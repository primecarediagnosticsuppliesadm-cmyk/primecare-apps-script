/**
 * Durable distributor persistence — Supabase public.tenants with localStorage fallback.
 */

import { supabase } from "@/api/supabaseClient.js";
import { readTenantRegistry, upsertRegistryTenant } from "@/tenant/tenantFoundationStore.js";

export const PERSISTENCE_STATUS = {
  DURABLE: "durable",
  LOCAL_ONLY: "local_only",
  SYNC_FAILED: "sync_failed",
};

/** True when the shared Supabase client module exported a client instance. */
export function isSupabaseClientAvailable() {
  return Boolean(supabase);
}

/**
 * Predator step: durableTenantStore.supabase_client_available
 * @returns {{ ok: boolean, status: 'PASS'|'FAIL', actual: string }}
 */
export function validateSupabaseClientForPredator() {
  const ok = isSupabaseClientAvailable();
  return {
    ok,
    status: ok ? "PASS" : "FAIL",
    actual: ok ? "supabase client defined" : "supabase is not defined",
  };
}

const EXTENDED_TENANT_SELECT =
  "id, tenant_code, tenant_name, status, created_at, updated_at, legal_name, country, state, timezone, metadata";
const MINIMAL_TENANT_SELECT = "id, tenant_code, tenant_name, status, created_at";

function str(v) {
  return String(v ?? "").trim();
}

