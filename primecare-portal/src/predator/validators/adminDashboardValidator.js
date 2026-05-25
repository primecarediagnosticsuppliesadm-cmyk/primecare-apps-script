import { runAdminDashboardValidation } from "@/validation/adminDashboardValidation.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";

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
            : "Layer mismatch between browser RLS reads, getAdminDashboardRead, and UI state",
        suggestedFix:
          check.status === "pass"
            ? ""
            : "See check.message and compare DB row counts vs API payload vs rendered KPIs",
        severity: check.status === "fail" ? "high" : check.status === "warn" ? "medium" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const summary = summarizePredatorEntries(entries);
    return { module: "Admin Dashboard", summary, entries, legacyReport: report };
  });
}
