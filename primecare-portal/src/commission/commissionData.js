import { supabase } from "@/api/supabaseClient.js";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { buildFounderPhaseEngineView } from "@/founder/founderPhaseEngine.js";
import { appendOperationalEvent } from "@/operations/operationalEventBridge.js";
import {
  computeAgentAttribution,
  buildCommissionEntries,
  buildCommissionModel,
  currentPeriodYmd,
} from "@/commission/commissionEngine.js";
import { getCommissionRule, DEFAULT_COMMISSION_PHASE_ID } from "@/commission/commissionRules.js";
import { ensureCommissionMigrated, loadCommissionLedger } from "@/commission/commissionStore.js";
import {
  approveAllPendingCommissionsForPeriod,
  approveCommission,
  getCommissionLiability,
  loadCommissionLiabilityForDistributors,
  recordCommissionPayout as recordCommissionPayoutSupabase,
  rejectCommission,
  upsertCommissionEntriesBatch,
} from "@/api/commissionSupabaseApi.js";
import { getLabsCredit } from "@/api/primecareSupabaseApi.js";
import {
  collectDistributorLabIds,
  filterRowsByDistributorLabs,
  filterRowsByTenant,
  rowTenantId,
} from "@/distributor/distributorOsEngine.js";
import { labIdKey } from "@/utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

export async function fetchPaymentsRaw() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("payments").select("*");
  if (error) {
    console.warn("[commission] payments read", error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

export async function fetchOrderLinesRaw() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("order_lines").select("*").limit(5000);
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

/**
 * Load ops data + compute commissions + merge durable ledger.
 */
export async function loadCommissionEngineBundle(currentUser, options = {}) {
  const scopeTenantId = str(options.scopeTenantId);
  const tenantId = scopeTenantId || str(currentUser?.tenantId || currentUser?.tenant_id);
  const periodYmd = options.periodYmd || currentPeriodYmd();
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);

  const [opsPayload, payments, orderLines, labsRes] = await Promise.all([
    loadOperationsCommandCenterData(currentUser, { force: options.force }),
    fetchPaymentsRaw(),
    fetchOrderLinesRaw().catch(() => []),
    scopeTenantId ? getLabsCredit() : Promise.resolve(null),
  ]);

  let effectivePayments = payments;
  if (scopeTenantId && opsPayload) {
    const rawLabs = Array.isArray(labsRes?.data)
      ? labsRes.data
      : Array.isArray(labsRes?.data?.labs)
        ? labsRes.data.labs
        : [];
    const scopedLabs = filterRowsByTenant(rawLabs, scopeTenantId, { tenantKey: rowTenantId });
    const labIds = collectDistributorLabIds(scopedLabs, scopeTenantId);
    opsPayload.collections = filterRowsByDistributorLabs(
      opsPayload.collections || [],
      labIds,
      "labId"
    );
    opsPayload.orders = filterRowsByDistributorLabs(
      opsPayload.orders || [],
      labIds,
      "labId"
    );
    opsPayload.visits = filterRowsByDistributorLabs(
      opsPayload.visits || [],
      labIds,
      "labId"
    );
    effectivePayments = (payments || []).filter((p) =>
      labIds.has(labIdKey(p.lab_id ?? p.labId))
    );
  }

  let phaseId = DEFAULT_COMMISSION_PHASE_ID;
  try {
    const journey = buildFounderPhaseEngineView(opsPayload, tenantId);
    phaseId = journey.currentPhaseId || phaseId;
  } catch {
    /* founder phase optional */
  }

  const rule = getCommissionRule(phaseId);
  const attribution = computeAgentAttribution({
    collections: opsPayload.collections || [],
    visits: opsPayload.visits || [],
    orders: opsPayload.orders || [],
    orderLines,
    payments: effectivePayments,
    periodYmd,
  });

  const computed = buildCommissionEntries({
    attribution,
    phaseId,
    periodYmd,
    tenantId,
  });

  await ensureCommissionMigrated({ homeTenantId });

  if (tenantId && supabase) {
    const upsertRes = await upsertCommissionEntriesBatch(tenantId, computed, {
      periodYmd,
      registryTenantId: homeTenantId || tenantId,
    });
    if (!upsertRes.ok) {
      console.warn("[commission] upsert failed:", upsertRes.error);
    }
  }

  const ledger = await loadCommissionLedger(tenantId, { periodYmd, homeTenantId });
  const entries = ledger.entries.filter((e) => e.periodYmd === periodYmd);
  const liabilityRes = await getCommissionLiability(tenantId, { periodYmd });

  const model = buildCommissionModel({
    entries,
    payouts: ledger.payouts,
    phaseId,
    periodYmd,
    rule,
  });

  return {
    tenantId,
    periodYmd,
    phaseId,
    opsPayload,
    model,
    paymentsCount: payments.length,
    ledgerSource: ledger.source,
    liability: liabilityRes.ok ? liabilityRes.liability : null,
  };
}

export async function approveCommissionEntry(tenantId, entryId, approvedBy) {
  const res = await approveCommission(tenantId, entryId, approvedBy);
  return res.ok ? res.entry : null;
}

export async function rejectCommissionEntry(tenantId, entryId, rejectedBy) {
  const res = await rejectCommission(tenantId, entryId, rejectedBy);
  return res.ok ? res.entry : null;
}

export async function approveAllPendingCommissions(tenantId, periodYmd, currentUser) {
  const approvedBy = str(currentUser?.name || currentUser?.email);
  const res = await approveAllPendingCommissionsForPeriod(tenantId, periodYmd, approvedBy);
  const approved = res.entries || [];

  if (tenantId && approved.length) {
    void appendOperationalEvent({
      tenantId,
      eventType: "payment_received",
      actor: str(currentUser?.name || "Executive"),
      actorRole: currentUser?.role || "executive",
      metadata: {
        summary: `Commission batch approved (${approved.length} agents)`,
        periodYmd,
        commissionApproval: true,
        total: approved.reduce((s, e) => s + Number(e.commissionAmount || 0), 0),
      },
    });
  }
  return approved;
}

export async function recordCommissionPayout(tenantId, periodYmd, currentUser) {
  const res = await recordCommissionPayoutSupabase(tenantId, periodYmd, {
    recordedBy: str(currentUser?.name || currentUser?.email),
    registryTenantId: tenantId,
  });

  if (res.duplicate) {
    return { duplicate: true };
  }
  if (!res.ok) {
    return { error: res.error || "Payout failed" };
  }

  const payout = res.payout;
  if (tenantId && payout) {
    void appendOperationalEvent({
      tenantId,
      eventType: "payment_received",
      actor: str(currentUser?.name || "Executive"),
      actorRole: currentUser?.role || "executive",
      metadata: {
        summary: `Commission payout recorded · ${periodYmd}`,
        periodYmd,
        commissionPayout: true,
        total: payout.totalCommission,
        agentCount: payout.agentCount,
      },
    });
  }
  return payout;
}

/**
 * Portfolio commission metrics for Founder Strategy.
 */
export async function loadFounderCommissionMetrics(distributorIds = [], options = {}) {
  await ensureCommissionMigrated({ homeTenantId: options.homeTenantId });
  return loadCommissionLiabilityForDistributors(distributorIds, {
    periodYmd: options.periodYmd,
  });
}

export { getCommissionLiability } from "@/api/commissionSupabaseApi.js";
