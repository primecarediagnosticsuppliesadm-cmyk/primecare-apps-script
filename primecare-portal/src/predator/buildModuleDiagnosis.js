import { diagnoseMetricLayers, metricsToPredatorEntries } from "@/predator/rootCauseEngine.js";
import {
  compareRegressionSnapshots,
  loadRegressionSnapshot,
  saveRegressionSnapshot,
} from "@/predator/regressionSnapshots.js";
import { predatorStore } from "@/predator/predatorStore.js";
import { QA_ADMIN_DASHBOARD_SEED } from "@/validation/qaSeedExpectations.js";
import { getLatestUiStateValue } from "@/predator/uiStateReliability.js";
import {
  buildModuleReliabilityScore,
  buildUiSyncWarnings,
  formatModuleHealthHeadline,
} from "@/predator/uiStateReliability.js";
import { isSetupPendingQaCheck } from "@/notifications/notificationFoundationProbe.js";

/** @param {import('@/validation/qaValidationCore.js').QaValidationCheck} check */
function resolveCheckIssueClass(check) {
  if (isSetupPendingQaCheck(check)) return "setup_pending";
  if (check.id.startsWith("tenant.")) return "tenant_isolation";
  if (check.id.startsWith("role.")) return "security";
  if (check.id.startsWith("layers.")) return "data_integrity";
  return "functional";
}

/**
 * @param {import('@/validation/qaValidationCore.js').QaValidationCheck} check
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} ctx
 * @returns {import('@/predator/rootCauseEngine.js').PredatorRootCauseDiagnosis}
 */
