import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import { loadFounderFinancialIntelligenceData } from "@/founder/founderFinancialIntelligenceData.js";
import { buildFounderFinancialIntelligenceModel } from "@/founder/founderFinancialIntelligenceEngine.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Founder Financial Intelligence",
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
export async function validateFounderFinancialIntelligenceModule({
  ctx,
  currentUser = null,
  rendered = null,
}) {
  return predatorTrace("Founder Financial Intelligence", "validation.full", async () => {
    const entries = [];

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Founder Financial Intelligence",
          step: "role.access",
          rootCauseGuess: "Founder financial intelligence is executive-scoped",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    let model;
    let loadStatus;
    try {
      const data = await loadFounderFinancialIntelligenceData(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId }
      );
      loadStatus = data.loadStatus;
      model = buildFounderFinancialIntelligenceModel(data);
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Founder Financial Intelligence",
          step: "engine.build",
          actual: err?.message || String(err),
          suggestedFix: "Open Founder Financial Intelligence and ensure Supabase reads succeed",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    entries.push(
      createPredatorEntry({
        status: loadStatus.billing.ok ? "PASS" : "FAIL",
        module: "Founder Financial Intelligence",
        step: "financial.billing_loaded",
        actual: loadStatus.billing,
        suggestedFix: loadStatus.billing.ok ? undefined : "Verify distributor_billing_payments read path",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: loadStatus.commissions.ok ? "PASS" : "FAIL",
        module: "Founder Financial Intelligence",
        step: "financial.commissions_loaded",
        actual: loadStatus.commissions,
        suggestedFix: loadStatus.commissions.ok ? undefined : "Verify commission_entries read path",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: loadStatus.contracts.ok ? "PASS" : "FAIL",
        module: "Founder Financial Intelligence",
        step: "financial.contracts_loaded",
        actual: { ok: loadStatus.contracts.ok, count: model.revenueIntelligence?.activeContracts ?? 0 },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const collectionsOk = loadStatus.collections.ok;
    const collectionsEmpty =
      model.distributorCount === 0 && num(model.collectionsCash?.overdueCount) === 0;
    entries.push(
      createPredatorEntry({
        status: collectionsOk ? (collectionsEmpty ? "WARN" : "PASS") : "FAIL",
        module: "Founder Financial Intelligence",
        step: "financial.collections_loaded",
        actual: {
          ok: collectionsOk,
          distributorCount: model.distributorCount,
          hasOutstanding: Boolean(model.collectionsCash?.totalOutstanding),
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const snapshotPresent =
      model.hqSnapshot &&
      Number.isFinite(model.hqSnapshot.realizedRevenueMtd) &&
      Number.isFinite(model.hqSnapshot.commissionLiability);
    entries.push(
      createPredatorEntry({
        status: snapshotPresent ? "PASS" : "FAIL",
        module: "Founder Financial Intelligence",
        step: "financial.snapshot_present",
        actual: snapshotPresent
          ? {
              realizedRevenueMtd: model.hqSnapshot.realizedRevenueMtd,
              commissionLiability: model.hqSnapshot.commissionLiability,
            }
          : "missing",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const tablePresent = Array.isArray(model.distributorEconomics);
    const tableEmpty = model.distributorEconomics.length === 0;
    entries.push(
      createPredatorEntry({
        status: tablePresent ? (tableEmpty ? "WARN" : "PASS") : "FAIL",
        module: "Founder Financial Intelligence",
        step: "financial.distributor_table_present",
        actual: { rowCount: model.distributorEconomics?.length ?? 0 },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: model.reconciliation?.valid ? "PASS" : "WARN",
        module: "Founder Financial Intelligence",
        step: "financial.reconciliation_valid",
        actual: model.reconciliation,
        suggestedFix: model.reconciliation?.valid
          ? undefined
          : "Portfolio rollups should match per-distributor sums",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (rendered?.founderFinancialIntelligence && rendered.distributorRowCount != null) {
      const match = rendered.distributorRowCount === model.distributorEconomics.length;
      entries.push(
        createPredatorEntry({
          status: match ? "PASS" : "WARN",
          module: "Founder Financial Intelligence",
          step: "ui.distributor_row_count",
          expected: model.distributorEconomics.length,
          actual: rendered.distributorRowCount,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries);
  });
}
