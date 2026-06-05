import {
  loadTenantFoundationRegistry,
  fetchAdminProfilesForTenant,
} from "@/tenant/tenantFoundationData.js";
import {
  upsertDistributorToSupabase,
  syncLocalDistributorsToSupabase,
  fetchDatabaseTenants as fetchDurableTenants,
  updateDistributorStatusInSupabase,
  patchDurableTenantMetadata,
  buildCatalogFlagRegistryDebug,
  PERSISTENCE_STATUS,
} from "@/tenant/durableTenantStore.js";
import { fetchAgentProfilesForTenant } from "@/distributor/distributorWorkspaceData.js";
import { runTenantFoundationIsolationChecks } from "@/tenant/tenantFoundationIsolation.js";
import {
  readTenantRegistry,
  upsertRegistryTenant,
  getRegistryTenant,
  getTenantRegistryStorageDebug,
  readTenantViewContext,
  TENANT_REGISTRY_STORAGE_KEY,
  TENANT_VIEW_STORAGE_KEY,
} from "@/tenant/tenantFoundationStore.js";
import {
  buildProvisioningDraft,
  buildDistributorProvisioningModel,
  TIMELINE_LABELS,
} from "@/distributor/distributorProvisioningEngine.js";
import { mapTenantToDistributorRegistryRow } from "@/distributor/distributorWorkspaceEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

