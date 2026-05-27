import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { createPredatorEntry } from "@/predator/predatorSchema.js";
import { predatorStore } from "@/predator/predatorStore.js";

/**
 * @typedef {Object} UiMetricSnapshot
 * @property {string} module
 * @property {string} metricId
 * @property {number|null} api
 * @property {number|null} state
 * @property {number|null} render
 * @property {string} [source]
 * @property {string} timestamp
 */

/**
 * @param {unknown} v
 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lightweight per-metric pipeline snapshot (no full state dumps).
 * @param {Object} params
 * @param {string} params.module
 * @param {string} params.metricId
 * @param {number|null} [params.api]
 * @param {number|null} [params.state]
 * @param {number|null} [params.render]
 * @param {string} [params.source]
 */
export function recordPredatorUiMetricSnapshot({
  module,
  metricId,
  api,
  state,
  render,
  source,
}) {
  if (!isPredatorEnabled()) return;

  const apiNum = num(api);
  const stateNum = num(state);
  if (source === "usePredatorUiSyncTrace" && apiNum != null && apiNum > 0 && stateNum === 0) {
    return;
  }

  const prevLatest = predatorStore.getLatestUiStateTrace(module, metricId);
  const prevState = num(prevLatest?.state);
  const nextState = num(state);
  const prevRender = num(prevLatest?.render);
  const nextRender = num(render);
  const snapshot = {
    module,
    metricId,
    api: num(api) ?? prevLatest?.api ?? null,
    state:
      nextState != null
        ? nextState
        : prevState != null && prevState > 0
          ? prevState
          : null,
    render:
      nextRender != null
        ? nextRender
        : prevRender != null && prevRender > 0
          ? prevRender
          : null,
    source: source || "unknown",
    timestamp: new Date().toISOString(),
  };

  const prev = predatorStore.getLatestUiStateTrace(module, metricId);
  predatorStore.recordUiStateTrace(snapshot);

  if (prev) {
    const prevApi = num(prev.api);
    const prevState = num(prev.state);
    const nextState = num(state);
    const nextRender = num(render);

    if (
      prevApi != null &&
      prevApi > 0 &&
      nextState === 0 &&
      source !== "usePredatorUiSyncTrace"
    ) {
      recordPredatorStateTransition({
        module,
        metricId,
        kind: "state.overwrite",
        from: prevState,
        to: nextState,
        detail: { source, prevApi },
      });
    }

    if (
      prevState != null &&
      prevState > 0 &&
      nextState === 0 &&
      source !== "usePredatorUiSyncTrace"
    ) {
      recordPredatorStateTransition({
        module,
        metricId,
        kind: "state.reset_after_load",
        from: prevState,
        to: nextState,
        detail: { source },
      });
    }

    if (prevApi != null && prevApi > 0 && nextRender === 0 && nextState === 0) {
      recordPredatorStateTransition({
        module,
        metricId,
        kind: "render.stale_zero",
        from: prevApi,
        to: 0,
        detail: { source },
      });
    }
  }
}

/**
 * @param {Object} params
 * @param {string} params.module
 * @param {string} params.metricId
 * @param {string} params.kind
 * @param {unknown} [params.from]
 * @param {unknown} [params.to]
 * @param {Record<string, unknown>} [params.detail]
 */
