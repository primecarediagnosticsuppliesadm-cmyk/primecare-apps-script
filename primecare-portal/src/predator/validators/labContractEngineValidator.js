import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { loadLabContractEngineBundle } from "@/labContract/labContractData.js";
import { CONTRACT_STATUSES } from "@/labContract/labContractTypes.js";
import { validateContractDates } from "@/labContract/labContractEngine.js";
import { buildContractRenewalIntelligence } from "@/contracts/contractRenewalIntelligenceEngine.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import { supabase } from "@/api/supabaseClient.js";
import {
  countNonTerminatedContractsForDistributor,
  readLabContractMigrationStatus,
} from "@/api/labContractsSupabaseApi.js";
import { evaluateContractActivationQualification } from "@/labContract/labContractQualificationGate.js";

const VALID_STATUSES = new Set(Object.values(CONTRACT_STATUSES));

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Lab Contract Engine",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 */
export async function validateLabContractEngineModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Lab Contract Engine", "validation.full", async () => {
    const entries = [];
    const roleOk = ctx.role === ROLES.EXECUTIVE || ctx.role === ROLES.ADMIN;

    if (!roleOk) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Lab Contract Engine",
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
      bundle = await loadLabContractEngineBundle(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        { force: false }
      );
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Lab Contract Engine",
          step: "bundle.load",
          actual: err?.message || String(err),
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const { model } = bundle;
    const contracts = model.contracts;

    entries.push(
      createPredatorEntry({
        status: supabase ? "PASS" : "FAIL",
        module: "Lab Contract Engine",
        step: "persistence.supabase_configured",
        actual: supabase ? "client ready" : "missing VITE_SUPABASE_URL / anon key",
        suggestedFix: supabase
          ? undefined
          : "Configure Supabase env vars and apply lab_contracts_migration.sql",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const migration = readLabContractMigrationStatus();
    const pendingLocal =
      Array.isArray(migration.localRegistryKeys) && migration.localRegistryKeys.length > 0;
    entries.push(
      createPredatorEntry({
        status: migration.done || !pendingLocal ? "PASS" : "WARN",
        module: "Lab Contract Engine",
        step: "persistence.migration_status",
        actual: {
          done: migration.done,
          localRegistryKeys: migration.localRegistryKeys?.length ?? 0,
          summary: migration.summary,
        },
        suggestedFix:
          migration.done || !pendingLocal
            ? undefined
            : "Open portal once to run ensureLabContractsMigrated or clear stale local registries",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const probeDistributorId = str(
      bundle.tenantId || ctx.tenantId || contracts[0]?.distributorId
    );
    let supabaseNonTerminatedCount = 0;
    let countError = null;
    if (probeDistributorId && supabase) {
      const countRes = await countNonTerminatedContractsForDistributor(probeDistributorId);
      supabaseNonTerminatedCount = countRes.ok ? countRes.count : 0;
      countError = countRes.ok ? null : countRes.error;
    }
    entries.push(
      createPredatorEntry({
        status:
          !supabase || !probeDistributorId
            ? "WARN"
            : countError
              ? "FAIL"
              : "PASS",
        module: "Lab Contract Engine",
        step: "persistence.non_terminated_count",
        expected: "Head count from public.lab_contracts for probe distributor",
        actual: {
          distributorId: probeDistributorId || null,
          count: supabaseNonTerminatedCount,
          error: countError,
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const invalidDates = contracts.filter((c) => !validateContractDates(c));
    entries.push(
      createPredatorEntry({
        status: invalidDates.length === 0 ? "PASS" : "FAIL",
        module: "Lab Contract Engine",
        step: "dates.valid_range",
        actual: invalidDates.map((c) => c.contractNumber).join(", ") || "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const invalidStatus = contracts.filter((c) => !VALID_STATUSES.has(c.status));
    entries.push(
      createPredatorEntry({
        status: invalidStatus.length === 0 ? "PASS" : "FAIL",
        module: "Lab Contract Engine",
        step: "status.consistency",
        actual: invalidStatus.map((c) => c.status).join(", ") || "ok",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const activeNoLab = contracts.filter(
      (c) => c.status === CONTRACT_STATUSES.ACTIVE && !c.readiness?.checks?.find((x) => x.id === "lab")?.pass
    );
    entries.push(
      createPredatorEntry({
        status: activeNoLab.length === 0 ? "PASS" : "FAIL",
        module: "Lab Contract Engine",
        step: "activation.active_requires_lab",
        actual: activeNoLab.length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const activeNoDist = contracts.filter(
      (c) =>
        c.status === CONTRACT_STATUSES.ACTIVE &&
        !c.readiness?.checks?.find((x) => x.id === "distributor")?.pass
    );
    entries.push(
      createPredatorEntry({
        status: activeNoDist.length === 0 ? "PASS" : "FAIL",
        module: "Lab Contract Engine",
        step: "activation.active_requires_distributor",
        actual: activeNoDist.length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const badReadiness = contracts.filter(
      (c) => c.readiness?.score < 0 || c.readiness?.score > 100
    );
    entries.push(
      createPredatorEntry({
        status: badReadiness.length === 0 ? "PASS" : "FAIL",
        module: "Lab Contract Engine",
        step: "readiness.score_range",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const badHealth = contracts.filter(
      (c) => c.healthScore < 0 || c.healthScore > 100
    );
    entries.push(
      createPredatorEntry({
        status: badHealth.length === 0 ? "PASS" : "FAIL",
        module: "Lab Contract Engine",
        step: "health.score_range",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const fakeRevenue = contracts.filter(
      (c) =>
        c.revenueUnderContract > 0 &&
        c.status === CONTRACT_STATUSES.ACTIVE &&
        !bundle.opsPayload?.orders?.length
    );
    entries.push(
      createPredatorEntry({
        status: fakeRevenue.length === 0 ? "PASS" : "WARN",
        module: "Lab Contract Engine",
        step: "data.no_fake_revenue",
        actual: fakeRevenue.length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const orphan = contracts.filter(
      (c) => !c.labId && c.status !== CONTRACT_STATUSES.TERMINATED
    );
    entries.push(
      createPredatorEntry({
        status: orphan.length === 0 ? "PASS" : "FAIL",
        module: "Lab Contract Engine",
        step: "data.no_orphan_contracts",
        actual: orphan.length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const expiring = contracts.filter(
      (c) =>
        c.status === CONTRACT_STATUSES.ACTIVE &&
        c.daysToExpiry != null &&
        c.daysToExpiry >= 0 &&
        c.daysToExpiry <= 90
    );
    if (expiring.length > 0) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Lab Contract Engine",
          step: "renewal.expires_90d",
          actual: expiring.length,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Lab Contract Engine",
          step: "renewal.expires_90d",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const lowCommit = contracts.filter(
      (c) =>
        c.status === CONTRACT_STATUSES.ACTIVE &&
        num(c.commercial?.monthlyCommitment) > 0 &&
        num(c.health?.commitmentPct) < 50
    );
    if (lowCommit.length > 0) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Lab Contract Engine",
          step: "commercial.commitment_below_target",
          actual: lowCommit.length,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const lowL1b = contracts.filter(
      (c) => c.l1b && c.l1b.utilizationPct < 40 && c.status === CONTRACT_STATUSES.ACTIVE
    );
    if (lowL1b.length > 0) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Lab Contract Engine",
          step: "l1b.utilization_low",
          actual: lowL1b.length,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (contracts.length > 1500) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Lab Contract Engine",
          step: "scale.contract_count",
          actual: contracts.length,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Lab Contract Engine",
          step: "scale.contract_count",
          actual: contracts.length,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (
      rendered?.activeCount !== undefined &&
      rendered.activeCount !== model.dashboard.activeCount
    ) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Lab Contract Engine",
          step: "ui.snapshot_drift",
          expected: rendered.activeCount,
          actual: model.dashboard.activeCount,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const renewalIntel = buildContractRenewalIntelligence(model);
    const activeContracts = contracts.filter((c) => c.status === CONTRACT_STATUSES.ACTIVE);
    const qualifications = bundle.opsPayload?.qualifications || [];

    if (activeContracts.length === 0) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Lab Contract Engine",
          step: "contract_activation_requires_qualification",
          actual: "No active contracts to evaluate qualification gate",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      for (const contract of activeContracts) {
        const probe = evaluateContractActivationQualification(contract, qualifications, {
          distributorId: contract.distributorId,
        });
        entries.push(
          createPredatorEntry({
            status: probe.activationAllowed ? "PASS" : "FAIL",
            module: "Lab Contract Engine",
            step: "contract_activation_requires_qualification",
            expected:
              "Qualification row exists, founder review approved, pipeline stage qualified",
            actual: {
              distributor: probe.distributor || contract.distributorName || contract.distributorId,
              lab: probe.lab || contract.labName || contract.labId,
              qualificationExists: probe.qualificationExists,
              qualificationStatus: probe.qualificationStatus,
              founderApproved: probe.founderApproved,
              contractStatus: probe.contractStatus,
              activationAllowed: probe.activationAllowed,
            },
            rootCauseGuess: probe.activationAllowed
              ? "Active contract backed by approved qualification"
              : probe.blockReason === "missing_qualification_row"
                ? "Contract activated without qualification record (likely migration or legacy path)"
                : "Qualification exists but founder approval or qualified stage missing",
            severity: probe.activationAllowed ? "low" : "critical",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    }

    if (activeContracts.length === 0) {
      for (const step of [
        "contracts.expiry_loaded",
        "contracts.revenue_at_risk",
        "contracts.renewal_queue_present",
        "contracts.health_score_valid",
        "contracts.distributor_rollup_valid",
      ]) {
        entries.push(
          createPredatorEntry({
            status: "WARN",
            module: "Lab Contract Engine",
            step,
            actual: "No active contracts to evaluate renewal intelligence",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    } else {
      const bucketSum =
        renewalIntel.expiring30Count +
        renewalIntel.expiring60Count +
        renewalIntel.expiring90Count;
      const interventionCount = renewalIntel.interventionQueue.length;
      const expiryLoadedOk =
        bucketSum === interventionCount &&
        renewalIntel.expiringIn90Total === interventionCount;

      entries.push(
        createPredatorEntry({
          status: expiryLoadedOk ? "PASS" : "FAIL",
          module: "Lab Contract Engine",
          step: "contracts.expiry_loaded",
          expected: "30/60/90 day buckets sum to intervention queue count",
          actual: {
            expiring30Count: renewalIntel.expiring30Count,
            expiring60Count: renewalIntel.expiring60Count,
            expiring90Count: renewalIntel.expiring90Count,
            interventionCount,
            bucketSum,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const queueRevenueSum = renewalIntel.interventionQueue.reduce(
        (s, r) => s + num(r.revenueAtRisk),
        0
      );
      const queueCommittedSum = renewalIntel.interventionQueue.reduce(
        (s, r) => s + num(r.monthlyRevenue),
        0
      );
      const revenueAtRiskOk =
        Math.abs(queueRevenueSum - num(renewalIntel.revenueAtRisk)) <= 0.01 &&
        Math.abs(queueCommittedSum - num(renewalIntel.committedRevenueAtRisk)) <= 0.01;

      entries.push(
        createPredatorEntry({
          status: revenueAtRiskOk ? "PASS" : "FAIL",
          module: "Lab Contract Engine",
          step: "contracts.revenue_at_risk",
          expected: "Portfolio revenue-at-risk matches intervention queue sums",
          actual: {
            revenueAtRisk: renewalIntel.revenueAtRisk,
            queueRevenueSum,
            committedRevenueAtRisk: renewalIntel.committedRevenueAtRisk,
            queueCommittedSum,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const queuePresentOk =
        interventionCount === 0
          ? renewalIntel.interventionQueueCount === 0
          : renewalIntel.interventionQueue.length === renewalIntel.interventionQueueCount;

      entries.push(
        createPredatorEntry({
          status: queuePresentOk ? "PASS" : "FAIL",
          module: "Lab Contract Engine",
          step: "contracts.renewal_queue_present",
          expected: "Intervention queue rows present when expiring contracts exist",
          actual: {
            interventionQueueCount: renewalIntel.interventionQueueCount,
            queueLength: renewalIntel.interventionQueue.length,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const healthScoreOk =
        num(renewalIntel.renewalHealthScore) >= 0 &&
        num(renewalIntel.renewalHealthScore) <= 100 &&
        renewalIntel.distributorRenewalHealth.every(
          (r) => r.renewalHealthScore >= 0 && r.renewalHealthScore <= 100
        );

      entries.push(
        createPredatorEntry({
          status: healthScoreOk ? "PASS" : "FAIL",
          module: "Lab Contract Engine",
          step: "contracts.health_score_valid",
          expected: "Renewal health scores are 0–100",
          actual: {
            portfolioHealth: renewalIntel.renewalHealthScore,
            distributorRows: renewalIntel.distributorRenewalHealth.length,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const rollupRevenue = renewalIntel.distributorRenewalHealth.reduce(
        (s, r) => s + num(r.revenueAtRisk),
        0
      );
      const rollupExpiring = renewalIntel.distributorRenewalHealth.reduce(
        (s, r) => s + num(r.expiringContracts),
        0
      );
      const distributorRollupOk =
        Math.abs(rollupRevenue - num(renewalIntel.revenueAtRisk)) <= 0.01 &&
        rollupExpiring === interventionCount;

      entries.push(
        createPredatorEntry({
          status: distributorRollupOk ? "PASS" : "FAIL",
          module: "Lab Contract Engine",
          step: "contracts.distributor_rollup_valid",
          expected: "Per-distributor renewal rollups match portfolio totals",
          actual: {
            rollupRevenue,
            portfolioRevenueAtRisk: renewalIntel.revenueAtRisk,
            rollupExpiring,
            interventionCount,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries);
  });
}

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
