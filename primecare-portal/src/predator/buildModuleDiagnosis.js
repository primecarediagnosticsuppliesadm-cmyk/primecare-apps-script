import { diagnoseMetricLayers, metricsToPredatorEntries } from "@/predator/rootCauseEngine.js";
import {
  compareRegressionSnapshots,
  loadRegressionSnapshot,
  saveRegressionSnapshot,
} from "@/predator/regressionSnapshots.js";
import { predatorStore } from "@/predator/predatorStore.js";
import { QA_ADMIN_DASHBOARD_SEED } from "@/validation/qaSeedExpectations.js";

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

  for (const r of renderSteps) {
    steps.push({
      phase: "UI",
      label: r.step,
      status: "PASS",
      durationMs: null,
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
  const status = metrics.some((m) => m.status === "FAIL")
    ? "FAIL"
    : metrics.some((m) => m.status === "WARN")
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

  const diagnosis = {
    module,
    status,
    metrics,
    timeline: buildDebugTimeline(module),
    regression,
    ranAt: new Date().toISOString(),
  };

  predatorStore.setModuleDiagnosis(module, diagnosis, ctx);
  const extraEntries = metricsToPredatorEntries(module, metrics, ctx);
  return { diagnosis, extraEntries };
}

/**
 * Admin Dashboard layer traces from validation snapshot.
 * @param {Object} snap
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} ctx
 */
export function buildAdminDashboardMetricDiagnoses(snap, ctx) {
  const seed = QA_ADMIN_DASHBOARD_SEED;
  const cacheEvents = predatorStore.getCacheEvents().filter((c) => c.cacheKey?.includes("admin"));
  const cacheMeta = { staleZeroRisk: cacheEvents.some((c) => c.staleZeroRisk) };

  return [
    diagnoseMetricLayers({
      metricId: "orders_count",
      metricLabel: "Orders row count (RLS evidence)",
      expected: seed.ordersCount,
      tenantCtx: ctx,
      cacheMeta,
      compareMode: "rls_only",
      layers: [
        { layerId: "rls", label: "RLS / Browser DB", value: snap.ordersRowCount },
        {
          layerId: "api",
          label: "API trace (orders table rows)",
          value: snap.apiTraceOrders ?? null,
          meta: { optional: true, notComparableToSeed: true },
        },
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
        { layerId: "ui", label: "Rendered executive", value: snap.uiOutstanding },
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
        { layerId: "ui", label: "Rendered UI", value: snap.uiRecentVisits },
      ],
    }),
    diagnoseMetricLayers({
      metricId: "inventory_skus",
      metricLabel: "Inventory SKUs",
      expected: seed.inventorySkus,
      tenantCtx: ctx,
      compareMode: "kpi",
      layers: [
        { layerId: "rls", label: "Inventory rows", value: snap.inventorySkus, meta: { supporting: true } },
        { layerId: "api", label: "API summary.stockStats.totalSkus", value: snap.apiInventorySkus },
        { layerId: "ui", label: "Rendered stockStats", value: snap.uiInventorySkus },
      ],
    }),
    diagnoseMetricLayers({
      metricId: "total_sold_value",
      metricLabel: "Total sold value (mutable)",
      expected: snap.totalSoldValue ?? seed.totalSoldValue,
      tenantCtx: ctx,
      compareMode: "kpi",
      layers: [
        { layerId: "rls", label: "Revenue compute (DB)", value: snap.totalSoldValue, meta: { supporting: true } },
        { layerId: "api", label: "API summary.totalSoldValue", value: snap.apiTotalSold },
        { layerId: "ui", label: "Rendered summary", value: snap.uiTotalSold },
      ],
    }),
  ];
}

/**
 * @param {Object} snap
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} ctx
 */
export function buildCollectionsMetricDiagnoses(snap, ctx) {
  return [
    diagnoseMetricLayers({
      metricId: "collections_list",
      metricLabel: "Collections list count",
      tenantCtx: ctx,
      layers: [
        { layerId: "rls", label: "AR rows", value: snap.dbArRows },
        { layerId: "api", label: "API collections", value: snap.apiCollectionCount },
        { layerId: "ui", label: "Rendered list", value: snap.uiCollectionCount },
      ],
    }),
    diagnoseMetricLayers({
      metricId: "outstanding_receivables",
      metricLabel: "Total outstanding",
      tenantCtx: ctx,
      layers: [
        { layerId: "rls", label: "AR rollup", value: snap.dbOutstanding },
        { layerId: "api", label: "API summary", value: snap.apiOutstanding },
        { layerId: "ui", label: "Rendered summary", value: snap.uiOutstanding },
      ],
    }),
  ];
}

/**
 * @param {Object} snap
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} ctx
 */
export function buildQualificationMetricDiagnoses(snap, ctx) {
  return [
    diagnoseMetricLayers({
      metricId: "qualification_rows",
      metricLabel: "Qualification rows",
      tenantCtx: ctx,
      layers: [
        { layerId: "rls", label: "lab_qualifications", value: snap.dbCount },
        { layerId: "api", label: "API rows", value: snap.apiCount },
        { layerId: "ui", label: "Rendered table", value: snap.uiCount },
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
  const openChecks = (report?.checks || []).filter((c) => c.status !== "pass");
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

  return openChecks.map((check) => {
    const actual = /** @type {Record<string, unknown>} */ (check.actual || {});
    const firstLayer = String(actual.firstDivergenceLayer || "rls");
    const issueClass =
      check.id.startsWith("tenant.")
        ? "tenant_isolation"
        : check.id.startsWith("role.")
          ? "security"
          : check.id.startsWith("layers.")
            ? "data_integrity"
            : "functional";

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

    diagnosis.status = check.status === "fail" ? "FAIL" : "WARN";
    diagnosis.issueClass = issueClass;
    diagnosis.probableRootCause = check.message;
    diagnosis.firstDivergenceLayer =
      check.status === "pass" ? "none" : firstLayer === "none" ? "rls" : firstLayer;
    return diagnosis;
  });
}
