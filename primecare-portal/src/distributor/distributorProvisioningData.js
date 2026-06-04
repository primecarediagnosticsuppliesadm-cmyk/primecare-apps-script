import {
  loadTenantFoundationRegistry,
  fetchAdminProfilesForTenant,
} from "@/tenant/tenantFoundationData.js";
import { fetchAgentProfilesForTenant } from "@/distributor/distributorWorkspaceData.js";
import { runTenantFoundationIsolationChecks } from "@/tenant/tenantFoundationIsolation.js";
import {
  readTenantRegistry,
  upsertRegistryTenant,
  getRegistryTenant,
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
  const distributors = (refreshed.tenants || [])
    .filter((t) => !t.isHome || refreshed.tenants.length === 1)
    .map((t) => mapTenantToDistributorRegistryRow(t));

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

  const registry = readTenantRegistry();
  const list = registry.map((reg) => {
    const db = allRows.find((t) => t.id === reg.id);
    return db || reg;
  });
  for (const t of allRows) {
    if (!list.find((r) => r.id === t.id)) list.push(t);
  }

  return {
    homeTenantId,
    tenants: list,
    distributors: list.map(mapTenantToDistributorRegistryRow),
    opsPayload: foundation.opsPayload,
    isolationChecks,
    roleCount,
    agentCount,
  };
}

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

export function persistProvisioningDraft(draft) {
  upsertRegistryTenant({
    ...draft,
    status: "PENDING",
    provisioning: {
      ...(draft.provisioning || {}),
      lifecycle: "configuring",
    },
  });
  return draft;
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
export function activateDistributorProvisioning(tenantId, model) {
  if (!model?.gates?.canActivate) {
    return {
      ok: false,
      error: "Activation blocked",
      blockers: model.gates.blockers.map((b) => b.label),
    };
  }

  const row = getRegistryTenant(tenantId);
  if (!row) return { ok: false, error: "Distributor not found" };

  const now = new Date().toISOString();
  upsertRegistryTenant({
    ...row,
    status: "ACTIVE",
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
export function refreshProvisioningBundleState(bundle) {
  if (!bundle) return bundle;
  const registry = readTenantRegistry();
  const byId = new Map();
  for (const t of bundle.tenants || []) byId.set(t.id, t);
  for (const reg of registry) {
    const fresh = getRegistryTenant(reg.id) || reg;
    byId.set(fresh.id, { ...byId.get(fresh.id), ...fresh });
  }
  const list = [...byId.values()];
  return {
    ...bundle,
    tenants: list,
    distributors: list.map(mapTenantToDistributorRegistryRow),
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

export function acknowledgeProvisioningTask(tenantId, taskId) {
  const row = getRegistryTenant(tenantId);
  if (!row) return null;
  const now = new Date().toISOString();
  const config = { ...(row.config || {}) };

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
  if (taskId === "verify_isolation" && row.source !== "database") {
    config.isolationAcknowledged = true;
    markProvisioningMilestone(tenantId, "isolation_verified");
  }

  upsertRegistryTenant({ ...row, config, updatedAt: now });
  return getRegistryTenant(tenantId);
}
