import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import {
  buildQAReadinessModel,
  releaseStatusFromScore,
  QA_COVERAGE_AREAS,
} from "@/qa/qaReadinessEngine.js";
import { loadQaDefects } from "@/qa/qaDefectRegistry.js";
import { predatorStore } from "@/predator/predatorStore.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "QA Readiness",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.rendered]
 */
export async function validateQAReadinessModule({ ctx, rendered = null }) {
  return predatorTrace("QA Readiness", "validation.full", async () => {
    const entries = [];

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "QA Readiness",
          step: "role.access",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const model =
      rendered?.qaReadiness ||
      buildQAReadinessModel({
        predatorReports: predatorStore.getModuleReportsForActiveTenant(),
        defects: loadQaDefects(),
      });

    const empty = num(model.coverage?.length) === 0;

    const pushStep = (step, valid, expected, actual) => {
      entries.push(
        createPredatorEntry({
          status: valid ? "PASS" : empty ? "WARN" : "FAIL",
          module: "QA Readiness",
          step,
          expected,
          actual: empty ? "No QA readiness model data" : actual,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    };

    const scoreValid =
      num(model.readinessScore) >= 0 &&
      num(model.readinessScore) <= 100 &&
      model.releaseStatus === releaseStatusFromScore(model.readinessScore);
    pushStep(
      "qa.readiness_score_valid",
      scoreValid,
      "Readiness score 0–100 with matching release status band",
      { readinessScore: model.readinessScore, releaseStatus: model.releaseStatus }
    );

    const coverageLoaded =
      Array.isArray(model.coverage) &&
      model.coverage.length === QA_COVERAGE_AREAS.length &&
      model.coverage.every((c) => typeof c.passPct === "number");
    pushStep(
      "qa.coverage_loaded",
      coverageLoaded,
      "Module coverage rows present for all QA areas",
      { areaCount: model.coverage?.length ?? 0 }
    );

    const defectsLoaded =
      model.defects &&
      typeof model.defects.open === "number" &&
      Array.isArray(model.defects.items);
    pushStep(
      "qa.defects_loaded",
      defectsLoaded,
      "Defect registry summary and items loaded",
      {
        open: model.defects?.open,
        critical: model.defects?.critical,
        itemCount: model.defects?.items?.length ?? 0,
      }
    );

    const regressionsLoaded =
      model.regression &&
      Array.isArray(model.regression.recentFailures) &&
      Array.isArray(model.regression.recentlyFixed);
    pushStep(
      "qa.regressions_loaded",
      regressionsLoaded,
      "Regression center lists failures and fixes",
      {
        failureCount: model.regression?.failureCount ?? 0,
        fixedCount: model.regression?.recentlyFixed?.length ?? 0,
      }
    );

    const statusValid = ["Ready", "Pilot Ready", "Risky", "Not Ready"].includes(model.releaseStatus);
    pushStep(
      "qa.release_status_valid",
      statusValid,
      "Release status is a valid readiness band",
      { releaseStatus: model.releaseStatus }
    );

    return finish(entries);
  });
}
