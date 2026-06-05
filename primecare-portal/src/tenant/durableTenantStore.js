/**
 * Durable distributor persistence — Supabase public.tenants with localStorage fallback.
 */

import { supabase } from "@/api/supabaseClient.js";
import { readTenantRegistry, upsertRegistryTenant } from "@/tenant/tenantFoundationStore.js";

export const PERSISTENCE_STATUS = {
  DURABLE: "durable",
  LOCAL_ONLY: "local_only",
  SYNC_FAILED: "sync_failed",
  UNKNOWN: "unknown",
};

const KNOWN_PERSISTENCE_STATUSES = new Set(Object.values(PERSISTENCE_STATUS));

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

/**
 * Resolve persistence key for a tenant/distributor row (never throws).
 */
export function resolvePersistenceStatus(tenant) {
  try {
    if (!tenant || typeof tenant !== "object") return PERSISTENCE_STATUS.UNKNOWN;
    const explicit = tenant.persistenceStatus;
    if (explicit && KNOWN_PERSISTENCE_STATUSES.has(explicit)) return explicit;
    if (tenant.source === "database" || tenant.durable === true) {
      return PERSISTENCE_STATUS.DURABLE;
    }
    if (tenant.syncFailed === true || str(tenant.lastSyncError)) {
      return PERSISTENCE_STATUS.SYNC_FAILED;
    }
    if (tenant.source === "registry" || tenant.localOnly === true) {
      return PERSISTENCE_STATUS.LOCAL_ONLY;
    }
    return PERSISTENCE_STATUS.LOCAL_ONLY;
  } catch {
    return PERSISTENCE_STATUS.UNKNOWN;
  }
}

export function persistenceStatusLabel(status) {
  if (status === PERSISTENCE_STATUS.DURABLE) return "Saved permanently";
  if (status === PERSISTENCE_STATUS.SYNC_FAILED) return "Save failed";
  if (status === PERSISTENCE_STATUS.LOCAL_ONLY) return "Saved on this device";
  if (status === PERSISTENCE_STATUS.UNKNOWN) return "Unknown";
  return "Unknown";
}

/**
 * UI-safe persistence display (badges must not crash the page).
 * @returns {{ key: string, label: string, tone: 'success'|'warn'|'danger' }}
 */
export function resolvePersistenceDisplay(tenant) {
  try {
    const key = resolvePersistenceStatus(tenant);
    if (key === PERSISTENCE_STATUS.DURABLE) {
      return { key, label: "Saved permanently", tone: "success" };
    }
    if (key === PERSISTENCE_STATUS.SYNC_FAILED) {
      return { key, label: "Save failed", tone: "danger" };
    }
    if (key === PERSISTENCE_STATUS.LOCAL_ONLY) {
      return { key, label: "Saved on this device", tone: "warn" };
    }
    if (key === PERSISTENCE_STATUS.UNKNOWN) {
      return { key, label: "Unknown", tone: "warn" };
    }
    return { key: PERSISTENCE_STATUS.UNKNOWN, label: "Unknown", tone: "warn" };
  } catch {
    return { key: "unknown", label: "Unknown", tone: "warn" };
  }
}

/**
 * Predator step: durableTenantStore.persistence_status_resolves
 */
