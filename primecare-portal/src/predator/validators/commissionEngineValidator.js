import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { loadCommissionEngineBundle } from "@/commission/commissionData.js";
import { COMMISSION_PHASE_RULES } from "@/commission/commissionRules.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import { supabase } from "@/api/supabaseClient.js";
import {
  ENTRY_STATUSES,
  readCommissionMigrationStatus,
  recordCommissionPayout,
  summarizeCommissionLiability,
} from "@/api/commissionSupabaseApi.js";

const VALID_STATUS = new Set(["pending", "approved", "paid", "rejected"]);
const PROBE_PERIOD = "2099-01";

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Commission Engine",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

async function cleanupCommissionProbe(tenantId) {
  if (!supabase || !tenantId) return;
  await supabase.from("commission_entries").delete().eq("distributor_id", tenantId).eq("period_ymd", PROBE_PERIOD);
  await supabase.from("commission_payouts").delete().eq("distributor_id", tenantId).eq("period_ymd", PROBE_PERIOD);
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
    const migrationStatus = readCommissionMigrationStatus();

    entries.push(
      createPredatorEntry({
        status: bundle.ledgerSource === "supabase" ? "PASS" : "WARN",
        module: "Commission Engine",
        step: "commissions.supabase_persistence",
        expected: "ledger",
        actual: bundle.ledgerSource,
        suggestedFix:
          bundle.ledgerSource === "supabase"
            ? ""
            : "Deploy commission_ledger_migration.sql and ensure RLS allows executive reads",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: migrationStatus.done || bundle.ledgerSource === "supabase" ? "PASS" : "WARN",
        module: "Commission Engine",
        step: "migration.status",
        actual: migrationStatus.done ? "done" : "pending",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (bundle.liability) {
      const fromEntries = summarizeCommissionLiability(
        model.entries.map((e) => ({
          status: e.status,
          commission_amount: e.commissionAmount,
        }))
      );
      const liabilityMatch =
        Math.abs(fromEntries.liabilityTotal - bundle.liability.liabilityTotal) < 1 &&
        Math.abs(fromEntries.approvedTotal - bundle.liability.approvedTotal) < 1 &&
        Math.abs(fromEntries.paidTotal - bundle.liability.paidTotal) < 1 &&
        Math.abs(fromEntries.outstandingTotal - bundle.liability.outstandingTotal) < 1;

      entries.push(
        createPredatorEntry({
          status: liabilityMatch ? "PASS" : "FAIL",
          module: "Commission Engine",
          step: "commissions.liability_matches_entries",
          expected: bundle.liability,
          actual: fromEntries,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Commission Engine",
          step: "commissions.liability_matches_entries",
          actual: "liability unavailable",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

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

    let duplicateBlocked = false;
    let probeDetected = false;
    if (supabase && ctx.tenantId) {
      const probeTenant = ctx.tenantId;
      const probeEntryId = `comm-${PROBE_PERIOD}-predator_probe`;
      await cleanupCommissionProbe(probeTenant);

      await supabase.from("commission_entries").upsert(
        {
          id: probeEntryId,
          distributor_id: probeTenant,
          registry_tenant_id: probeTenant,
          period_ymd: PROBE_PERIOD,
          agent_key: "predator_probe",
          agent_name: "Predator Probe",
          commission_amount: 100,
          threshold_met: true,
          status: ENTRY_STATUSES.APPROVED,
          approved_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

      const first = await recordCommissionPayout(probeTenant, PROBE_PERIOD, {
        recordedBy: "predator",
        registryTenantId: probeTenant,
      });
      const second = await recordCommissionPayout(probeTenant, PROBE_PERIOD, {
        recordedBy: "predator",
        registryTenantId: probeTenant,
      });
      duplicateBlocked = Boolean(first.ok && second.duplicate);
      probeDetected = Boolean(first.ok);
      await cleanupCommissionProbe(probeTenant);
    }

    entries.push(
      createPredatorEntry({
        status: duplicateBlocked && probeDetected ? "PASS" : supabase ? "FAIL" : "WARN",
        module: "Commission Engine",
        step: "payout.duplicate_guard",
        expected: "Second payout for same tenant+period rejected",
        actual: { duplicateBlocked, probeDetected },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    let payoutsReconciled = true;
    for (const p of model.payouts) {
      const paidEntries = model.entries.filter(
        (e) => e.periodYmd === p.periodYmd && e.status === "paid"
      );
      const sum = paidEntries.reduce((s, e) => s + Number(e.commissionAmount || 0), 0);
      const match = Math.abs(sum - Number(p.totalCommission || 0)) < 1;
      if (!match) payoutsReconciled = false;
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

    entries.push(
      createPredatorEntry({
        status: payoutsReconciled ? "PASS" : "WARN",
        module: "Commission Engine",
        step: "commissions.payouts_reconciled",
        actual: payoutsReconciled ? "ok" : "mismatch",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

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
