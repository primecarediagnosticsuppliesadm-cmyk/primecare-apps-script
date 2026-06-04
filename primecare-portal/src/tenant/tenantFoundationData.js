import { supabase } from "@/api/supabaseClient.js";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import {
  readTenantRegistry,
  upsertRegistryTenant,
  getRegistryTenant,
} from "@/tenant/tenantFoundationStore.js";
import {
  mergeTenantRow,
  buildTenantReadiness,
} from "@/tenant/tenantFoundationEngine.js";
import { runTenantFoundationIsolationChecks } from "@/tenant/tenantFoundationIsolation.js";

function str(v) {
  return String(v ?? "").trim();
}

function inDays(iso, maxDay) {
  const s = str(iso).slice(0, 10);
  if (!s) return false;
  const age = Math.floor((Date.now() - Date.parse(s)) / 86400000);
  return age >= 0 && age < maxDay;
}

/**
 * Live metrics for the signed-in tenant (RLS-scoped).
 */
export function metricsFromOpsPayload(payload) {
  const dashboard = payload?.dashboard || {};
  const executive = dashboard.executive || dashboard.kpis || {};
  const labs = Array.isArray(dashboard.labs) ? dashboard.labs.length : 0;
  const orders = Array.isArray(payload?.orders) ? payload.orders.length : 0;
  const collections = Array.isArray(payload?.collections) ? payload.collections.length : 0;
  const visits = (payload?.visits || []).filter((v) => inDays(v.visitDate || v.date, 30)).length;
  const inventory = Array.isArray(payload?.inventory) ? payload.inventory.length : 0;
  const openInterventions = Number(
    executive.openInterventions ??
      executive.interventionsOpen ??
      dashboard.openInterventions ??
      0
  );

  return {
    labs,
    orders,
    collections,
    visits,
    openInterventions,
    products: inventory,
  };
}

export async function fetchDatabaseTenants() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tenants")
    .select("id, tenant_code, tenant_name, status, created_at")
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[tenantFoundation] tenants read failed", error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

export async function fetchAdminProfilesForTenant(tenantId) {
  if (!supabase || !tenantId) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, role, agent_name, active")
    .eq("tenant_id", tenantId)
    .in("role", ["admin", "executive"]);
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

/**
 * Build switcher options: HQ + registry + database tenants.
 */
export function buildTenantSwitcherOptions(homeTenantId, tenants, registry) {
  const options = [];
  const seen = new Set();

  const home = tenants.find((t) => t.id === homeTenantId);
  if (homeTenantId) {
    options.push({
      id: homeTenantId,
      label: home?.name || "PrimeCare HQ",
      readOnly: false,
      isHq: true,
    });
    seen.add(homeTenantId);
  }

  for (const row of registry) {
    if (!row.id || seen.has(row.id)) continue;
    if (row.id === homeTenantId) continue;
    options.push({
      id: row.id,
      label: row.name || row.config?.displayName || row.tenantCode || row.id.slice(0, 8),
      readOnly: true,
      isHq: false,
    });
    seen.add(row.id);
  }

  for (const t of tenants) {
    if (!t.id || seen.has(t.id)) continue;
    options.push({
      id: t.id,
      label: t.name,
      readOnly: t.id !== homeTenantId,
      isHq: t.id === homeTenantId,
    });
    seen.add(t.id);
  }

  return options;
}

/**
 * Full registry load for Tenant Management page.
 */
export async function loadTenantFoundationRegistry(currentUser, options = {}) {
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const registry = readTenantRegistry();
  const dbTenants = await fetchDatabaseTenants();

  let opsPayload = null;
  let liveMetrics = null;
  let isolationChecks = null;

  if (!options.skipLiveLoad && homeTenantId) {
    try {
      opsPayload = await loadOperationsCommandCenterData(currentUser, {
        force: options.force,
      });
      liveMetrics = metricsFromOpsPayload(opsPayload);
      isolationChecks = await runTenantFoundationIsolationChecks(homeTenantId);
    } catch (err) {
      console.warn("[tenantFoundation] live metrics failed", err);
    }
  }

  const isolationPass = isolationChecks?.every((c) => c.status === "PASS") ?? false;
  if (homeTenantId && isolationChecks) {
    const existing = getRegistryTenant(homeTenantId);
    upsertRegistryTenant({
      ...(existing || { id: homeTenantId, name: "PrimeCare HQ", tenantCode: "hq" }),
      id: homeTenantId,
      isHome: true,
      status: existing?.status || "ACTIVE",
      metrics: liveMetrics || existing?.metrics,
      isolationChecks,
      lastIsolationPass: isolationPass,
      lastIsolationAt: new Date().toISOString(),
    });
  }

  const adminProfiles = homeTenantId ? await fetchAdminProfilesForTenant(homeTenantId) : [];
  const rolesConfigured = adminProfiles.filter((p) => p.active !== false).length >= 2;

  const merged = [];
  const seenIds = new Set();

  for (const db of dbTenants) {
    const reg = registry.find((r) => r.id === db.id) || {};
    const isHome = db.id === homeTenantId;
    const metrics = isHome ? liveMetrics : reg.metrics;
    const checks = isHome ? isolationChecks : reg.isolationChecks;
    const config = {
      ...(reg.config || {}),
      rolesConfigured: isHome ? rolesConfigured : reg.config?.rolesConfigured,
      productCatalogReady: isHome
        ? Number(metrics?.products || 0) > 0
        : reg.config?.productCatalogReady,
    };
    if (isHome && adminProfiles.length) {
      const admin = adminProfiles.find((p) => p.role === "admin") || adminProfiles[0];
      config.adminName = config.adminName || admin?.agent_name || "Admin";
      config.rolesConfigured = rolesConfigured;
    }

    merged.push(
      mergeTenantRow(db, { ...reg, config, isHome }, metrics, checks)
    );
    seenIds.add(db.id);
  }

  for (const reg of registry) {
    if (!reg.id || seenIds.has(reg.id)) continue;
    merged.push(mergeTenantRow(null, reg, reg.metrics, reg.isolationChecks));
    seenIds.add(reg.id);
  }

  merged.sort((a, b) => {
    if (a.isHome) return -1;
    if (b.isHome) return 1;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });

  return {
    tenants: merged,
    homeTenantId,
    opsPayload,
    switcherOptions: buildTenantSwitcherOptions(homeTenantId, merged, registry),
  };
}

export function persistPendingTenant(draft) {
  upsertRegistryTenant({
    ...draft,
    status: "PENDING",
    updatedAt: new Date().toISOString(),
  });
  return draft;
}

export function activateRegistryTenant(tenantId) {
  const row = getRegistryTenant(tenantId);
  if (!row) return { ok: false, error: "Tenant not found in registry" };
  const readiness = buildTenantReadiness(mergeTenantRow(null, row, row.metrics, row.isolationChecks));
  if (!readiness.ready) {
    return { ok: false, error: "Readiness checks incomplete", readiness };
  }
  upsertRegistryTenant({
    ...row,
    status: "ACTIVE",
    activatedAt: new Date().toISOString(),
  });
  return { ok: true };
}

export function syncRegistryMetrics(tenantId, metrics) {
  const row = getRegistryTenant(tenantId);
  if (!row) return;
  upsertRegistryTenant({ ...row, metrics: { ...(row.metrics || {}), ...metrics } });
}
