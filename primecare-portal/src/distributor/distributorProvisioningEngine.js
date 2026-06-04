/**
 * Distributor Provisioning V1 — onboarding workflow (not a dashboard).
 * tenant_id = distributor company; territories live on config.territories.
 */

import { isolationChecksPass } from "@/tenant/tenantFoundationIsolation.js";
import { parseTerritorySummary } from "@/distributor/distributorWorkspaceEngine.js";

const PIPELINE_STEPS = [
  { id: "draft", label: "Draft" },
  { id: "configured", label: "Configured" },
  { id: "ready", label: "Ready" },
  { id: "activated", label: "Activated" },
];

const REQUIRED_GATE_IDS = new Set([
  "admin_user",
  "roles_configured",
  "catalog_configured",
  "isolation_verified",
]);

const OPTIONAL_GATE_IDS = new Set(["at_least_one_lab"]);

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/** @typedef {'PASS'|'WARN'|'FAIL'} CheckStatus */

/**
 * @param {CheckStatus} pass fail warn from boolean + required
 */
function toCheckStatus(pass, required, pending = false) {
  if (pass) return "PASS";
  if (pending) return "WARN";
  return required ? "FAIL" : "WARN";
}

/**
 * @param {object} ctx
 */
export function buildProvisioningChecks(ctx) {
  const config = ctx.config || {};
  const metrics = ctx.metrics || {};
  const isLive = ctx.isLive;
  const isDb = ctx.source === "database";
  const isolationPass =
    ctx.isolationChecks?.length > 0
      ? isolationChecksPass(ctx.isolationChecks)
      : ctx.lastIsolationPass === true;

  const checks = [
    {
      id: "admin_user",
      label: "Admin user",
      required: true,
      pass: Boolean(str(config.adminEmail) && str(config.adminName)),
      detail: str(config.adminEmail) || "Add admin in provisioning wizard",
    },
    {
      id: "roles_configured",
      label: "Roles configured",
      required: true,
      pass:
        config.rolesConfigured === true ||
        (isLive && num(ctx.roleCount) >= 2) ||
        num(config.roleCount) >= 2,
      detail: "Admin + executive/agent profiles in Supabase",
    },
    {
      id: "catalog_configured",
      label: "Catalog configured",
      required: true,
      pass:
        config.productCatalogReady === true ||
        num(metrics.products) > 0 ||
        num(metrics.inventory) > 0,
      detail: "Inventory/products loaded for tenant",
    },
    {
      id: "at_least_one_lab",
      label: "At least one lab",
      required: false,
      pass: num(metrics.labs) >= 1,
      detail: `${num(metrics.labs)} lab(s) in scope`,
    },
    {
      id: "isolation_verified",
      label: "Isolation verified",
      required: true,
      pass: isDb ? isolationPass : config.isolationAcknowledged === true,
      detail: isDb
        ? isolationPass
          ? "RLS probes PASS"
          : "Run isolation on HQ tenant"
        : "Verify after Supabase provision",
    },
    {
      id: "agent_assigned",
      label: "Agent assigned",
      required: false,
      pass:
        config.agentProvisioned === true ||
        num(metrics.agents) >= 1 ||
        num(ctx.agentCount) >= 1,
      detail: num(metrics.agents) >= 1 ? `${metrics.agents} agent(s)` : "No agents assigned yet",
    },
    {
      id: "ordering_enabled",
      label: "Ordering enabled",
      required: false,
      pass: num(metrics.orders) > 0 || config.orderingEnabled === true,
      detail: num(metrics.orders) > 0 ? `${metrics.orders} orders` : "No orders yet",
    },
    {
      id: "collections_enabled",
      label: "Collections enabled",
      required: false,
      pass: num(metrics.collections) > 0 || config.collectionsEnabled === true,
      detail:
        num(metrics.collections) > 0
          ? `${metrics.collections} AR rows`
          : "Collections not active",
    },
  ];

  return checks.map((c) => ({
    ...c,
    status: toCheckStatus(
      c.pass,
      c.required,
      !c.pass && !isDb && c.id === "isolation_verified"
    ),
  }));
}

export function computeReadinessPercent(checks) {
  const { readinessPct } = computeReadinessDebug(checks);
  return readinessPct;
}

