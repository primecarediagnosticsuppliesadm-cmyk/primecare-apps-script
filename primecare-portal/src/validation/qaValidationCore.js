/** @typedef {'pass' | 'info' | 'warn' | 'fail'} QaCheckStatus */

/**
 * @typedef {Object} QaValidationCheck
 * @property {string} id
 * @property {string} label
 * @property {QaCheckStatus} status
 * @property {unknown} [expected]
 * @property {Record<string, unknown>} [actual]
 * @property {string} message
 */

/**
 * @typedef {Object} QaValidationReport
 * @property {'pass' | 'warn' | 'fail'} status
 * @property {string} scope
 * @property {string} ranAt
 * @property {QaValidationCheck[]} checks
 * @property {{ pass: number, warn: number, fail: number, info?: number }} summary
 */

/**
 * @param {number|null|undefined} value
 */
export function numOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const MUTABLE_LAYER_KEYS = ["browserRls", "dbComputed", "apiPayload", "uiRendered"];

/**
 * @param {number} expected
 * @param {number|null|undefined} actual
 * @param {number} [tolerance]
 */
export function numbersMatch(expected, actual, tolerance = 0) {
  const a = numOrNull(actual);
  if (a === null) return false;
  return Math.abs(a - expected) <= tolerance;
}

/**
 * @param {QaCheckStatus} a
 * @param {QaCheckStatus} b
 * @returns {QaCheckStatus}
 */
export function worstStatus(a, b) {
  if (a === "fail" || b === "fail") return "fail";
  if (a === "warn" || b === "warn") return "warn";
  if (a === "info" || b === "info") return "info";
  return "pass";
}

/**
 * @param {QaValidationCheck[]} checks
 * @returns {QaValidationReport['summary']}
 */
export function summarizeChecks(checks) {
  return checks.reduce(
    (acc, c) => {
      if (c.status === "info") {
        acc.info = (acc.info ?? 0) + 1;
      } else {
        acc[c.status] += 1;
      }
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, info: 0 }
  );
}

/**
 * @param {QaValidationCheck[]} checks
 * @returns {QaCheckStatus}
 */
export function overallStatusFromChecks(checks) {
  const actionable = checks.filter((c) => c.status !== "info");
  const summary = summarizeChecks(actionable);
  if (summary.fail > 0) return "fail";
  if (summary.warn > 0) return "warn";
  return "pass";
}

/**
 * Compare one metric across layers vs QA seed expectation.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.label
 * @param {number} params.expected
 * @param {Record<string, number|null|undefined>} params.layers
 * @param {number} [params.tolerance]
 * @returns {QaValidationCheck}
 */
export function checkMetricAcrossLayers({ id, label, expected, layers, tolerance = 0 }) {
  const actual = { ...layers };
  const layerStatuses = Object.entries(layers)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([layer, value]) => {
    if (!numbersMatch(expected, value, tolerance)) {
      return { layer, status: /** @type {QaCheckStatus} */ ("fail"), note: `expected ${expected}, got ${value}` };
    }
    return { layer, status: /** @type {QaCheckStatus} */ ("pass"), note: "ok" };
    });

  let status = /** @type {QaCheckStatus} */ (
    layerStatuses.length === 0 ? "warn" : "pass"
  );
  const mismatches = [];
  if (layerStatuses.length === 0) {
    mismatches.push("no comparable layers provided");
  }
  for (const ls of layerStatuses) {
    status = worstStatus(status, ls.status);
    if (ls.status !== "pass") mismatches.push(`${ls.layer}: ${ls.note}`);
  }

  const values = Object.values(layers).filter((v) => v !== null && v !== undefined);
  if (values.length >= 2) {
    const first = numOrNull(values[0]);
    for (let i = 1; i < values.length; i += 1) {
      const next = numOrNull(values[i]);
      if (first !== null && next !== null && first !== next) {
        status = worstStatus(status, "fail");
        mismatches.push(`cross-layer drift (${values.join(" vs ")})`);
      }
    }
  }

  const message =
    mismatches.length === 0
      ? `All layers match expected ${expected}`
      : mismatches.join("; ");

  return { id, label, status, expected, actual, message };
}

