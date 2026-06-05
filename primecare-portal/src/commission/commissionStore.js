import {
  LEDGER_PREFIX,
  getCommissionEntries,
  listCommissionPayoutsForDistributor,
  migrateLocalCommissionLedgersToSupabase,
  readCommissionMigrationStatus,
  scanLocalCommissionLedgers,
} from "@/api/commissionSupabaseApi.js";

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

let migrationPromise = null;

/** @deprecated Legacy local read — migration source only. */
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

/** @deprecated Legacy local write — no longer used after Supabase durability. */
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

function hasLocalCommissionData() {
  return scanLocalCommissionLedgers().some(
    (l) => l.entries.length > 0 || l.payouts.length > 0
  );
}

/**
 * One-time localStorage → Supabase migration (idempotent).
 */
export async function ensureCommissionMigrated(options = {}) {
  if (typeof window === "undefined") return { ok: true, alreadyDone: true };
  const status = readCommissionMigrationStatus();
  if (status.done && !options.force) return { ok: true, alreadyDone: true };
  if (!hasLocalCommissionData() && !options.force) {
    const result = await migrateLocalCommissionLedgersToSupabase(options);
    return result;
  }
  if (!migrationPromise) {
    migrationPromise = migrateLocalCommissionLedgersToSupabase(options).finally(() => {
      migrationPromise = null;
    });
  }
  return migrationPromise;
}

/**
 * Durable read — Supabase primary.
 */
export async function loadCommissionLedger(tenantId, options = {}) {
  const id = String(tenantId ?? "").trim();
  if (!id) return { entries: [], payouts: [], source: "empty" };

  await ensureCommissionMigrated({ homeTenantId: options.homeTenantId });

  const [entriesRes, payoutsRes] = await Promise.all([
    getCommissionEntries(id, { periodYmd: options.periodYmd }),
    listCommissionPayoutsForDistributor(id, { periodYmd: options.periodYmd }),
  ]);

  if (entriesRes.ok) {
    return {
      entries: entriesRes.entries,
      payouts: payoutsRes.ok ? payoutsRes.payouts : [],
      source: "supabase",
      error: payoutsRes.ok ? null : payoutsRes.error,
    };
  }

  console.warn("[commission] Supabase read failed, using local fallback:", entriesRes.error);
  const local = readCommissionLedger(id);
  return {
    entries: local.entries,
    payouts: local.payouts,
    source: "local_fallback",
    error: entriesRes.error,
  };
}

/** @deprecated Use commissionSupabaseApi.hasPayoutForPeriod via loadCommissionLedger */
export async function hasPayoutForPeriod(tenantId, periodYmd) {
  const ledger = await loadCommissionLedger(tenantId, { periodYmd });
  return ledger.payouts.some((p) => p.periodYmd === periodYmd && p.status === "paid");
}
