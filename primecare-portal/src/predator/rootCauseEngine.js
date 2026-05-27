import { createPredatorEntry } from "@/predator/predatorSchema.js";

/**
 * @typedef {import('@/predator/predatorDiagnosisSchema.js').PredatorLayerValue} PredatorLayerValue
 * @typedef {import('@/predator/predatorDiagnosisSchema.js').PredatorRootCauseDiagnosis} PredatorRootCauseDiagnosis
 * @typedef {import('@/predator/predatorDiagnosisSchema.js').PredatorIssueClass} PredatorIssueClass
 */

/**
 * @param {unknown} v
 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {PredatorLayerValue[]} layers
 */
function findFirstDivergence(layers) {
  const numeric = layers.filter(
    (l) => num(l.value) !== null && !l.meta?.optional && !l.meta?.notComparableToSeed
  );
  if (numeric.length < 2) return null;

  const baseline = num(numeric[0].value);
  for (let i = 1; i < numeric.length; i += 1) {
    const current = num(numeric[i].value);
    if (baseline !== current) {
      return {
        fromLayer: numeric[i - 1].layerId,
        toLayer: numeric[i].layerId,
        fromValue: numeric[i - 1].value,
        toValue: numeric[i].value,
      };
    }
  }
  return null;
}

/**
 * @param {PredatorLayerValue[]} layers
 * @param {'rls_only'|'kpi'|undefined} compareMode
 */
function layersForDivergence(layers, compareMode) {
  if (compareMode === "rls_only") {
    return layers.filter((l) => l.layerId === "rls" || !l.meta?.optional);
  }
  if (compareMode === "kpi") {
    return layers.filter(
      (l) => l.layerId === "api" || l.layerId === "state" || l.layerId === "ui"
    );
  }
  return layers;
}

/**
 * @param {number|null} expected
 * @param {'rls_only'|'kpi'|undefined} compareMode
 * @param {number|null} rls
 * @param {number|null} api
 * @param {number|null} ui
 */
function resolveMetricStatus(expected, compareMode, rls, api, ui) {
  if (expected == null) return "PASS";

  if (compareMode === "rls_only") {
    if (rls === expected) return "PASS";
    if (rls != null) return "FAIL";
    return "WARN";
  }

  if (compareMode === "kpi") {
    const apiOk = api != null && api === expected;
    const uiOk = ui != null && ui === expected;
    const apiUiAligned = api == null || ui == null || api === ui;

    if (apiOk && (ui == null || uiOk)) return "PASS";
    if (uiOk && (api == null || apiOk)) return "PASS";
    if (apiOk && uiOk && apiUiAligned) return "PASS";

    if (api != null && api !== expected) return "FAIL";
    if (ui != null && ui !== expected) return "FAIL";
    if (api == null && ui == null) return "WARN";
    return "WARN";
  }

  const compare = ui ?? api ?? rls;
  if (compare != null && compare !== expected) return "FAIL";
  return "PASS";
}

/**
 * @param {Object} ctx
 * @param {number|null} rls
 * @param {number|null} api
 * @param {number|null} ui
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} [tenantCtx]
 */