export function recordPredatorStateTransition({ module, metricId, kind, from, to, detail }) {
  if (!isPredatorEnabled()) return;
  predatorStore.recordStateTransition({
    module,
    metricId,
    kind,
    from: from ?? null,
    to: to ?? null,
    detail: detail ?? null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Latest traced React-state value for a metric (Predator-only).
 * @param {string} module
 * @param {string} metricId
 */
export function getLatestUiStateValue(module, metricId) {
  const trace = predatorStore.getLatestUiStateTrace(module, metricId);
  return trace?.state ?? null;
}

/**
 * @param {string} module
 * @param {string} metricId
 */
export function getLatestUiMetricApi(module, metricId) {
  const trace = predatorStore.getLatestUiStateTrace(module, metricId);
  return trace?.api ?? null;
}

/**
 * Infer probable UI-layer root cause from API/state/render + store signals.
 * @param {Object} params
 * @param {string} params.metricId
 * @param {number|null} params.api
 * @param {number|null} params.state
 * @param {number|null} params.render
 * @param {string} params.module
 */
export function inferUiDivergenceCause({ metricId, api, state, render, module }) {
  const cacheEvents = predatorStore
    .getCacheEvents()
    .filter((c) => c.cacheKey?.toLowerCase().includes(module.split(" ")[0]?.toLowerCase() || ""));
  const transitions = predatorStore.getStateTransitionsForModule(module);
  const metricTransitions = transitions.filter((t) => t.metricId === metricId);
  const renderSteps = predatorStore.getRenderStepsForModule(module);

  if (api != null && api > 0 && (render === 0 || render == null) && (state === 0 || state == null)) {
    if (cacheEvents.some((c) => c.staleZeroRisk)) {
      return {
        issueClass: "ui_sync",
        probableRootCause: "UI hydrated from stale zero snapshot",
        firstLayer: "cache",
        suggestions: [
          "Invalidate adminDashboardRead cache and reload with force: true",
          "Check module-level adminDashboardCache seeding useState before fetch completes",
        ],
      };
    }
    if (metricTransitions.some((t) => t.kind === "state.reset_after_load")) {
      return {
        issueClass: "ui_sync",
        probableRootCause: "Fallback state overwrote loaded data",
        firstLayer: "state",
        suggestions: [
          "Trace mergeAdminDashboardWithSupabase — Apps Script zeros may overwrite Supabase KPIs",
          "Verify QA direct read path does not reset state after successful getAdminDashboardRead",
        ],
      };
    }
    if (renderSteps.some((s) => s.step === "ui.render_before_hydration")) {
      return {
        issueClass: "ui_sync",
        probableRootCause: "Render occurred before hydration completion",
        firstLayer: "ui",
        suggestions: [
          "Gate KPI cards on loading=false and both summaryData and executiveData",
          "Avoid rendering KPI strip while background merge still in flight",
        ],
      };
    }
    if (metricTransitions.some((t) => t.kind === "state.overwrite")) {
      return {
        issueClass: "ui_sync",
        probableRootCause: "Cache overwrite or race dropped API values in React state",
        firstLayer: "state",
        suggestions: [
          "Check duplicate cache layers (module cache + getAdminDashboardRead cache)",
          "Ensure setState batch order: API result applied after cache hydrate",
        ],
      };
    }
    return {
      issueClass: "ui_sync",
      probableRootCause:
        "Backend healthy, UI synchronization unhealthy — API has data but React state/render shows zero",
      firstLayer: "state",
      suggestions: [
        "UI rendered before async state completion",
        "Stale closure or memo dependency omitting API fields",
        "Derived memo computed before API hydration",
        "Conditional render skip on empty default object",
      ],
    };
  }

  if (api != null && api > 0 && state != null && state > 0 && render === 0) {
    return {
      issueClass: "ui_sync",
      probableRootCause: "React state has data but rendered KPI is zero (render/memo drift)",
      firstLayer: "ui",
      suggestions: [
        "Check memoized qaValidationSnapshot vs visible KPI props",
        "Verify currency/formatting does not coerce non-zero to display zero",
        "Conditional render skip on derived empty object",
      ],
    };
  }

  if (api != null && state != null && api !== state) {
    return {
      issueClass: "ui_sync",
      probableRootCause: "Normalization or state mapping mismatch between API payload and React state",
      firstLayer: "normalize",
      suggestions: [
        "Compare API field paths vs setState mapping in loadPrimaryData",
        "Trace mapDirectDashboardStateFromRead field names",
      ],
    };
  }

  return null;
}

/**
 * @param {string} module
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorRootCauseDiagnosis[]} metrics
 */
export function buildUiSyncWarnings(module, metrics) {
  if (!isPredatorEnabled()) return [];

  const warnings = [];
  const uiSnapshotUnobserved = metrics.every((m) => {
    const uiLayer = m.layerTrace?.find((l) => l.layerId === "ui");
    return uiLayer?.meta?.unobserved === true;
  });
  if (uiSnapshotUnobserved && metrics.length > 0) {
    return warnings;
  }

  for (const m of metrics) {
    if (m.status === "PASS") continue;
    const api = num(m.layerTrace.find((l) => l.layerId === "api")?.value);
    const state = num(m.layerTrace.find((l) => l.layerId === "state")?.value);
    const ui = num(m.layerTrace.find((l) => l.layerId === "ui")?.value);

    const inferred =
      inferUiDivergenceCause({ metricId: m.metricId, api, state, render: ui, module }) || null;

    if (inferred && (m.status === "FAIL" || m.status === "WARN")) {
      const headline =
        api != null && api > 0 && (ui === 0 || ui == null)
          ? "Backend healthy, UI synchronization unhealthy"
          : m.probableRootCause;

      warnings.push(
        createPredatorEntry({
          status: m.status === "FAIL" ? "FAIL" : "WARN",
          module,
          step: `ui_sync.${m.metricId}`,
          actual: {
            api,
            state,
            ui,
            firstDivergence: inferred.firstLayer,
          },
          rootCauseGuess: inferred.probableRootCause || headline,
          suggestedFix: (inferred.suggestions || m.suggestions || []).join(" · "),
          severity: m.status === "FAIL" ? "high" : "medium",
          issueClass: inferred.issueClass || "ui_sync",
        })
      );
    }
  }

  const renderSteps = predatorStore.getRenderStepsForModule(module);
  const rerenderLoop = renderSteps.find((s) => s.step === "ui.rerender_loop");
  if (rerenderLoop) {
    warnings.push(
      createPredatorEntry({
        status: "WARN",
        module,
        step: "ui_stability.excessive_rerenders",
        actual: rerenderLoop.detail,
        rootCauseGuess: "Excessive rerenders detected — unstable deps or state churn",
        suggestedFix: "Stabilize useMemo/useCallback deps; avoid inline object literals in deps",
        severity: "medium",
        issueClass: "render_timing",
      })
    );
  }

  return warnings;
}

/**
 * Per-module reliability scores (0–100) for quick instability triage.
 * @param {string} module
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorRootCauseDiagnosis[]} metrics
 */
export function buildModuleReliabilityScore(module, metrics) {
  const total = metrics.length || 1;
  const pass = metrics.filter((m) => m.status === "PASS").length;
  const fail = metrics.filter((m) => m.status === "FAIL").length;
  const warn = metrics.filter((m) => m.status === "WARN").length;

  const dataReliability = Math.round((pass / total) * 100);
  const uiSyncFails = metrics.filter(
    (m) =>
      m.status !== "PASS" &&
      (m.issueClass === "ui_sync" ||
        String(m.probableRootCause || "").includes("UI synchronization"))
  ).length;
  const stateSynchronization = Math.max(0, 100 - uiSyncFails * 25 - fail * 15);

  const cacheEvents = predatorStore.getCacheEvents();
  const staleZero = cacheEvents.filter((c) => c.staleZeroRisk).length;
  const cacheHealth = Math.max(0, 100 - staleZero * 20);

  const renderSteps = predatorStore.getRenderStepsForModule(module);
  const rerenderPenalty = renderSteps.some((s) => s.step === "ui.rerender_loop") ? 15 : 0;
  const beforeHydration = renderSteps.some((s) => s.step === "ui.render_before_hydration") ? 20 : 0;
  const renderStability = Math.max(0, 100 - rerenderPenalty - beforeHydration);
  const rerenderStability = Math.max(0, 100 - rerenderPenalty);

  const transitions = predatorStore.getStateTransitionsForModule(module);
  const churnPenalty = Math.min(30, transitions.length * 3);
  const renderStabilityCombined = Math.max(0, renderStability - churnPenalty);

  const score = {
    module,
    dataReliability,
    renderStability: renderStabilityCombined,
    cacheHealth,
    stateSynchronization,
    rerenderStability,
    summary: fail > 0 ? "FAIL" : warn > 0 ? "WARN" : "PASS",
    computedAt: new Date().toISOString(),
  };

  predatorStore.setModuleReliability(module, score);
  return score;
}

/**
 * Human-readable validation health for console UX.
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorModuleDiagnosis} diagnosis
 */
export function formatModuleHealthHeadline(diagnosis) {
  const metrics = diagnosis?.metrics || [];
  const fail = metrics.filter((m) => m.status === "FAIL");
  const uiSync = fail.filter(
    (m) =>
      m.issueClass === "ui_sync" ||
      String(m.probableRootCause || "").includes("UI synchronization") ||
      String(m.probableRootCause || "").includes("React state")
  );
  const apiFail = fail.filter((m) => {
    const api = num(m.layerTrace.find((l) => l.layerId === "api")?.value);
    const rls = num(m.layerTrace.find((l) => l.layerId === "rls")?.value);
    return api === 0 && rls != null && rls > 0;
  });

  if (uiSync.length > 0 && apiFail.length === 0) {
    return "Backend healthy, UI synchronization unhealthy";
  }
  if (apiFail.length > 0) {
    return "Backend/API layer divergence detected";
  }
  if (diagnosis?.status === "PASS") return "All layers aligned";
  return "Layer divergence — inspect module diagnosis";
}

/**
 * Record API-layer KPI snapshots after getAdminDashboardRead (diagnostic only).
 * @param {Object} data — getAdminDashboardRead payload
 * @param {string} [source]
 */
export function recordAdminDashboardApiUiSnapshots(data, source = "getAdminDashboardRead") {
  if (!isPredatorEnabled() || !data) return;

  const executive = data.executive || {};
  const summary = data.summary || {};
  const stock = summary.stockStats || {};

  const pairs = [
    ["outstanding_receivables", executive.outstandingReceivables],
    ["recent_visits", summary.recentVisits],
    ["inventory_skus", summary.inventorySkus ?? stock.totalSkus],
    ["total_sold_value", summary.totalSoldValue],
  ];

  for (const [metricId, api] of pairs) {
    recordPredatorUiMetricSnapshot({
      module: "Admin Dashboard",
      metricId,
      api,
      state: null,
      render: null,
      source,
    });
  }
}
