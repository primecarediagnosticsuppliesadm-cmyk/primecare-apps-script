import { LAB_CONTRACT_VERSION } from "@/labContract/labContractTypes.js";
import { supabase } from "@/api/supabaseClient.js";
import {
  createLabContract,
  getContractById,
  getContractsForDistributor,
  migrateLocalContractsToSupabase,
  readLabContractMigrationStatus,
  rowToLabContract,
  updateLabContract,
} from "@/api/labContractsSupabaseApi.js";

const REGISTRY_PREFIX = "primecare_lab_contract_registry_v1";

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function str(v) {
  return String(v ?? "").trim();
}

function registryKey(tenantId) {
  return `${REGISTRY_PREFIX}:${tenantId || "default"}`;
}

let migrationPromise = null;

/** @deprecated Write path — Phase 1C. Reads use Supabase via loadContractsForDistributor. */
export function readLabContractRegistry(tenantId) {
  if (typeof window === "undefined") {
    return { contracts: [], updatedAt: null, version: LAB_CONTRACT_VERSION };
  }
  const data = safeParse(window.localStorage.getItem(registryKey(tenantId)), {
    contracts: [],
  });
  return {
    contracts: Array.isArray(data.contracts) ? data.contracts : [],
    updatedAt: data.updatedAt || null,
    version: data.version || LAB_CONTRACT_VERSION,
  };
}

/**
 * Legacy dual-registry local read (deduped by contract id).
 * Used only as fallback when Supabase is unavailable or migration fails.
 */
export function readLocalContractsForDistributor(distributorId, homeTenantId = "") {
  const target = str(distributorId);
  if (!target) return [];

  const home = str(homeTenantId);
  const buckets = [];
  if (home) buckets.push(readLabContractRegistry(home).contracts);
  if (target !== home) buckets.push(readLabContractRegistry(target).contracts);
  if (!home) buckets.push(readLabContractRegistry(target).contracts);

  const seen = new Set();
  const out = [];
  for (const list of buckets) {
    for (const c of list) {
      if (!c?.id || seen.has(c.id)) continue;
      if (
        str(c.distributorId) === target ||
        str(c.tenantId) === target ||
        str(c.tenant_id) === target
      ) {
        seen.add(c.id);
        out.push(c);
      }
    }
  }
  return out;
}

function hasLocalContractData() {
  if (typeof window === "undefined") return false;
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(`${REGISTRY_PREFIX}:`)) continue;
    const data = readLabContractRegistry(key.slice(`${REGISTRY_PREFIX}:`.length));
    if (data.contracts.length > 0) return true;
  }
  return false;
}

/**
 * One-time localStorage → Supabase migration (idempotent).
 */
export async function ensureLabContractsMigrated() {
  if (typeof window === "undefined") return { ok: true, alreadyDone: true };
  const status = readLabContractMigrationStatus();
  if (status.done) return { ok: true, alreadyDone: true };
  if (!hasLocalContractData()) {
    const result = await migrateLocalContractsToSupabase();
    return result;
  }
  if (!migrationPromise) {
    migrationPromise = migrateLocalContractsToSupabase().finally(() => {
      migrationPromise = null;
    });
  }
  return migrationPromise;
}

/**
 * Durable read — Supabase primary, local fallback on error or missing config.
 * @param {string} distributorId
 * @param {{ homeTenantId?: string, nonTerminated?: boolean }} [options]
 */
export async function loadContractsForDistributor(distributorId, options = {}) {
  const id = str(distributorId);
  if (!id) return [];

  const homeTenantId = str(options.homeTenantId);

  if (!supabase) {
    return readLocalContractsForDistributor(id, homeTenantId);
  }

  await ensureLabContractsMigrated();

  const res = await getContractsForDistributor(id, {
    nonTerminated: options.nonTerminated,
  });

  if (res.ok) {
    if (res.contracts.length > 0 || readLabContractMigrationStatus().done) {
      return res.contracts;
    }
    const local = readLocalContractsForDistributor(id, homeTenantId);
    if (local.length > 0) {
      await migrateLocalContractsToSupabase();
      const retry = await getContractsForDistributor(id, {
        nonTerminated: options.nonTerminated,
      });
      if (retry.ok && retry.contracts.length > 0) return retry.contracts;
      return local;
    }
    return res.contracts;
  }

  console.warn("[labContract] Supabase read failed, using local fallback:", res.error);
  return readLocalContractsForDistributor(id, homeTenantId);
}

/**
 * Portfolio / founder read — all contracts visible to current user (RLS-scoped).
 */
export async function loadVisibleLabContracts() {
  if (!supabase) {
    if (typeof window === "undefined") return [];
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(`${REGISTRY_PREFIX}:`)) {
        keys.push(key.slice(`${REGISTRY_PREFIX}:`.length));
      }
    }
    const seen = new Set();
    const out = [];
    for (const tenantId of keys) {
      for (const c of readLabContractRegistry(tenantId).contracts) {
        if (c?.id && !seen.has(c.id)) {
          seen.add(c.id);
          out.push(c);
        }
      }
    }
    return out;
  }

  await ensureLabContractsMigrated();

  const { data, error } = await supabase
    .from("lab_contracts")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("[labContract] portfolio read failed:", error.message);
    return [];
  }

  return (Array.isArray(data) ? data : []).map(rowToLabContract).filter(Boolean);
}

/** @deprecated Write path — Phase 1C */
export function writeLabContractRegistry(tenantId, registry) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    registryKey(tenantId),
    JSON.stringify({
      ...registry,
      version: LAB_CONTRACT_VERSION,
      updatedAt: new Date().toISOString(),
    })
  );
}

/** Persist contract to Supabase (insert or update by id). */
export async function upsertLabContract(tenantId, contract) {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  const distributorId = str(contract.distributorId) || str(tenantId);
  const existing = await getContractById(contract.id);
  if (existing.ok && existing.contract) {
    const res = await updateLabContract(contract.id, contract);
    if (!res.ok || !res.contract) {
      throw new Error(res.error || "Failed to update contract");
    }
    return res.contract;
  }
  const res = await createLabContract(contract, {
    registryTenantId: str(tenantId),
    distributorId,
  });
  if (!res.ok || !res.contract) {
    throw new Error(res.error || "Failed to create contract");
  }
  return res.contract;
}

/** Load single contract from Supabase by id. */
export async function getLabContractById(_tenantId, contractId) {
  const res = await getContractById(contractId);
  return res.ok ? res.contract : null;
}

/** @deprecated Write path — Phase 1C */
export function deleteLabContract(tenantId, contractId) {
  const registry = readLabContractRegistry(tenantId);
  writeLabContractRegistry(tenantId, {
    ...registry,
    contracts: registry.contracts.filter((c) => c.id !== contractId),
  });
}

export { readLabContractMigrationStatus };