function inferCauseFromDivergence(ctx, rls, api, ui, tenantCtx) {
  const { metricId, cacheMeta, state: stateVal } = ctx;

  if (rls != null && rls > 0 && api === 0) {
    return {
      issueClass: /** @type {PredatorIssueClass} */ ("data_integrity"),
      probableRootCause:
        "First divergence at API layer: browser RLS reads return rows but API payload is empty",
      suggestions: [
        "RLS may block rows only for select(*) vs probe — verify PostgREST errors",
        "Check timedSupabaseQuery invokes factory (await query fn())",
        "Wrong tenant_id on profile vs seed data",
        "Invalid query projection — run schema projection diagnosis",
        "Stale server cache serving empty payload — check cache hit age",
        "Supabase session/JWT mismatch between probe and batch read",
      ],
      firstLayer: "api",
    };
  }

  if (
    ctx.uiSnapshotFresh !== false &&
    rls != null &&
    rls > 0 &&
    api != null &&
    api > 0 &&
    ui === 0
  ) {
    return {
      issueClass: /** @type {PredatorIssueClass} */ ("ui_sync"),
      probableRootCause:
        "Backend healthy, UI synchronization unhealthy — API has data but render shows zero",
      suggestions: [
        "UI rendered before async state completion",
        "Merge layer overwrote Supabase payload with Apps Script zeros",
        "QA direct read path not wired to KPI cards",
        "Stale module-level adminDashboardCache hydrated initial useState",
        "Check cache hit serving stale-zero snapshot",
      ],
      firstLayer: "ui",
    };
  }

  const state = num(ctx.state);
  if (ctx.uiSnapshotFresh !== false && api != null && api > 0 && state === 0) {
    return {
      issueClass: /** @type {PredatorIssueClass} */ ("ui_sync"),
      probableRootCause:
        "First divergence at React state layer: API payload present but state is zero",
      suggestions: [
        "setState not called after getAdminDashboardRead success",
        "mapDirectDashboardStateFromRead returns empty defaults",
        "Module cache hydrate overwrote API values before setState",
      ],
      firstLayer: "state",
    };
  }

  if (ctx.uiSnapshotFresh !== false && api != null && api > 0 && state != null && state > 0 && ui === 0) {
    return {
      issueClass: /** @type {PredatorIssueClass} */ ("ui_sync"),
      probableRootCause:
        "React state has values but rendered KPI is zero (memo or conditional render skip)",
      suggestions: [
        "Verify KPI card reads executive/summary state paths",
        "Check useMemo snapshot vs visible props",
        "Stale derived memo — dependency array missing API fields",
      ],
      firstLayer: "ui",
    };
  }

  if (rls === 0 && api === 0 && (ui === 0 || ui == null)) {
    const tenantHint =
      tenantCtx?.tenantId != null ? `profile tenant=${tenantCtx.tenantId}` : "tenant unknown";
    return {
      issueClass: /** @type {PredatorIssueClass} */ ("tenant_isolation"),
      probableRootCause: `RLS likely blocking tenant rows (${tenantHint})`,
      suggestions: [
        "RLS likely blocking tenant rows — compare SQL editor (service role) vs browser JWT",
        "Verify profiles.tenant_id matches seed tenant",
        "Auth session may be anon or expired at query time",
      ],
      firstLayer: "rls",
    };
  }

  if (cacheMeta?.staleZeroRisk) {
    return {
      issueClass: /** @type {PredatorIssueClass} */ ("data_integrity"),
      probableRootCause: "Cache serving stale zero snapshot",
      suggestions: [
        "Invalidate adminDashboardReadCache and module cache",
        "Use getAdminDashboardRead({ force: true }) on QA",
      ],
      firstLayer: "cache",
    };
  }

  if (
    ctx.compareMode !== "kpi" &&
    metricId === "outstanding_receivables" &&
    rls != null &&
    api != null &&
    rls !== api
  ) {
    return {
      issueClass: /** @type {PredatorIssueClass} */ ("data_integrity"),
      probableRootCause: "Normalization layer diverged from raw AR rollup",
      suggestions: [
        "Trace computeReceivableMetrics vs getCollectionsRead summary",
        "Check outstanding field mapping (outstanding vs outstanding_amount)",
      ],
      firstLayer: "normalize",
    };
  }

  return {
    issueClass: /** @type {PredatorIssueClass} */ ("functional"),
    probableRootCause: "No automatic rule matched — inspect layer trace manually",
    suggestions: ["Expand layer instrumentation for this metric"],
    firstLayer: "unknown",
  };
}

/**
 * @param {Object} params
 * @param {string} params.metricId
 * @param {string} params.metricLabel
 * @param {PredatorLayerValue[]} params.layers
 * @param {number|null} [params.expected]
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} [params.tenantCtx]
 * @param {Object} [params.cacheMeta]
 * @param {'rls_only'|'kpi'|undefined} [params.compareMode]
 * @returns {PredatorRootCauseDiagnosis}
 */