/** Weights + failing checks for executive debug drawer. */
export function computeReadinessDebug(checks, lastUpdated = null) {
  if (!checks.length) {
    return {
      readinessPct: 0,
      weights: [],
      failingChecks: [],
      lastUpdated,
    };
  }
  const weights = checks.map((c) => {
    const w = c.required ? 2 : 1;
    const earned =
      c.status === "PASS" ? w : c.status === "WARN" ? w * 0.5 : 0;
    return {
      id: c.id,
      label: c.label,
      weight: w,
      earned,
      required: c.required,
      status: c.status,
    };
  });
  const total = weights.reduce((s, x) => s + x.weight, 0);
  const earnedSum = weights.reduce((s, x) => s + x.earned, 0);
  return {
    readinessPct: total > 0 ? clamp((earnedSum / total) * 100) : 0,
    weights,
    failingChecks: checks.filter((c) => c.status !== "PASS"),
    lastUpdated,
  };
}

/** Activation gate rows for diagnosis UI (required + key optional). */
export function buildActivationDiagnosis(checks) {
  const gateOrder = [
    "admin_user",
    "roles_configured",
    "catalog_configured",
    "at_least_one_lab",
    "isolation_verified",
  ];
  return gateOrder.map((id) => {
    const c = checks.find((x) => x.id === id);
    return {
      id,
      label: c?.label || id,
      pass: c?.status === "PASS",
      required: REQUIRED_GATE_IDS.has(id),
      status: c?.status || "FAIL",
      detail: c?.detail || "",
    };
  });
}

/** Open / inline actions per readiness check. */
export const PROVISIONING_CHECK_ACTIONS = {
  admin_user: { type: "edit_admin", label: "Edit admin" },
  roles_configured: { page: "tenantManagement", label: "Open setup" },
  catalog_configured: { page: "inventory", label: "Open catalog" },
  at_least_one_lab: { page: "labs", label: "Open labs" },
  isolation_verified: {
    page: "tenantManagement",
    section: "isolation",
    label: "Open isolation",
  },
  agent_assigned: { page: "visits", label: "Open agents" },
  ordering_enabled: { page: "orders", label: "Open orders" },
  collections_enabled: { page: "risk", label: "Open collections" },
};

export const PROVISIONING_TASK_ACTIONS = {
  create_admin: { type: "edit_admin", label: "Edit admin" },
  configure_roles: { page: "tenantManagement", label: "Open setup" },
  load_catalog: { page: "inventory", label: "Open catalog" },
  create_lab: { page: "labs", label: "Open labs" },
  assign_agent: { page: "visits", label: "Open agents" },
  verify_isolation: {
    page: "tenantManagement",
    section: "isolation",
    label: "Open isolation",
  },
};

export function evaluateActivationGates(checks) {
  const blockers = checks.filter(
    (c) => REQUIRED_GATE_IDS.has(c.id) && c.status !== "PASS"
  );
  const optionalPending = checks.filter(
    (c) => OPTIONAL_GATE_IDS.has(c.id) && c.status !== "PASS"
  );
  return {
    canActivate: blockers.length === 0,
    blockers,
    optionalPending,
    readyLabel: blockers.length === 0 ? "Ready to Activate" : "Blocked",
  };
}

/**
 * Resolve lifecycle badge for pipeline stepper.
 * @returns {'draft'|'configuring'|'ready'|'blocked'|'activated'}
 */
export function resolveProvisioningLifecycle(tenant, checks, gates) {
  const status = str(tenant.status).toUpperCase();
  if (status === "ACTIVE" || tenant.provisioning?.lifecycle === "activated") {
    return "activated";
  }
  if (!str(tenant.name) && !str(tenant.config?.companyName)) return "draft";
  if (!gates.canActivate) {
    const hasConfig = checks.some(
      (c) => c.id === "admin_user" && c.status === "PASS"
    );
    return hasConfig ? "blocked" : "draft";
  }
  if (gates.canActivate) return "ready";
  return "configuring";
}

