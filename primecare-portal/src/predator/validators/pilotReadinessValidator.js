import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { checkTenantConsistency, resolveExecutiveRegisteredTenantIds, executiveCrossTenantOpts } from "@/predator/predatorChecks.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { buildExecutiveInterventionModel } from "@/operations/executiveInterventionModel.js";
import { buildExecutiveOperationalTaskModel } from "@/operations/operationalTaskModel.js";
import { readOperationalLedger } from "@/operations/operationalEventLedger.js";
import { buildUnifiedOperationsFeedRows } from "@/operations/operationalEventTimeline.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import {
  buildPilotReadinessModel,
  loadPilotReadinessData,
  PILOT_READINESS_GATES,
  readinessBandFromScore,
  validatePilotReadinessModelConsistency,
} from "@/readiness/pilotReadinessEngine.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Pilot Readiness",
    summary: summarizePredatorEntries(polished),
    entries: polished,
  };
}

function pushCenterStep(entries, ctx, step, valid, expected, actual, empty = false) {
  entries.push(
    createPredatorEntry({
      status: valid ? "PASS" : empty ? "WARN" : "FAIL",
      module: "Pilot Readiness",
      step,
      expected,
      actual: empty ? "No pilot readiness model data" : actual,
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    })
  );
}

async function validatePilotReadinessCenterModel({ ctx, currentUser, rendered = null, entries }) {
  let model = rendered?.pilotReadiness || null;
  const empty = !model;

  if (!model && currentUser && ctx.role === ROLES.EXECUTIVE) {
    try {
      const data = await loadPilotReadinessData(currentUser);
      model = buildPilotReadinessModel(data);
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Pilot Readiness",
          step: "readiness.model_load",
          actual: err?.message,
          suggestedFix: "Open Pilot Readiness and ensure portfolio data loads.",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return false;
    }
  }

  if (!model) return false;

  const consistency = validatePilotReadinessModelConsistency(model);
  const score = num(model.overallScore ?? model.readinessScore);
  const band = model.overallBand || model.readinessBand;

  pushCenterStep(
    entries,
    ctx,
    "readiness.gates_loaded",
    consistency.gatesLoaded,
    `${PILOT_READINESS_GATES.length} readiness gates with valid status`,
    { gateCount: model.gateBreakdown?.length ?? 0 },
    empty
  );

  pushCenterStep(
    entries,
    ctx,
    "readiness.score_valid",
    consistency.scoreValid,
    "Readiness score 0–100 with matching band",
    { readinessScore: score, readinessBand: band },
    empty
  );

  pushCenterStep(
    entries,
    ctx,
    "readiness.distributor_rollup_valid",
    consistency.distributorRollupValid,
    "Portfolio score matches distributor rollup average",
    {
      overallScore: score,
      distributorCount: model.distributors?.length ?? 0,
    },
    empty
  );

  pushCenterStep(
    entries,
    ctx,
    "readiness.blockers_valid",
    consistency.blockersValid,
    "Blocking issues array present",
    { blockerCount: model.blockers?.length ?? 0 },
    empty
  );

  pushCenterStep(
    entries,
    ctx,
    "readiness.band_valid",
    consistency.bandValid && band === readinessBandFromScore(score),
    "Readiness band matches score thresholds",
    { readinessBand: band, expectedBand: readinessBandFromScore(score) },
    empty
  );

  return true;
}

/**
 * Pilot Readiness — center model consistency (executive) + legacy ops checklist.
 */
