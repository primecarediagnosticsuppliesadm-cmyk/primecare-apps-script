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
import { assignAllMasterCatalogToDistributor } from "@/catalog/distributorCatalogData.js";
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
  evaluateAdminUserGate,
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

function adminSnapshotFromConfig(config = {}) {
  return {
    name: str(config.adminName),
    email: str(config.adminEmail),
    phone: str(config.adminPhone),
    updatedAt: str(config.adminUpdatedAt) || null,
  };
}

/**
 * Debug: admin fields across local, durable metadata, merged tenant, and gate.
 */
export function buildAdminFieldRegistryDebug(bundle) {
  const registry = readTenantRegistry();
  const dbRows = bundle?.dbFetch?.rows || [];
  const homeId = str(bundle?.homeTenantId);

  return (bundle?.tenants || [])
    .filter((t) => t.id && t.id !== homeId && !t.isHome)
    .map((t) => {
      const local = registry.find((r) => r.id === t.id);
      const db = dbRows.find((d) => d.id === t.id);
      const dbMeta = db?.metadata && typeof db.metadata === "object" ? db.metadata : {};
      const localAdmin = adminSnapshotFromConfig(local?.config);
      const durableAdmin = adminSnapshotFromConfig(dbMeta.config);
      const mergedAdmin = adminSnapshotFromConfig(t.config);
      const gate = evaluateAdminUserGate(t.config || {});
      return {
        id: t.id,
        name: t.name,
        localAdmin,
        durableAdmin,
        mergedAdmin,
        gatePass: gate.pass,
        gateRequired: gate.requiredFields,
        gateMissing: gate.missing,
        gateValues: gate.values,
      };
    });
}