export function buildProvisioningTasks(checks) {
  const taskDefs = [
    { id: "create_admin", label: "Create admin", checkId: "admin_user" },
    { id: "configure_roles", label: "Configure roles", checkId: "roles_configured" },
    { id: "load_catalog", label: "Load catalog", checkId: "catalog_configured" },
    { id: "create_lab", label: "Create first lab", checkId: "at_least_one_lab" },
    { id: "assign_agent", label: "Assign first agent", checkId: "agent_assigned" },
    { id: "verify_isolation", label: "Verify isolation", checkId: "isolation_verified" },
    { id: "activate", label: "Activate distributor", checkId: null },
  ];

  return taskDefs.map((t) => {
    const check = t.checkId ? checks.find((c) => c.id === t.checkId) : null;
    const done = t.id === "activate" ? false : check?.status === "PASS";
    const action = PROVISIONING_TASK_ACTIONS[t.id] || null;
    return {
      ...t,
      done,
      status: check?.status || "WARN",
      action,
      canMarkProvisioned: [
        "configure_roles",
        "load_catalog",
        "assign_agent",
        "verify_isolation",
      ].includes(t.id),
    };
  });
}

const TIMELINE_LABELS = {
  created: "Distributor created",
  admin_added: "Admin added",
  catalog_configured: "Catalog configured",
  lab_added: "Lab added",
  agent_assigned: "Agent assigned",
  isolation_verified: "Isolation verified",
  activated: "Activated",
};

/**
 * Build timeline from registry + inferred milestones (ledger pattern, local store).
 */
export function buildProvisioningTimeline(tenant, checks) {
  const stored = Array.isArray(tenant.provisioning?.timeline)
    ? tenant.provisioning.timeline
    : [];
  const inferred = [];

  if (tenant.createdAt) {
    inferred.push({
      id: "created",
      kind: "created",
      label: TIMELINE_LABELS.created,
      at: tenant.createdAt,
    });
  }
  if (checks.find((c) => c.id === "admin_user")?.status === "PASS") {
    inferred.push({
      id: "admin_added",
      kind: "admin_added",
      label: TIMELINE_LABELS.admin_added,
      at: tenant.config?.adminAddedAt || tenant.updatedAt || tenant.createdAt,
    });
  }
  if (checks.find((c) => c.id === "catalog_configured")?.status === "PASS") {
    inferred.push({
      id: "catalog_configured",
      kind: "catalog_configured",
      label: TIMELINE_LABELS.catalog_configured,
      at: tenant.config?.catalogConfiguredAt || null,
    });
  }
  if (checks.find((c) => c.id === "at_least_one_lab")?.status === "PASS") {
    inferred.push({
      id: "lab_added",
      kind: "lab_added",
      label: TIMELINE_LABELS.lab_added,
      at: tenant.config?.labAddedAt || null,
    });
  }
  if (checks.find((c) => c.id === "agent_assigned")?.status === "PASS") {
    inferred.push({
      id: "agent_assigned",
      kind: "agent_assigned",
      label: TIMELINE_LABELS.agent_assigned,
      at: tenant.config?.agentAssignedAt || null,
    });
  }
  if (checks.find((c) => c.id === "isolation_verified")?.status === "PASS") {
    inferred.push({
      id: "isolation_verified",
      kind: "isolation_verified",
      label: TIMELINE_LABELS.isolation_verified,
      at: tenant.lastIsolationAt || null,
    });
  }
  if (str(tenant.status).toUpperCase() === "ACTIVE" || tenant.provisioning?.activatedAt) {
    inferred.push({
      id: "activated",
      kind: "activated",
      label: TIMELINE_LABELS.activated,
      at: tenant.provisioning?.activatedAt || tenant.updatedAt,
    });
  }

  const byKind = new Map();
  for (const e of [...stored, ...inferred]) {
    if (!e?.at) continue;
    const kind = e.kind || e.id;
    if (!byKind.has(kind) || parseTime(e.at) > parseTime(byKind.get(kind).at)) {
      byKind.set(kind, { ...e, kind, label: e.label || TIMELINE_LABELS[kind] || kind });
    }
  }

  return [...byKind.values()]
    .filter((e) => e.at)
    .sort((a, b) => parseTime(b.at) - parseTime(a.at));
}

function parseTime(iso) {
  const ms = Date.parse(str(iso));
  return Number.isFinite(ms) ? ms : 0;
}

export function isTimelineOrdered(events) {
  const list = events || [];
  if (list.length < 2) return true;
  for (let i = 0; i < list.length - 1; i++) {
    if (parseTime(list[i].at) < parseTime(list[i + 1].at)) return false;
  }
  return true;
}

