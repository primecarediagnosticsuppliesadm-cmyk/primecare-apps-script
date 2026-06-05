/**
 * Durable agent commission ledger — entries + payouts.
 * Calculation inputs remain public.payments / orders.
 */
import { supabase } from "@/api/supabaseClient.js";

export const LEDGER_PREFIX = "primecare_commission_ledger_v1";
export const MIGRATION_FLAG_KEY = "primecare_commission_migration_v1_done";

export const ENTRY_STATUSES = {
  PENDING: "pending",
  APPROVED: "approved",
  PAID: "paid",
  REJECTED: "rejected",
};

const LOCKED_STATUSES = new Set([
  ENTRY_STATUSES.APPROVED,
  ENTRY_STATUSES.PAID,
  ENTRY_STATUSES.REJECTED,
]);

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
  return supabase;
}

/** @param {object} row */
export function rowToCommissionEntry(row) {
  if (!row) return null;
  return {
    id: str(row.id),
    tenantId: str(row.distributor_id),
    distributorId: str(row.distributor_id),
    registryTenantId: str(row.registry_tenant_id),
    periodYmd: str(row.period_ymd),
    agentKey: str(row.agent_key),
    agentName: str(row.agent_name),
    collectedAmount: num(row.collected_amount),
    revenueAttributed: num(row.revenue_attributed),
    commissionAmount: num(row.commission_amount),
    collectionCommission: num(row.collection_commission),
    revenueCommission: num(row.revenue_commission),
    efficiencyPct: num(row.efficiency_pct),
    labsTouched: num(row.labs_touched),
    paymentCount: num(row.payment_count),
    thresholdMet: Boolean(row.threshold_met),
    eligible: Boolean(row.eligible),
    phaseId: str(row.phase_id) || null,
    ruleVersion: str(row.rule_version) || null,
    status: str(row.status) || ENTRY_STATUSES.PENDING,
    approvedAt: row.approved_at || null,
    approvedBy: str(row.approved_by) || null,
    rejectedAt: row.rejected_at || null,
    rejectedBy: str(row.rejected_by) || null,
    paidAt: row.paid_at || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

/** @param {object} entry */
export function commissionEntryToRow(entry, options = {}) {
  const distributorId = str(entry.distributorId || entry.tenantId || options.distributorId);
  const registryTenantId = str(
    entry.registryTenantId || options.registryTenantId || distributorId
  );
  return {
    id: str(entry.id),
    distributor_id: distributorId,
    registry_tenant_id: registryTenantId,
    period_ymd: str(entry.periodYmd),
    agent_key: str(entry.agentKey),
    agent_name: str(entry.agentName) || null,
    collected_amount: num(entry.collectedAmount),
    revenue_attributed: num(entry.revenueAttributed),
    commission_amount: num(entry.commissionAmount),
    collection_commission: num(entry.collectionCommission),
    revenue_commission: num(entry.revenueCommission),
    efficiency_pct: num(entry.efficiencyPct),
    labs_touched: Math.round(num(entry.labsTouched)),
    payment_count: Math.round(num(entry.paymentCount)),
    threshold_met: Boolean(entry.thresholdMet),
    eligible: Boolean(entry.eligible),
    phase_id: str(entry.phaseId) || null,
    rule_version: str(entry.ruleVersion) || null,
    status: str(entry.status) || ENTRY_STATUSES.PENDING,
    approved_at: entry.approvedAt || null,
    approved_by: str(entry.approvedBy) || null,
    rejected_at: entry.rejectedAt || null,
    rejected_by: str(entry.rejectedBy) || null,
    paid_at: entry.paidAt || null,
    metadata: {
      ...(entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {}),
    },
  };
}

/** @param {object} row */
export function rowToCommissionPayout(row) {
  if (!row) return null;
  return {
    id: str(row.id),
    tenantId: str(row.distributor_id),
    distributorId: str(row.distributor_id),
    registryTenantId: str(row.registry_tenant_id),
    periodYmd: str(row.period_ymd),
    totalCommission: num(row.total_commission),
    agentCount: num(row.agent_count),
    status: str(row.status) || "paid",
    paidAt: row.paid_at || null,
    recordedBy: str(row.recorded_by) || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

/** @param {object} payout */
export function commissionPayoutToRow(payout, options = {}) {
  const distributorId = str(payout.distributorId || payout.tenantId || options.distributorId);
  const registryTenantId = str(
    payout.registryTenantId || options.registryTenantId || distributorId
  );
  return {
    id: str(payout.id),
    distributor_id: distributorId,
    registry_tenant_id: registryTenantId,
    period_ymd: str(payout.periodYmd),
    total_commission: num(payout.totalCommission),
    agent_count: Math.round(num(payout.agentCount)),
    status: str(payout.status) || "paid",
    paid_at: payout.paidAt || new Date().toISOString(),
    recorded_by: str(payout.recordedBy || options.recordedBy) || null,
    metadata: {
      ...(payout.metadata && typeof payout.metadata === "object" ? payout.metadata : {}),
    },
  };
}

function pickComputedFields(entry) {
  return {
    collected_amount: num(entry.collectedAmount),
    revenue_attributed: num(entry.revenueAttributed),
    commission_amount: num(entry.commissionAmount),
    collection_commission: num(entry.collectionCommission),
    revenue_commission: num(entry.revenueCommission),
    efficiency_pct: num(entry.efficiencyPct),
    labs_touched: Math.round(num(entry.labsTouched)),
    payment_count: Math.round(num(entry.paymentCount)),
    threshold_met: Boolean(entry.thresholdMet),
    eligible: Boolean(entry.eligible),
    phase_id: str(entry.phaseId) || null,
    rule_version: str(entry.ruleVersion) || null,
    agent_name: str(entry.agentName) || null,
    metadata: {
      ...(entry.metadata && typeof entry.metadata === "object" ? entry.metadata : {}),
      lastComputedAt: new Date().toISOString(),
    },
  };
}

/**
 * @param {string} distributorId
 * @param {{ periodYmd?: string, status?: string|string[], limit?: number }} [options]
 */
export async function getCommissionEntries(distributorId, options = {}) {
  const id = str(distributorId);
  if (!id) return { ok: true, entries: [], error: null };
  if (!supabase) return { ok: false, entries: [], error: "Supabase not configured" };

  let query = supabase
    .from("commission_entries")
    .select("*")
    .eq("distributor_id", id)
    .order("updated_at", { ascending: false });

  if (options.periodYmd) {
    query = query.eq("period_ymd", str(options.periodYmd));
  }
  if (options.status) {
    const statuses = Array.isArray(options.status)
      ? options.status.map((s) => str(s)).filter(Boolean)
      : [str(options.status)].filter(Boolean);
    if (statuses.length === 1) query = query.eq("status", statuses[0]);
    else if (statuses.length > 1) query = query.in("status", statuses);
  }
  if (options.limit) {
    query = query.limit(Math.max(1, Number(options.limit) || 500));
  }

  const { data, error } = await query;
  if (error) return { ok: false, entries: [], error: error.message };
  return {
    ok: true,
    entries: (Array.isArray(data) ? data : []).map(rowToCommissionEntry).filter(Boolean),
    error: null,
  };
}

/**
 * @param {string} distributorId
 * @param {{ periodYmd?: string, limit?: number }} [options]
 */
export async function listCommissionPayoutsForDistributor(distributorId, options = {}) {
  const id = str(distributorId);
  if (!id) return { ok: true, payouts: [], error: null };
  if (!supabase) return { ok: false, payouts: [], error: "Supabase not configured" };

  let query = supabase
    .from("commission_payouts")
    .select("*")
    .eq("distributor_id", id)
    .order("paid_at", { ascending: false });

  if (options.periodYmd) {
    query = query.eq("period_ymd", str(options.periodYmd));
  }
  if (options.limit) {
    query = query.limit(Math.max(1, Number(options.limit) || 120));
  }

  const { data, error } = await query;
  if (error) return { ok: false, payouts: [], error: error.message };
  return {
    ok: true,
    payouts: (Array.isArray(data) ? data : []).map(rowToCommissionPayout).filter(Boolean),
    error: null,
  };
}

/**
 * @param {object} draft
 * @param {{ distributorId?: string, registryTenantId?: string }} [options]
 */
export async function createCommissionEntry(draft, options = {}) {
  const client = requireSupabase();
  const row = commissionEntryToRow(draft, options);
  if (!row.id || !row.distributor_id || !row.period_ymd || !row.agent_key) {
    return { ok: false, entry: null, error: "Missing id, distributor_id, period, or agent_key" };
  }

  const { data, error } = await client
    .from("commission_entries")
    .insert(row)
    .select("*")
    .single();

  if (error) return { ok: false, entry: null, error: error.message };
  return { ok: true, entry: rowToCommissionEntry(data), error: null };
}

/**
 * Merge computed fields; preserve workflow status when locked.
 * @param {object} entry
 * @param {{ distributorId?: string, registryTenantId?: string }} [options]
 */
export async function updateCommissionEntry(entry, options = {}) {
  const client = requireSupabase();
  const id = str(entry.id);
  const distributorId = str(entry.distributorId || entry.tenantId || options.distributorId);
  if (!id || !distributorId) {
    return { ok: false, entry: null, error: "Missing entry id or distributor_id" };
  }

  const { data: existing, error: readError } = await client
    .from("commission_entries")
    .select("*")
    .eq("id", id)
    .eq("distributor_id", distributorId)
    .maybeSingle();

  if (readError) return { ok: false, entry: null, error: readError.message };

  const computed = pickComputedFields(entry);
  const patch = existing
    ? LOCKED_STATUSES.has(str(existing.status))
      ? { ...computed, status: existing.status }
      : { ...commissionEntryToRow(entry, options), ...computed }
    : commissionEntryToRow(entry, options);

  const { data, error } = await client
    .from("commission_entries")
    .upsert(patch, { onConflict: "id" })
    .select("*")
    .single();

  if (error) return { ok: false, entry: null, error: error.message };
  return { ok: true, entry: rowToCommissionEntry(data), error: null };
}

/**
 * Upsert many computed entries for a period (idempotent).
 */
export async function upsertCommissionEntriesBatch(distributorId, entries, options = {}) {
  const id = str(distributorId);
  if (!id) return { ok: true, upserted: 0, error: null };
  if (!supabase) return { ok: false, upserted: 0, error: "Supabase not configured" };
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: true, upserted: 0, error: null };
  }

  const client = requireSupabase();
  const periodYmd = str(options.periodYmd || entries[0]?.periodYmd);
  const agentKeys = entries.map((e) => str(e.agentKey)).filter(Boolean);

  const { data: existingRows, error: readError } = await client
    .from("commission_entries")
    .select("id, agent_key, status")
    .eq("distributor_id", id)
    .eq("period_ymd", periodYmd)
    .in("agent_key", agentKeys);

  if (readError) return { ok: false, upserted: 0, error: readError.message };

  const statusByAgent = new Map(
    (existingRows || []).map((r) => [str(r.agent_key), str(r.status)])
  );

  const rows = entries.map((entry) => {
    const row = commissionEntryToRow({ ...entry, tenantId: id }, options);
    const prevStatus = statusByAgent.get(row.agent_key);
    if (prevStatus && LOCKED_STATUSES.has(prevStatus)) {
      return { ...row, status: prevStatus, ...pickComputedFields(entry) };
    }
    return row;
  });

  const { error } = await client.from("commission_entries").upsert(rows, { onConflict: "id" });
  if (error) return { ok: false, upserted: 0, error: error.message };
  return { ok: true, upserted: rows.length, error: null };
}

/**
 * @param {string} distributorId
 * @param {string} entryId
 * @param {string} approvedBy
 */
export async function approveCommission(distributorId, entryId, approvedBy = "") {
  const client = requireSupabase();
  const did = str(distributorId);
  const eid = str(entryId);
  const now = new Date().toISOString();

  const { data: existing, error: readError } = await client
    .from("commission_entries")
    .select("*")
    .eq("id", eid)
    .eq("distributor_id", did)
    .maybeSingle();

  if (readError) return { ok: false, entry: null, error: readError.message };
  if (!existing) return { ok: false, entry: null, error: "Entry not found" };
  if (!existing.threshold_met) return { ok: false, entry: null, error: "Threshold not met" };
  if (str(existing.status) !== ENTRY_STATUSES.PENDING) {
    return { ok: false, entry: rowToCommissionEntry(existing), error: "Entry not pending" };
  }

  const { data, error } = await client
    .from("commission_entries")
    .update({
      status: ENTRY_STATUSES.APPROVED,
      approved_at: now,
      approved_by: str(approvedBy) || null,
      updated_at: now,
    })
    .eq("id", eid)
    .eq("distributor_id", did)
    .select("*")
    .single();

  if (error) return { ok: false, entry: null, error: error.message };
  return { ok: true, entry: rowToCommissionEntry(data), error: null };
}

/**
 * Approve all pending threshold-met entries for a period.
 */
export async function approveAllPendingCommissionsForPeriod(
  distributorId,
  periodYmd,
  approvedBy = ""
) {
  const client = requireSupabase();
  const did = str(distributorId);
  const period = str(periodYmd);
  const now = new Date().toISOString();

  const { data: pending, error: readError } = await client
    .from("commission_entries")
    .select("*")
    .eq("distributor_id", did)
    .eq("period_ymd", period)
    .eq("status", ENTRY_STATUSES.PENDING)
    .eq("threshold_met", true);

  if (readError) return { ok: false, entries: [], error: readError.message };
  if (!pending?.length) return { ok: true, entries: [], error: null };

  const ids = pending.map((r) => r.id);
  const { data, error } = await client
    .from("commission_entries")
    .update({
      status: ENTRY_STATUSES.APPROVED,
      approved_at: now,
      approved_by: str(approvedBy) || null,
    })
    .in("id", ids)
    .eq("distributor_id", did)
    .select("*");

  if (error) return { ok: false, entries: [], error: error.message };
  return {
    ok: true,
    entries: (data || []).map(rowToCommissionEntry).filter(Boolean),
    error: null,
  };
}

/**
 * @param {string} distributorId
 * @param {string} entryId
 * @param {string} rejectedBy
 */
export async function rejectCommission(distributorId, entryId, rejectedBy = "") {
  const client = requireSupabase();
  const did = str(distributorId);
  const eid = str(entryId);
  const now = new Date().toISOString();

  const { data: existing, error: readError } = await client
    .from("commission_entries")
    .select("*")
    .eq("id", eid)
    .eq("distributor_id", did)
    .maybeSingle();

  if (readError) return { ok: false, entry: null, error: readError.message };
  if (!existing) return { ok: false, entry: null, error: "Entry not found" };
  if (str(existing.status) !== ENTRY_STATUSES.PENDING) {
    return { ok: false, entry: rowToCommissionEntry(existing), error: "Entry not pending" };
  }

  const { data, error } = await client
    .from("commission_entries")
    .update({
      status: ENTRY_STATUSES.REJECTED,
      rejected_at: now,
      rejected_by: str(rejectedBy) || null,
    })
    .eq("id", eid)
    .eq("distributor_id", did)
    .select("*")
    .single();

  if (error) return { ok: false, entry: null, error: error.message };
  return { ok: true, entry: rowToCommissionEntry(data), error: null };
}

/**
 * @param {string} distributorId
 * @param {string} periodYmd
 * @param {{ recordedBy?: string, registryTenantId?: string }} [options]
 */
export async function recordCommissionPayout(distributorId, periodYmd, options = {}) {
  const client = requireSupabase();
  const did = str(distributorId);
  const period = str(periodYmd);
  const now = new Date().toISOString();

  const { data: existingPayout, error: dupError } = await client
    .from("commission_payouts")
    .select("id")
    .eq("distributor_id", did)
    .eq("period_ymd", period)
    .eq("status", "paid")
    .maybeSingle();

  if (dupError) return { ok: false, payout: null, duplicate: false, error: dupError.message };
  if (existingPayout?.id) {
    return { ok: false, payout: null, duplicate: true, error: "Payout already recorded" };
  }

  const { data: approved, error: approvedError } = await client
    .from("commission_entries")
    .select("*")
    .eq("distributor_id", did)
    .eq("period_ymd", period)
    .eq("status", ENTRY_STATUSES.APPROVED);

  if (approvedError) {
    return { ok: false, payout: null, duplicate: false, error: approvedError.message };
  }

  const approvedRows = approved || [];
  const total = approvedRows.reduce((s, r) => s + num(r.commission_amount), 0);
  const payoutRow = commissionPayoutToRow(
    {
      id: `payout-${period}`,
      distributorId: did,
      periodYmd: period,
      totalCommission: total,
      agentCount: approvedRows.length,
      status: "paid",
      paidAt: now,
      recordedBy: options.recordedBy || null,
    },
    options
  );

  const { data: payoutData, error: payoutError } = await client
    .from("commission_payouts")
    .insert(payoutRow)
    .select("*")
    .single();

  if (payoutError) {
    return { ok: false, payout: null, duplicate: false, error: payoutError.message };
  }

  if (approvedRows.length) {
    const ids = approvedRows.map((r) => r.id);
    const { error: markError } = await client
      .from("commission_entries")
      .update({ status: ENTRY_STATUSES.PAID, paid_at: now })
      .in("id", ids)
      .eq("distributor_id", did);

    if (markError) {
      return { ok: false, payout: rowToCommissionPayout(payoutData), duplicate: false, error: markError.message };
    }
  }

  return {
    ok: true,
    payout: rowToCommissionPayout(payoutData),
    duplicate: false,
    error: null,
  };
}

/**
 * @param {string} distributorId
 * @param {{ periodYmd?: string }} [options]
 */
export async function getCommissionLiability(distributorId, options = {}) {
  const id = str(distributorId);
  if (!id) {
    return {
      ok: true,
      liability: emptyLiability(),
      error: null,
    };
  }
  if (!supabase) {
    return { ok: false, liability: emptyLiability(), error: "Supabase not configured" };
  }

  let query = supabase
    .from("commission_entries")
    .select("status, commission_amount, period_ymd")
    .eq("distributor_id", id);

  if (options.periodYmd) {
    query = query.eq("period_ymd", str(options.periodYmd));
  }

  const { data, error } = await query;
  if (error) return { ok: false, liability: emptyLiability(), error: error.message };

  const liability = summarizeCommissionLiability(data || []);
  return { ok: true, liability, error: null };
}

export function summarizeCommissionLiability(rows = []) {
  let pendingTotal = 0;
  let approvedTotal = 0;
  let paidTotal = 0;
  let rejectedTotal = 0;
  let pendingCount = 0;
  let approvedCount = 0;
  let paidCount = 0;

  for (const row of rows) {
    const amount = num(row.commission_amount ?? row.commissionAmount);
    const status = str(row.status);
    if (status === ENTRY_STATUSES.PENDING) {
      pendingTotal += amount;
      pendingCount += 1;
    } else if (status === ENTRY_STATUSES.APPROVED) {
      approvedTotal += amount;
      approvedCount += 1;
    } else if (status === ENTRY_STATUSES.PAID) {
      paidTotal += amount;
      paidCount += 1;
    } else if (status === ENTRY_STATUSES.REJECTED) {
      rejectedTotal += amount;
    }
  }

  const liabilityTotal = pendingTotal + approvedTotal;
  return {
    pendingTotal,
    approvedTotal,
    paidTotal,
    rejectedTotal,
    liabilityTotal,
    outstandingTotal: pendingTotal,
    pendingCount,
    approvedCount,
    paidCount,
    entryCount: rows.length,
  };
}

function emptyLiability() {
  return summarizeCommissionLiability([]);
}

/**
 * Batch liability for portfolio dashboards.
 * @param {string[]} distributorIds
 * @param {{ periodYmd?: string }} [options]
 */
export async function loadCommissionLiabilityForDistributors(distributorIds = [], options = {}) {
  const ids = [...new Set(distributorIds.map((id) => str(id)).filter(Boolean))];
  if (!ids.length) {
    return { ok: true, byDistributor: {}, portfolio: emptyLiability(), error: null };
  }
  if (!supabase) {
    return { ok: false, byDistributor: {}, portfolio: emptyLiability(), error: "Supabase not configured" };
  }

  let query = supabase
    .from("commission_entries")
    .select("distributor_id, status, commission_amount, period_ymd")
    .in("distributor_id", ids);

  if (options.periodYmd) {
    query = query.eq("period_ymd", str(options.periodYmd));
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false, byDistributor: {}, portfolio: emptyLiability(), error: error.message };
  }

  const byDistributor = {};
  const allRows = [];
  for (const row of data || []) {
    const did = str(row.distributor_id);
    if (!byDistributor[did]) byDistributor[did] = [];
    byDistributor[did].push(row);
    allRows.push(row);
  }

  const summarized = {};
  for (const did of ids) {
    summarized[did] = summarizeCommissionLiability(byDistributor[did] || []);
  }

  return {
    ok: true,
    byDistributor: summarized,
    portfolio: summarizeCommissionLiability(allRows),
    error: null,
  };
}

/**
 * Payout counts per distributor (for Distributor OS performance panel).
 */
export async function loadCommissionPayoutCountsForDistributors(distributorIds = []) {
  const ids = [...new Set(distributorIds.map((id) => str(id)).filter(Boolean))];
  if (!ids.length) return { ok: true, byDistributor: {}, error: null };
  if (!supabase) return { ok: false, byDistributor: {}, error: "Supabase not configured" };

  const { data, error } = await supabase
    .from("commission_payouts")
    .select("distributor_id")
    .in("distributor_id", ids)
    .eq("status", "paid");

  if (error) return { ok: false, byDistributor: {}, error: error.message };

  const byDistributor = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const row of data || []) {
    const did = str(row.distributor_id);
    if (did in byDistributor) byDistributor[did] += 1;
  }

  return { ok: true, byDistributor, error: null };
}

