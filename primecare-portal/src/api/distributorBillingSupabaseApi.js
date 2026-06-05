/**
 * Durable PrimeCare ↔ Distributor platform billing payments.
 * Separate from lab collections (public.payments) and lab contracts (public.lab_contracts).
 */
import { supabase } from "@/api/supabaseClient.js";
import { fetchDatabaseTenants } from "@/tenant/durableTenantStore.js";

export const MIGRATION_FLAG_KEY = "primecare_billing_migration_v1_done";

export const PAYMENT_TYPES = {
  PLATFORM_FEE: "platform_fee",
  REVENUE_SHARE: "revenue_share",
  PER_LAB_FEE: "per_lab_fee",
  OPENING_BALANCE: "opening_balance",
  ADJUSTMENT: "adjustment",
  REFUND: "refund",
};

export const RECORDABLE_PAYMENT_TYPES = [
  PAYMENT_TYPES.PLATFORM_FEE,
  PAYMENT_TYPES.REVENUE_SHARE,
  PAYMENT_TYPES.PER_LAB_FEE,
  PAYMENT_TYPES.ADJUSTMENT,
];

export const PAYMENT_TYPE_LABELS = {
  [PAYMENT_TYPES.PLATFORM_FEE]: "Platform fee",
  [PAYMENT_TYPES.REVENUE_SHARE]: "Revenue share",
  [PAYMENT_TYPES.PER_LAB_FEE]: "Per lab fee",
  [PAYMENT_TYPES.OPENING_BALANCE]: "Opening balance",
  [PAYMENT_TYPES.ADJUSTMENT]: "Adjustment",
  [PAYMENT_TYPES.REFUND]: "Refund",
};