export async function validatePilotReadinessModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Pilot Readiness", "validation.full", async () => {
    const entries = [];

    if (ctx.role !== ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Pilot Readiness",
          step: "role.access",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const centerValidated = await validatePilotReadinessCenterModel({
      ctx,
      currentUser,
      rendered,
      entries,
    });

    if (centerValidated && rendered?.pilotReadinessCenter) {
      return finish(entries);
    }

    if (!ctx.tenantId) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Pilot Readiness",
          step: "auth.tenant",
          suggestedFix: "Sign in with a tenant-scoped profile before pilot operations.",
          rootCauseGuess: "Missing tenant on session",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Pilot Readiness",
        step: "auth.tenant",
        actual: ctx.tenantId,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    let payload;
    try {
      payload = await resolvePredatorOpsPayload(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        opsPayload
      );
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Pilot Readiness",
          step: "ops.payload",
          actual: err?.message,
          suggestedFix: "Reload Operations Command Center; check Supabase connectivity.",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const registeredTenantIds = await resolveExecutiveRegisteredTenantIds(ctx);
    const collectionTenantIds = (payload.collections || [])
      .map((c) => c.tenantId || c.tenant_id)
      .filter(Boolean);
    if (collectionTenantIds.length) {
      entries.push(
        ...checkTenantConsistency({
          module: "Pilot Readiness",
          step: "tenant.isolation",
          ctx,
          profileTenantId: ctx.tenantId,
          rowTenantIds: collectionTenantIds,
          ...executiveCrossTenantOpts(ctx, registeredTenantIds),
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "INFO",
          module: "Pilot Readiness",
          step: "tenant.isolation",
          actual: "No collection rows to verify",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const hasCollections = Array.isArray(payload.collections) && payload.collections.length > 0;
    entries.push(
      createPredatorEntry({
        status: hasCollections ? "PASS" : "WARN",
        module: "Pilot Readiness",
        step: "collections.integrity",
        expected: "Collections AR rows available",
        actual: { count: payload.collections?.length ?? 0 },
        suggestedFix: hasCollections ? "" : "Import or sync AR data before collections pilot.",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const evidence = payload.evidence || [];
    const localOnly = evidence.filter((e) => e.storageBackend === "local_embedded").length;
    entries.push(
      createPredatorEntry({
        status: localOnly > evidence.length * 0.5 && evidence.length > 0 ? "WARN" : "PASS",
        module: "Pilot Readiness",
        step: "evidence.storage",
        actual: { total: evidence.length, localOnly },
        suggestedFix:
          localOnly > 0
            ? "Run operational evidence storage migration for durable proof."
            : "",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const execModel = buildExecutiveInterventionModel(payload, { tenantId: ctx.tenantId });
    const queues = execModel.interventionQueues || {};
    const taskModel = buildExecutiveOperationalTaskModel(queues, ctx.tenantId, payload);
    const taskWithIntervention = (taskModel.allTasks || []).filter((t) => t.linkedInterventionId);
    entries.push(
      createPredatorEntry({
        status: taskWithIntervention.length > 0 || (queues.allIssues || []).length === 0 ? "PASS" : "WARN",
        module: "Pilot Readiness",
        step: "intervention.task_linkage",
        actual: {
          interventions: queues.allIssues?.length ?? 0,
          tasksLinked: taskWithIntervention.length,
        },
        suggestedFix: "Open Control Tower to sync intervention-derived tasks.",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const feed = buildUnifiedOperationsFeedRows({
      tenantId: ctx.tenantId,
      opsFeed: execModel.feed || [],
      payload,
      limit: 28,
    });
    const feedIds = new Set();
    let dupFeed = 0;
    for (const row of feed) {
      if (feedIds.has(row.id)) dupFeed += 1;
      feedIds.add(row.id);
    }
    entries.push(
      createPredatorEntry({
        status: dupFeed === 0 ? "PASS" : "WARN",
        module: "Pilot Readiness",
        step: "feed.integrity",
        actual: { rows: feed.length, duplicateIds: dupFeed },
        suggestedFix: dupFeed ? "Clear ledger backfill duplicates; refresh Control Tower." : "",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const ledger = readOperationalLedger(ctx.tenantId);
    const times = ledger.map((e) => Date.parse(e.event_timestamp || e.timestamp || "")).filter(Boolean);
    let chronoOk = true;
    for (let i = 1; i < times.length; i++) {
      if (times[i] > times[i - 1]) chronoOk = false;
    }
    entries.push(
      createPredatorEntry({
        status: chronoOk || ledger.length < 2 ? "PASS" : "WARN",
        module: "Pilot Readiness",
        step: "audit.chronological",
        actual: { events: ledger.length },
        suggestedFix: chronoOk ? "" : "Ledger read sort normalization should order newest-first.",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const staleRisk =
      !payload.dashboard && !hasCollections && (payload.visits || []).length === 0;
    entries.push(
      createPredatorEntry({
        status: staleRisk ? "WARN" : "PASS",
        module: "Pilot Readiness",
        step: "data.stale_detection",
        issueClass: staleRisk ? "empty_snapshot" : undefined,
        actual: {
          visits: payload.visits?.length ?? 0,
          collections: payload.collections?.length ?? 0,
        },
        suggestedFix: staleRisk
          ? "Tenant may have no operational data yet — confirm seed/migration, not a UI bug."
          : "",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    return finish(entries);
  });
}
