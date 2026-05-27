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

  /**
   * Metadata-only tenant operations summary (no business records).
   * Safe for operational visibility cards.
   */
  getTenantOperationalSummaries() {
    /** @type {Map<string, {
     * tenantKey: string,
     * tenantId: string,
     * userId: string,
     * moduleCount: number,
     * pass: number,
     * warn: number,
     * fail: number,
     * latestValidationAt: string|null,
     * errorCount: number,
     * slowTimingCount: number,
     * avgValidationMs: number|null,
   }>} */
    const byTenant = new Map();

    for (const report of moduleReportsByTenant.values()) {
      const [tenantId = "_no_tenant", userId = "_no_user"] = String(report.tenantKey).split("::");
      if (!byTenant.has(report.tenantKey)) {
        byTenant.set(report.tenantKey, {
          tenantKey: report.tenantKey,
          tenantId,
          userId,
          moduleCount: 0,
          pass: 0,
          warn: 0,
          fail: 0,
          latestValidationAt: null,
          errorCount: 0,
          slowTimingCount: 0,
          avgValidationMs: null,
        });
      }
      const row = byTenant.get(report.tenantKey);
      row.moduleCount += 1;
      row.pass += report.summary?.pass || 0;
      row.warn += report.summary?.warn || 0;
      row.fail += report.summary?.fail || 0;
      row.latestValidationAt =
        !row.latestValidationAt || String(report.updatedAt) > String(row.latestValidationAt)
          ? report.updatedAt
          : row.latestValidationAt;
    }

    const timingAgg = new Map();
    for (const t of timingEntries) {
      const key = `${t.tenantId || "_no_tenant"}::${t.userId || "_no_user"}`;
      if (!timingAgg.has(key)) timingAgg.set(key, { sum: 0, count: 0, slow: 0 });
      const agg = timingAgg.get(key);
      if (typeof t.durationMs === "number") {
        agg.sum += t.durationMs;
        agg.count += 1;
        if (t.durationMs > 2000) agg.slow += 1;
      }
    }

    const errorAgg = new Map();
    for (const e of errorEntries) {
      const key = `${e.tenantId || "_no_tenant"}::${e.userId || "_no_user"}`;
      errorAgg.set(key, (errorAgg.get(key) || 0) + 1);
    }

    for (const [key, agg] of timingAgg.entries()) {
      if (!byTenant.has(key)) {
        const [tenantId = "_no_tenant", userId = "_no_user"] = String(key).split("::");
        byTenant.set(key, {
          tenantKey: key,
          tenantId,
          userId,
          moduleCount: 0,
          pass: 0,
          warn: 0,
          fail: 0,
          latestValidationAt: null,
          errorCount: 0,
          slowTimingCount: 0,
          avgValidationMs: null,
        });
      }
      const row = byTenant.get(key);
      row.slowTimingCount = agg.slow;
      row.avgValidationMs = agg.count > 0 ? Math.round(agg.sum / agg.count) : null;
    }

    for (const [key, count] of errorAgg.entries()) {
      if (!byTenant.has(key)) {
        const [tenantId = "_no_tenant", userId = "_no_user"] = String(key).split("::");
        byTenant.set(key, {
          tenantKey: key,
          tenantId,
          userId,
          moduleCount: 0,
          pass: 0,
          warn: 0,
          fail: 0,
          latestValidationAt: null,
          errorCount: 0,
          slowTimingCount: 0,
          avgValidationMs: null,
        });
      }
      byTenant.get(key).errorCount = count;
    }

    return [...byTenant.values()].sort((a, b) => {
      if (a.fail !== b.fail) return b.fail - a.fail;
      if (a.warn !== b.warn) return b.warn - a.warn;
      return String(b.latestValidationAt || "").localeCompare(String(a.latestValidationAt || ""));
    });
  },
};
