import { summarizePredatorEntries } from "@/predator/predatorSchema.js";

const MAX_TIMINGS = 300;
const MAX_ERRORS = 20;
const MAX_MODULE_REPORTS = 40;
const MAX_CACHE_EVENTS = 50;
const MAX_API_TRACES = 80;
const MAX_RENDER_STEPS = 100;
const MAX_UI_STATE_TRACES = 40;
const MAX_STATE_TRANSITIONS = 60;

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

/** @type {Object[]} */
const uiStateTraces = [];

/** @type {Object[]} */
const stateTransitions = [];

/** @type {Map<string, import('@/predator/predatorDiagnosisSchema.js').PredatorModuleDiagnosis>} */
const moduleDiagnosisByTenant = new Map();

/** @type {Map<string, Object>} */
const moduleReliabilityByTenant = new Map();

/** @type {Map<string, { snapshot: object, source: string, capturedAt: number, kpiModel?: object|null }>} */
const moduleRenderedSnapshotsByTenant = new Map();

/** @type {Map<string, number>} */
const moduleApiValidationAtByTenant = new Map();

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

  /** WARN/FAIL only — excludes INFO-level schema diagnostics. */
  getOperationalErrors() {
    return errorEntries.filter((e) => e.status === "WARN" || e.status === "FAIL");
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

  recordUiStateTrace(trace) {
    uiStateTraces.unshift(stampContext(trace));
    if (uiStateTraces.length > MAX_UI_STATE_TRACES) uiStateTraces.length = MAX_UI_STATE_TRACES;
  },

  getUiStateTracesForModule(module) {
    return uiStateTraces.filter((t) => t.module === module);
  },

  getLatestUiStateTrace(module, metricId) {
    return (
      uiStateTraces.find((t) => t.module === module && t.metricId === metricId) || null
    );
  },

  /**
   * @param {string} module
   * @param {{ snapshot: object, source: string, capturedAt: number, kpiModel?: object|null }} payload
   * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} [ctx]
   */
  setModuleRenderedSnapshot(module, payload, ctx = activeTenantContext) {
    const key = `${tenantBucketKey(ctx)}::${module}`;
    moduleRenderedSnapshotsByTenant.set(key, {
      snapshot: payload.snapshot,
      source: payload.source,
      capturedAt: payload.capturedAt,
      kpiModel: payload.kpiModel ?? null,
    });
  },

  /**
   * @param {string} module
   * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} [ctx]
   */
  getModuleRenderedSnapshot(module, ctx = activeTenantContext) {
    const key = `${tenantBucketKey(ctx)}::${module}`;
    const row = moduleRenderedSnapshotsByTenant.get(key);
    return row ? { ...row } : null;
  },

  /**
   * @param {string} module
   * @param {number} validatedAtMs
   * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} [ctx]
   */
  setModuleApiValidationAt(module, validatedAtMs, ctx = activeTenantContext) {
    const key = `${tenantBucketKey(ctx)}::${module}`;
    moduleApiValidationAtByTenant.set(key, validatedAtMs);
  },

  /**
   * Drop UI traces that only record state/render zero (stale before fresh page render).
   * @param {string} module
   */
  clearStaleZeroUiStateTraces(module) {
    for (let i = uiStateTraces.length - 1; i >= 0; i -= 1) {
      const t = uiStateTraces[i];
      if (t.module !== module) continue;
      const state = Number(t.state);
      const render = Number(t.render);
      if ((Number.isFinite(state) && state === 0) || (Number.isFinite(render) && render === 0)) {
        uiStateTraces.splice(i, 1);
      }
    }
    this.clearStaleZeroStateTransitions(module);
  },

  /** Remove false-positive UI sync transitions recorded before hydration. */
  clearStaleZeroStateTransitions(module) {
    const staleKinds = new Set(["render.stale_zero", "state.reset_after_load", "state.overwrite"]);
    for (let i = stateTransitions.length - 1; i >= 0; i -= 1) {
      const t = stateTransitions[i];
      if (t.module !== module || !staleKinds.has(t.kind)) continue;
      const to = Number(t.to);
      if (Number.isFinite(to) && to === 0) {
        stateTransitions.splice(i, 1);
      }
    }
  },

  recordStateTransition(transition) {
    stateTransitions.unshift(stampContext(transition));
    if (stateTransitions.length > MAX_STATE_TRANSITIONS) {
      stateTransitions.length = MAX_STATE_TRANSITIONS;
    }
  },

  getStateTransitionsForModule(module) {
    return stateTransitions.filter((t) => t.module === module);
  },

  /**
   * @param {string} module
   * @param {Object} score
   * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} [ctx]
   */
  setModuleReliability(module, score, ctx = activeTenantContext) {
    const key = `${tenantBucketKey(ctx)}::${module}`;
    moduleReliabilityByTenant.set(key, { ...score, module });
  },

  getModuleReliability(module) {
    const key = `${tenantBucketKey(activeTenantContext)}::${module}`;
    return moduleReliabilityByTenant.get(key) || null;
  },

  getAllModuleReliabilityForActiveTenant() {
    const prefix = `${tenantBucketKey(activeTenantContext)}::`;
    return [...moduleReliabilityByTenant.entries()]
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
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
