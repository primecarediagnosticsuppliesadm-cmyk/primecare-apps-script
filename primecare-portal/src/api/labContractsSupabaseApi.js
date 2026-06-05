/**
 * Durable lab commercial contracts — Supabase public.lab_contracts.
 * Platform PrimeCare ↔ Distributor agreement stays in tenants.metadata.config.
 */
import { supabase } from "@/api/supabaseClient.js";
import { LAB_CONTRACT_VERSION } from "@/labContract/labContractTypes.js";
import { CONTRACT_STATUSES } from "@/labContract/labContractTypes.js";
import { labIdKey } from "@/utils/labId.js";

const REGISTRY_PREFIX = "primecare_lab_contract_registry_v1";
const MIGRATION_FLAG_KEY = "primecare_lab_contracts_migration_v1_done";

const TERMINATED_STATUSES = new Set([
  CONTRACT_STATUSES.TERMINATED,
  CONTRACT_STATUSES.EXPIRED,
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

/** @param {object} row */
export function rowToLabContract(row) {
  if (!row) return null;
  const commercial = {
    monthlyCommitment: num(row.monthly_commitment),
    creditLimit: num(row.credit_limit),
    paymentTerms: str(row.payment_terms) || "30 Days",
    collectionTargetPct: num(row.collection_target_pct),
    distributorMarginPct: num(row.distributor_margin_pct),
    primecareMarginPct: num(row.primecare_margin_pct),
  };
  return {
    id: str(row.id),
    contractNumber: str(row.contract_number),
    tenantId: str(row.registry_tenant_id),
    distributorId: str(row.distributor_id),
    distributorName: str(row.distributor_name),
    labId: labIdKey(row.lab_id),
    labName: str(row.lab_name),
    contractType: str(row.contract_type),
    status: str(row.status),
    startDate: dateOnly(row.start_date) || "",
    endDate: dateOnly(row.end_date) || "",
    autoRenewal: Boolean(row.auto_renewal),
    owner: str(row.owner),
    notes: str(row.notes),
    commercial,
    l1b: row.l1b && typeof row.l1b === "object" ? row.l1b : null,
    timeline: Array.isArray(row.timeline) ? row.timeline : [],
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

/** @param {object} contract */
export function labContractToRow(contract, options = {}) {
  const distributorId = str(contract.distributorId || options.distributorId);
  const registryTenantId = str(
    contract.tenantId || options.registryTenantId || distributorId
  );
  const commercial = contract.commercial || {};
  return {
    id: str(contract.id),
    contract_number: str(contract.contractNumber),
    distributor_id: distributorId,
    registry_tenant_id: registryTenantId,
    lab_id: labIdKey(contract.labId),
    lab_name: str(contract.labName) || null,
    distributor_name: str(contract.distributorName) || null,
    contract_type: str(contract.contractType),
    status: str(contract.status) || CONTRACT_STATUSES.DRAFT,
    start_date: dateOnly(contract.startDate),
    end_date: dateOnly(contract.endDate),
    auto_renewal: Boolean(contract.autoRenewal),
    owner: str(contract.owner) || null,
    notes: str(contract.notes) || null,
    payment_terms: str(commercial.paymentTerms) || null,
    credit_limit: num(commercial.creditLimit),
    collection_target_pct: num(commercial.collectionTargetPct),
    monthly_commitment: num(commercial.monthlyCommitment),
    distributor_margin_pct: num(commercial.distributorMarginPct),
    primecare_margin_pct: num(commercial.primecareMarginPct),
    l1b: contract.l1b && typeof contract.l1b === "object" ? contract.l1b : null,
    timeline: Array.isArray(contract.timeline) ? contract.timeline : [],
    metadata: {
      ...(contract.metadata && typeof contract.metadata === "object" ? contract.metadata : {}),
      version: LAB_CONTRACT_VERSION,
    },
  };
}

function applyCountFilter(query, filter = {}) {
  if (filter.nonTerminated) {
    return query
      .neq("status", CONTRACT_STATUSES.TERMINATED)
      .neq("status", CONTRACT_STATUSES.EXPIRED);
  }
  if (filter.status) {
    return query.eq("status", str(filter.status));
  }
  return query;
}

/**
 * @param {string} distributorId
 * @param {{ nonTerminated?: boolean, status?: string, orderBy?: string }} [options]
 */
export async function getContractsForDistributor(distributorId, options = {}) {
  const id = str(distributorId);
  if (!id) return { ok: true, contracts: [], error: null };
  if (!supabase) return { ok: false, contracts: [], error: "Supabase not configured" };

  const client = requireSupabase();
  let query = client
    .from("lab_contracts")
    .select("*")
    .eq("distributor_id", id)
    .order("updated_at", { ascending: false });

  query = applyCountFilter(query, options);

  const { data, error } = await query;
  if (error) {
    return { ok: false, contracts: [], error: error.message };
  }
  return {
    ok: true,
    contracts: (Array.isArray(data) ? data : []).map(rowToLabContract).filter(Boolean),
    error: null,
  };
}

/** @param {string} contractId */
export async function getContractById(contractId) {
  const id = str(contractId);
  if (!id) return { ok: false, contract: null, error: "Missing contract id" };

  const client = requireSupabase();
  const { data, error } = await client.from("lab_contracts").select("*").eq("id", id).maybeSingle();
  if (error) return { ok: false, contract: null, error: error.message };
  return { ok: true, contract: data ? rowToLabContract(data) : null, error: null };
}

/**
 * @param {object} draft
 * @param {{ registryTenantId?: string, distributorId?: string }} [options]
 */
export async function createLabContract(draft, options = {}) {
  const client = requireSupabase();
  const row = labContractToRow(draft, options);
  if (!row.id || !row.distributor_id || !row.contract_number || !row.lab_id) {
    return { ok: false, contract: null, error: "Missing required contract fields" };
  }

  const { data, error } = await client.from("lab_contracts").insert(row).select("*").single();
  if (error) return { ok: false, contract: null, error: error.message };
  return { ok: true, contract: rowToLabContract(data), error: null };
}

/**
 * @param {string} contractId
 * @param {object} patch — partial domain contract
 */
export async function updateLabContract(contractId, patch) {
  const id = str(contractId);
  if (!id) return { ok: false, contract: null, error: "Missing contract id" };

  const existing = await getContractById(id);
  if (!existing.ok) return existing;
  if (!existing.contract) return { ok: false, contract: null, error: "Contract not found" };

  const merged = {
    ...existing.contract,
    ...patch,
    commercial: { ...existing.contract.commercial, ...(patch.commercial || {}) },
    timeline: patch.timeline ?? existing.contract.timeline,
    metadata: { ...existing.contract.metadata, ...(patch.metadata || {}) },
  };
  const row = labContractToRow(merged);
  delete row.id;

  const client = requireSupabase();
  const { data, error } = await client
    .from("lab_contracts")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { ok: false, contract: null, error: error.message };
  return { ok: true, contract: rowToLabContract(data), error: null };
}

/**
 * @param {string} contractId
 * @param {string} status
 * @param {{ timeline?: object[], note?: string }} [meta]
 */
export async function transitionLabContractStatus(contractId, status, meta = {}) {
  const patch = { status: str(status) };
  if (Array.isArray(meta.timeline)) {
    patch.timeline = meta.timeline;
  }
  if (meta.note) {
    patch.notes = str(meta.note);
  }
  return updateLabContract(contractId, patch);
}

/**
 * @param {string} contractId
 * @param {{ endDate?: string, status?: string, timeline?: object[] }} [options]
 */
export async function renewLabContract(contractId, options = {}) {
  const patch = {
    status: options.status || CONTRACT_STATUSES.ACTIVE,
    endDate: options.endDate,
    autoRenewal: true,
  };
  if (Array.isArray(options.timeline)) {
    patch.timeline = options.timeline;
  }
  return updateLabContract(contractId, patch);
}

/** @param {string} contractId */
export async function terminateLabContract(contractId, reason = "") {
  return transitionLabContractStatus(contractId, CONTRACT_STATUSES.TERMINATED, {
    note: reason,
  });
}

/**
 * Count contracts for launch gate and portfolio.
 * @param {string} distributorId
 * @param {{ nonTerminated?: boolean, status?: string }} [filter]
 */
export async function countContractsForDistributor(distributorId, filter = {}) {
  const id = str(distributorId);
  if (!id) return { ok: true, count: 0, error: null };
  if (!supabase) return { ok: false, count: 0, error: "Supabase not configured" };

  const client = requireSupabase();
  let query = client
    .from("lab_contracts")
    .select("id", { count: "exact", head: true })
    .eq("distributor_id", id);

  query = applyCountFilter(query, filter);

  const { count, error } = await query;
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: true, count: count ?? 0, error: null };
}

/** Non-terminated contracts — used by contract_configured gate. */
export async function countNonTerminatedContractsForDistributor(distributorId) {
  return countContractsForDistributor(distributorId, { nonTerminated: true });
}

function isNonTerminated(status) {
  return !TERMINATED_STATUSES.has(str(status));
}

function scanLocalRegistryKeys() {
  if (typeof window === "undefined") return [];
  const keys = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(`${REGISTRY_PREFIX}:`)) {
      keys.push(key);
    }
  }
  return keys;
}

function readLocalRegistryFromKey(storageKey) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    const tenantId = storageKey.slice(`${REGISTRY_PREFIX}:`.length);
    return {
      tenantId,
      contracts: Array.isArray(parsed.contracts) ? parsed.contracts : [],
    };
  } catch {
    return { tenantId: "", contracts: [] };
  }
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

