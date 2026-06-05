/**
 * Distributor Provisioning V3 — HQ-operated launch workflow (not self-service SaaS).
 * tenant_id = distributor company; territories live on config.territories.
 */

import { isolationChecksPass } from "@/tenant/tenantFoundationIsolation.js";
import { parseTerritorySummary } from "@/distributor/distributorWorkspaceEngine.js";
import {
  LIFECYCLE_DB_STATUS,
  LIFECYCLE_STATUS,
  normalizeCommercialConfig,
} from "@/distributor/distributorLifecycleEngine.js";
import {
  readDistributorCatalogItems,
  validateHqCatalogPricingConfigured,
} from "@/catalog/distributorCatalogEngine.js";
import {
  PERSISTENCE_STATUS,
  resolvePersistenceStatus,
  resolvePersistenceDisplay,
} from "@/tenant/durableTenantStore.js";

const PIPELINE_STEPS = [
  { id: "draft", label: "Draft" },
  { id: "configured", label: "Configured" },
  { id: "ready", label: "Ready" },
  { id: "activated", label: "Activated" },
];

/** Gates that block activation — operational milestones only (no distributor user provisioning). */
export const ACTIVATION_GATE_IDS = new Set([
  "durable_tenant",
  "catalog_configured",
  "catalog_hq_pricing_configured",
  "isolation_verified",
  "at_least_one_lab",
  "contract_configured",
]);

/** @deprecated Use ACTIVATION_GATE_IDS — kept for imports that expect REQUIRED_GATE_IDS */
export const REQUIRED_GATE_IDS = ACTIVATION_GATE_IDS;

const OPTIONAL_GATE_IDS = new Set(["agent_assigned"]);

function readinessWeightFor(c) {
  if (c.comingSoon) return 0;
  if (c.readinessWeight != null) return c.readinessWeight;
  return c.required ? 2 : 1;
}

function str(v) {
  return String(v ?? "").trim();
}

