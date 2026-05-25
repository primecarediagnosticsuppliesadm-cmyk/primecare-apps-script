import { summarizePredatorEntries } from "@/predator/predatorSchema.js";

const MAX_TIMINGS = 300;
const MAX_ERRORS = 20;
const MAX_MODULE_REPORTS = 40;

/** @type {import('@/predator/predatorSchema.js').PredatorTenantContext|null} */
let activeTenantContext = null;

/** @type {Map<string, { entries: import('@/predator/predatorSchema.js').PredatorDebugEntry[], updatedAt: string }>} */
const moduleReportsByTenant = new Map();

/** @type {import('@/predator/predatorSchema.js').PredatorDebugEntry[]} */
const timingEntries = [];

/** @type {import('@/predator/predatorSchema.js').PredatorDebugEntry[]} */
const errorEntries = [];

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
};
