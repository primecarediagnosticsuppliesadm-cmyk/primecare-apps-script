import { isolationChecksPass } from "@/tenant/tenantFoundationIsolation.js";

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function str(v) {
  return String(v ?? "").trim();
}

function normalizeStatus(status) {
  const s = str(status).toUpperCase();
  if (s === "ACTIVE" || s === "INACTIVE" || s === "PENDING") return s;
  if (s === "active") return "ACTIVE";
  if (s === "inactive") return "INACTIVE";
  return "PENDING";
}

/**
 * @typedef {'Healthy'|'Watch'|'Risk'} TenantHealthBand
 */

/**
 * @param {object} metrics
 * @returns {TenantHealthBand}
 */
export function computeTenantHealthBand(metrics) {
  const labs = Number(metrics.labs || 0);
  const openInterventions = Number(metrics.openInterventions || 0);
  const visits = Number(metrics.visits || 0);
  const isolationPass = metrics.isolationPass !== false;

  if (!isolationPass || labs === 0 || openInterventions >= 5) return "Risk";
  if (openInterventions >= 2 || visits === 0 || labs < 1) return "Watch";
  if (labs >= 1 && visits >= 1 && openInterventions < 2) return "Healthy";
  return "Watch";
}

export function computeTenantHealthScore(metrics, healthBand) {
  let score = 70;
  score += Math.min(15, Number(metrics.labs || 0) * 3);
  score += Math.min(10, Number(metrics.orders || 0));
  score += Math.min(10, Number(metrics.collections || 0) > 0 ? 8 : 0);
  score -= Math.min(25, Number(metrics.openInterventions || 0) * 5);
  if (metrics.isolationPass === false) score -= 30;
  if (healthBand === "Healthy") score += 5;
  if (healthBand === "Risk") score -= 15;
  return clamp(score);
}

/**
 * @param {object} tenant
 */
export function buildTenantReadiness(tenant) {
  const config = tenant.config || {};
  const metrics = tenant.metrics || {};
  const checks = [
    {
      id: "admin_user",
      label: "Admin user",
      pass: Boolean(str(config.adminEmail) && str(config.adminName)),
    },
    {
      id: "roles_configured",
      label: "Roles configured",
      pass: config.rolesConfigured === true,
    },
    {
      id: "product_catalog",
      label: "Product catalog",
      pass: config.productCatalogReady === true || Number(metrics.products || 0) > 0,
    },
    {
      id: "at_least_one_lab",
      label: "At least one lab",
      pass: Number(metrics.labs || 0) >= 1,
    },
    {
      id: "isolation_pass",
      label:
        tenant.source === "database" ? "Tenant isolation PASS" : "Isolation (after DB provision)",
      pass:
        tenant.source === "database"
          ? tenant.lastIsolationPass === true
          : true,
    },
  ];

  const completed = checks.filter((c) => c.pass);
  const blocked = checks.filter((c) => !c.pass);

  return {
    checks,
    completed,
    blocked,
    ready: blocked.length === 0,
    canActivate: blocked.length === 0 && normalizeStatus(tenant.status) === "PENDING",
  };
}

export function mergeTenantRow(dbRow, registryRow, liveMetrics, isolationChecks) {
  const id = str(dbRow?.id || registryRow?.id);
  const config = { ...(registryRow?.config || {}), ...(dbRow?.config || {}) };
  const metrics = {
    labs: 0,
    orders: 0,
    collections: 0,
    visits: 0,
    openInterventions: 0,
    products: 0,
    ...(registryRow?.metrics || {}),
    ...(liveMetrics || {}),
  };

  const isolationPass = isolationChecks ? isolationChecksPass(isolationChecks) : registryRow?.lastIsolationPass === true;
  const healthBand = computeTenantHealthBand({ ...metrics, isolationPass });
  const healthScore = computeTenantHealthScore({ ...metrics, isolationPass }, healthBand);

  const tenant = {
    id,
    tenantCode: str(dbRow?.tenant_code || registryRow?.tenantCode),
    name: str(dbRow?.tenant_name || registryRow?.name || registryRow?.displayName),
    status: normalizeStatus(registryRow?.status || dbRow?.status || "PENDING"),
    createdAt: dbRow?.created_at || registryRow?.createdAt || null,
    adminUser: str(config.adminName) || str(config.adminEmail) || "—",
    config,
    provisioning: registryRow?.provisioning || {},
    metrics,
    healthBand,
    healthScore,
    isolationChecks: isolationChecks || registryRow?.isolationChecks || [],
    lastIsolationPass: isolationPass,
    source: dbRow ? "database" : registryRow?.source || "registry",
    isHome: Boolean(registryRow?.isHome),
    durable: Boolean(dbRow || registryRow?.durable),
    persistenceStatus: registryRow?.persistenceStatus,
    syncFailed: Boolean(registryRow?.syncFailed),
    lastSyncError: registryRow?.lastSyncError || null,
  };

  tenant.readiness = buildTenantReadiness(tenant);
  return tenant;
}

export function buildWizardTenantDraft(steps) {
  const company = steps.company || {};
  const branding = steps.branding || {};
  const admin = steps.admin || {};
  const ops = steps.operations || {};

  const displayName = str(branding.displayName) || str(company.companyName);
  const tenantCode =
    str(company.tenantCode) ||
    `dist-${str(company.companyName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 24)}-${Date.now().toString(36).slice(-4)}`;

  return {
    id: crypto.randomUUID?.() || `tenant-${Date.now()}`,
    tenantCode,
    name: displayName,
    status: "PENDING",
    config: {
      companyName: str(company.companyName),
      legalName: str(company.legalName),
      country: str(company.country),
      state: str(company.state),
      timezone: str(company.timezone),
      logoDataUrl: branding.logoDataUrl || "",
      primaryColor: str(branding.primaryColor) || "#4f46e5",
      displayName,
      adminName: str(admin.name),
      adminEmail: str(admin.email),
      adminPhone: str(admin.phone),
      currency: str(ops.currency) || "INR",
      creditDays: Number(ops.creditDays) || 30,
      collectionsRules: str(ops.collectionsRules) || "standard",
      rolesConfigured: false,
      productCatalogReady: false,
    },
    metrics: { labs: 0, orders: 0, collections: 0, visits: 0, openInterventions: 0, products: 0 },
    lastIsolationPass: false,
    isolationChecks: [],
  };
}