const COLLECTED_PAYMENT_TYPES = new Set([
  PAYMENT_TYPES.PLATFORM_FEE,
  PAYMENT_TYPES.REVENUE_SHARE,
  PAYMENT_TYPES.PER_LAB_FEE,
  PAYMENT_TYPES.OPENING_BALANCE,
  PAYMENT_TYPES.ADJUSTMENT,
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

function dateOnly(iso) {
  const s = str(iso).slice(0, 10);
  return s || null;
}

function migrationRowId(distributorId) {
  return `billing-mig-${str(distributorId)}`;
}

/** @param {object} row */
export function rowToBillingPayment(row) {
  if (!row) return null;
  return {
    id: str(row.id),
    distributorId: str(row.distributor_id),
    registryTenantId: str(row.registry_tenant_id),
    amount: num(row.amount),
    currency: str(row.currency) || "INR",
    paymentType: str(row.payment_type) || PAYMENT_TYPES.PLATFORM_FEE,
    paymentDate: dateOnly(row.payment_date) || "",
    paidAt: row.paid_at || null,
    periodYmd: dateOnly(row.period_ymd),
    mode: str(row.mode) || null,
    reference: str(row.reference) || null,
    note: str(row.note) || null,
    recordedBy: str(row.recorded_by) || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

/** @param {object} payment */
export function billingPaymentToRow(payment, options = {}) {
  const distributorId = str(payment.distributorId || options.distributorId);
  const registryTenantId = str(
    payment.registryTenantId || options.registryTenantId || distributorId
  );
  return {
    id: str(payment.id),
    distributor_id: distributorId,
    registry_tenant_id: registryTenantId,
    amount: num(payment.amount),
    currency: str(payment.currency) || "INR",
    payment_type: str(payment.paymentType) || PAYMENT_TYPES.PLATFORM_FEE,
    payment_date: dateOnly(payment.paymentDate) || dateOnly(new Date().toISOString()),
    paid_at: payment.paidAt || new Date().toISOString(),
    period_ymd: dateOnly(payment.periodYmd),
    mode: str(payment.mode) || null,
    reference: str(payment.reference) || null,
    note: str(payment.note) || null,
    recorded_by: str(payment.recordedBy || options.recordedBy) || null,
    metadata: {
      ...(payment.metadata && typeof payment.metadata === "object" ? payment.metadata : {}),
    },
  };
}

function applyListFilters(query, options = {}) {
  let q = query;
  if (options.fromDate) {
    q = q.gte("payment_date", dateOnly(options.fromDate));
  }
  if (options.toDate) {
    q = q.lte("payment_date", dateOnly(options.toDate));
  }
  if (Array.isArray(options.paymentTypes) && options.paymentTypes.length) {
    q = q.in("payment_type", options.paymentTypes.map((t) => str(t)).filter(Boolean));
  }
  return q;
}

/**
 * @param {string} distributorId
 * @param {{ fromDate?: string, toDate?: string, paymentTypes?: string[], limit?: number }} [options]
 */
export async function listBillingPaymentsForDistributor(distributorId, options = {}) {
  const id = str(distributorId);
  if (!id) return { ok: true, payments: [], error: null };
  if (!supabase) return { ok: false, payments: [], error: "Supabase not configured" };

  const client = requireSupabase();
  let query = client
    .from("distributor_billing_payments")
    .select("*")
    .eq("distributor_id", id)
    .order("paid_at", { ascending: false });

  query = applyListFilters(query, options);

  const limit = num(options.limit);
  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false, payments: [], error: error.message };
  }
  return {
    ok: true,
    payments: (Array.isArray(data) ? data : []).map(rowToBillingPayment).filter(Boolean),
    error: null,
  };
}

/**
 * Sum collected platform fees for a distributor (excludes refund rows).
 * @param {string} distributorId
 * @param {{ fromDate?: string, toDate?: string, includeRefunds?: boolean }} [options]
 */
export async function sumCollectedForDistributor(distributorId, options = {}) {
  const id = str(distributorId);
  if (!id) return { ok: true, sum: 0, count: 0, error: null };
  if (!supabase) return { ok: false, sum: 0, count: 0, error: "Supabase not configured" };

  const listRes = await listBillingPaymentsForDistributor(id, {
    fromDate: options.fromDate,
    toDate: options.toDate,
    paymentTypes: options.includeRefunds
      ? [...COLLECTED_PAYMENT_TYPES, PAYMENT_TYPES.REFUND]
      : [...COLLECTED_PAYMENT_TYPES],
  });
  if (!listRes.ok) {
    return { ok: false, sum: 0, count: 0, error: listRes.error };
  }

  const payments = listRes.payments;
  const sum = payments.reduce((s, p) => s + num(p.amount), 0);
  return { ok: true, sum, count: payments.length, error: null };
}

/**
 * Batch ledger totals for portfolio billing (one query per load).
 * @param {string[]} distributorIds
 * @returns {Promise<{ ok: boolean, byDistributor: Record<string, { sum: number, count: number, latestPaidAt: string|null, latestPaymentDate: string|null }>, error: string|null }>}
 */
export async function loadBillingLedgerTotalsForDistributors(distributorIds = []) {
  const ids = [...new Set((distributorIds || []).map((id) => str(id)).filter(Boolean))];
  const emptyEntry = () => ({ sum: 0, count: 0, latestPaidAt: null, latestPaymentDate: null });
  const emptyById = () =>
    Object.fromEntries(ids.map((id) => [id, emptyEntry()]));

  if (!ids.length) {
    return { ok: true, byDistributor: {}, error: null };
  }
  if (!supabase) {
    return { ok: false, byDistributor: emptyById(), error: "Supabase not configured" };
  }

  try {
    const client = requireSupabase();
    const { data, error } = await client
      .from("distributor_billing_payments")
      .select("distributor_id, amount, paid_at, payment_date, payment_type")
      .in("distributor_id", ids);

    if (error) {
      return { ok: false, byDistributor: emptyById(), error: error.message };
    }

    const byDistributor = emptyById();
    for (const row of Array.isArray(data) ? data : []) {
      const paymentType = str(row.payment_type);
      if (!COLLECTED_PAYMENT_TYPES.has(paymentType)) continue;
      const id = str(row.distributor_id);
      if (!byDistributor[id]) continue;
      const entry = byDistributor[id];
      entry.sum += num(row.amount);
      entry.count += 1;
      const paidAt = row.paid_at ? String(row.paid_at) : null;
      if (!entry.latestPaidAt || (paidAt && paidAt > entry.latestPaidAt)) {
        entry.latestPaidAt = paidAt;
        entry.latestPaymentDate = dateOnly(row.payment_date);
      }
    }

    return { ok: true, byDistributor, error: null };
  } catch (err) {
    return {
      ok: false,
      byDistributor: emptyById(),
      error: err?.message || String(err),
    };
  }
}

/** @param {string} distributorId */
export async function getLatestBillingPaymentForDistributor(distributorId) {
  const res = await listBillingPaymentsForDistributor(distributorId, { limit: 1 });
  if (!res.ok) {
    return { ok: false, payment: null, error: res.error };
  }
  return { ok: true, payment: res.payments[0] || null, error: null };
}

/**
 * @param {object} draft
 * @param {{ registryTenantId?: string, distributorId?: string, recordedBy?: string }} [options]
 */
export async function createDistributorBillingPayment(draft, options = {}) {
  const client = requireSupabase();
  const row = billingPaymentToRow(draft, options);
  if (!row.id || !row.distributor_id || row.amount <= 0) {
    return { ok: false, payment: null, error: "Missing id, distributor_id, or amount" };
  }

  const { data, error } = await client
    .from("distributor_billing_payments")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    return { ok: false, payment: null, error: error.message };
  }
  return { ok: true, payment: rowToBillingPayment(data), error: null };
}

function readConfigBillingCollected(tenantRow) {
  const meta = tenantRow?.metadata && typeof tenantRow.metadata === "object" ? tenantRow.metadata : {};
  const config = meta.config && typeof meta.config === "object" ? meta.config : {};
  return num(config.billingCollected);
}

function readConfigBillingLastPaymentDate(tenantRow) {
  const meta = tenantRow?.metadata && typeof tenantRow.metadata === "object" ? tenantRow.metadata : {};
  const config = meta.config && typeof meta.config === "object" ? meta.config : {};
  return dateOnly(config.billingLastPaymentDate || config.lastPaymentDate);
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

export function readBillingMigrationStatus() {
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
 * One-time migration: tenants.metadata.config.billingCollected → opening_balance row.
 * @param {{ force?: boolean, homeTenantId?: string, recordedBy?: string }} [options]
 */
export async function migrateConfigBillingCollectedFromTenants(options = {}) {
  if (typeof window === "undefined") {
    return { ok: true, migrated: 0, skipped: 0, errors: [], alreadyDone: true };
  }
  if (migrationDone() && !options.force) {
    return { ok: true, migrated: 0, skipped: 0, errors: [], alreadyDone: true };
  }

  const client = requireSupabase();
  const homeTenantId = str(options.homeTenantId);
  const { rows, error: fetchError } = await fetchDatabaseTenants();
  if (fetchError) {
    return { ok: false, migrated: 0, skipped: 0, errors: [{ error: fetchError }], alreadyDone: false };
  }

  let migrated = 0;
  let skipped = 0;
  const errors = [];

  for (const tenant of rows) {
    const distributorId = str(tenant.id);
    const collected = readConfigBillingCollected(tenant);
    if (!distributorId || collected <= 0) {
      continue;
    }

    const migrationId = migrationRowId(distributorId);
    const { data: existing } = await client
      .from("distributor_billing_payments")
      .select("id")
      .eq("distributor_id", distributorId)
      .eq("payment_type", PAYMENT_TYPES.OPENING_BALANCE)
      .maybeSingle();

    if (existing?.id) {
      skipped += 1;
      continue;
    }

    const paymentDate =
      readConfigBillingLastPaymentDate(tenant) || dateOnly(new Date().toISOString());
    const row = billingPaymentToRow(
      {
        id: migrationId,
        distributorId,
        registryTenantId: homeTenantId || distributorId,
        amount: collected,
        paymentType: PAYMENT_TYPES.OPENING_BALANCE,
        paymentDate,
        note: "Migrated from tenants.metadata.config.billingCollected",
        metadata: {
          migrationSource: "config_billing_collected",
          priorConfigValue: collected,
          migratedAt: new Date().toISOString(),
        },
      },
      { recordedBy: options.recordedBy || "billing-migration" }
    );

    const { error } = await client.from("distributor_billing_payments").upsert(row, {
      onConflict: "id",
    });
    if (error) {
      errors.push({ distributorId, error: error.message });
    } else {
      migrated += 1;
    }
  }

  const summary = { migrated, skipped, errors: errors.length, tenantRows: rows.length };
  if (errors.length === 0) {
    markMigrationDone(summary);
  }

  return {
    ok: errors.length === 0,
    migrated,
    skipped,
    errors,
    alreadyDone: false,
    summary,
  };
}