export function normalizeTenantName(name) {
  return str(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolvePersistenceStatus(tenant) {
  if (!tenant) return PERSISTENCE_STATUS.LOCAL_ONLY;
  if (tenant.persistenceStatus) return tenant.persistenceStatus;
  if (tenant.source === "database" || tenant.durable === true) return PERSISTENCE_STATUS.DURABLE;
  if (tenant.syncFailed === true || str(tenant.lastSyncError)) {
    return PERSISTENCE_STATUS.SYNC_FAILED;
  }
  return PERSISTENCE_STATUS.LOCAL_ONLY;
}

export function persistenceStatusLabel(status) {
  if (status === PERSISTENCE_STATUS.DURABLE) return "Durable";
  if (status === PERSISTENCE_STATUS.SYNC_FAILED) return "Sync failed";
  return "Local only";
}

/**
 * @param {Array<object>} dbTenants
 * @param {string} name
 * @param {string} [excludeId]
 */
export function findTenantNameCollision(dbTenants, registryRows, name, excludeId = "") {
  const norm = normalizeTenantName(name);
  if (!norm) return null;

  const ex = str(excludeId);
  for (const db of dbTenants || []) {
    if (ex && db.id === ex) continue;
    if (normalizeTenantName(db.tenant_name) === norm) {
      return { id: db.id, name: db.tenant_name, source: "database" };
    }
  }
  for (const reg of registryRows || []) {
    if (ex && reg.id === ex) continue;
    if (reg.isHome) continue;
    const regName = reg.name || reg.config?.companyName;
    if (normalizeTenantName(regName) === norm) {
      return { id: reg.id, name: regName, source: "registry" };
    }
  }
  return null;
}

function metadataFromDraft(draft) {
  const config = { ...(draft.config || {}) };
  return {
    config,
    provisioning: draft.provisioning || {},
    metrics: draft.metrics || {},
    createdVia: "distributor_provisioning_v1",
  };
}

/**
 * Build Supabase row from provisioning draft (no hardcoded tenant ids).
 */
export function buildSupabaseTenantRowFromDraft(draft) {
  const config = draft.config || {};
  const now = new Date().toISOString();
  const row = {
    id: draft.id,
    tenant_code: str(draft.tenantCode),
    tenant_name: str(draft.name || config.companyName),
    status: str(draft.status || "PENDING").toUpperCase(),
    created_at: draft.createdAt || now,
    updated_at: now,
    legal_name: str(config.legalName) || null,
    country: str(config.country) || null,
    state: str(config.state) || null,
    timezone: str(config.timezone) || null,
    metadata: metadataFromDraft(draft),
  };
  return row;
}

/**
 * Map DB tenant row into registry merge shape (metadata → config).
 */
export function mapDatabaseTenantToRegistryShape(dbRow) {
  if (!dbRow) return null;
  const meta =
    dbRow.metadata && typeof dbRow.metadata === "object" ? dbRow.metadata : {};
  const config = { ...(meta.config || {}) };
  if (dbRow.legal_name && !config.legalName) config.legalName = dbRow.legal_name;
  if (dbRow.country && !config.country) config.country = dbRow.country;
  if (dbRow.state && !config.state) config.state = dbRow.state;
  if (dbRow.timezone && !config.timezone) config.timezone = dbRow.timezone;

  return {
    id: dbRow.id,
    tenantCode: dbRow.tenant_code,
    name: dbRow.tenant_name,
    status: dbRow.status,
    createdAt: dbRow.created_at,
    updatedAt: dbRow.updated_at || dbRow.created_at,
    config,
    metrics: meta.metrics || {},
    provisioning: meta.provisioning || {},
    durable: true,
    persistenceStatus: PERSISTENCE_STATUS.DURABLE,
    source: "database",
  };
}

async function upsertWithPayload(payload) {
  const { data, error } = await supabase
    .from("tenants")
    .upsert(payload, { onConflict: "id" })
    .select(MINIMAL_TENANT_SELECT)
    .single();
  return { data, error };
}

/**
 * Insert/upsert distributor into Supabase. Returns durable flag + error message.
 */
export async function upsertDistributorToSupabase(draft, options = {}) {
  if (!supabase) {
    return { ok: false, durable: false, error: "Supabase not configured" };
  }

  const dbTenants = options.dbTenants || (await fetchDatabaseTenants());
  const registry = options.registry || [];
  const collision = findTenantNameCollision(
    dbTenants,
    registry,
    draft.name || draft.config?.companyName,
    draft.id
  );
  if (collision && !options.allowNameCollision) {
    return {
      ok: false,
      durable: false,
      error: `Duplicate tenant name: "${collision.name}" (${collision.source})`,
      duplicate: collision,
    };
  }

  const full = buildSupabaseTenantRowFromDraft(draft);
  let result = await upsertWithPayload(full);
  if (result.error && isMissingColumnError(result.error)) {
    const minimal = {
      id: full.id,
      tenant_code: full.tenant_code,
      tenant_name: full.tenant_name,
      status: full.status,
      created_at: full.created_at,
    };
    result = await upsertWithPayload(minimal);
  }

  if (result.error) {
    return {
      ok: false,
      durable: false,
      error: result.error.message || String(result.error),
    };
  }

  return {
    ok: true,
    durable: true,
    row: mapDatabaseTenantToRegistryShape({ ...full, ...result.data }),
  };
}

function isMissingColumnError(err) {
  const msg = str(err?.message || err).toLowerCase();
  return msg.includes("column") || msg.includes("metadata") || msg.includes("schema cache");
}

/**
 * Fetch tenants from Supabase (extended columns when available).
 */
export async function fetchDatabaseTenants() {
  if (!supabase) return { rows: [], extended: false, error: "Supabase not configured" };

  const extended = await supabase
    .from("tenants")
    .select(EXTENDED_TENANT_SELECT)
    .order("created_at", { ascending: true });

  if (!extended.error) {
    return {
      rows: Array.isArray(extended.data) ? extended.data : [],
      extended: true,
      error: null,
    };
  }

  const minimal = await supabase
    .from("tenants")
    .select(MINIMAL_TENANT_SELECT)
    .order("created_at", { ascending: true });

  if (minimal.error) {
    console.warn("[durableTenant] tenants read failed", minimal.error.message);
    return { rows: [], extended: false, error: minimal.error.message };
  }

  return {
    rows: Array.isArray(minimal.data) ? minimal.data : [],
    extended: false,
    error: null,
  };
}

/**
 * Update tenant status in Supabase (activation).
 */
export async function updateDistributorStatusInSupabase(tenantId, status) {
  if (!supabase || !tenantId) return { ok: false, error: "Supabase not configured" };
  const payload = {
    status: str(status).toUpperCase(),
    updated_at: new Date().toISOString(),
  };
  let { error } = await supabase.from("tenants").update(payload).eq("id", tenantId);
  if (error && isMissingColumnError(error)) {
    ({ error } = await supabase
      .from("tenants")
      .update({ status: payload.status })
      .eq("id", tenantId));
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Merge Supabase tenants + local registry. Supabase wins on id or normalized name.
 */
export function mergeTenantRegistrySources({
  dbTenants = [],
  registry = [],
  homeTenantId = "",
  liveMetrics = null,
  isolationChecks = null,
  rolesConfigured = false,
  adminProfiles = [],
  mergeTenantRow,
}) {
  const merged = [];
  const seenIds = new Set();
  const seenNormNames = new Map();
  const duplicateNames = [];

  const dbById = new Map((dbTenants || []).map((d) => [d.id, d]));

  for (const db of dbTenants || []) {
    const reg = registry.find((r) => r.id === db.id) || {};
    const isHome = db.id === homeTenantId;
    const regShape = mapDatabaseTenantToRegistryShape(db);
    const metrics = isHome ? liveMetrics : reg.metrics || regShape?.metrics;
    const checks = isHome ? isolationChecks : reg.isolationChecks;
    const config = {
      ...(regShape?.config || {}),
      ...(reg.config || {}),
      rolesConfigured: isHome ? rolesConfigured : reg.config?.rolesConfigured,
      productCatalogReady: isHome
        ? Number(metrics?.products || 0) > 0
        : reg.config?.productCatalogReady ?? regShape?.config?.productCatalogReady,
    };
    if (isHome && adminProfiles.length) {
      const admin = adminProfiles.find((p) => p.role === "admin") || adminProfiles[0];
      config.adminName = config.adminName || admin?.agent_name || "Admin";
      config.rolesConfigured = rolesConfigured;
    }

    const row = mergeTenantRow(
      db,
      {
        ...regShape,
        ...reg,
        config,
        isHome,
        durable: true,
        persistenceStatus: PERSISTENCE_STATUS.DURABLE,
        source: "database",
      },
      metrics,
      checks
    );
    merged.push(row);
    seenIds.add(db.id);
    const norm = normalizeTenantName(row.name);
    if (norm) seenNormNames.set(norm, row);
  }

  for (const reg of registry) {
    if (!reg.id || seenIds.has(reg.id)) continue;
    const norm = normalizeTenantName(reg.name || reg.config?.companyName);
    const dbDup = norm ? findDbByNormName(dbTenants, norm) : null;
    if (dbDup && dbDup.id !== reg.id) {
      duplicateNames.push({
        name: reg.name || reg.config?.companyName,
        localId: reg.id,
        durableId: dbDup.id,
      });
      continue;
    }
    if (norm && seenNormNames.has(norm)) {
      duplicateNames.push({
        name: reg.name || reg.config?.companyName,
        localId: reg.id,
        durableId: seenNormNames.get(norm)?.id,
      });
      continue;
    }

    const persistenceStatus = resolvePersistenceStatus(reg);
    merged.push(
      mergeTenantRow(null, {
        ...reg,
        persistenceStatus,
        durable: persistenceStatus === PERSISTENCE_STATUS.DURABLE,
      }, reg.metrics, reg.isolationChecks)
    );
    seenIds.add(reg.id);
    if (norm) seenNormNames.set(norm, reg);
  }

  merged.sort((a, b) => {
    if (a.isHome) return -1;
    if (b.isHome) return 1;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });

  return { tenants: merged, duplicateNames };
}

function findDbByNormName(dbTenants, norm) {
  return (dbTenants || []).find((d) => normalizeTenantName(d.tenant_name) === norm) || null;
}

/**
 * Sync all local-only registry distributors to Supabase.
 */
export async function syncLocalDistributorsToSupabase(homeTenantId) {
  const registry = readTenantRegistry();
  const { rows: dbTenants } = await fetchDatabaseTenants();

  const results = [];
  for (const reg of registry) {
    if (!reg.id || reg.isHome || reg.id === homeTenantId) continue;
    if (reg.durable === true || reg.source === "database") continue;

    const draft = {
      ...reg,
      name: reg.name || reg.config?.companyName,
      tenantCode: reg.tenantCode,
      config: reg.config || {},
      metrics: reg.metrics || {},
      provisioning: reg.provisioning || {},
    };

    const outcome = await upsertDistributorToSupabase(draft, {
      dbTenants,
      registry,
    });

    if (outcome.ok && outcome.durable) {
      upsertRegistryTenant({
        ...reg,
        ...outcome.row,
        durable: true,
        localOnly: false,
        syncFailed: false,
        lastSyncError: null,
        persistenceStatus: PERSISTENCE_STATUS.DURABLE,
        source: "database",
      });
      results.push({ id: reg.id, name: reg.name, ok: true });
    } else {
      upsertRegistryTenant({
        ...reg,
        syncFailed: true,
        lastSyncError: outcome.error || "Sync failed",
        persistenceStatus: PERSISTENCE_STATUS.SYNC_FAILED,
      });
      results.push({
        id: reg.id,
        name: reg.name,
        ok: false,
        error: outcome.error,
      });
    }
  }

  return {
    attempted: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok),
    results,
  };
}