function traceAdminSaveStages(tenantId, config, dbRows = []) {
  const local = getRegistryTenant(tenantId);
  const db = (dbRows || []).find((d) => d.id === tenantId);
  const dbMeta = db?.metadata && typeof db.metadata === "object" ? db.metadata : {};
  return {
    tenantId,
    gate: evaluateAdminUserGate(config),
    local: adminSnapshotFromConfig(local?.config),
    durable: adminSnapshotFromConfig(dbMeta.config),
    merged: adminSnapshotFromConfig(config),
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
    adminFieldDebug: buildAdminFieldRegistryDebug(bundle),
    adminGateLogic: {
      required: ["adminName", "adminEmail"],
      optional: ["adminPhone"],
      expression: "pass = adminName && adminEmail",
    },
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
    config: {
      ...(row.config || {}),
      lifecycleStatus: "active",
      orderingEnabled: true,
      collectionsEnabled: true,
    },
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

/**
 * Save distributor admin to local registry and durable Supabase metadata.
 * @param {string} tenantId
 * @param {{ name?: string, email?: string, phone?: string }} admin
 * @param {{ fallbackTenant?: object, dbRows?: object[] }} [options]
 */
export async function updateDistributorAdminDetails(tenantId, admin, options = {}) {
  const id = str(tenantId);
  if (!id) {
    return { ok: false, error: "Missing tenant id" };
  }

  let row = getRegistryTenant(id);
  const fallback = options.fallbackTenant;
  if (!row && fallback) {
    row = {
      ...fallback,
      config: { ...(fallback.config || {}) },
      provisioning: { ...(fallback.provisioning || {}) },
    };
  }
  if (!row) {
    row = {
      id,
      name: fallback?.name || id,
      status: fallback?.status || "PENDING",
      tenantCode: fallback?.tenantCode,
      config: {},
      provisioning: {},
      source: fallback?.source || "registry",
      durable: Boolean(fallback?.durable || fallback?.source === "database"),
      persistenceStatus: fallback?.persistenceStatus,
    };
  }

  const now = new Date().toISOString();
  const config = {
    ...(row.config || {}),
    adminName: str(admin.name),
    adminEmail: str(admin.email),
    adminPhone: str(admin.phone),
    adminUpdatedAt: now,
  };
  const gate = evaluateAdminUserGate(config);
  const hasAdmin = gate.pass;

  console.log("[provisioning] admin save — before write", traceAdminSaveStages(id, config, options.dbRows));

  upsertRegistryTenant({
    ...row,
    config,
    adminUser: hasAdmin ? str(config.adminName) : row.adminUser,
    updatedAt: now,
  });
  if (hasAdmin) {
    markProvisioningMilestone(id, "admin_added");
  }

  const fresh = getRegistryTenant(id) || { ...row, config };
  const isDurable =
    fresh.durable === true ||
    fresh.source === "database" ||
    fresh.persistenceStatus === PERSISTENCE_STATUS.DURABLE ||
    fallback?.persistenceStatus === PERSISTENCE_STATUS.DURABLE;

  let durablePatchOk = !isDurable;
  if (isDurable) {
    const patchResult = await patchDurableTenantMetadata(id, {
      config: fresh.config || config,
      provisioning: fresh.provisioning || row.provisioning || {},
    });
    durablePatchOk = patchResult.ok;
    if (!patchResult.ok) {
      console.warn("[provisioning] admin durable patch failed", patchResult.error);
      upsertRegistryTenant({
        ...fresh,
        lastSyncError: patchResult.error,
        syncFailed: true,
      });
    } else {
      upsertRegistryTenant({
        ...fresh,
        syncFailed: false,
        lastSyncError: null,
        durable: true,
        source: "database",
        persistenceStatus: PERSISTENCE_STATUS.DURABLE,
      });
    }
  }

  const saved = getRegistryTenant(id);
  console.log("[provisioning] admin save — after write", {
    ...traceAdminSaveStages(id, saved?.config || config, options.dbRows),
    durablePatchOk,
    gatePass: evaluateAdminUserGate(saved?.config || config).pass,
  });

  if (!hasAdmin) {
    return {
      ok: false,
      error: `Admin gate still failing — missing: ${gate.missing.join(", ")}`,
      row: saved,
      durablePatchOk,
      trace: traceAdminSaveStages(id, saved?.config || config, options.dbRows),
    };
  }

  return {
    ok: true,
    row: saved,
    durablePatchOk,
    trace: traceAdminSaveStages(id, saved?.config || config, options.dbRows),
  };
}

/**
 * Assign HQ master catalog products to a distributor (replaces legacy flag-only enable).
 */
export async function enableStandardProductCatalog(tenantId, options = {}) {
  const assignResult = await assignAllMasterCatalogToDistributor(tenantId, options);
  if (assignResult.ok) {
    markProvisioningMilestone(str(tenantId), "catalog_configured");
    return {
      ok: true,
      row: getRegistryTenant(tenantId),
      durablePatchOk: assignResult.durablePatchOk,
      assignedCount: assignResult.assignedCount,
    };
  }

  // Fallback: metadata flag when HQ master list is empty (legacy path)
  const id = str(tenantId);
  if (!id) {
    return { ok: false, error: "Missing tenant id" };
  }

  let row = getRegistryTenant(id);
  const fallback = options.fallbackTenant;
  if (!row && fallback) {
    row = {
      ...fallback,
      config: { ...(fallback.config || {}) },
      provisioning: { ...(fallback.provisioning || {}) },
    };
  }
  if (!row) {
    row = {
      id,
      name: fallback?.name || id,
      status: fallback?.status || "PENDING",
      tenantCode: fallback?.tenantCode,
      config: {},
      provisioning: {},
      source: fallback?.source || "registry",
      durable: Boolean(fallback?.durable || fallback?.source === "database"),
      persistenceStatus: fallback?.persistenceStatus,
    };
  }

  const now = new Date().toISOString();
  const config = {
    ...(row.config || {}),
    catalogAssigned: false,
    catalogAssignedCount: 0,
    productCatalogReady: false,
    catalogConfiguredAt: now,
    standardCatalogEnabled: false,
  };

  upsertRegistryTenant({
    ...row,
    config,
    updatedAt: now,
  });
  markProvisioningMilestone(id, "catalog_configured");

  const fresh = getRegistryTenant(id) || { ...row, config };
  const isDurable =
    fresh.durable === true ||
    fresh.source === "database" ||
    fresh.persistenceStatus === PERSISTENCE_STATUS.DURABLE ||
    fallback?.persistenceStatus === PERSISTENCE_STATUS.DURABLE;

  let durablePatchOk = !isDurable;
  if (isDurable) {
    const patchResult = await patchDurableTenantMetadata(id, {
      config: fresh.config || config,
      provisioning: fresh.provisioning || row.provisioning || {},
    });
    durablePatchOk = patchResult.ok;
    if (!patchResult.ok) {
      console.warn("[provisioning] catalog durable patch failed", patchResult.error);
      upsertRegistryTenant({
        ...fresh,
        lastSyncError: patchResult.error,
        syncFailed: true,
      });
    } else {
      upsertRegistryTenant({
        ...fresh,
        syncFailed: false,
        lastSyncError: null,
        durable: true,
        source: "database",
        persistenceStatus: PERSISTENCE_STATUS.DURABLE,
      });
    }
  }

  const saved = getRegistryTenant(id);
  return {
    ok: Boolean(saved?.config?.catalogAssigned || saved?.config?.productCatalogReady),
    row: saved,
    durablePatchOk,
  };
}

export async function acknowledgeProvisioningTask(tenantId, taskId, options = {}) {
  if (taskId === "load_catalog") {
    return enableStandardProductCatalog(tenantId, options);
  }

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
