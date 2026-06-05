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
import {
  readCommissionLedger,
  upsertCommissionEntries,
  updateEntryStatus,
  approveAllPending,
  recordMonthlyPayout,
} from "@/commission/commissionStore.js";

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
 * Load ops data + compute commissions + merge ledger.
 */
export async function loadCommissionEngineBundle(currentUser, options = {}) {
  const tenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const periodYmd = options.periodYmd || currentPeriodYmd();

  const [opsPayload, payments, orderLines] = await Promise.all([
    loadOperationsCommandCenterData(currentUser, { force: options.force }),
    fetchPaymentsRaw(),
    fetchOrderLinesRaw().catch(() => []),
  ]);

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
    payments,
    periodYmd,
  });

  const computed = buildCommissionEntries({
    attribution,
    phaseId,
    periodYmd,
    tenantId,
  });

  upsertCommissionEntries(tenantId, computed);

  const ledger = readCommissionLedger(tenantId);
  const entries = ledger.entries.filter((e) => e.periodYmd === periodYmd);
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
  };
}

export function approveCommissionEntry(tenantId, entryId, approvedBy) {
  const ledger = readCommissionLedger(tenantId);
  const existing = ledger.entries.find((e) => e.id === entryId);
  if (!existing?.thresholdMet || existing.status !== "pending") return null;
  const entry = updateEntryStatus(tenantId, entryId, "approved", {
    approvedAt: new Date().toISOString(),
    approvedBy,
  });
  return entry;
}

export async function approveAllPendingCommissions(tenantId, periodYmd, currentUser) {
  const approved = approveAllPending(tenantId, periodYmd, str(currentUser?.name || currentUser?.email));
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
  const payout = recordMonthlyPayout(tenantId, periodYmd, {
    recordedBy: str(currentUser?.name || currentUser?.email),
  });
  if (!payout) {
    return { duplicate: true };
  }
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