/**
 * One-time localStorage → Supabase migration (idempotent by contract id).
 * @param {{ force?: boolean }} [options]
 */
export async function migrateLocalContractsToSupabase(options = {}) {
  if (typeof window === "undefined") {
    return { ok: true, migrated: 0, skipped: 0, errors: [], alreadyDone: true };
  }
  if (migrationDone() && !options.force) {
    return { ok: true, migrated: 0, skipped: 0, errors: [], alreadyDone: true };
  }

  const client = requireSupabase();
  const keys = scanLocalRegistryKeys();
  if (!keys.length) {
    const summary = { migrated: 0, skipped: 0, errors: 0, registryKeys: 0 };
    markMigrationDone(summary);
    return {
      ok: true,
      migrated: 0,
      skipped: 0,
      errors: [],
      alreadyDone: false,
      summary,
    };
  }

  const seenIds = new Set();
  let migrated = 0;
  let skipped = 0;
  const errors = [];

  for (const storageKey of keys) {
    const { tenantId: registryTenantId, contracts } = readLocalRegistryFromKey(storageKey);
    for (const raw of contracts) {
      const id = str(raw.id);
      if (!id || seenIds.has(id)) {
        skipped += 1;
        continue;
      }
      seenIds.add(id);

      const distributorId = str(raw.distributorId || raw.tenantId || registryTenantId);
      const contract = {
        ...raw,
        distributorId,
        tenantId: registryTenantId,
        metadata: {
          ...(raw.metadata || {}),
          migratedFromLocal: true,
          legacyRegistryKey: storageKey,
        },
      };
      const row = labContractToRow(contract, { registryTenantId, distributorId });

      const { error } = await client.from("lab_contracts").upsert(row, { onConflict: "id" });
      if (error) {
        errors.push({ id, error: error.message });
      } else {
        migrated += 1;
      }
    }
  }

  const summary = { migrated, skipped, errors: errors.length, registryKeys: keys.length };
  const hadLocalContracts = keys.some(
    (storageKey) => readLocalRegistryFromKey(storageKey).contracts.length > 0
  );
  if (errors.length === 0 || !hadLocalContracts) {
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

export function readLabContractMigrationStatus() {
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
  return {
    done: migrationDone(),
    localRegistryKeys: scanLocalRegistryKeys(),
    summary,
  };
}

export { isNonTerminated, TERMINATED_STATUSES };
