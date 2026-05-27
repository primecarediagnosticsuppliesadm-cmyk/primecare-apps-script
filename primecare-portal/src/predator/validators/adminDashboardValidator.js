import { runAdminDashboardValidation } from "@/validation/adminDashboardValidation.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import {
  buildAdminDashboardMetricDiagnoses,
  finalizeModuleDiagnosis,
} from "@/predator/buildModuleDiagnosis.js";
import { diagnoseProjectionColumns } from "@/predator/schemaAwareness.js";
import { buildAdminDashboardPredatorSnapshot } from "@/predator/validators/adminDashboardPredatorMapping.js";

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {{ executive?: object, summary?: object }|null} [params.rendered]
 */
export async function validateAdminDashboardModule({ ctx, rendered = null }) {
  return predatorTrace("Admin Dashboard", "validation.full", async () => {
    const report = await runAdminDashboardValidation({
      rendered,
      printReport: false,
    });

    const entries = (report.checks || []).map((check) =>
      createPredatorEntry({
        status: check.status === "fail" ? "FAIL" : check.status === "warn" ? "WARN" : "PASS",
        module: "Admin Dashboard",
        step: check.id || check.label,
        expected: check.expected,
        actual: check.actual,
        rootCauseGuess:
          check.status === "pass"
            ? ""
            : check.actual?.uiRendered === 0 && check.actual?.apiPayload > 0
              ? "Backend healthy, UI synchronization unhealthy"
              : check.actual?.apiPayload === 0 && check.actual?.browserRls > 0
                ? "Backend/API layer divergence detected"
                : "Layer mismatch between browser RLS reads, getAdminDashboardRead, and UI state",
        suggestedFix:
          check.status === "pass"
            ? ""
            : "See Predator UI Reliability tab for state/cache/render trace and first divergence layer",
        severity: check.status === "fail" ? "high" : check.status === "warn" ? "medium" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    await diagnoseProjectionColumns("orders", ["order_status", "net_line_total"]);
    await diagnoseProjectionColumns("order_lines", ["net_line_total"]);

    const predatorSnapshot = buildAdminDashboardPredatorSnapshot({
      legacyReport: report,
      rendered,
    });
    const metrics = buildAdminDashboardMetricDiagnoses(predatorSnapshot, ctx);
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
