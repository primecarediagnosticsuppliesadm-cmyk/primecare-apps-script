import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { buildFounderStrategyModel } from "@/founder/founderStrategyEngine.js";
import { loadVisibleLabContracts } from "@/labContract/labContractStore.js";
import { loadFounderCommissionMetrics } from "@/commission/commissionData.js";
import { filterDistributorRegistry } from "@/distributor/distributorOsEngine.js";
import { loadDistributorWorkspaceBundle } from "@/distributor/distributorWorkspaceData.js";
import { YEAR1_TARGETS } from "@/founder/founderStrategyTargets.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";

const VALID_PAGES = new Set([
  "dashboard",
  "operationsCenter",
  "risk",
  "orders",
  "founderNavigation",
  "qualificationReview",
]);

function finish(entries, ctx) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Founder Strategy",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {object|null} [params.rendered]
 * @param {object|null} [params.opsPayload]
 */
export async function validateFounderStrategyModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Founder Strategy", "validation.full", async () => {
    const entries = [];

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Founder Strategy",
          step: "role.access",
          rootCauseGuess: "Founder strategy is executive-scoped",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries, ctx);
    }

    let model;
    try {
      const payload = await resolvePredatorOpsPayload(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        opsPayload
      );
      const [contracts, bundle] = await Promise.all([
        loadVisibleLabContracts(),
        loadDistributorWorkspaceBundle(
          currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId }
        ).catch(() => ({ registry: [] })),
      ]);
      const distributors = filterDistributorRegistry(bundle.registry || [], ctx.tenantId);
      const commissionRes = await loadFounderCommissionMetrics(
        distributors.map((d) => d.id).filter(Boolean),
        { homeTenantId: ctx.tenantId }
      );
      model = buildFounderStrategyModel(payload, ctx.tenantId, {
        contracts,
        commissionMetrics: commissionRes.ok ? commissionRes.portfolio : null,
      });
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Founder Strategy",
          step: "engine.build",
          actual: err?.message || String(err),
          suggestedFix: "Ensure ops payload loads on Founder Strategy page.",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries, ctx);
    }

    const priorities = model.todayPriorities || [];
    const priorityCountOk = priorities.length <= 5;
    entries.push(
      createPredatorEntry({
        status: priorityCountOk ? "PASS" : "FAIL",
        module: "Founder Strategy",
        step: "priorities.count",
        expected: "<= 5",
        actual: priorities.length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const badImpact = priorities.filter(
      (p) => p.impactScore < 1 || p.impactScore > 100 || !Number.isFinite(p.impactScore)
    );
    entries.push(
      createPredatorEntry({
        status: badImpact.length === 0 ? "PASS" : "FAIL",
        module: "Founder Strategy",
        step: "priorities.impact_range",
        actual: badImpact.map((p) => p.id).join(", ") || "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const badPages = priorities.filter((p) => p.page && !VALID_PAGES.has(p.page));
    entries.push(
      createPredatorEntry({
        status: badPages.length === 0 ? "PASS" : "FAIL",
        module: "Founder Strategy",
        step: "priorities.navigation",
        actual: badPages.map((p) => p.page).join(", ") || "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const rg = model.revenueGap;
    const labMathOk =
      rg.labGap === Math.max(0, rg.targetLabs - rg.currentLabs) &&
      rg.targetLabs === YEAR1_TARGETS.activeLabs;
    entries.push(
      createPredatorEntry({
        status: labMathOk ? "PASS" : "FAIL",
        module: "Founder Strategy",
        step: "revenue.labs_math",
        expected: `gap = target(${YEAR1_TARGETS.activeLabs}) - current`,
        actual: `gap ${rg.labGap}, current ${rg.currentLabs}`,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const progressOk =
      rg.labProgressPct >= 0 &&
      rg.labProgressPct <= 100 &&
      rg.revenueProgressPct >= 0 &&
      rg.revenueProgressPct <= 100;
    entries.push(
      createPredatorEntry({
        status: progressOk ? "PASS" : "FAIL",
        module: "Founder Strategy",
        step: "revenue.progress_range",
        actual: `labs ${rg.labProgressPct}%, revenue ${rg.revenueProgressPct}%`,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const journey = model.journey;
    const milestoneOk =
      model.milestoneUnlock.currentMilestone &&
      model.milestoneUnlock.nextMilestone &&
      (model.milestoneUnlock.completedConditions.length +
        model.milestoneUnlock.requiredConditions.length >=
        1 ||
        model.signals.dataStale);
    entries.push(
      createPredatorEntry({
        status: milestoneOk ? "PASS" : "FAIL",
        module: "Founder Strategy",
        step: "milestone.consistency",
        actual: `${model.milestoneUnlock.currentMilestone} → ${model.milestoneUnlock.nextMilestone}`,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (!model.signals.dataStale && journey) {
      const readinessMatch =
        model.health.components.pilotReadiness === journey.signals?.pilotReadinessPct;
      entries.push(
        createPredatorEntry({
          status: readinessMatch ? "PASS" : "FAIL",
          module: "Founder Strategy",
          step: "milestone.readiness_align",
          expected: journey.signals?.pilotReadinessPct,
          actual: model.health.components.pilotReadiness,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const commission = model.commissionMetrics || {};
    const commissionOk =
      Number.isFinite(commission.liabilityTotal) &&
      Number.isFinite(commission.approvedTotal) &&
      Number.isFinite(commission.paidTotal) &&
      Number.isFinite(commission.outstandingTotal);
    entries.push(
      createPredatorEntry({
        status: commissionOk ? "PASS" : "WARN",
        module: "Founder Strategy",
        step: "commissions.metrics_present",
        actual: commissionOk
          ? {
              liability: commission.liabilityTotal,
              approved: commission.approvedTotal,
              paid: commission.paidTotal,
              outstanding: commission.outstandingTotal,
            }
          : "missing",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const roadmapOk = (model.year1Roadmap || []).length === 4;
    entries.push(
      createPredatorEntry({
        status: roadmapOk ? "PASS" : "FAIL",
        module: "Founder Strategy",
        step: "roadmap.quarters",
        expected: 4,
        actual: (model.year1Roadmap || []).length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const flywheelOk = (model.flywheel?.stages || []).length === 7;
    entries.push(
      createPredatorEntry({
        status: flywheelOk ? "PASS" : "FAIL",
        module: "Founder Strategy",
        step: "flywheel.stages",
        expected: 7,
        actual: (model.flywheel?.stages || []).length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const scores = model.health || {};
    const scoresOk = ["overall", "execution", "revenueReadiness"].every((k) => {
      const v = scores[k];
      return Number.isFinite(v) && v >= 0 && v <= 100;
    });
    entries.push(
      createPredatorEntry({
        status: scoresOk ? "PASS" : "FAIL",
        module: "Founder Strategy",
        step: "health.score_range",
        actual: JSON.stringify({
          overall: scores.overall,
          execution: scores.execution,
          revenueReadiness: scores.revenueReadiness,
        }),
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (model.signals.dataStale && priorities.some((p) => p.impactScore >= 99 && p.id !== "load-data")) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Founder Strategy",
          step: "data.no_fake_priorities",
          rootCauseGuess: "Stale tenant should not show high-impact fake wins",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Founder Strategy",
          step: "data.no_fake_priorities",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (rendered?.founderStrategy && rendered.priorityCount !== priorities.length) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Founder Strategy",
          step: "ui.snapshot_drift",
          expected: rendered.priorityCount,
          actual: priorities.length,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries, ctx);
  });
}
