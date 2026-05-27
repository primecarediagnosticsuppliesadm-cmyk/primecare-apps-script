import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { checkSlowStep } from "@/predator/predatorChecks.js";
import { PREDATOR_TIMING_THRESHOLDS_MS } from "@/predator/predatorSchema.js";
import {
  buildTenantRoleIsolationDiagnoses,
  finalizeModuleDiagnosis,
} from "@/predator/buildModuleDiagnosis.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import {
  isTenantRoleIsolationValidationEnabled,
  qaCheckToIssueClass,
  runTenantRoleIsolationValidation,
} from "@/validation/tenantRoleIsolationValidation.js";

const MODULE = "Tenant + Role Isolation";

/**
 * @param {import('@/validation/qaValidationCore.js').QaValidationCheck} check
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} ctx
 */
function qaCheckToPredatorEntry(check, ctx) {
  const status = check.status === "fail" ? "FAIL" : check.status === "warn" ? "WARN" : "PASS";
  return createPredatorEntry({
    status,
    module: MODULE,
    step: check.id,
    expected: check.expected,
    actual: check.actual,
    rootCauseGuess: check.message,
    suggestedFix:
      status === "FAIL"
        ? "Fix RLS tenant predicate or client filter; verify profile.tenant_id and role assignment"
        : status === "WARN"
          ? "Review schema manifest, QA seed coverage, or timing — not confirmed leakage"
          : "",
    severity:
      status === "FAIL"
        ? check.id.startsWith("tenant.")
          ? "critical"
          : "high"
        : status === "WARN"
          ? "medium"
          : "low",
    tenantId: ctx.tenantId,
    role: ctx.role,
    userId: ctx.userId,
    issueClass: qaCheckToIssueClass(check),
  });
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {Record<string, { db?: number, api?: number, ui?: number }>|null} [params.rendered]
 */
export async function validateTenantRoleIsolationModule({
  ctx,
  currentUser = null,
  rendered = null,
}) {
  return predatorTrace(MODULE, "validation.full", async () => {
    const started = Date.now();

    if (!isTenantRoleIsolationValidationEnabled()) {
      const entries = [
        createPredatorEntry({
          status: "WARN",
          module: MODULE,
          step: "environment.disabled",
          rootCauseGuess: "Phase 2 isolation validation disabled for this environment",
          suggestedFix: "Use QA/dev or set VITE_QA_ISOLATION_VALIDATION=true (never on prod without review)",
          issueClass: "security",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        }),
      ];
      return {
        module: MODULE,
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    const report = await runTenantRoleIsolationValidation({
      currentUser,
      ctx,
      layerSnapshots: rendered?.layerSnapshots ?? rendered ?? {},
      printReport: false,
    });

    const entries = report.checks.map((c) => qaCheckToPredatorEntry(c, ctx));

    entries.push(
      checkSlowStep({
        module: MODULE,
        step: "validation.duration",
        ctx,
        durationMs: Date.now() - started,
        thresholdMs: PREDATOR_TIMING_THRESHOLDS_MS.moduleValidation,
      })
    );

    const metrics = buildTenantRoleIsolationDiagnoses(report, ctx);
    const { diagnosis, extraEntries } = finalizeModuleDiagnosis({
      module: MODULE,
      ctx,
      metrics,
    });

    const allEntries = [...entries, ...extraEntries];
    return {
      module: MODULE,
      summary: summarizePredatorEntries(allEntries),
      entries: allEntries,
      diagnosis,
      qaReport: report,
    };
  });
}
