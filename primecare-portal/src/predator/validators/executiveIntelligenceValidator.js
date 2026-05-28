import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { buildExecutiveInterventionModel } from "@/operations/executiveInterventionModel.js";
import { buildExecutiveIntelligenceModel } from "@/operations/executiveIntelligenceModel.js";
import { ROLES } from "@/config/roles.js";

const VALID_TRENDS = new Set(["improving", "worsening", "stable"]);
const STALE_MS = 5 * 60 * 1000;

function scoreInRange(n, label, entries, ctx) {
  const ok = typeof n === "number" && n >= 0 && n <= 100;
  entries.push(
    createPredatorEntry({
      status: ok ? "PASS" : "FAIL",
      module: "Executive Intelligence",
      step: `score.${label}`,
      expected: "0–100",
      actual: n,
      rootCauseGuess: ok ? null : "Reliability or agent score out of range",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    })
  );
  return ok;
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {object|null} [params.rendered]
 */
export async function validateExecutiveIntelligenceModule({
  ctx,
  currentUser = null,
  rendered = null,
}) {
  return predatorTrace("Executive Intelligence", "validation.full", async () => {
    const entries = [];

    if (ctx.role === ROLES.LAB || ctx.role === ROLES.AGENT) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Executive Intelligence",
          step: "role.access",
          rootCauseGuess: "Intelligence layer restricted to executive roles",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Executive Intelligence",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    let intelligence;
    try {
      const payload = await loadOperationsCommandCenterData(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId }
      );
      const execModel = buildExecutiveInterventionModel(payload, { tenantId: ctx.tenantId });
      intelligence = buildExecutiveIntelligenceModel({
        payload,
        opsModel: execModel,
        tenantId: ctx.tenantId,
        interventionQueues: execModel.interventionQueues,
      });
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Executive Intelligence",
          step: "model.build",
          actual: err?.message || String(err),
          rootCauseGuess: "Executive intelligence model failed to build",
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Executive Intelligence",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    const { driftSignals, agents, trendStrips, reliability, escalationInsights } = intelligence;

    const driftIds = new Set();
    let duplicateDrift = false;
    for (const d of driftSignals) {
      if (driftIds.has(d.id)) duplicateDrift = true;
      driftIds.add(d.id);
      if (!VALID_TRENDS.has(d.trend)) {
        entries.push(
          createPredatorEntry({
            status: "FAIL",
            module: "Executive Intelligence",
            step: "drift.trend_valid",
            actual: { id: d.id, trend: d.trend },
            rootCauseGuess: "Invalid drift trend value",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    }
    entries.push(
      createPredatorEntry({
        status: duplicateDrift ? "FAIL" : "PASS",
        module: "Executive Intelligence",
        step: "drift.unique_ids",
        expected: "Unique drift card ids",
        actual: { count: driftSignals.length, duplicate: duplicateDrift },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    for (const strip of trendStrips) {
      if (!VALID_TRENDS.has(strip.trend)) {
        entries.push(
          createPredatorEntry({
            status: "FAIL",
            module: "Executive Intelligence",
            step: "trends.valid",
            actual: strip,
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    }
    entries.push(
      createPredatorEntry({
        status: trendStrips.length === 5 ? "PASS" : "WARN",
        module: "Executive Intelligence",
        step: "trends.strip_count",
        expected: 5,
        actual: trendStrips.length,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    scoreInRange(reliability.overall, "overall", entries, ctx);
    scoreInRange(reliability.executionReliability, "execution", entries, ctx);
    scoreInRange(reliability.collectionsDiscipline, "collections", entries, ctx);
    scoreInRange(reliability.fieldDiscipline, "field", entries, ctx);
    scoreInRange(reliability.interventionClosureHealth, "closure", entries, ctx);

    const avgAgent =
      agents.length > 0
        ? agents.reduce((s, a) => s + a.reliabilityScore, 0) / agents.length
        : null;
    const execGap =
      avgAgent != null && reliability.executionReliability != null
        ? Math.abs(avgAgent - reliability.executionReliability)
        : 0;
    entries.push(
      createPredatorEntry({
        status: execGap <= 35 ? "PASS" : "WARN",
        module: "Executive Intelligence",
        step: "reliability.consistency",
        expected: "Execution score aligned with agent reliability average",
        actual: { execution: reliability.executionReliability, avgAgent, gap: execGap },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    for (const a of agents) {
      scoreInRange(a.reliabilityScore, `agent.${a.name}`, entries, ctx);
      scoreInRange(a.pressureScore, `pressure.${a.name}`, entries, ctx);
    }

    const uiDrift = rendered?.driftCount ?? null;
    const apiDrift = driftSignals.length;
    entries.push(
      createPredatorEntry({
        status: uiDrift == null || uiDrift === apiDrift ? "PASS" : "WARN",
        module: "Executive Intelligence",
        step: "ui.drift_sync",
        expected: "UI drift count matches API",
        actual: { api: apiDrift, ui: uiDrift },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const uiReliability = rendered?.reliabilityOverall ?? null;
    entries.push(
      createPredatorEntry({
        status:
          uiReliability == null || uiReliability === reliability.overall ? "PASS" : "WARN",
        module: "Executive Intelligence",
        step: "ui.reliability_sync",
        expected: "UI reliability matches API",
        actual: { api: reliability.overall, ui: uiReliability },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const capturedAt = rendered?.intelligenceCapturedAt ?? null;
    const stale =
      capturedAt != null && Date.now() - capturedAt > STALE_MS && rendered?.intelligenceUiReady;
    entries.push(
      createPredatorEntry({
        status: stale ? "WARN" : "PASS",
        module: "Executive Intelligence",
        step: "ui.snapshot_freshness",
        expected: "Intelligence snapshot refreshed with UI",
        actual: { capturedAt, stale },
        rootCauseGuess: stale ? "Stale intelligence snapshot vs live model" : null,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Executive Intelligence",
        step: "deterministic.no_ai",
        expected: "Rule-based signals only",
        actual: {
          drift: driftSignals.length,
          agents: agents.length,
          escalations: escalationInsights.length,
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    return {
      module: "Executive Intelligence",
      summary: summarizePredatorEntries(entries),
      entries,
    };
  });
}