function migrationDone() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MIGRATION_FLAG_KEY) === "true";
}

function markMigrationDone(summary) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MIGRATION_FLAG_KEY, "true");
  window.localStorage.setItem(
    `${MIGRATION_FLAG_KEY}:summary`,
    JSON.stringify({ ...summary, at: new Date().toISOString() })
  );
}

export function readCommissionMigrationStatus() {
  if (typeof window === "undefined") {
    return { done: false, summary: null };
  }
  let summary = null;
  try {
    const raw = window.localStorage.getItem(`${MIGRATION_FLAG_KEY}:summary`);
    summary = raw ? JSON.parse(raw) : null;
  } catch {
    summary = null;
  }
  return { done: migrationDone(), summary };
}

/**
 * Scan localStorage for legacy commission ledgers.
 */
export function scanLocalCommissionLedgers() {
  if (typeof window === "undefined") return [];
  const out = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(`${LEDGER_PREFIX}:`)) continue;
    const tenantId = key.slice(`${LEDGER_PREFIX}:`.length);
    try {
      const raw = window.localStorage.getItem(key);
      const data = raw ? JSON.parse(raw) : { entries: [], payouts: [] };
      out.push({
        tenantId,
        entries: Array.isArray(data.entries) ? data.entries : [],
        payouts: Array.isArray(data.payouts) ? data.payouts : [],
      });
    } catch {
      /* skip corrupt */
    }
  }
  return out;
}

