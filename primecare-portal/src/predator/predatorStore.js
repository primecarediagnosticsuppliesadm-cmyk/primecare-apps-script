import { summarizePredatorEntries } from "@/predator/predatorSchema.js";

const MAX_TIMINGS = 300;
const MAX_ERRORS = 20;
const MAX_MODULE_REPORTS = 40;
const MAX_CACHE_EVENTS = 50;
const MAX_API_TRACES = 80;
const MAX_RENDER_STEPS = 100;

/** @type {import('@/predator/predatorSchema.js').PredatorTenantContext|null} */
let activeTenantContext = null;

/** @type {Map<string, { entries: import('@/predator/predatorSchema.js').PredatorDebugEntry[], updatedAt: string }>} */
const moduleReportsByTenant = new Map();

/** @type {import('@/predator/predatorSchema.js').PredatorDebugEntry[]} */
const timingEntries = [];

/** @type {import('@/predator/predatorSchema.js').PredatorDebugEntry[]} */
const errorEntries = [];

/** @type {Object[]} */
const cacheEvents = [];

/** @type {Object[]} */
const apiExecutions = [];

/** @type {Object[]} */
const renderSteps = [];

/** @type {Map<string, import('@/predator/predatorDiagnosisSchema.js').PredatorModuleDiagnosis>} */
const moduleDiagnosisByTenant = new Map();

function tenantBucketKey(ctx) {
  const tid = ctx?.tenantId || "_no_tenant";
  const uid = ctx?.userId || "_no_user";
  return `${tid}::${uid}`;
}

function stampContext(entry, ctx = activeTenantContext) {
  return {
    ...entry,
    tenantId: entry.tenantId ?? ctx?.tenantId ?? null,
    role: entry.role ?? ctx?.role ?? null,
    userId: entry.userId ?? ctx?.userId ?? null,
  };
}

export const predatorStore = {
  setActiveTenantContext(ctx) {
    activeTenantContext = ctx
      ? {
          tenantId: ctx.tenantId ?? null,
          role: ctx.role ?? null,
          userId: ctx.userId ?? null,
        }
      : null;
  },

  getActiveTenantContext() {
    return activeTenantContext ? { ...activeTenantContext } : null;
  },

  /**
   * @param {import('@/predator/predatorSchema.js').PredatorDebugEntry} entry
   */
  recordTiming(entry) {
    timingEntries.unshift(stampContext(entry));
    if (timingEntries.length > MAX_TIMINGS) timingEntries.length = MAX_TIMINGS;
  },

  /**
   * @param {import('@/predator/predatorSchema.js').PredatorDebugEntry} entry
   */
  recordError(entry) {
    const stamped = stampContext({
      ...entry,
      status: entry.status || "FAIL",
      severity: entry.severity || "high",
    });
    errorEntries.unshift(stamped);
    if (errorEntries.length > MAX_ERRORS) errorEntries.length = MAX_ERRORS;
  },

  /**
   * @param {string} module
   * @param {import('@/predator/predatorSchema.js').PredatorDebugEntry[]} entries
   * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} [ctx]
   */
  setModuleReport(module, entries, ctx = activeTenantContext) {
    const key = tenantBucketKey(ctx);
    const bucketKey = `${key}::${module}`;
    const stamped = (entries || []).map((e) => stampContext({ ...e, module: e.module || module }));
    const summary = summarizePredatorEntries(stamped);
    moduleReportsByTenant.set(bucketKey, {
      module,
      tenantKey: key,
      entries: stamped,
      summary,
      updatedAt: new Date().toISOString(),
    });
    const keys = [...moduleReportsByTenant.keys()];
    if (keys.length > MAX_MODULE_REPORTS) {
      for (let i = MAX_MODULE_REPORTS; i < keys.length; i += 1) {
        moduleReportsByTenant.delete(keys[i]);
      }
    }
  },

  getModuleReportsForActiveTenant() {
    const key = tenantBucketKey(activeTenantContext);
    return [...moduleReportsByTenant.values()].filter((r) => r.tenantKey === key);
  },

  getAllTimings() {
    return [...timingEntries];
  },

  getErrors() {
    return [...errorEntries];
  },

  getSlowestProcesses(limit = 15) {
    return [...timingEntries]
      .filter((t) => typeof t.durationMs === "number")
      .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
      .slice(0, limit);
  },

  getFailedValidations() {
    const out = [];
    for (const report of this.getModuleReportsForActiveTenant()) {
      for (const e of report.entries) {
        if (e.status === "FAIL" || e.status === "WARN") out.push(e);
      }
    }
    return out.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  },

  clearModuleReports() {
    const key = tenantBucketKey(activeTenantContext);
    for (const k of [...moduleReportsByTenant.keys()]) {
      if (k.startsWith(`${key}::`)) moduleReportsByTenant.delete(k);
    }
  },

  recordCacheEvent(event) {
    cacheEvents.unshift(stampContext(event));
    if (cacheEvents.length > MAX_CACHE_EVENTS) cacheEvents.length = MAX_CACHE_EVENTS;
  },

  getCacheEvents() {
    return [...cacheEvents];
  },

  recordApiExecution(trace) {
    apiExecutions.unshift(stampContext(trace));
    if (apiExecutions.length > MAX_API_TRACES) apiExecutions.length = MAX_API_TRACES;
  },

  getApiExecutionsForModule(module) {
    return apiExecutions.filter((t) => t.module === module);
  },

  recordRenderStep(step) {
    renderSteps.unshift(stampContext(step));
    if (renderSteps.length > MAX_RENDER_STEPS) renderSteps.length = MAX_RENDER_STEPS;
  },

  getRenderStepsForModule(module) {
    return renderSteps.filter((s) => s.module === module);
  },

  /**
   * @param {string} module
   * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorModuleDiagnosis} diagnosis
   * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} [ctx]
   */
  setModuleDiagnosis(module, diagnosis, ctx = activeTenantContext) {
    const key = `${tenantBucketKey(ctx)}::${module}`;
    moduleDiagnosisByTenant.set(key, diagnosis);
  },

  getModuleDiagnosis(module) {
    const key = `${tenantBucketKey(activeTenantContext)}::${module}`;
    return moduleDiagnosisByTenant.get(key) || null;
  },

  getAllModuleDiagnosesForActiveTenant() {
    const prefix = `${tenantBucketKey(activeTenantContext)}::`;
    return [...moduleDiagnosisByTenant.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
  },
};
