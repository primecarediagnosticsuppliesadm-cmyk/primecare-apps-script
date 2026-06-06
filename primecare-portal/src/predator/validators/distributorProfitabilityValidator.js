import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import { loadFounderFinancialIntelligenceData } from "@/founder/founderFinancialIntelligenceData.js";
import { buildFounderFinancialIntelligenceModel } from "@/founder/founderFinancialIntelligenceEngine.js";
import {
  CONTRIBUTION_STATUS,
  contributionStatusFromScore,
} from "@/founder/distributorProfitabilityEngine.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Distributor Profitability",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {object|null} [params.rendered]
 */
export async function validateDistributorProfitabilityModule({
  ctx,
  currentUser = null,
  rendered = null,
}) {
  return predatorTrace("Distributor Profitability", "validation.full", async () => {
    const entries = [];

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Distributor Profitability",
          step: "role.access",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    let model;
    try {
      const data = await loadFounderFinancialIntelligenceData(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId }
      );
      model = buildFounderFinancialIntelligenceModel(data);
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Distributor Profitability",
          step: "engine.build",
          actual: err?.message || String(err),
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const profitability = rendered?.distributorProfitability || model.distributorProfitability;
    const rows = profitability?.rows || [];
    const empty = rows.length === 0;

    const pushStep = (step, valid, expected, actual) => {
      entries.push(
        createPredatorEntry({
          status: empty ? "WARN" : valid ? "PASS" : "FAIL",
          module: "Distributor Profitability",
          step,
          expected,
          actual: empty ? "No distributor profitability rows" : actual,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    };

    const rowsLoadedOk =
      rows.length === num(model.distributorCount) && rows.every((r) => Boolean(r.distributorId));
    pushStep(
      "profitability.rows_loaded",
      rowsLoadedOk,
      "Profitability row count matches distributor registry",
      { rowCount: rows.length, distributorCount: model.distributorCount }
    );

    const scoreValid = rows.every(
      (r) =>
        num(r.contributionScore) >= 0 &&
        num(r.contributionScore) <= 100 &&
        r.status === contributionStatusFromScore(r.contributionScore)
    );
    pushStep(
      "profitability.score_valid",
      scoreValid,
      "Contribution scores are 0–100 and match status classification",
      {
        invalid: rows
          .filter(
            (r) =>
              num(r.contributionScore) < 0 ||
              num(r.contributionScore) > 100 ||
              r.status !== contributionStatusFromScore(r.contributionScore)
          )
          .map((r) => ({ distributorId: r.distributorId, score: r.contributionScore, status: r.status })),
      }
    );

    const signalValid = rows.every(
      (r) => Math.abs(num(r.contributionSignal) - (num(r.billingCollected) - num(r.commissionLiability))) <= 0.01
    );
    pushStep(
      "profitability.contribution_signal_valid",
      signalValid,
      "contributionSignal = billingCollected − commissionLiability",
      {
        invalid: rows
          .filter(
            (r) =>
              Math.abs(num(r.contributionSignal) - (num(r.billingCollected) - num(r.commissionLiability))) > 0.01
          )
          .map((r) => ({
            distributorId: r.distributorId,
            contributionSignal: r.contributionSignal,
            billingCollected: r.billingCollected,
            commissionLiability: r.commissionLiability,
          })),
      }
    );

    const classificationValid = rows.every((r) =>
      Object.values(CONTRIBUTION_STATUS).includes(r.status)
    );
    pushStep(
      "profitability.risk_classification_valid",
      classificationValid,
      "Status is Strong, Watch, or At Risk",
      {
        invalid: rows.filter((r) => !Object.values(CONTRIBUTION_STATUS).includes(r.status)).map((r) => r.status),
      }
    );

    const billingById = new Map((model.distributorEconomics || []).map((r) => [r.distributorId, r]));
    const rollupBillingCollected = rows.reduce((s, r) => s + num(r.billingCollected), 0);
    const sourceBillingCollected = [...billingById.values()].reduce(
      (s, r) => s + num(r.billingCollected),
      0
    );
    const rollupMatches =
      Math.abs(rollupBillingCollected - sourceBillingCollected) <= 0.01 &&
      rows.every((r) => {
        const src = billingById.get(r.distributorId);
        if (!src) return true;
        return (
          Math.abs(num(r.billingCollected) - num(src.billingCollected)) <= 0.01 &&
          Math.abs(num(r.revenue) - num(src.revenue)) <= 0.01
        );
      });
    pushStep(
      "profitability.rollup_matches_source",
      rollupMatches,
      "Profitability rows reconcile with distributor economics source fields",
      {
        rollupBillingCollected,
        sourceBillingCollected,
        rowCount: rows.length,
      }
    );

    return finish(entries);
  });
}