/**
 * One-time localStorage → Supabase migration (idempotent by entry/payout id).
 * @param {{ force?: boolean, homeTenantId?: string }} [options]
 */
export async function migrateLocalCommissionLedgersToSupabase(options = {}) {
  if (typeof window === "undefined") {
    return { ok: true, migratedEntries: 0, migratedPayouts: 0, skipped: 0, errors: [], alreadyDone: true };
  }
  if (migrationDone() && !options.force) {
    return { ok: true, migratedEntries: 0, migratedPayouts: 0, skipped: 0, errors: [], alreadyDone: true };
  }

  const client = requireSupabase();
  const homeTenantId = str(options.homeTenantId);
  const ledgers = scanLocalCommissionLedgers();

  let migratedEntries = 0;
  let migratedPayouts = 0;
  let skipped = 0;
  const errors = [];

  for (const ledger of ledgers) {
    const distributorId = str(ledger.tenantId);
    if (!distributorId || distributorId.startsWith("__predator")) continue;

    for (const entry of ledger.entries) {
      const row = commissionEntryToRow(
        {
          ...entry,
          tenantId: distributorId,
          distributorId,
        },
        { registryTenantId: homeTenantId || distributorId }
      );
      if (!row.id || !row.period_ymd || !row.agent_key) {
        skipped += 1;
        continue;
      }
      row.metadata = {
        ...row.metadata,
        migrationSource: LEDGER_PREFIX,
        migratedAt: new Date().toISOString(),
      };

      const { error } = await client.from("commission_entries").upsert(row, { onConflict: "id" });
      if (error) errors.push({ id: row.id, type: "entry", error: error.message });
      else migratedEntries += 1;
    }

    for (const payout of ledger.payouts) {
      const row = commissionPayoutToRow(
        {
          ...payout,
          tenantId: distributorId,
          distributorId,
        },
        { registryTenantId: homeTenantId || distributorId }
      );
      if (!row.id || !row.period_ymd) {
        skipped += 1;
        continue;
      }
      row.metadata = {
        ...row.metadata,
        migrationSource: LEDGER_PREFIX,
        migratedAt: new Date().toISOString(),
      };

      const { error } = await client.from("commission_payouts").upsert(row, { onConflict: "id" });
      if (error) errors.push({ id: row.id, type: "payout", error: error.message });
      else migratedPayouts += 1;
    }
  }

  const summary = {
    migratedEntries,
    migratedPayouts,
    skipped,
    errors: errors.length,
    ledgerKeys: ledgers.length,
  };

  if (errors.length === 0) {
    markMigrationDone(summary);
  }

  return {
    ok: errors.length === 0,
    migratedEntries,
    migratedPayouts,
    skipped,
    errors,
    alreadyDone: false,
    summary,
  };
}
