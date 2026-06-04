import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { buildFounderPhaseEngineView } from "@/founder/founderPhaseEngine.js";
import { FOUNDER_MILESTONE_TEMPLATES } from "@/founder/founderJourneyDefinition.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";

const VALID_MILESTONE_STATUS = new Set(["completed", "in_progress", "blocked", "locked"]);
const VALID_PHASE_VISUAL = new Set(["complete", "current", "blocked", "locked", "upcoming"]);

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {object|null} [params.rendered]
 * @param {object|null} [params.opsPayload]
 */
export async function validateFounderNavigationModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Founder Navigation", "validation.full", async () => {
    const entries = [];

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Founder Navigation",
          step: "role.access",
          rootCauseGuess: "Founder navigation is executive-scoped",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries, ctx);
    }

    let view;
    try {
      const payload = await resolvePredatorOpsPayload(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        opsPayload
      );
      view = buildFounderPhaseEngineView(payload, ctx.tenantId);
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Founder Navigation",
          step: "engine.build",
          actual: err?.message || String(err),
          suggestedFix: "Ensure ops payload loads on Founder Navigation page.",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries, ctx);
    }

    const milestoneCountOk = view.milestones.length === FOUNDER_MILESTONE_TEMPLATES.length;
    entries.push(
      createPredatorEntry({
        status: milestoneCountOk ? "PASS" : "FAIL",
        module: "Founder Navigation",
        step: "milestones.count",
        expected: FOUNDER_MILESTONE_TEMPLATES.length,
        actual: view.milestones.length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const invalidStatus = view.milestones.filter((m) => !VALID_MILESTONE_STATUS.has(m.status));
    entries.push(
      createPredatorEntry({
        status: invalidStatus.length === 0 ? "PASS" : "FAIL",
        module: "Founder Navigation",
        step: "milestones.status_valid",
        actual: invalidStatus.map((m) => m.id),
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const fakeComplete = view.milestones.filter((m) => {
      if (m.status !== "completed") return false;
      if (m.id === "platform_built") return !ctx.tenantId;
      if (m.id === "field_scale_ready") return !view.signals.fieldScaleUnlocked;
      if (m.id === "pilot_hardening") return view.signals.pilotReadinessPct < 90;
      return false;
    });
    entries.push(
      createPredatorEntry({
        status: fakeComplete.length === 0 ? "PASS" : "FAIL",
        module: "Founder Navigation",
        step: "milestones.no_fake_complete",
        actual: fakeComplete.map((m) => m.id),
        suggestedFix: "Milestone completion must match live signals, not static flags.",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const phaseInvalid = view.phases.filter((p) => !VALID_PHASE_VISUAL.has(p.visualStatus));
    entries.push(
      createPredatorEntry({
        status: phaseInvalid.length === 0 ? "PASS" : "FAIL",
        module: "Founder Navigation",
        step: "phases.visual_valid",
        actual: phaseInvalid.map((p) => p.id),
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const hasCurrent = view.phases.some((p) => p.visualStatus === "current");
    const phaseMatches = view.currentPhase?.visualStatus === "current";
    entries.push(
      createPredatorEntry({
        status: hasCurrent && phaseMatches ? "PASS" : "WARN",
        module: "Founder Navigation",
        step: "phases.current_consistent",
        actual: {
          currentPhaseId: view.currentPhaseId,
          hasCurrent,
          phaseMatches,
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const unlockDeterministic =
      view.signals.fieldScaleUnlocked === view.signals.unlockGates.every((g) => g.pass);
    entries.push(
      createPredatorEntry({
        status: unlockDeterministic ? "PASS" : "FAIL",
        module: "Founder Navigation",
        step: "unlock.logic_deterministic",
        actual: {
          unlocked: view.signals.fieldScaleUnlocked,
          gates: view.signals.unlockGates.map((g) => ({ id: g.id, pass: g.pass })),
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const uiPhase = rendered?.currentPhaseId ?? null;
    const apiPhase = view.currentPhaseId;
    entries.push(
      createPredatorEntry({
        status: uiPhase == null || uiPhase === apiPhase ? "PASS" : "WARN",
        module: "Founder Navigation",
        step: "ui.phase_sync",
        expected: apiPhase,
        actual: { api: apiPhase, ui: uiPhase },
        suggestedFix: "Refresh Founder Navigation after ops data changes.",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const uiReadiness = rendered?.pilotReadinessPct ?? null;
    entries.push(
      createPredatorEntry({
        status:
          uiReadiness == null || uiReadiness === view.signals.pilotReadinessPct ? "PASS" : "WARN",
        module: "Founder Navigation",
        step: "ui.readiness_sync",
        actual: { api: view.signals.pilotReadinessPct, ui: uiReadiness },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (view.signals.dataStale) {
      entries.push(
        createPredatorEntry({
          status: "INFO",
          module: "Founder Navigation",
          step: "data.stale_snapshot",
          issueClass: "empty_snapshot",
          actual: view.signals,
          suggestedFix: "Load tenant operational data — scores are zero until data exists.",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Founder Navigation",
          step: "data.freshness",
          actual: {
            labs: view.signals.activeLabs,
            visits: view.signals.visitsLogged,
            readiness: view.signals.pilotReadinessPct,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Founder Navigation",
        step: "deterministic.no_ai",
        rootCauseGuess: "Phase engine uses ops payload only",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    return finish(entries, ctx);
  });
}

function finish(entries, ctx) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Founder Navigation",
    summary: summarizePredatorEntries(polished),
    entries: polished,
  };
}
