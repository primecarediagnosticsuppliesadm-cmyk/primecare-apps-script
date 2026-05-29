import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { checkTenantConsistency } from "@/predator/predatorChecks.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { buildExecutiveInterventionModel } from "@/operations/executiveInterventionModel.js";
import { buildExecutiveOperationalTaskModel } from "@/operations/operationalTaskModel.js";
import { readOperationalLedger } from "@/operations/operationalEventLedger.js";
import { buildUnifiedOperationsFeedRows } from "@/operations/operationalEventTimeline.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";

/**
 * Deterministic pilot-readiness checklist (no AI).
 */
export async function validatePilotReadinessModule({ ctx, currentUser = null, opsPayload = null }) {
  return predatorTrace("Pilot Readiness", "validation.full", async () => {
    const entries = [];

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
      return finish(entries, ctx);
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
      return finish(entries, ctx);
    }

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

    const hasInventory = Array.isArray(payload.inventory) && payload.inventory.length > 0;
    entries.push(
      createPredatorEntry({
        status: hasInventory ? "PASS" : "INFO",
        module: "Pilot Readiness",
        step: "inventory.integrity",
        actual: { count: payload.inventory?.length ?? 0 },
        suggestedFix: hasInventory ? "" : "Optional for pilot: stock dashboard may be empty.",
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
      !payload.dashboard && !hasCollections && !hasInventory && (payload.visits || []).length === 0;
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

    if (ctx.role === ROLES.LAB) {
      entries.push(
        createPredatorEntry({
          status: "INFO",
          module: "Pilot Readiness",
          step: "role.lab",
          rootCauseGuess: "Lab role uses lab portal checks separately",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries, ctx);
  });
}

function finish(entries, ctx) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Pilot Readiness",
    summary: summarizePredatorEntries(polished),
    entries: polished,
  };
}