export function diagnoseMetricLayers({
  metricId,
  metricLabel,
  layers,
  expected,
  tenantCtx,
  cacheMeta,
  compareMode,
}) {
  const divergence = findFirstDivergence(layersForDivergence(layers, compareMode));
  const rls = num(layers.find((l) => l.layerId === "rls")?.value);
  const api = num(layers.find((l) => l.layerId === "api")?.value);
  const state = num(layers.find((l) => l.layerId === "state")?.value);
  const ui = num(layers.find((l) => l.layerId === "ui")?.value);

  let status = resolveMetricStatus(expected, compareMode, rls, api, ui);

  if (divergence && status === "PASS" && compareMode !== "kpi") {
    status = "WARN";
  }
  if (divergence && status === "PASS" && compareMode === "kpi") {
    const apiUiOk = api != null && ui != null && api === ui;
    const stateUiOk = state == null || ui == null || state === ui;
    if (!apiUiOk || !stateUiOk) status = "WARN";
  }

  const uiObserved = layers.some((l) => l.layerId === "ui" && !l.meta?.unobserved);
  if (compareMode === "kpi" && uiObserved && api != null && api > 0 && ui === 0) {
    status = status === "PASS" ? "FAIL" : status;
  }

  const inferred = inferCauseFromDivergence(
    {
      metricId,
      cacheMeta,
      compareMode,
      state,
      uiSnapshotFresh: cacheMeta?.uiSnapshotFresh !== false && uiObserved,
    },
    rls,
    api,
    ui,
    tenantCtx
  );

  if (status === "PASS") {
    inferred.probableRootCause = "Computed KPI layers align with QA seed expectation";
    inferred.issueClass = "cosmetic";
    inferred.firstLayer = "none";
    inferred.suggestions = [];
  } else if (status === "FAIL" && !divergence) {
    const observed =
      compareMode === "kpi" ? (ui ?? api ?? rls) : compareMode === "rls_only" ? rls : ui ?? api ?? rls;
    inferred.probableRootCause = `Expected ${expected} but observed ${observed}`;
    inferred.issueClass = "data_integrity";
  }

  if (compareMode === "kpi" && status === "PASS" && rls != null && api != null && rls !== api) {
    inferred.probableRootCause =
      "API/UI computed KPIs match seed; RLS rollup differs (supporting evidence only)";
    inferred.issueClass = "cosmetic";
    inferred.firstLayer = "rls";
    inferred.suggestions = [];
  }

  return {
    metricId,
    metricLabel,
    status,
    issueClass: inferred.issueClass,
    firstDivergenceLayer: status === "PASS" ? "none" : divergence?.toLayer || inferred.firstLayer,
    probableRootCause: inferred.probableRootCause,
    suggestions: inferred.suggestions,
    layerTrace: layers,
    timestamp: new Date().toISOString(),
  };
}

/**
 * @param {PredatorRootCauseDiagnosis[]} metrics
 */
export function metricsToPredatorEntries(module, metrics, tenantCtx) {
  return metrics
    .filter((m) => m.status === "WARN" || m.status === "FAIL")
    .map((m) =>
      createPredatorEntry({
        status: m.status === "FAIL" ? "FAIL" : "WARN",
        module,
        step: `diagnosis.${m.metricId}`,
        expected: null,
        actual: {
          layers: m.layerTrace.map((l) => ({ id: l.layerId, value: l.value })),
          firstDivergence: m.firstDivergenceLayer,
        },
        rootCauseGuess: m.probableRootCause,
        suggestedFix: m.suggestions.join(" · "),
        severity: m.status === "FAIL" ? "high" : "medium",
        issueClass: m.issueClass,
        tenantId: tenantCtx?.tenantId,
        role: tenantCtx?.role,
        userId: tenantCtx?.userId,
      })
    );
}