/** @deprecated Year-1 HQ-operated model — contact fields only, not a login user gate. */
export function evaluateAdminUserGate(config = {}) {
  const adminName = str(config.adminName);
  const adminEmail = str(config.adminEmail);
  const adminPhone = str(config.adminPhone);
  return {
    pass: Boolean(adminName && adminEmail),
    requiredFields: ["adminName", "adminEmail"],
    optionalFields: ["adminPhone"],
    values: {
      adminName,
      adminEmail,
      adminPhone,
      adminUpdatedAt: str(config.adminUpdatedAt),
    },
    missing: [!adminName ? "adminName" : null, !adminEmail ? "adminEmail" : null].filter(
      Boolean
    ),
  };
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
  const isDb = ctx.source === "database";
  const persistenceStatus = resolvePersistenceStatus({
    source: ctx.source,
    durable: ctx.durable,
    persistenceStatus: ctx.persistenceStatus,
    syncFailed: ctx.syncFailed,
    lastSyncError: ctx.lastSyncError,
  });
  const isDurable = persistenceStatus === PERSISTENCE_STATUS.DURABLE || isDb;
  const isolationPass =
    ctx.isolationChecks?.length > 0
      ? isolationChecksPass(ctx.isolationChecks)
      : ctx.lastIsolationPass === true;
  const contractCount = num(metrics.contracts ?? ctx.contractCount);

  const checks = [
    {
      id: "durable_tenant",
      label: "Saved permanently",
      required: true,
      pass: isDurable,
      detail: isDurable
        ? "Distributor saved to your account"
        : persistenceStatus === PERSISTENCE_STATUS.SYNC_FAILED
          ? `Save failed — ${str(ctx.lastSyncError) || "tap Sync local distributors"}`
          : "Saved on this device — sync before launch",
    },
    {
      id: "catalog_configured",
      label: "Catalog assigned",
      required: true,
      pass:
        config.catalogAssigned === true ||
        (Array.isArray(config.distributorCatalog?.items) &&
          config.distributorCatalog.items.length > 0) ||
        num(config.catalogAssignedCount) > 0,
      detail:
        config.catalogAssigned === true || num(config.catalogAssignedCount) > 0
          ? `${num(config.catalogAssignedCount) || config.distributorCatalog?.items?.length || 0} product(s) assigned from HQ master`
          : "Assign at least one product from HQ master catalog in Distributor OS",
    },
    {
      id: "catalog_hq_pricing_configured",
      label: "HQ catalog pricing configured",
      required: true,
      pass: (() => {
        const items = readDistributorCatalogItems(config);
        if (!items.length) return false;
        return validateHqCatalogPricingConfigured(items).valid;
      })(),
      detail: (() => {
        const items = readDistributorCatalogItems(config);
        if (!items.length) return "Assign catalog products before launch";
        const hq = validateHqCatalogPricingConfigured(items);
        return hq.valid
          ? "All assigned products have HQ cost and transfer price"
          : `${hq.missingCount} product(s) missing HQ cost/transfer price — configure in Master Catalog`;
      })(),
    },
    {
      id: "isolation_verified",
      label: "Data isolation verified",
      required: true,
      pass: isDb ? isolationPass : config.isolationAcknowledged === true,
      detail: isDb
        ? isolationPass
          ? "Tenant separation and RLS validated"
          : "Verify tenant isolation on HQ tenant management"
        : "Acknowledge data isolation after saving distributor",
    },
    {
      id: "at_least_one_lab",
      label: "First lab added",
      required: true,
      pass: num(metrics.labs) >= 1,
      detail: `${num(metrics.labs)} lab(s) in scope`,
    },
    {
      id: "contract_configured",
      label: "Contract configured",
      required: true,
      pass:
        contractCount >= 1 ||
        num(config.contractCount) >= 1 ||
        config.contractConfigured === true,
      detail:
        contractCount >= 1 || num(config.contractCount) >= 1
          ? `${contractCount || num(config.contractCount)} contract(s)`
          : "Add at least one lab contract in Contracts tab",
    },
    {
      id: "distributor_activated",
      label: "Distributor activated",
      required: false,
      readinessWeight: 2,
      pass:
        str(ctx.status).toUpperCase() === "ACTIVE" ||
        str(config.lifecycleStatus).toLowerCase() === LIFECYCLE_STATUS.ACTIVE ||
        ctx.provisioningLifecycle === "activated",
      detail: "Launch distributor when all gates pass",
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

  return checks.map((c) => {
    if (c.comingSoon) {
      return { ...c, status: "WARN" };
    }
    return {
      ...c,
      status: toCheckStatus(
        c.pass,
        c.required,
        !c.pass && !isDb && c.id === "isolation_verified"
      ),
    };
  });
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
  const weights = checks
    .map((c) => {
      const w = readinessWeightFor(c);
      const earned =
        w === 0 ? 0 : c.status === "PASS" ? w : c.status === "WARN" ? w * 0.5 : 0;
      return {
        id: c.id,
        label: c.label,
        weight: w,
        earned,
        required: c.required,
        activationRequired: ACTIVATION_GATE_IDS.has(c.id),
        status: c.status,
        comingSoon: Boolean(c.comingSoon),
      };
    })
    .filter((w) => w.weight > 0);
  const total = weights.reduce((s, x) => s + x.weight, 0);
  const earnedSum = weights.reduce((s, x) => s + x.earned, 0);
  return {
    readinessPct: total > 0 ? clamp((earnedSum / total) * 100) : 0,
    weights,
    failingChecks: checks.filter((c) => c.status !== "PASS"),
    lastUpdated,
  };
}

/** Activation gate rows for diagnosis UI (required operational milestones). */
export function buildActivationDiagnosis(checks) {
  const gateOrder = [
    "durable_tenant",
    "catalog_configured",
    "catalog_hq_pricing_configured",
    "isolation_verified",
    "at_least_one_lab",
    "contract_configured",
    "distributor_activated",
    "agent_assigned",
  ];
  return gateOrder.map((id) => {
    const c = checks.find((x) => x.id === id);
    const blocksActivation = ACTIVATION_GATE_IDS.has(id);
    return {
      id,
      label: c?.label || id,
      pass: c?.comingSoon ? false : c?.status === "PASS",
      required: blocksActivation,
      blocksActivation,
      comingSoon: Boolean(c?.comingSoon),
      status: c?.comingSoon ? "WARN" : c?.status || (blocksActivation ? "FAIL" : "WARN"),
      detail: c?.detail || "",
    };
  });
}

/** Open / inline actions per readiness check. */
export const PROVISIONING_CHECK_ACTIONS = {
  catalog_configured: {
    page: "distributorOs",
    tab: "catalog",
    label: "Open catalog",
  },
  catalog_hq_pricing_configured: {
    page: "masterCatalog",
    label: "Configure HQ pricing",
  },
  at_least_one_lab: {
    page: "distributorOs",
    tab: "labs",
    openAddLab: true,
    label: "Open labs",
  },
  contract_configured: {
    page: "distributorOs",
    tab: "contracts",
    label: "Open contracts",
  },
  isolation_verified: {
    type: "verify_isolation",
    label: "Verify isolation",
  },
  agent_assigned: { page: "distributorOs", tab: "agents", label: "Open agents" },
  ordering_enabled: { page: "distributorOs", tab: "orders", label: "Open orders" },
  collections_enabled: {
    page: "distributorOs",
    tab: "collections",
    label: "Open collections",
  },
};

export const PROVISIONING_TASK_ACTIONS = {
  load_catalog: {
    type: "use_standard_catalog",
    label: "Assign from HQ master catalog",
  },
  create_lab: {
    page: "distributorOs",
    tab: "labs",
    openAddLab: true,
    label: "Open labs",
  },
  configure_contract: {
    page: "distributorOs",
    tab: "contracts",
    label: "Open contracts",
  },
  assign_agent: { page: "distributorOs", tab: "agents", label: "Open agents" },
  verify_isolation: {
    type: "verify_isolation",
    label: "Verify isolation",
  },
};

export function evaluateActivationGates(checks) {
  const blockers = checks.filter(
    (c) => ACTIVATION_GATE_IDS.has(c.id) && c.status !== "PASS"
  );
  const optionalPending = checks.filter(
    (c) => OPTIONAL_GATE_IDS.has(c.id) && c.status !== "PASS"
  );
  return {
    canActivate: blockers.length === 0,
    blockers,
    optionalPending,
    readyLabel: blockers.length === 0 ? "Ready to launch" : "Not ready to launch",
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
    const hasProgress = checks.some(
      (c) => ACTIVATION_GATE_IDS.has(c.id) && c.status === "PASS"
    );
    return hasProgress ? "blocked" : "configuring";
  }
  if (gates.canActivate) return "ready";
  return "configuring";
}

export function buildProvisioningTasks(checks) {
  const taskDefs = [
    { id: "load_catalog", label: "Assign catalog from HQ master", checkId: "catalog_configured" },
    { id: "verify_isolation", label: "Verify data isolation", checkId: "isolation_verified" },
    { id: "create_lab", label: "Add first lab", checkId: "at_least_one_lab" },
    { id: "configure_contract", label: "Configure contract", checkId: "contract_configured" },
    { id: "assign_agent", label: "Assign first agent", checkId: "agent_assigned" },
    { id: "activate", label: "Launch distributor", checkId: null },
  ];

  return taskDefs.map((t) => {
    const check = t.checkId ? checks.find((c) => c.id === t.checkId) : null;
    const done = t.id === "activate" ? false : check?.status === "PASS";
    const action = PROVISIONING_TASK_ACTIONS[t.id] || null;
    return {
      ...t,
      done: t.comingSoon ? false : done,
      status: t.comingSoon ? "WARN" : check?.status || "WARN",
      action,
      comingSoon: Boolean(t.comingSoon),
      canMarkProvisioned: ["assign_agent", "verify_isolation"].includes(t.id),
    };
  });
}

const TIMELINE_LABELS = {
  created: "Distributor created",
  catalog_configured: "Catalog assigned",
  isolation_verified: "Data isolation verified",
  lab_added: "First lab added",
  contract_configured: "Contract configured",
  agent_assigned: "Agent assigned",
  activated: "Distributor activated",
};

export const LAUNCH_FLOW_STEPS = [
  { id: "company", label: "Company", checkId: "durable_tenant" },
  { id: "catalog", label: "Catalog", checkId: "catalog_configured" },
  { id: "isolation", label: "Isolation", checkId: "isolation_verified" },
  { id: "lab", label: "First Lab", checkId: "at_least_one_lab" },
  { id: "contract", label: "Contract", checkId: "contract_configured" },
  { id: "launch", label: "Launch", checkId: null },
];

export function buildLaunchFlowSteps(checks, lifecycle) {
  const activated = lifecycle === "activated";
  let foundCurrent = false;
  return LAUNCH_FLOW_STEPS.map((step) => {
    let pass = false;
    if (step.id === "launch") {
      pass = activated;
    } else {
      const c = checks.find((x) => x.id === step.checkId);
      pass = c?.status === "PASS";
    }
    let visual = "upcoming";
    if (pass) {
      visual = "complete";
    } else if (!foundCurrent) {
      visual = lifecycle === "blocked" && step.checkId ? "blocked" : "current";
      foundCurrent = true;
    }
    return { ...step, visual, pass };
  });
}

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
  if (checks.find((c) => c.id === "catalog_configured")?.status === "PASS") {
    inferred.push({
      id: "catalog_configured",
      kind: "catalog_configured",
      label: TIMELINE_LABELS.catalog_configured,
      at: tenant.config?.catalogConfiguredAt || null,
    });
  }
  if (checks.find((c) => c.id === "isolation_verified")?.status === "PASS") {
    inferred.push({
      id: "isolation_verified",
      kind: "isolation_verified",
      label: TIMELINE_LABELS.isolation_verified,
      at: tenant.lastIsolationAt || tenant.config?.isolationVerifiedAt || null,
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
  if (checks.find((c) => c.id === "contract_configured")?.status === "PASS") {
    inferred.push({
      id: "contract_configured",
      kind: "contract_configured",
      label: TIMELINE_LABELS.contract_configured,
      at: tenant.config?.contractConfiguredAt || null,
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
 * Build draft from provisioning wizard.
 */
export function buildProvisioningDraft(form) {
  const company = form.company || {};
  const ops = form.operations || {};
  const commercial = form.commercial || {};
  const territories = str(company.territory)
    .split(/[,;]+/)
    .map((t) => str(t))
    .filter(Boolean);

  const id = crypto.randomUUID?.() || `dist-${Date.now()}`;
  const name = str(company.distributorName) || str(company.companyName);
  const now = new Date().toISOString();
  const commercialConfig = normalizeCommercialConfig({
    legalName: str(company.legalName),
    territories: territories.length ? territories.join(", ") : str(company.territory),
    adminName: str(company.contactName) || str(company.email) ? "Contact" : "",
    adminEmail: str(company.email),
    adminPhone: str(company.phone),
    contractStartDate: commercial.contractStartDate,
    contractEndDate: commercial.contractEndDate,
    billingModel: commercial.billingModel || "fixed_monthly",
    monthlyPlatformFee: commercial.monthlyPlatformFee,
    revenueSharePct: commercial.revenueSharePct || ops.commissionPct,
    perLabFee: commercial.perLabFee,
    lifecycleStatus: commercial.lifecycleStatus || LIFECYCLE_STATUS.DRAFT,
  });
  const lifecycleStatus = commercialConfig.lifecycleStatus;
  const dbStatus = LIFECYCLE_DB_STATUS[lifecycleStatus] || "PENDING";

  return {
    id,
    tenantCode: `dist-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}-${Date.now().toString(36).slice(-4)}`,
    name,
    status: dbStatus,
    config: {
      companyName: name,
      legalName: commercialConfig.legalName || str(company.legalName),
      country: str(company.country),
      state: str(company.state),
      territories: territories.length ? territories : [str(company.state), str(company.country)].filter(Boolean),
      territory: str(company.territory),
      phone: str(company.phone),
      email: str(company.email),
      contactName: str(company.contactName),
      adminName: commercialConfig.adminName,
      adminEmail: commercialConfig.adminEmail,
      adminPhone: commercialConfig.adminPhone,
      paymentTerms: str(ops.paymentTerms),
      creditLimit: num(ops.creditLimit),
      commissionPct: num(ops.commissionPct ?? commercial.revenueSharePct),
      territoryNotes: str(ops.territoryNotes),
      contractStartDate: commercialConfig.contractStartDate,
      contractEndDate: commercialConfig.contractEndDate,
      billingModel: commercialConfig.billingModel,
      monthlyPlatformFee: commercialConfig.monthlyPlatformFee,
      revenueSharePct: commercialConfig.revenueSharePct,
      perLabFee: commercialConfig.perLabFee,
      lifecycleStatus: commercialConfig.lifecycleStatus,
      billingDueDate: commercialConfig.billingDueDate,
      billingCollected: 0,
      productCatalogReady: false,
      collectionsEnabled: lifecycleStatus === LIFECYCLE_STATUS.ACTIVE,
      orderingEnabled: lifecycleStatus === LIFECYCLE_STATUS.ACTIVE,
    },
    metrics: { labs: 0, orders: 0, collections: 0, visits: 0, openInterventions: 0, products: 0, agents: 0, contracts: 0 },
    provisioning: {
      lifecycle: "configuring",
      timeline: [
        { id: "created", kind: "created", label: TIMELINE_LABELS.created, at: now },
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
  const persistence = resolvePersistenceDisplay(tenant);
  const persistenceStatus = persistence.key;
  const checks = buildProvisioningChecks({
    config: tenant.config,
    metrics: tenant.metrics,
    status: tenant.status,
    provisioningLifecycle: tenant.provisioning?.lifecycle,
    isLive: ctx.isLive,
    source: tenant.source,
    durable: tenant.durable,
    persistenceStatus,
    syncFailed: tenant.syncFailed,
    lastSyncError: tenant.lastSyncError,
    isolationChecks: tenant.isolationChecks,
    lastIsolationPass: tenant.lastIsolationPass,
    agentCount: ctx.agentCount,
    contractCount: ctx.contractCount,
  });

  const readinessPct = computeReadinessPercent(checks);
  const gates = evaluateActivationGates(checks);
  const lifecycle = resolveProvisioningLifecycle(tenant, checks, gates);
  const pipeline = buildProvisioningPipeline(
    lifecycle === "configuring" ? "configured" : lifecycle
  );
  const launchFlow = buildLaunchFlowSteps(checks, lifecycle);
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
    launchFlow,
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
      contact: str(tenant.config?.contactName) || str(tenant.config?.adminName),
      email: str(tenant.config?.email) || str(tenant.config?.adminEmail),
      phone: str(tenant.config?.phone) || str(tenant.config?.adminPhone),
      paymentTerms: str(tenant.config?.paymentTerms),
      creditLimit: tenant.config?.creditLimit,
      commissionPct: tenant.config?.commissionPct,
      catalogAssigned: tenant.config?.catalogAssigned === true,
      catalogAssignedCount: num(tenant.config?.catalogAssignedCount),
    },
    isLive: ctx.isLive,
    isHome: tenant.isHome,
    persistenceStatus,
    persistenceLabel: persistence.label,
    persistenceTone: persistence.tone,
    durable: persistenceStatus === PERSISTENCE_STATUS.DURABLE,
  };
}

export { PIPELINE_STEPS, TIMELINE_LABELS };
