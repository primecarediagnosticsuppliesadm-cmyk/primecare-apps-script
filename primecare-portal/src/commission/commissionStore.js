const LEDGER_PREFIX = "primecare_commission_ledger_v1";

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function ledgerKey(tenantId) {
  return `${LEDGER_PREFIX}:${tenantId || "default"}`;
}

export function readCommissionLedger(tenantId) {
  if (typeof window === "undefined") {
    return { entries: [], payouts: [], updatedAt: null };
  }
  const data = safeParse(window.localStorage.getItem(ledgerKey(tenantId)), {
    entries: [],
    payouts: [],
  });
  return {
    entries: Array.isArray(data.entries) ? data.entries : [],
    payouts: Array.isArray(data.payouts) ? data.payouts : [],
    updatedAt: data.updatedAt || null,
  };
}

export function writeCommissionLedger(tenantId, ledger) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    ledgerKey(tenantId),
    JSON.stringify({
      ...ledger,
      updatedAt: new Date().toISOString(),
    })
  );
}

export function upsertCommissionEntries(tenantId, entries) {
  const ledger = readCommissionLedger(tenantId);
  const byKey = new Map(ledger.entries.map((e) => [entryKey(e), e]));
  for (const row of entries) {
    const key = entryKey(row);
    const prev = byKey.get(key);
    if (prev && (prev.status === "approved" || prev.status === "paid")) {
      byKey.set(key, { ...prev, ...pickComputedFields(row) });
    } else {
      byKey.set(key, row);
    }
  }
  writeCommissionLedger(tenantId, {
    ...ledger,
    entries: [...byKey.values()],
  });
}

function entryKey(e) {
  return `${e.periodYmd}:${e.agentKey}`;
}

function pickComputedFields(row) {
  return {
    collectedAmount: row.collectedAmount,
    revenueAttributed: row.revenueAttributed,
    commissionAmount: row.commissionAmount,
    efficiencyPct: row.efficiencyPct,
    labsTouched: row.labsTouched,
    thresholdMet: row.thresholdMet,
    phaseId: row.phaseId,
    ruleVersion: row.ruleVersion,
    updatedAt: row.updatedAt,
  };
}

export function updateEntryStatus(tenantId, entryId, status, meta = {}) {
  const ledger = readCommissionLedger(tenantId);
  const entries = ledger.entries.map((e) =>
    e.id === entryId
      ? {
          ...e,
          status,
          ...meta,
          updatedAt: new Date().toISOString(),
        }
      : e
  );
  writeCommissionLedger(tenantId, { ...ledger, entries });
  return entries.find((e) => e.id === entryId);
}

export function approveAllPending(tenantId, periodYmd, approvedBy) {
  const ledger = readCommissionLedger(tenantId);
  const now = new Date().toISOString();
  const entries = ledger.entries.map((e) =>
    e.periodYmd === periodYmd && e.status === "pending" && e.thresholdMet
      ? { ...e, status: "approved", approvedAt: now, approvedBy, updatedAt: now }
      : e
  );
  writeCommissionLedger(tenantId, { ...ledger, entries });
  return entries.filter((e) => e.status === "approved" && e.approvedAt === now);
}

export function hasPayoutForPeriod(tenantId, periodYmd) {
  const ledger = readCommissionLedger(tenantId);
  return ledger.payouts.some(
    (p) => p.periodYmd === periodYmd && p.status === "paid"
  );
}

export function recordMonthlyPayout(tenantId, periodYmd, meta = {}) {
  if (hasPayoutForPeriod(tenantId, periodYmd)) {
    return null;
  }
  const ledger = readCommissionLedger(tenantId);
  const approved = ledger.entries.filter(
    (e) => e.periodYmd === periodYmd && e.status === "approved"
  );
  const total = approved.reduce((s, e) => s + Number(e.commissionAmount || 0), 0);
  const now = new Date().toISOString();
  const entries = ledger.entries.map((e) =>
    e.periodYmd === periodYmd && e.status === "approved"
      ? { ...e, status: "paid", paidAt: now, updatedAt: now }
      : e
  );
  const payout = {
    id: `payout-${periodYmd}`,
    periodYmd,
    totalCommission: total,
    agentCount: approved.length,
    status: "paid",
    paidAt: now,
    recordedBy: meta.recordedBy || "",
  };
  const payouts = [
    payout,
    ...ledger.payouts.filter((p) => p.periodYmd !== periodYmd),
  ];
  writeCommissionLedger(tenantId, { entries, payouts });
  return payout;
}