export function buildProvisioningPipeline(lifecycle) {
  const order = ["draft", "configured", "ready", "activated"];
  const mapLifecycle = {
    draft: 0,
    configuring: 1,
    configured: 1,
    blocked: 1,
    ready: 2,
    activated: 3,
  };
  const idx = mapLifecycle[lifecycle] ?? 0;

  return PIPELINE_STEPS.map((step, i) => {
    let visual = "upcoming";
    if (i < idx) visual = "complete";
    else if (i === idx) visual = lifecycle === "blocked" ? "blocked" : "current";
    else if (lifecycle === "activated" && i <= 3) visual = "complete";
    return { ...step, visual };
  });
}

/**
 * Build draft from provisioning wizard (4 steps).
 */
export function buildProvisioningDraft(form) {
  const company = form.company || {};
  const admin = form.admin || {};
  const ops = form.operations || {};
  const territories = str(company.territory)
    .split(/[,;]+/)
    .map((t) => str(t))
    .filter(Boolean);

  const id = crypto.randomUUID?.() || `dist-${Date.now()}`;
  const name = str(company.distributorName) || str(company.companyName);
  const now = new Date().toISOString();

  return {
    id,
    tenantCode: `dist-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${Date.now().toString(36).slice(-4)}`,
    name,
    status: "PENDING",
    config: {
      companyName: name,
      legalName: str(company.legalName),
      country: str(company.country),
      state: str(company.state),
      territories: territories.length ? territories : [str(company.state), str(company.country)].filter(Boolean),
      territory: str(company.territory),
      phone: str(company.phone),
      email: str(company.email),
      adminName: str(admin.name),
      adminEmail: str(admin.email),
      adminPhone: str(admin.phone),
      paymentTerms: str(ops.paymentTerms),
      creditLimit: num(ops.creditLimit),
      commissionPct: num(ops.commissionPct),
      territoryNotes: str(ops.territoryNotes),
      rolesConfigured: false,
      productCatalogReady: false,
      collectionsEnabled: false,
      orderingEnabled: false,
    },
    metrics: { labs: 0, orders: 0, collections: 0, visits: 0, openInterventions: 0, products: 0, agents: 0 },
    provisioning: {
      lifecycle: "configuring",
      timeline: [
        { id: "created", kind: "created", label: TIMELINE_LABELS.created, at: now },
        ...(str(admin.email)
          ? [{ id: "admin_added", kind: "admin_added", label: TIMELINE_LABELS.admin_added, at: now }]
          : []),
      ],
    },
    createdAt: now,
    updatedAt: now,
    lastIsolationPass: false,
    isolationChecks: [],
  };
}

/**
 * Full provisioning model for one distributor.
 */
export function buildDistributorProvisioningModel(tenant, ctx = {}) {
  const checks = buildProvisioningChecks({
    config: tenant.config,
    metrics: tenant.metrics,
    isLive: ctx.isLive,
    source: tenant.source,
    isolationChecks: tenant.isolationChecks,
    lastIsolationPass: tenant.lastIsolationPass,
    roleCount: ctx.roleCount,
    agentCount: ctx.agentCount,
  });

  const readinessPct = computeReadinessPercent(checks);
  const gates = evaluateActivationGates(checks);
  const lifecycle = resolveProvisioningLifecycle(tenant, checks, gates);
  const pipeline = buildProvisioningPipeline(
    lifecycle === "configuring" ? "configured" : lifecycle
  );
  const tasks = buildProvisioningTasks(checks);
  const timeline = buildProvisioningTimeline(tenant, checks);

  const activated = lifecycle === "activated";
  const readinessDebug = computeReadinessDebug(checks, tenant.updatedAt || tenant.createdAt);
  const activationDiagnosis = buildActivationDiagnosis(checks);

  return {
    distributorId: tenant.id,
    name: tenant.name,
    territories: parseTerritorySummary(tenant.config),
    lifecycle,
    pipeline,
    checks,
    readinessPct,
    readinessDebug,
    activationDiagnosis,
    gates,
    tasks,
    timeline,
    activated,
    profile: {
      legalName: str(tenant.config?.legalName),
      admin: str(tenant.config?.adminName),
      email: str(tenant.config?.adminEmail),
      phone: str(tenant.config?.adminPhone),
      paymentTerms: str(tenant.config?.paymentTerms),
      creditLimit: tenant.config?.creditLimit,
      commissionPct: tenant.config?.commissionPct,
    },
    isLive: ctx.isLive,
    isHome: tenant.isHome,
  };
}

export { PIPELINE_STEPS, REQUIRED_GATE_IDS, TIMELINE_LABELS };
