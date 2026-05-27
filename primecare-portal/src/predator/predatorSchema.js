/** @typedef {'PASS' | 'INFO' | 'WARN' | 'FAIL'} PredatorStatus */
/** @typedef {'low' | 'medium' | 'high' | 'critical'} PredatorSeverity */

/**
 * @typedef {Object} PredatorTenantContext
 * @property {string|null} tenantId
 * @property {string|null} role
 * @property {string|null} userId
 */

/**
 * @typedef {Object} PredatorDebugEntry
 * @property {PredatorStatus} status
 * @property {string} module
 * @property {string} step
 * @property {number|null} durationMs
 * @property {unknown} [expected]
 * @property {unknown} [actual]
 * @property {string} rootCauseGuess
 * @property {string} suggestedFix
 * @property {PredatorSeverity} severity
 * @property {string} timestamp
 * @property {string|null} [tenantId]
 * @property {string|null} [role]
 * @property {string|null} [userId]
 * @property {string} [issueClass]
 */

/** Slow-query / process thresholds (ms) — Phase 2 defaults. */
export const PREDATOR_TIMING_THRESHOLDS_MS = {
  authBootstrap: 3000,
  authProfileFetch: 1500,
  dashboardLoad: 5000,
  supabaseRead: 2000,
  rlsVisibilityCheck: 1500,
  kpiCompute: 500,
  uiRenderReady: 8000,
  saveAction: 3000,
  qualificationSave: 3000,
  pipelineSave: 3000,
  collectionsPaymentSave: 3000,
  orderCreateOrFulfillment: 4000,
  inventoryUpdate: 3000,
  moduleValidation: 8000,
};

/**
 * @param {Partial<PredatorDebugEntry>} partial
 * @returns {PredatorDebugEntry}
 */
export function createPredatorEntry(partial) {
  const status = partial.status || "PASS";
  return {
    status,
    module: partial.module || "unknown",
    step: partial.step || "unknown",
    durationMs: partial.durationMs ?? null,
    expected: partial.expected,
    actual: partial.actual,
    rootCauseGuess: partial.rootCauseGuess || "",
    suggestedFix: partial.suggestedFix || "",
    severity:
      partial.severity ||
      (status === "FAIL"
        ? "high"
        : status === "WARN"
          ? "medium"
          : status === "INFO"
            ? "low"
            : "low"),
    timestamp: partial.timestamp || new Date().toISOString(),
    tenantId: partial.tenantId ?? null,
    role: partial.role ?? null,
    userId: partial.userId ?? null,
    issueClass: partial.issueClass,
  };
}

/**
 * @param {PredatorDebugEntry[]} entries
 * @returns {{ status: PredatorStatus, pass: number, warn: number, fail: number }}
 */
export function summarizePredatorEntries(entries) {
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const e of entries) {
    if (e.status === "FAIL") counts.fail += 1;
    else if (e.status === "WARN") counts.warn += 1;
    else counts.pass += 1;
  }
  // INFO is counted in pass for module health (not WARN/FAIL)
  const status = counts.fail > 0 ? "FAIL" : counts.warn > 0 ? "WARN" : "PASS";
  return { status, ...counts };
}
