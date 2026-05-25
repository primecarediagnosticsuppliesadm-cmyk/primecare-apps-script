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
  const numeric = layers.filter((l) => num(l.value) !== null);
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
 * @param {Object} ctx
 * @param {number|null} rls
 * @param {number|null} api
 * @param {number|null} ui
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} [tenantCtx]
 */
function inferCauseFromDivergence(ctx, rls, api, ui, tenantCtx) {
  const { metricId, cacheMeta } = ctx;

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

  if (rls != null && rls > 0 && api != null && api > 0 && ui === 0) {
    return {
      issueClass: /** @type {PredatorIssueClass} */ ("functional"),
      probableRootCause:
        "First divergence at UI layer: API has data but React state or render shows zero",
      suggestions: [
        "UI rendered before async state completion",
        "Merge layer overwrote Supabase payload with Apps Script zeros",
        "QA direct read path not wired to KPI cards",
        "Stale module-level adminDashboardCache hydrated initial useState",
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

  if (metricId === "outstanding_receivables" && rls != null && api != null && rls !== api) {
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
 * @returns {PredatorRootCauseDiagnosis}
 */
export function diagnoseMetricLayers({ metricId, metricLabel, layers, expected, tenantCtx, cacheMeta }) {
  const divergence = findFirstDivergence(layers);
  const rls = num(layers.find((l) => l.layerId === "rls")?.value);
  const api = num(layers.find((l) => l.layerId === "api")?.value);
  const ui = num(layers.find((l) => l.layerId === "ui")?.value);

  let status = "PASS";
  if (expected != null) {
    const compare = ui ?? api ?? rls;
    if (compare != null && compare !== expected) status = "FAIL";
  }
  if (divergence) status = status === "PASS" ? "WARN" : status;

  const inferred = inferCauseFromDivergence(
    { metricId, cacheMeta },
    rls,
    api,
    ui,
    tenantCtx
  );

  if (status === "FAIL" && !divergence) {
    inferred.probableRootCause = `Expected ${expected} but observed ${ui ?? api ?? rls}`;
    inferred.issueClass = "data_integrity";
  }

  return {
    metricId,
    metricLabel,
    status,
    issueClass: inferred.issueClass,
    firstDivergenceLayer: divergence?.toLayer || inferred.firstLayer,
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
    .filter((m) => m.status !== "PASS")
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