export function validatePersistenceStatusResolvesForPredator() {
  try {
    if (typeof resolvePersistenceStatus !== "function") {
      return {
        ok: false,
        status: "FAIL",
        actual: "resolvePersistenceStatus is not defined",
      };
    }
    const samples = [
      { source: "database", durable: true },
      { source: "registry", localOnly: true },
      { syncFailed: true, lastSyncError: "test" },
      { persistenceStatus: PERSISTENCE_STATUS.UNKNOWN },
      null,
    ];
    for (const sample of samples) {
      const display = resolvePersistenceDisplay(sample);
      if (!display?.key || !display?.label || !display?.tone) {
        return {
          ok: false,
          status: "FAIL",
          actual: `invalid display for ${JSON.stringify(sample)}`,
        };
      }
    }
    return {
      ok: true,
      status: "PASS",
      actual: "resolvePersistenceStatus/export ok",
    };
  } catch (err) {
    return {
      ok: false,
      status: "FAIL",
      actual: err?.message || String(err),
    };
  }
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

/** Provisioning booleans merged with OR (local true wins persistence). */
const PROVISIONING_BOOL_FLAGS = [
  "productCatalogReady",
  "catalogAssigned",
  "rolesConfigured",
  "agentProvisioned",
  "isolationAcknowledged",
  "rolesAutoProvisioned",
  "orderingEnabled",
  "collectionsEnabled",
];

const PROVISIONING_TIMESTAMP_FIELDS = [
  "catalogConfiguredAt",
  "catalogAssignedAt",
  "rolesConfiguredAt",
  "adminUpdatedAt",
  "agentProvisionedAt",
];

const PROVISIONING_NUMERIC_FIELDS = ["catalogAssignedCount"];

const ADMIN_CONTACT_FIELDS = ["adminName", "adminEmail", "adminPhone"];

function mergeAdminContactFields(localConfig = {}, durableConfig = {}, merged = {}) {
  const localAt = Date.parse(str(localConfig.adminUpdatedAt)) || 0;
  const durableAt = Date.parse(str(durableConfig.adminUpdatedAt)) || 0;
  const preferLocal = localAt >= durableAt;

  for (const field of ADMIN_CONTACT_FIELDS) {
    const localVal = str(localConfig[field]);
    const durableVal = str(durableConfig[field]);
    if (preferLocal) {
      if (localVal) merged[field] = localConfig[field];
      else if (durableVal) merged[field] = durableConfig[field];
    } else if (durableVal) {
      merged[field] = durableConfig[field];
    } else if (localVal) {
      merged[field] = localConfig[field];
    }
  }
  const newerAt = pickNewerIso(localConfig.adminUpdatedAt, durableConfig.adminUpdatedAt);
  if (newerAt) merged.adminUpdatedAt = newerAt;
  return merged;
}

function pickNewerIso(a, b) {
  const as = str(a);
  const bs = str(b);
  if (!as) return bs || null;
  if (!bs) return as || null;
  return Date.parse(as) >= Date.parse(bs) ? as : bs;
}

/**
 * Merge local + durable provisioning config without dropping admin/territories.
 */
export function mergeProvisioningConfigFlags(localConfig = {}, durableConfig = {}) {
  const merged = mergeAdminContactFields(localConfig, durableConfig, {
    ...durableConfig,
    ...localConfig,
  });
  for (const flag of PROVISIONING_BOOL_FLAGS) {
    if (localConfig[flag] === true || durableConfig[flag] === true) {
      merged[flag] = true;
    }
  }
  for (const field of PROVISIONING_TIMESTAMP_FIELDS) {
    const newer = pickNewerIso(localConfig[field], durableConfig[field]);
    if (newer) merged[field] = newer;
  }
  for (const field of PROVISIONING_NUMERIC_FIELDS) {
    const localNum = Number(localConfig[field]);
    const durableNum = Number(durableConfig[field]);
    const localValid = Number.isFinite(localNum) && localNum > 0;
    const durableValid = Number.isFinite(durableNum) && durableNum > 0;
    if (localValid || durableValid) {
      merged[field] = Math.max(localValid ? localNum : 0, durableValid ? durableNum : 0);
    }
  }
  const localCatalogItems = Array.isArray(localConfig.distributorCatalog?.items)
    ? localConfig.distributorCatalog.items.length
    : 0;
  const durableCatalogItems = Array.isArray(durableConfig.distributorCatalog?.items)
    ? durableConfig.distributorCatalog.items.length
    : 0;
  if (localCatalogItems > 0 || durableCatalogItems > 0) {
    merged.distributorCatalog =
      localCatalogItems >= durableCatalogItems && localConfig.distributorCatalog
        ? localConfig.distributorCatalog
        : durableConfig.distributorCatalog;
  }
  return merged;
}

/**
 * Merge provisioning timeline events by id (newer `at` wins).
 */
export function mergeProvisioningTimelines(localTimeline = [], durableTimeline = []) {
  const byId = new Map();
  for (const event of [...(durableTimeline || []), ...(localTimeline || [])]) {
    if (!event?.id) continue;
    const existing = byId.get(event.id);
    if (!existing || Date.parse(event.at || 0) >= Date.parse(existing.at || 0)) {
      byId.set(event.id, event);
    }
  }
  return [...byId.values()].sort(
    (a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0)
  );
}

export function mergeProvisioningState(localRow = {}, durableRow = {}) {
  const localConfig = localRow.config || {};
  const durableConfig = durableRow.config || {};
  const localProv = localRow.provisioning || {};
  const durableProv = durableRow.provisioning || {};
  return {
    config: mergeProvisioningConfigFlags(localConfig, durableConfig),
    provisioning: {
      ...durableProv,
      ...localProv,
      timeline: mergeProvisioningTimelines(localProv.timeline, durableProv.timeline),
    },
  };
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
 * Fetch a single tenant row from Supabase (extended columns when available).
 */
export async function fetchDatabaseTenantById(tenantId) {
  const id = str(tenantId);
  if (!supabase || !id) return { row: null, extended: false, error: "Supabase not configured" };

  const extended = await supabase
    .from("tenants")
    .select(EXTENDED_TENANT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!extended.error && extended.data) {
    return { row: extended.data, extended: true, error: null };
  }

  const minimal = await supabase
    .from("tenants")
    .select(MINIMAL_TENANT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (minimal.error || !minimal.data) {
    return {
      row: null,
      extended: false,
      error: extended.error?.message || minimal.error?.message || "Tenant not found",
    };
  }

  return { row: minimal.data, extended: false, error: null };
}

/**
 * Confirm catalog flags persisted in public.tenants.metadata.config.
 */
export async function verifyDistributorCatalogMetadata(
  tenantId,
  { minCount = 1, requireAssigned = true } = {}
) {
  const { row, error } = await fetchDatabaseTenantById(tenantId);
  if (!row) {
    return {
      ok: false,
      found: false,
      catalogAssigned: false,
      catalogAssignedCount: 0,
      error: error || "Tenant not found in Supabase",
    };
  }

  const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const config = meta.config && typeof meta.config === "object" ? meta.config : {};
  const catalogAssigned = config.catalogAssigned === true;
  const catalogAssignedCount = Number(config.catalogAssignedCount || 0);
  const itemCount = Array.isArray(config.distributorCatalog?.items)
    ? config.distributorCatalog.items.length
    : 0;
  const effectiveCount = Math.max(catalogAssignedCount, itemCount);

  let ok = false;
  if (requireAssigned) {
    const required = Math.max(1, Number(minCount) || 1);
    ok = catalogAssigned && effectiveCount >= required;
  } else {
    ok = !catalogAssigned && effectiveCount === 0;
  }

  return {
    ok,
    found: true,
    catalogAssigned,
    catalogAssignedCount: effectiveCount,
    config,
    error: ok
      ? null
      : `metadata.config.catalogAssigned=${String(config.catalogAssigned)} catalogAssignedCount=${effectiveCount}`,
  };
}

/**
 * Patch tenants.metadata for a durable distributor (preserves admin, territories, metrics).
 */
export async function patchDurableTenantMetadata(tenantId, { config = {}, provisioning = {} } = {}) {
  if (!supabase || !tenantId) {
    return { ok: false, error: "Supabase not configured" };
  }

  let current = null;
  const extended = await supabase
    .from("tenants")
    .select(EXTENDED_TENANT_SELECT)
    .eq("id", tenantId)
    .maybeSingle();

  if (!extended.error && extended.data) {
    current = extended.data;
  } else {
    const minimal = await supabase
      .from("tenants")
      .select(MINIMAL_TENANT_SELECT)
      .eq("id", tenantId)
      .maybeSingle();
    if (minimal.error || !minimal.data) {
      return { ok: false, error: extended.error?.message || minimal.error?.message || "Tenant not found" };
    }
    current = minimal.data;
  }

  const meta =
    current.metadata && typeof current.metadata === "object" ? current.metadata : {};
  const regShape = mapDatabaseTenantToRegistryShape(current);
  const merged = mergeProvisioningState(
    { config, provisioning },
    { config: regShape?.config || meta.config || {}, provisioning: regShape?.provisioning || meta.provisioning || {} }
  );

  const metadata = {
    ...meta,
    config: merged.config,
    provisioning: merged.provisioning,
    metrics: meta.metrics || regShape?.metrics || {},
  };

  const payload = {
    metadata,
    updated_at: new Date().toISOString(),
  };

  let { error } = await supabase.from("tenants").update(payload).eq("id", tenantId);
  if (error && isMissingColumnError(error)) {
    return { ok: false, error: "metadata column not available — run durable_distributor_tenants_migration.sql" };
  }
  if (error) return { ok: false, error: error.message };
  return { ok: true, metadata };
}

/**
 * Predator: local productCatalogReady must survive durable merge + catalog gate.
 */
export function validateDurableCatalogFlagPersistsForPredator(bundle, resolveModel) {
  const registry = readTenantRegistry();
  const flagged = registry.filter(
    (r) => !r.isHome && r.config?.productCatalogReady === true
  );
  if (!flagged.length) {
    return { status: "PASS", actual: "no local catalog flags" };
  }

  const failures = [];
  for (const reg of flagged) {
    const merged = (bundle?.tenants || []).find((t) => t.id === reg.id);
    const model = resolveModel?.(bundle, reg.id);
    const catalog = model?.checks?.find((c) => c.id === "catalog_configured");
    if (!merged?.config?.productCatalogReady || catalog?.status !== "PASS") {
      failures.push(reg.name || reg.id.slice(0, 8));
    }
  }

  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    actual: failures.length
      ? `catalog flag lost: ${failures.join(", ")}`
      : `${flagged.length} catalog flag(s) persisted`,
  };
}

/**
 * Debug: catalog flag across local, durable, merged rows.
 */
export function buildCatalogFlagRegistryDebug(bundle) {
  const registry = readTenantRegistry();
  const dbRows = bundle?.dbFetch?.rows || [];
  const homeId = str(bundle?.homeTenantId);

  return (bundle?.tenants || [])
    .filter((t) => t.id && t.id !== homeId && !t.isHome)
    .map((t) => {
      const local = registry.find((r) => r.id === t.id);
      const db = dbRows.find((d) => d.id === t.id);
      const dbMeta =
        db?.metadata && typeof db.metadata === "object" ? db.metadata : {};
      const localConfig = local?.config || {};
      const durableConfig = dbMeta.config || {};
      const mergedConfig = t.config || {};
      return {
        id: t.id,
        name: t.name,
        localProductCatalogReady: Boolean(localConfig.productCatalogReady),
        durableProductCatalogReady: Boolean(durableConfig.productCatalogReady),
        mergedProductCatalogReady: Boolean(mergedConfig.productCatalogReady),
        localCatalogAssigned: Boolean(localConfig.catalogAssigned),
        durableCatalogAssigned: Boolean(durableConfig.catalogAssigned),
        mergedCatalogAssigned: Boolean(mergedConfig.catalogAssigned),
        localCatalogAssignedCount: Number(localConfig.catalogAssignedCount || 0),
        durableCatalogAssignedCount: Number(durableConfig.catalogAssignedCount || 0),
        mergedCatalogAssignedCount: Number(mergedConfig.catalogAssignedCount || 0),
      };
    });
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
    const provisionMerged = mergeProvisioningState(reg, regShape || {});
    let config = provisionMerged.config;
    let provisioning = provisionMerged.provisioning;

    if (isHome) {
      config = {
        ...config,
        rolesConfigured,
        productCatalogReady: Number(metrics?.products || 0) > 0,
      };
      if (adminProfiles.length) {
        const admin = adminProfiles.find((p) => p.role === "admin") || adminProfiles[0];
        config.adminName = config.adminName || admin?.agent_name || "Admin";
        config.rolesConfigured = rolesConfigured;
      }
    }

    const row = mergeTenantRow(
      db,
      {
        ...regShape,
        ...reg,
        config,
        provisioning,
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