function buildInformationalDiagnosis(check, ctx) {
  const actual = /** @type {Record<string, unknown>} */ (check.actual || {});
  const suggestedFix = String(actual.suggestedFix || "").trim();
  return {
    metricId: check.id,
    metricLabel: check.label,
    status: "INFO",
    issueClass: resolveCheckIssueClass(check),
    firstDivergenceLayer: "none",
    probableRootCause: check.message,
    suggestions: suggestedFix ? [suggestedFix] : [],
    layerTrace: [
      {
        layerId: "rls",
        label: check.label,
        value: null,
        meta: { message: check.message, ...actual },
      },
    ],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build Auth → DB → API → Compute → UI timeline from store + module metrics.
 * @param {string} module
 */
export function buildDebugTimeline(module) {
  const timings = predatorStore
    .getAllTimings()
    .filter((t) => t.module === module || t.module === "Supabase" || t.module === "Auth");
  const renderSteps = predatorStore.getRenderStepsForModule(module);
  const apiExec = predatorStore.getApiExecutionsForModule(module);

  const steps = [];

  for (const t of timings.filter((x) => x.module === "Auth")) {
    steps.push({
      phase: "Auth",
      label: t.step,
      status: t.status,
      durationMs: t.durationMs,
      timestamp: t.timestamp,
    });
  }

  for (const t of timings.filter((x) => x.module === "Supabase")) {
    steps.push({
      phase: "DB",
      label: t.step,
      status: t.status,
      durationMs: t.durationMs,
      timestamp: t.timestamp,
    });
  }

  for (const a of apiExec) {
    steps.push({
      phase: "API",
      label: a.apiName,
      status: "PASS",
      durationMs: a.durationMs,
      rowsReturned: a.rowsReturned,
      payloadBytes: a.payloadBytes,
      timestamp: a.timestamp,
    });
  }

  const computeTiming = timings.find((x) => x.module === module && x.step.includes("kpi"));
  if (computeTiming) {
    steps.push({
      phase: "Compute",
      label: computeTiming.step,
      status: computeTiming.status,
      durationMs: computeTiming.durationMs,
      timestamp: computeTiming.timestamp,
    });
  }

  const stateTransitions = predatorStore.getStateTransitionsForModule(module).slice(0, 8);
  for (const t of stateTransitions) {
    steps.push({
      phase: "State",
      label: t.kind,
      status: "WARN",
      durationMs: null,
      detail: { metricId: t.metricId, from: t.from, to: t.to, ...t.detail },
      timestamp: t.timestamp,
    });
  }

  const cacheEvents = predatorStore
    .getCacheEvents()
    .filter((c) => c.cacheKey?.toLowerCase().includes(module.split(" ")[0]?.toLowerCase() || ""))
    .slice(0, 6);
  for (const c of cacheEvents) {
    steps.push({
      phase: "Cache",
      label: `${c.cacheKey}.${c.event}`,
      status: c.staleZeroRisk ? "WARN" : "PASS",
      durationMs: c.ageMs,
      detail: c.summary,
      timestamp: c.timestamp,
    });
  }

  for (const r of renderSteps) {
    steps.push({
      phase: "UI",
      label: r.step,
      status: r.step.includes("before_hydration") || r.step.includes("rerender_loop") ? "WARN" : "PASS",
      durationMs: r.detail?.hydrationDelayMs ?? r.detail?.msSinceMount ?? null,
      detail: r.detail,
      timestamp: r.timestamp,
    });
  }

  return steps.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
}

/**
 * @param {Object} params
 * @param {string} params.module
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} params.ctx
 * @param {Array<import('@/predator/rootCauseEngine.js').PredatorRootCauseDiagnosis>} params.metrics
 */
export function finalizeModuleDiagnosis({ module, ctx, metrics }) {
  const actionableMetrics = metrics.filter((m) => m.status !== "INFO");
  const status = actionableMetrics.some((m) => m.status === "FAIL")
    ? "FAIL"
    : actionableMetrics.some((m) => m.status === "WARN")
      ? "WARN"
      : "PASS";

  const previous = loadRegressionSnapshot(ctx, module);
  const regression = compareRegressionSnapshots(
    { status, metrics: metrics.map((m) => ({ metricId: m.metricId, status: m.status, probableRootCause: m.probableRootCause })) },
    previous
  );

  if (status === "PASS") {
    saveRegressionSnapshot(ctx, module, { status, metrics, summary: { pass: metrics.length } });
  }

  const reliability = buildModuleReliabilityScore(module, metrics);
  const uiSyncEntries = buildUiSyncWarnings(module, metrics);

  const diagnosis = {
    module,
    status,
    metrics,
    timeline: buildDebugTimeline(module),
    regression,
    reliability,
    healthHeadline: "",
    ranAt: new Date().toISOString(),
  };

  diagnosis.healthHeadline = formatModuleHealthHeadline(diagnosis);

  predatorStore.setModuleDiagnosis(module, diagnosis, ctx);
  const diagnosisEntries = metricsToPredatorEntries(module, metrics, ctx);
  const uiSyncSteps = new Set(
    uiSyncEntries.map((e) => String(e.step || "").replace(/^ui_sync\./, ""))
  );
  const dedupedDiagnosis = diagnosisEntries.filter((e) => {
    const metricId = String(e.step || "").replace(/^diagnosis\./, "");
    return !uiSyncSteps.has(metricId);
  });
  const extraEntries = [...dedupedDiagnosis, ...uiSyncEntries];
  return { diagnosis, extraEntries };
}

function stateLayer(metricId, module, snapValue, uiValue, uiSnapshotFresh = true) {
  const traced = uiSnapshotFresh ? getLatestUiStateValue(module, metricId) : null;
  const value = uiSnapshotFresh
    ? snapValue ?? uiValue ?? traced ?? null
    : snapValue ?? uiValue ?? null;
  return {
    layerId: "state",
    label: "React state",
    value,
    meta: {
      ...(traced != null && uiValue != null && traced !== uiValue ? { drift: true } : {}),
      ...(!uiSnapshotFresh ? { unobserved: true, optional: true } : {}),
    },
  };
}

/**
 * Admin Dashboard layer traces from validation snapshot.
 * @param {Object} snap
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} ctx
 */
export function buildAdminDashboardMetricDiagnoses(snap, ctx, options = {}) {
  const uiSnapshotFresh = options.uiSnapshotFresh !== false;
  const seed = QA_ADMIN_DASHBOARD_SEED;
  const cacheEvents = predatorStore.getCacheEvents().filter((c) => c.cacheKey?.includes("admin"));
  const cacheMeta = { staleZeroRisk: cacheEvents.some((c) => c.staleZeroRisk), uiSnapshotFresh };

  const uiLayer = (value) => ({
    layerId: "ui",
    label: "Rendered UI",
    value: uiSnapshotFresh ? value : null,
    meta: uiSnapshotFresh ? undefined : { unobserved: true, optional: true },
  });

  const ordersUiLayer =
    snap.uiOrdersRowCount != null
      ? uiLayer(snap.uiOrdersRowCount)
      : {
          layerId: "ui",
          label: "Rendered UI",
          value: null,
          meta: { unobserved: true, optional: true, notRenderedOnDashboard: true },
        };

  return [
    diagnoseMetricLayers({
      metricId: "orders_count",
      metricLabel: "Orders row count (mutable, backend/API)",
      expected:
        snap.apiTraceOrders ??
        snap.apiOrdersRowCount ??
        snap.ordersRowCount ??
        seed.ordersCount,
      tenantCtx: ctx,
      cacheMeta: { ...cacheMeta, ordersUiNotRendered: snap.uiOrdersRowCount == null },
      compareMode: "kpi",
      layers: [
        {
          layerId: "rls",
          label: "Orders rows (RLS / browser)",
          value: snap.ordersRowCount,
          meta: { supporting: true },
        },
        {
          layerId: "api",
          label: "API getAdminDashboardRead (orders rows)",
          value: snap.apiTraceOrders ?? snap.apiOrdersRowCount ?? null,
        },
        ordersUiLayer,
      ],
    }),
    diagnoseMetricLayers({
      metricId: "outstanding_receivables",
      metricLabel: "Receivables (mutable)",
      expected: snap.arOutstanding ?? seed.outstandingReceivables,
      tenantCtx: ctx,
      cacheMeta,
      compareMode: "kpi",
      layers: [
        { layerId: "rls", label: "AR rollup (DB)", value: snap.arOutstanding, meta: { supporting: true } },
        { layerId: "api", label: "API executive.outstandingReceivables", value: snap.apiOutstanding },
        stateLayer(
          "outstanding_receivables",
          "Admin Dashboard",
          snap.stateOutstanding,
          snap.uiOutstanding,
          uiSnapshotFresh
        ),
        uiLayer(snap.uiOutstanding),
      ],
    }),
    diagnoseMetricLayers({
      metricId: "recent_visits",
      metricLabel: "Recent visits (mutable)",
      expected: snap.visitsRowCount ?? seed.recentVisits,
      tenantCtx: ctx,
      compareMode: "kpi",
      layers: [
        { layerId: "rls", label: "Visits rows", value: snap.visitsRowCount, meta: { supporting: true } },
        { layerId: "api", label: "API summary", value: snap.apiRecentVisits },
        stateLayer(
          "recent_visits",
          "Admin Dashboard",
          snap.stateRecentVisits,
          snap.uiRecentVisits,
          uiSnapshotFresh
        ),
        uiLayer(snap.uiRecentVisits),
      ],
    }),
    diagnoseMetricLayers({
      metricId: "inventory_skus",
      metricLabel: "Inventory SKU count (mutable, executive portfolio)",
      expected:
        snap.inventorySkus ?? snap.apiInventorySkus ?? seed.inventorySkus,
      tenantCtx: ctx,
      compareMode: "kpi",
      layers: [
        { layerId: "rls", label: "Inventory rows", value: snap.inventorySkus, meta: { supporting: true } },
        { layerId: "api", label: "API summary.stockStats.totalSkus", value: snap.apiInventorySkus },
        stateLayer(
          "inventory_skus",
          "Admin Dashboard",
          snap.stateInventorySkus,
          snap.uiInventorySkus,
          uiSnapshotFresh
        ),
        uiLayer(snap.uiInventorySkus),
      ],
    }),
    diagnoseMetricLayers({
      metricId: "total_sold_value",
      metricLabel: "Total sold value (mutable)",
      expected: snap.apiTotalSold ?? snap.totalSoldValue ?? seed.totalSoldValue,
      tenantCtx: ctx,
      compareMode: "kpi",
      layers: [
        { layerId: "rls", label: "Revenue compute (DB)", value: snap.totalSoldValue, meta: { supporting: true } },
        { layerId: "api", label: "API summary.totalSoldValue", value: snap.apiTotalSold },
        stateLayer(
          "total_sold_value",
          "Admin Dashboard",
          snap.stateTotalSold,
          snap.uiTotalSold,
          uiSnapshotFresh
        ),
        uiLayer(snap.uiTotalSold),
      ],
    }),
  ];
}

/**
 * @param {Object} snap
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} ctx
 */
export function buildCollectionsMetricDiagnoses(snap, ctx, options = {}) {
  const uiSnapshotFresh = options.uiSnapshotFresh !== false;
  const module = "Collections";
  const uiLayer = (value) => ({
    layerId: "ui",
    label: "Rendered UI",
    value: uiSnapshotFresh ? value : null,
    meta: uiSnapshotFresh ? undefined : { unobserved: true, optional: true },
  });

  return [
    diagnoseMetricLayers({
      metricId: "collections_list",
      metricLabel: "Collections list count",
      tenantCtx: ctx,
      compareMode: "kpi",
      layers: [
        { layerId: "rls", label: "AR rows", value: snap.dbArRows },
        { layerId: "api", label: "API collections", value: snap.apiCollectionCount },
        stateLayer(
          "collections_list",
          module,
          null,
          snap.uiCollectionCount,
          uiSnapshotFresh
        ),
        uiLayer(snap.uiCollectionCount),
      ],
    }),
    diagnoseMetricLayers({
      metricId: "outstanding_receivables",
      metricLabel: "Total outstanding",
      tenantCtx: ctx,
      compareMode: "kpi",
      layers: [
        { layerId: "rls", label: "AR rollup", value: snap.dbOutstanding },
        { layerId: "api", label: "API summary", value: snap.apiOutstanding },
        stateLayer(
          "outstanding_receivables",
          module,
          null,
          snap.uiOutstanding,
          uiSnapshotFresh
        ),
        uiLayer(snap.uiOutstanding),
      ],
    }),
  ];
}

/**
 * @param {Object} snap
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} ctx
 */
export function buildQualificationMetricDiagnoses(snap, ctx, options = {}) {
  const uiSnapshotFresh = options.uiSnapshotFresh !== false;
  const module = "Qualification Analytics";
  const uiLayer = (value) => ({
    layerId: "ui",
    label: "Rendered UI",
    value: uiSnapshotFresh ? value : null,
    meta: uiSnapshotFresh ? undefined : { unobserved: true, optional: true },
  });

  return [
    diagnoseMetricLayers({
      metricId: "qualification_rows",
      metricLabel: "Qualification rows",
      tenantCtx: ctx,
      compareMode: "kpi",
      layers: [
        { layerId: "rls", label: "lab_qualifications", value: snap.dbCount },
        { layerId: "api", label: "API rows", value: snap.apiCount },
        stateLayer("qualification_rows", module, null, snap.uiCount, uiSnapshotFresh),
        uiLayer(snap.uiCount),
      ],
    }),
  ];
}

/**
 * Phase 2 tenant + role isolation — one diagnosis metric per non-pass QA check.
 * @param {import('@/validation/qaValidationCore.js').QaValidationReport} report
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} ctx
 */
export function buildTenantRoleIsolationDiagnoses(report, ctx) {
  const checks = report?.checks || [];
  const informational = checks.filter((c) => c.status === "info");
  const openChecks = checks.filter((c) => c.status === "fail" || c.status === "warn");

  const infoMetrics = informational.map((check) => buildInformationalDiagnosis(check, ctx));

  if (openChecks.length === 0 && infoMetrics.length > 0) {
    return infoMetrics;
  }

  if (openChecks.length === 0) {
    return [
      diagnoseMetricLayers({
        metricId: "isolation.summary",
        metricLabel: "Tenant + role isolation summary",
        tenantCtx: ctx,
        layers: [
          { layerId: "rls", label: "RLS probes", value: report?.summary?.pass ?? 0 },
        ],
      }),
    ];
  }

  const actionableMetrics = openChecks.map((check) => {
    const actual = /** @type {Record<string, unknown>} */ (check.actual || {});
    const firstLayer = String(actual.firstDivergenceLayer || "rls");

    const diagnosis = diagnoseMetricLayers({
      metricId: check.id,
      metricLabel: check.label,
      tenantCtx: ctx,
      compareMode: "rls_only",
      layers: [
        {
          layerId: firstLayer === "api" ? "api" : firstLayer === "ui" ? "ui" : "rls",
          label: check.label,
          value: actual.rowCount ?? actual.unauthorizedCount ?? null,
          meta: { message: check.message, ...actual },
        },
      ],
    });

    diagnosis.status =
      check.status === "fail" ? "FAIL" : check.status === "warn" ? "WARN" : "PASS";
    diagnosis.issueClass = resolveCheckIssueClass(check);
    diagnosis.probableRootCause = check.message;
    diagnosis.firstDivergenceLayer =
      check.status === "pass" ? "none" : firstLayer === "none" ? "rls" : firstLayer;
    return diagnosis;
  });

  return [...infoMetrics, ...actionableMetrics];
}
