import { runAdminDashboardValidation } from "@/validation/adminDashboardValidation.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import {
  buildAdminDashboardMetricDiagnoses,
  finalizeModuleDiagnosis,
} from "@/predator/buildModuleDiagnosis.js";
import { diagnoseProjectionColumns } from "@/predator/schemaAwareness.js";
import { buildAdminDashboardPredatorSnapshot } from "@/predator/validators/adminDashboardPredatorMapping.js";
import { predatorStore } from "@/predator/predatorStore.js";
import {
  ADMIN_DASHBOARD_MODULE,
  resolveAdminDashboardUiSnapshot,
} from "@/predator/adminDashboardUiSnapshot.js";

/** @param {import('@/validation/qaValidationCore.js').QaValidationCheck} check */
function resolveAdminDashboardCheckStatus(check, uiSnapshotFresh, domKpisVisible = false) {
  const base =
    check.status === "fail" ? "FAIL" : check.status === "warn" ? "WARN" : "PASS";
  if (base !== "FAIL" || uiSnapshotFresh || domKpisVisible) return base;
  if (check.id === "browser_query_errors" || check.id === "api_read_failed") return base;

  const actual = /** @type {Record<string, unknown>} */ (check.actual || {});
  const uiRendered = actual.uiRendered;
  if (uiRendered != null) return base;

  const layerValues = [actual.browserRls, actual.dbComputed, actual.apiPayload].filter(
    (v) => v !== null && v !== undefined
  );
  if (layerValues.length >= 2 && layerValues.every((v) => v === layerValues[0])) {
    return "WARN";
  }
  return base;
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {{ executive?: object, summary?: object }|null} [params.rendered]
 */
export async function validateAdminDashboardModule({ ctx, rendered = null }) {
  return predatorTrace("Admin Dashboard", "validation.full", async () => {
    const stored = predatorStore.getModuleRenderedSnapshot(ADMIN_DASHBOARD_MODULE, ctx);
    const renderedInput = rendered ?? stored?.snapshot ?? null;

    const report = await runAdminDashboardValidation({
      rendered: renderedInput,
      printReport: false,
      forceApi: false,
    });

    const uiSnapshot = report.meta?.uiSnapshot;
    const uiSnapshotFresh = Boolean(uiSnapshot?.fresh);
    const domKpisVisible = Boolean(report.meta?.domKpisVisible);

    const entries = (report.checks || []).map((check) => {
      const status = resolveAdminDashboardCheckStatus(
        check,
        uiSnapshotFresh,
        domKpisVisible
      );
      return createPredatorEntry({
        status,
        module: "Admin Dashboard",
        step: check.id || check.label,
        expected: check.expected,
        actual: check.actual,
        rootCauseGuess:
          check.status === "pass"
            ? ""
            : check.id === "ui_snapshot_freshness"
              ? check.message || "Open Admin Dashboard to validate UI render sync"
              : check.id === "ui_snapshot_metric_missing.orders_count"
                ? check.message ||
                  "Orders count is backend/API validated; UI layer not rendered"
              : check.id === "orders_count"
                ? check.message || "Orders row count layer mismatch (RLS vs API)"
              : !uiSnapshotFresh && status === "WARN"
                ? "Open Admin Dashboard to validate UI render sync"
              : check.actual?.uiRendered === 0 &&
                    check.actual?.apiPayload > 0 &&
                    check.id !== "orders_count"
                  ? "Backend healthy, UI synchronization unhealthy"
                  : check.actual?.apiPayload === 0 && check.actual?.browserRls > 0
                    ? "Backend/API layer divergence detected"
                    : "Layer mismatch between browser RLS reads, getAdminDashboardRead, and UI state",
        suggestedFix:
          check.status === "pass"
            ? ""
            : "See Predator UI Reliability tab for state/cache/render trace and first divergence layer",
        severity: status === "FAIL" ? "high" : status === "WARN" ? "medium" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      });
    });

    await diagnoseProjectionColumns("orders", {
      required: ["order_id", "lab_id", "status", "total_amount"],
    });
    await diagnoseProjectionColumns("order_lines", {
      required: ["order_id", "net_line_total"],
    });

    const predatorSnapshot = buildAdminDashboardPredatorSnapshot({
      legacyReport: report,
      rendered: uiSnapshotFresh ? uiSnapshot.rendered : null,
    });
    const metrics = buildAdminDashboardMetricDiagnoses(predatorSnapshot, ctx, {
      uiSnapshotFresh,
    });
    const { diagnosis, extraEntries } = finalizeModuleDiagnosis({
      module: "Admin Dashboard",
      ctx,
      metrics,
    });

    const allEntries = [...entries, ...extraEntries];
    const summary = summarizePredatorEntries(allEntries);

    return {
      module: "Admin Dashboard",
      summary,
      entries: allEntries,
      legacyReport: report,
      diagnosis,
    };
  });
}