export async function loadProvisioningBundle(currentUser, options = {}) {
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const foundation = await loadTenantFoundationRegistry(currentUser, {
    force: options.force,
  });

  let isolationChecks = null;
  if (homeTenantId && !options.skipIsolation) {
    try {
      isolationChecks = await runTenantFoundationIsolationChecks(homeTenantId);
      const pass = isolationChecks.every((c) => c.status === "PASS");
      const row = getRegistryTenant(homeTenantId);
      if (row) {
        upsertRegistryTenant({
          ...row,
          isolationChecks,
          lastIsolationPass: pass,
          lastIsolationAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn("[provisioning] isolation", err);
    }
  }

  const refreshed = await loadTenantFoundationRegistry(currentUser, { skipLiveLoad: true });

  const allRows = refreshed.tenants || [];
  const homeRow = allRows.find((t) => t.id === homeTenantId);

  let roleCount = 0;
  let agentCount = 0;
  if (homeTenantId) {
    const admins = await fetchAdminProfilesForTenant(homeTenantId);
    const agents = await fetchAgentProfilesForTenant(homeTenantId);
    roleCount = admins.length + agents.length;
    agentCount = agents.length;
    if (homeRow) {
      upsertRegistryTenant({
        ...getRegistryTenant(homeTenantId),
        metrics: {
          ...(homeRow.metrics || {}),
          agents: agentCount,
        },
        config: {
          ...(homeRow.config || {}),
          roleCount: admins.length,
        },
      });
    }
  }

  const distributors = allRows.map(mapTenantToDistributorRegistryRow);
  const dbFetch = await fetchDurableTenants();

  return {
    homeTenantId,
    tenants: allRows,
    distributors,
    duplicateNames: refreshed.duplicateNames || [],
    registryDebug: buildProvisioningRegistryDebug({
      homeTenantId,
      tenants: allRows,
      distributors,
      dbFetch,
      duplicateNames: refreshed.duplicateNames || [],
    }),
    opsPayload: foundation.opsPayload,
    isolationChecks,
    roleCount,
    agentCount,
  };
}

/**
 * Registry diagnostics for Provisioning (localStorage + merge + view context).
 */
export function buildProvisioningRegistryDebug(bundle) {
  const storage = getTenantRegistryStorageDebug();
  const homeTenantId = str(bundle?.homeTenantId);
  const view = readTenantViewContext(homeTenantId);
  const loaded = bundle?.distributors || [];
  const loadedNonHome = loaded.filter((d) => !d.isHome);
  const rawNonHome = (storage.rawRows || []).filter((r) => !r.isHome);
  const supabaseCount = bundle?.dbFetch?.rows?.length ?? 0;
  const localOnlyRows = loadedNonHome.filter(
    (d) => d.persistenceStatus === PERSISTENCE_STATUS.LOCAL_ONLY
  );
  const syncFailedRows = loadedNonHome.filter(
    (d) => d.persistenceStatus === PERSISTENCE_STATUS.SYNC_FAILED
  );
  const durableRows = loadedNonHome.filter(
    (d) => d.persistenceStatus === PERSISTENCE_STATUS.DURABLE
  );

  return {
    storageKey: TENANT_REGISTRY_STORAGE_KEY,
    viewStorageKey: TENANT_VIEW_STORAGE_KEY,
    supabaseTenantsCount: supabaseCount,
    supabaseFetchError: bundle?.dbFetch?.error || null,
    rawDistributorCount: storage.rawDistributorCount,
    rawDistributorCountExcludingHome: rawNonHome.length,
    loadedDistributorCount: loaded.length,
    loadedDistributorCountExcludingHome: loadedNonHome.length,
    mergedCount: loaded.length,
    durableCount: durableRows.length,
    localOnlyCount: localOnlyRows.length,
    syncFailedCount: syncFailedRows.length,
    localOnlyRows: localOnlyRows.map((d) => ({ id: d.id, name: d.name })),
    syncFailedRows: syncFailedRows.map((d) => ({
      id: d.id,
      name: d.name,
      error: d.lastSyncError,
    })),
    duplicateNames: bundle?.duplicateNames || [],
    homeTenantId: homeTenantId || null,
    viewTenantId: view.viewTenantId,
    readOnlyView: view.readOnly,
    filteredByTenantContext: false,
    rawRows: storage.rawRows,
    loadedNames: loaded.map((d) => d.name),
    loadedNonHomeNames: loadedNonHome.map((d) => d.name),
    catalogFlagDebug: buildCatalogFlagRegistryDebug(bundle),
    notes:
      "Durable rows live in public.tenants (Supabase). localStorage is fallback when insert/RLS fails.",
  };
}

export { syncLocalDistributorsToSupabase };

export function resolveProvisioningModel(bundle, distributorId) {
  const id = str(distributorId);
  const tenant =
    bundle.tenants.find((t) => t.id === id) ||
    getRegistryTenant(id) ||
    null;
  if (!tenant) return null;

  const isLive =
    id === bundle.homeTenantId && Boolean(bundle.opsPayload);

  return buildDistributorProvisioningModel(
    {
      ...tenant,
      isolationChecks:
        isLive && bundle.isolationChecks
          ? bundle.isolationChecks
          : tenant.isolationChecks,
      lastIsolationPass:
        isLive && bundle.isolationChecks
          ? bundle.isolationChecks.every((c) => c.status === "PASS")
          : tenant.lastIsolationPass,
    },
    {
      isLive,
      roleCount: isLive ? bundle.roleCount : num(tenant.config?.roleCount),
      agentCount: isLive ? bundle.agentCount : num(tenant.metrics?.agents),
    }
  );
}

function num(v) {
  return Number(v) || 0;
}

/**
 * Save distributor: Supabase first, localStorage fallback.
 * @returns {Promise<{ row: object, durable: boolean, warning?: string, error?: string }>}
 */
export async function persistProvisioningDraft(draft) {
  const registry = readTenantRegistry();
  const { rows: dbTenants } = await fetchDurableTenants();

  const supabaseResult = await upsertDistributorToSupabase(draft, {
    dbTenants,
    registry,
  });

  const now = new Date().toISOString();
  const base = {
    ...draft,
    status: "PENDING",
    provisioning: {
      ...(draft.provisioning || {}),
      lifecycle: "configuring",
    },
    updatedAt: now,
  };

  if (supabaseResult.ok && supabaseResult.durable) {
    const row = {
      ...base,
      ...supabaseResult.row,
      durable: true,
      localOnly: false,
      syncFailed: false,
      lastSyncError: null,
      persistenceStatus: PERSISTENCE_STATUS.DURABLE,
      source: "database",
    };
    upsertRegistryTenant(row);
    return { row, durable: true };
  }

  const row = {
    ...base,
    durable: false,
    localOnly: true,
    syncFailed: Boolean(supabaseResult.error),
    lastSyncError: supabaseResult.error || null,
    persistenceStatus: supabaseResult.error
      ? PERSISTENCE_STATUS.SYNC_FAILED
      : PERSISTENCE_STATUS.LOCAL_ONLY,
    source: "registry",
  };
  upsertRegistryTenant(row);

  return {
    row,
    durable: false,
    warning: "Saved locally only — durable tenant save failed",
    error: supabaseResult.error,
  };
}

function appendTimelineEvent(tenantId, event) {
  const row = getRegistryTenant(tenantId);
  if (!row) return;
  const timeline = Array.isArray(row.provisioning?.timeline) ? row.provisioning.timeline : [];
  upsertRegistryTenant({
    ...row,
    provisioning: {
      ...(row.provisioning || {}),
      timeline: [event, ...timeline].slice(0, 40),
    },
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Activate distributor when gates pass (registry status ACTIVE).
 */
export async function activateDistributorProvisioning(tenantId, model) {
  if (!model?.gates?.canActivate) {
    return {
      ok: false,
      error: "Activation blocked",
      blockers: model.gates.blockers.map((b) => b.label),
    };
  }

  if (!model.durable && model.persistenceStatus !== PERSISTENCE_STATUS.DURABLE) {
    return {
      ok: false,
      error: "Activation requires durable Supabase tenant",
      blockers: ["Durable tenant (Supabase)"],
    };
  }

  const row = getRegistryTenant(tenantId);
  if (!row) return { ok: false, error: "Distributor not found" };

  const now = new Date().toISOString();
  const dbUpdate = await updateDistributorStatusInSupabase(tenantId, "ACTIVE");
  if (!dbUpdate.ok) {
    return {
      ok: false,
      error: dbUpdate.error || "Failed to update Supabase tenant status",
    };
  }

  upsertRegistryTenant({
    ...row,
    status: "ACTIVE",
    durable: true,
    persistenceStatus: PERSISTENCE_STATUS.DURABLE,
    source: "database",
    provisioning: {
      ...(row.provisioning || {}),
      lifecycle: "activated",
      activatedAt: now,
      timeline: [
        {
          id: "activated",
          kind: "activated",
          label: TIMELINE_LABELS.activated,
          at: now,
        },
        ...(row.provisioning?.timeline || []),
      ],
    },
  });

  return { ok: true, activatedAt: now };
}

export function markProvisioningMilestone(tenantId, kind) {
  const label = TIMELINE_LABELS[kind] || kind;
  appendTimelineEvent(tenantId, {
    id: kind,
    kind,
    label,
    at: new Date().toISOString(),
  });
}

/** Record manual Supabase setup (flags only — no fake lab/order counts). */
/**
 * Refresh bundle tenants from localStorage without reloading ops/API.
 */
export async function refreshProvisioningBundleState(bundle, currentUser) {
  if (!bundle) return bundle;
  if (currentUser) {
    return loadProvisioningBundle(currentUser, { skipIsolation: true });
  }
  const registry = readTenantRegistry();
  const byId = new Map();
  for (const t of bundle.tenants || []) byId.set(t.id, t);
  for (const reg of registry) {
    const fresh = getRegistryTenant(reg.id) || reg;
    byId.set(fresh.id, { ...byId.get(fresh.id), ...fresh });
  }
  const list = [...byId.values()];
  const distributors = list.map(mapTenantToDistributorRegistryRow);
  const dbFetch = await fetchDurableTenants();
  return {
    ...bundle,
    tenants: list,
    distributors,
    registryDebug: buildProvisioningRegistryDebug({
      homeTenantId: bundle.homeTenantId,
      tenants: list,
      distributors,
      dbFetch,
    }),
  };
}

export function updateDistributorAdminDetails(tenantId, admin) {
  const row = getRegistryTenant(tenantId);
  if (!row) return null;
  const now = new Date().toISOString();
  const config = {
    ...(row.config || {}),
    adminName: str(admin.name),
    adminEmail: str(admin.email),
    adminPhone: str(admin.phone),
    adminUpdatedAt: now,
  };
  const hasAdmin = Boolean(str(config.adminEmail) && str(config.adminName));
  upsertRegistryTenant({
    ...row,
    config,
    adminUser: hasAdmin ? str(config.adminName) : row.adminUser,
    updatedAt: now,
  });
  if (hasAdmin) {
    markProvisioningMilestone(tenantId, "admin_added");
  }
  return getRegistryTenant(tenantId);
}

export async function acknowledgeProvisioningTask(tenantId, taskId) {
  const row = getRegistryTenant(tenantId);
  if (!row) return null;
  const now = new Date().toISOString();
  const config = { ...(row.config || {}) };
  const provisioning = { ...(row.provisioning || {}) };

  if (taskId === "configure_roles") {
    config.rolesConfigured = true;
    config.rolesConfiguredAt = now;
    markProvisioningMilestone(tenantId, "admin_added");
  }
  if (taskId === "load_catalog") {
    config.productCatalogReady = true;
    config.catalogConfiguredAt = now;
    markProvisioningMilestone(tenantId, "catalog_configured");
  }
  if (taskId === "assign_agent") {
    config.agentProvisioned = true;
    markProvisioningMilestone(tenantId, "agent_assigned");
  }
  if (taskId === "verify_isolation") {
    config.isolationAcknowledged = true;
    markProvisioningMilestone(tenantId, "isolation_verified");
  }

  const freshRow = getRegistryTenant(tenantId) || row;
  upsertRegistryTenant({
    ...freshRow,
    config,
    provisioning: freshRow.provisioning || provisioning,
    updatedAt: now,
  });

  const updated = getRegistryTenant(tenantId);
  const isDurable = updated?.durable === true || updated?.source === "database";
  if (isDurable && updated) {
    const patchResult = await patchDurableTenantMetadata(tenantId, {
      config: updated.config || config,
      provisioning: updated.provisioning || provisioning,
    });
    if (!patchResult.ok) {
      console.warn("[provisioning] durable metadata patch failed", patchResult.error);
      upsertRegistryTenant({
        ...updated,
        lastSyncError: patchResult.error,
        syncFailed: taskId === "load_catalog",
      });
    }
  }

  return getRegistryTenant(tenantId);
}