/**
 * Mutable QA metric: baseline from browser RLS / DB compute; fail only on layer disagreement.
 * @param {Object} params
 * @param {string} params.id
 * @param {string} params.label
 * @param {Record<string, number|null|undefined>} params.layers
 * @param {number} [params.seedBaseline] — informational seed reference only
 * @param {number} [params.tolerance]
 * @param {boolean} [params.omitUiUnlessPresent] — skip uiRendered when null/undefined (non-KPI metrics)
 * @returns {QaValidationCheck}
 */
export function checkMutableMetricAcrossLayers({
  id,
  label,
  layers,
  seedBaseline,
  tolerance = 0,
  omitUiUnlessPresent = false,
}) {
  const actual = { ...layers, mutable: true, seedBaseline: seedBaseline ?? null };
  const browser = numOrNull(layers.browserRls);
  const db = numOrNull(layers.dbComputed);
  const runtimeBaseline = browser ?? db ?? null;

  const comparableValues = MUTABLE_LAYER_KEYS.filter((key) => key in layers)
    .filter((key) => {
      if (key !== "uiRendered") return true;
      if (!omitUiUnlessPresent) return true;
      const raw = layers.uiRendered;
      return raw !== null && raw !== undefined;
    })
    .map((key) => numOrNull(layers[key]))
    .filter((value) => value !== null);

  let status = /** @type {QaCheckStatus} */ (
    comparableValues.length === 0 ? "warn" : "pass"
  );
  const mismatches = [];

  if (comparableValues.length === 0) {
    mismatches.push("no comparable layers provided");
  }

  if (comparableValues.length >= 2) {
    const first = comparableValues[0];
    for (let i = 1; i < comparableValues.length; i += 1) {
      if (!numbersMatch(first, comparableValues[i], tolerance)) {
        status = worstStatus(status, "fail");
        mismatches.push(`cross-layer drift (${comparableValues.join(" vs ")})`);
        break;
      }
    }
  }

  const expected = runtimeBaseline ?? seedBaseline ?? null;
  const baselineNote =
    runtimeBaseline != null
      ? `runtime baseline ${runtimeBaseline}`
      : seedBaseline != null
        ? `seed baseline ${seedBaseline}`
        : "no baseline";

  const message =
    mismatches.length === 0
      ? `All layers agree at ${comparableValues[0] ?? expected} (${baselineNote}; mutable field)`
      : mismatches.join("; ");

  return { id, label, status, expected, actual, message };
}

/**
 * @param {string} scope
 * @param {QaValidationCheck[]} checks
 * @returns {QaValidationReport}
 */
export function buildValidationReport(scope, checks) {
  const summary = summarizeChecks(checks);
  return {
    status: overallStatusFromChecks(checks),
    scope,
    ranAt: new Date().toISOString(),
    checks,
    summary,
  };
}

/**
 * @param {QaValidationReport} report
 */
export function printQaValidationReport(report) {
  const header = `[PrimeCare QA Validation] ${report.scope} — ${report.status.toUpperCase()}`;
  const style =
    report.status === "fail"
      ? "color:#b91c1c;font-weight:bold"
      : report.status === "warn"
        ? "color:#b45309;font-weight:bold"
        : "color:#15803d;font-weight:bold";

  console.groupCollapsed(`%c${header}`, style);
  console.info("ranAt", report.ranAt);
  console.info("summary", report.summary);
  for (const check of report.checks) {
    const fn = check.status === "fail" ? console.error : check.status === "warn" ? console.warn : console.info;
    fn(`[${check.status.toUpperCase()}] ${check.label}: ${check.message}`, {
      expected: check.expected,
      actual: check.actual,
    });
  }
  console.groupEnd();
}
