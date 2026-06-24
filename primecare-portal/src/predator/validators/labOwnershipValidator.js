import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { supabase } from "@/api/supabaseClient.js";
import { getLabOwnershipRead } from "@/api/labOwnershipApi.js";
import { loadLabOwnershipMetricsBundle } from "@/operations/operationsCenterAdminData.js";
import { buildExecutiveActionQueue } from "@/operations/executiveActionQueueEngine.js";
import { ACTION_QUEUE_SOURCE_MODULES } from "@/operations/executiveActionQueueTypes.js";
import { buildAgentOwnershipSummary } from "@/operations/labOwnershipEngine.js";
import { ROLES } from "@/config/roles.js";

const MODULE = "Lab Ownership";

function str(v) {
  return String(v ?? "").trim();
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return { module: MODULE, entries: polished, summary: summarizePredatorEntries(polished) };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 */
export async function validateLabOwnershipModule({ ctx, currentUser = null }) {
  return predatorTrace(MODULE, "validation.full", async () => {
    const entries = [];
    const tenantId = str(ctx.tenantId);

    if (!supabase) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: MODULE,
          step: "ownership.table.exists",
          rootCauseGuess: "Supabase client unavailable",
          tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const tableProbe = await supabase.from("lab_ownership").select("id").limit(1);
    const tableExists = !/lab_ownership|relation.*does not exist/i.test(tableProbe.error?.message || "");
    entries.push(
      createPredatorEntry({
        status: tableExists ? "PASS" : "WARN",
        module: MODULE,
        step: "ownership.table.exists",
        expected: "lab_ownership table readable",
        actual: { error: tableProbe.error?.message || null },
        suggestedFix: tableExists ? undefined : "Run user_provisioning_phase3c_lab_ownership_migration.sql",
        tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (!tenantId) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: MODULE,
          step: "ownership.unassigned.count",
          rootCauseGuess: "No tenant on context",
          tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    const ownershipRes = await getLabOwnershipRead({ tenantId });
    const rows = ownershipRes.data?.rows || [];
    const activeRows = rows.filter((r) => str(r.status).toUpperCase() === "ACTIVE");
    const dupCheck = new Map();
    let duplicateActive = false;
    for (const row of activeRows) {
      const key = str(row.labId).toLowerCase();
      if (dupCheck.has(key)) duplicateActive = true;
      dupCheck.set(key, (dupCheck.get(key) || 0) + 1);
    }

    entries.push(
      createPredatorEntry({
        status: duplicateActive ? "FAIL" : "PASS",
        module: MODULE,
        step: "ownership.active.unique",
        expected: "At most one ACTIVE ownership row per lab_id",
        actual: { activeCount: activeRows.length, duplicateActive },
        tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const bundle = await loadLabOwnershipMetricsBundle(tenantId);
    const metrics = bundle.ownershipMetrics || {};
    entries.push(
      createPredatorEntry({
        status: metrics.unassignedLabs > 0 ? "WARN" : "PASS",
        module: MODULE,
        step: "ownership.unassigned.count",
        expected: "Unassigned labs tracked for ops attention",
        actual: {
          totalLabs: metrics.totalLabs,
          unassignedLabs: metrics.unassignedLabs,
          ownedLabs: metrics.ownedLabs,
        },
        tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const foreignTenant = "00000000-0000-0000-0000-000000000099";
    const crossRes = await supabase
      .from("lab_ownership")
      .select("id, tenant_id")
      .eq("tenant_id", foreignTenant)
      .limit(5);
    const crossLeak = (crossRes.data || []).length > 0;
    entries.push(
      createPredatorEntry({
        status: crossRes.error ? "WARN" : crossLeak ? "FAIL" : "PASS",
        module: MODULE,
        step: "ownership.cross_tenant_access",
        expected: "No lab_ownership rows visible for foreign tenant_id",
        actual: { leakCount: (crossRes.data || []).length, error: crossRes.error?.message || null },
        issueClass: "tenant_isolation",
        tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const ownershipEvents = (await import("@/api/userProvisioningApi.js")).getUserProvisioningEventsRead;
    const auditRes = await ownershipEvents({ tenantId, limit: 100 });
    const events = auditRes?.data?.events || [];
    const ownershipAudit = events.filter((e) =>
      /ownership_/i.test(str(e.event_type))
    );
    entries.push(
      createPredatorEntry({
        status: auditRes.error ? "WARN" : ownershipAudit.length > 0 || events.length === 0 ? "PASS" : "INFO",
        module: MODULE,
        step: "ownership.audit.events",
        expected: "Ownership audit events when writes occur",
        actual: { ownershipEventCount: ownershipAudit.length, totalEvents: events.length },
        tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const queue = buildExecutiveActionQueue({
      ownershipMetrics: metrics,
      directoryUsers: bundle.directoryUsers,
      tenantId,
      payload: {},
      contracts: [],
      pendingCommissions: [],
    });
    const ownershipItems = (queue.items || []).filter(
      (i) => i.sourceModule === ACTION_QUEUE_SOURCE_MODULES.OWNERSHIP
    );
    entries.push(
      createPredatorEntry({
        status: ownershipItems.length > 0 || metrics.unassignedLabs === 0 ? "PASS" : "WARN",
        module: MODULE,
        step: "ownership.executive.queue",
        expected: "Executive queue ingests ownership risk when gaps exist",
        actual: { ownershipQueueCount: ownershipItems.length, unassigned: metrics.unassignedLabs },
        tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (str(ctx.role) === ROLES.AGENT && currentUser) {
      const summary = buildAgentOwnershipSummary({
        agentId: currentUser.agentId || currentUser.agent_id,
        enrichedLabs: metrics.enrichedLabs || [],
        pendingCollections: [],
      });
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: MODULE,
          step: "ownership.agent.dashboard",
          expected: "Agent ownership summary computable",
          actual: { assignedLabCount: summary.assignedLabCount },
          tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: MODULE,
          step: "ownership.agent.dashboard",
          rootCauseGuess: "Agent dashboard ownership probe applies to agent role only",
          actual: { role: ctx.role, skipped: true },
          tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries);
  });
}
