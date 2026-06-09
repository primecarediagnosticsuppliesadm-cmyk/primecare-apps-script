import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { loadCommissionEngineBundle } from "@/commission/commissionData.js";
import { filterDistributorRegistry } from "@/distributor/distributorOsEngine.js";
import { loadDistributorWorkspaceBundle } from "@/distributor/distributorWorkspaceData.js";
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
const PROBE_AGENT_KEY = "predator_probe";

function str(v) {
  return String(v ?? "").trim();
}

function probeEntryId(distributorId, period = PROBE_PERIOD) {
  const short = str(distributorId).replace(/-/g, "").slice(0, 8) || "dist";
  return `comm-${period}-predator_probe-${short}`;
}

function probePayoutLegacyId(period = PROBE_PERIOD) {
  return `payout-${period}`;
}

/** Void probe-period payouts and clear probe entries — best-effort without DELETE RLS. */
async function cleanupCommissionProbe(distributorId) {
  if (!supabase || !distributorId) {
    return { voidedPayouts: 0, legacyVoided: false, entriesCleared: false };
  }
  const did = str(distributorId);
  const period = PROBE_PERIOD;
  const now = new Date().toISOString();
  const summary = { voidedPayouts: 0, legacyVoided: false, entriesCleared: false };

  const voidPaid = async (query) => {
    const { data, error } = await query;
    if (error || !data?.length) return 0;
    const ids = data.map((r) => r.id).filter(Boolean);
    if (!ids.length) return 0;
    const { error: updErr } = await supabase
      .from("commission_payouts")
      .update({ status: "void", updated_at: now })
      .in("id", ids);
    return updErr ? 0 : ids.length;
  };

  summary.voidedPayouts += await voidPaid(
    supabase
      .from("commission_payouts")
      .select("id")
      .eq("distributor_id", did)
      .eq("period_ymd", period)
      .eq("status", "paid")
  );

  const legacyId = probePayoutLegacyId(period);
  const legacyVoided = await voidPaid(
    supabase.from("commission_payouts").select("id").eq("id", legacyId).eq("status", "paid")
  );
  summary.legacyVoided = legacyVoided > 0;
  summary.voidedPayouts += legacyVoided;

  const scopedEntryId = probeEntryId(did, period);
  const entryIds = [scopedEntryId, `comm-${period}-predator_probe`];
  const { error: entryDeleteErr } = await supabase
    .from("commission_entries")
    .delete()
    .in("id", entryIds);
  if (!entryDeleteErr) {
    summary.entriesCleared = true;
  } else {
    await supabase
      .from("commission_entries")
      .update({ status: ENTRY_STATUSES.REJECTED, rejected_at: now })
      .eq("distributor_id", did)
      .eq("period_ymd", period)
      .eq("agent_key", PROBE_AGENT_KEY);
  }

  return summary;
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Commission Engine",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

/** @param {boolean} supabaseConfigured @param {string|null} probeTenant @param {Record<string, unknown>} actual */
function classifyDuplicateGuardProbe(supabaseConfigured, probeTenant, actual) {
  if (!supabaseConfigured) return "WARN";
  if (!probeTenant) return "INFO";

  const upsertError = str(actual.upsertError);
  const firstOk = actual.firstOk === true;
  const firstDuplicate = actual.firstDuplicate === true;
  const firstError = str(actual.firstError);
  const secondDuplicate = actual.secondDuplicate === true;
  const secondOk = actual.secondOk === true;
  const duplicateBlocked = actual.duplicateBlocked === true;
  const probeDetected = actual.probeDetected === true;

  if (duplicateBlocked || (secondDuplicate && (firstOk || firstDuplicate))) {
    return "PASS";
  }

  if (firstOk && !secondDuplicate) {
    return "FAIL";
  }

  const probeBlocked =
    Boolean(upsertError) ||
    (firstError && !firstOk && !firstDuplicate) ||
    (secondOk && !secondDuplicate) ||
    (!probeDetected && Boolean(firstError || upsertError));

  if (probeBlocked) {
    return "WARN";
  }

  if (firstDuplicate && secondDuplicate) {
    return "PASS";
  }

  return "WARN";
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
    let distributorCount = 0;
    try {
      await resolvePredatorOpsPayload(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        opsPayload
      );
      const user = currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId };
      let scopeTenantId = str(rendered?.selectedDistributorId);
      if (!scopeTenantId && !rendered?.embedded) {
        const workspace = await loadDistributorWorkspaceBundle(user).catch(() => ({ registry: [] }));
        const distributors = filterDistributorRegistry(workspace.registry || [], ctx.tenantId);
        distributorCount = distributors.length;
        scopeTenantId = str(distributors[0]?.id);
      }
      if (rendered?.embedded) {
        scopeTenantId = str(rendered?.selectedDistributorId || scopeTenantId);
      }
      bundle = await loadCommissionEngineBundle(user, {
        force: false,
        scopeTenantId,
      });
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

    if (rendered?.embedded) {
      entries.push(
        createPredatorEntry({
          status:
            rendered.readOnly === true && rendered.writeEnabled === false ? "PASS" : "FAIL",
          module: "Commission Engine",
          step: "commission_engine.distributor_os_read_only",
          expected: { readOnly: true, writeEnabled: false },
          actual: { readOnly: rendered.readOnly, writeEnabled: rendered.writeEnabled },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: rendered?.hqWriteSurfaceAvailable === true ? "PASS" : "WARN",
          module: "Commission Engine",
          step: "commission_engine.hq_write_surface_available",
          expected: true,
          actual: rendered?.hqWriteSurfaceAvailable ?? false,
          suggestedFix:
            rendered?.hqWriteSurfaceAvailable === true
              ? ""
              : "Open HQ Commission Engine with a distributor selected",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      const pageOpen = rendered?.commissionEngine === true;
      const selectedDistributorId = str(rendered?.selectedDistributorId);
      const scopeTenantId = str(bundle.tenantId);
      let selectedDistributorStatus = "WARN";
      if (pageOpen) {
        selectedDistributorStatus =
          selectedDistributorId ? "PASS" : distributorCount > 0 ? "FAIL" : "WARN";
      } else if (selectedDistributorId || scopeTenantId) {
        selectedDistributorStatus = "PASS";
      } else if (distributorCount > 0) {
        selectedDistributorStatus = "INFO";
      }
      entries.push(
        createPredatorEntry({
          status: selectedDistributorStatus,
          module: "Commission Engine",
          step: "commission_engine.selected_distributor_required",
          expected: "Distributor selected for HQ commission scope",
          actual: {
            selectedDistributorId: selectedDistributorId || null,
            scopeTenantId: scopeTenantId || null,
            pageOpen,
            distributorCount,
          },
          suggestedFix:
            pageOpen && !selectedDistributorId && distributorCount > 0
              ? "Select a distributor on HQ Commission Engine"
              : undefined,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

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
    let payoutProbeActual = { duplicateBlocked: false, probeDetected: false };
    const probeTenant = str(bundle?.tenantId);
    const probeRegistryTenantId = str(ctx.tenantId) || probeTenant;
    if (supabase && probeTenant) {
      const cleanupSummary = await cleanupCommissionProbe(probeTenant);
      const scopedEntryId = probeEntryId(probeTenant, PROBE_PERIOD);

      const upsertRes = await supabase.from("commission_entries").upsert(
        {
          id: scopedEntryId,
          distributor_id: probeTenant,
          registry_tenant_id: probeRegistryTenantId,
          period_ymd: PROBE_PERIOD,
          agent_key: PROBE_AGENT_KEY,
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
        registryTenantId: probeRegistryTenantId,
      });
      const second = await recordCommissionPayout(probeTenant, PROBE_PERIOD, {
        recordedBy: "predator",
        registryTenantId: probeRegistryTenantId,
      });
      duplicateBlocked = Boolean(second.duplicate && (first.ok || first.duplicate));
      probeDetected = Boolean(first.ok || first.duplicate);
      payoutProbeActual = {
        duplicateBlocked,
        probeDetected,
        probeTenant,
        scopedEntryId,
        cleanupSummary,
        upsertError: upsertRes.error?.message || null,
        firstOk: first.ok,
        firstDuplicate: first.duplicate,
        firstError: first.error || null,
        secondOk: second.ok,
        secondDuplicate: second.duplicate,
        secondError: second.error || null,
        probeBlockedReason:
          upsertRes.error?.message ||
          (!first.ok && !first.duplicate ? first.error : null) ||
          null,
      };
      await cleanupCommissionProbe(probeTenant);
    } else if (supabase) {
      payoutProbeActual = {
        duplicateBlocked: false,
        probeDetected: false,
        probeTenant: null,
        reason: "no_distributor_scope",
      };
    }

    const duplicateGuardStatus = classifyDuplicateGuardProbe(
      Boolean(supabase),
      probeTenant || null,
      payoutProbeActual
    );

    entries.push(
      createPredatorEntry({
        status: duplicateGuardStatus,
        module: "Commission Engine",
        step: "payout.duplicate_guard",
        expected: "Second payout for same tenant+period rejected",
        actual: payoutProbeActual,
        rootCauseGuess:
          duplicateGuardStatus === "WARN" && payoutProbeActual.probeBlockedReason
            ? `Duplicate guard probe blocked by write surface: ${payoutProbeActual.probeBlockedReason}`
            : undefined,
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
