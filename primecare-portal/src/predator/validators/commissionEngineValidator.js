import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { loadCommissionEngineBundle } from "@/commission/commissionData.js";
import { COMMISSION_PHASE_RULES } from "@/commission/commissionRules.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";

const VALID_STATUS = new Set(["pending", "approved", "paid"]);

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Commission Engine",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 */
export async function validateCommissionEngineModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Commission Engine", "validation.full", async () => {
    const entries = [];

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Commission Engine",
          step: "role.access",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    let bundle;
    try {
      await resolvePredatorOpsPayload(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        opsPayload
      );
      bundle = await loadCommissionEngineBundle(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        { force: false }
      );
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Commission Engine",
          step: "bundle.load",
          actual: err?.message || String(err),
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const model = bundle.model;
    const rule = model.rule;

    entries.push(
      createPredatorEntry({
        status: model.phaseId && COMMISSION_PHASE_RULES[model.phaseId] ? "PASS" : "WARN",
        module: "Commission Engine",
        step: "rules.phase",
        actual: model.phaseId,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const badScores = model.entries.filter(
      (e) => e.efficiencyPct < 0 || e.efficiencyPct > 100 || e.commissionAmount < 0
    );
    entries.push(
      createPredatorEntry({
        status: badScores.length === 0 ? "PASS" : "FAIL",
        module: "Commission Engine",
        step: "scores.range",
        actual: badScores.length ? String(badScores[0].commissionAmount) : "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const fakeCommission = model.entries.filter(
      (e) => e.commissionAmount > 0 && e.collectedAmount === 0 && e.revenueAttributed === 0
    );
    entries.push(
      createPredatorEntry({
        status: fakeCommission.length === 0 ? "PASS" : "FAIL",
        module: "Commission Engine",
        step: "data.no_fake_commission",
        actual: fakeCommission.map((e) => e.agentKey).join(", ") || "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const belowThresholdWithPay = model.entries.filter(
      (e) => !e.thresholdMet && e.commissionAmount > 0
    );
    entries.push(
      createPredatorEntry({
        status: belowThresholdWithPay.length === 0 ? "PASS" : "FAIL",
        module: "Commission Engine",
        step: "threshold.enforced",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const invalidStatus = model.entries.filter((e) => !VALID_STATUS.has(e.status));
    entries.push(
      createPredatorEntry({
        status: invalidStatus.length === 0 ? "PASS" : "FAIL",
        module: "Commission Engine",
        step: "ledger.status",
        actual: invalidStatus.map((e) => e.status).join(", ") || "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const approvedBelowMin = model.approved.filter(
      (e) => e.collectedAmount < rule.minMonthlyCollection
    );
    entries.push(
      createPredatorEntry({
        status: approvedBelowMin.length === 0 ? "PASS" : "FAIL",
        module: "Commission Engine",
        step: "activation.approved_requirements",
        actual: approvedBelowMin.length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    for (const p of model.payouts) {
      const paidEntries = model.entries.filter(
        (e) => e.periodYmd === p.periodYmd && e.status === "paid"
      );
      const sum = paidEntries.reduce((s, e) => s + Number(e.commissionAmount || 0), 0);
      const match = Math.abs(sum - Number(p.totalCommission || 0)) < 1;
      entries.push(
        createPredatorEntry({
          status: match ? "PASS" : "WARN",
          module: "Commission Engine",
          step: "payout.ledger_match",
          expected: p.totalCommission,
          actual: sum,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (model.summary.agentCount > 200) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Commission Engine",
          step: "scale.agent_count",
          actual: model.summary.agentCount,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Commission Engine",
          step: "scale.agent_count",
          actual: model.summary.agentCount,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (rendered?.pendingTotal !== undefined && rendered.pendingTotal !== model.summary.pendingTotal) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Commission Engine",
          step: "ui.snapshot_drift",
          expected: rendered.pendingTotal,
          actual: model.summary.pendingTotal,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries);
  });
}
