import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { checkTenantConsistency } from "@/predator/predatorChecks.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { buildExecutiveInterventionModel } from "@/operations/executiveInterventionModel.js";
import { buildExecutiveOperationalTaskModel } from "@/operations/operationalTaskModel.js";
import { loadOperationalTaskRecords, TASK_STATES } from "@/operations/operationalTaskStateStore.js";
import { getAgentWorkspaceRead } from "@/api/primecareSupabaseApi.js";
import { buildAgentDailyWorkspaceModel } from "@/pages/agentDailyWorkspace.js";
import { buildAgentOperationalTaskModel } from "@/operations/operationalTaskModel.js";
import { ROLES } from "@/config/roles.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {object|null} [params.rendered]
 */
export async function validateOperationalTasksModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Operational Tasks", "validation.full", async () => {
    const entries = [];

    if (ctx.role === ROLES.LAB) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Operational Tasks",
          step: "role.access",
          rootCauseGuess: "Lab role does not access operational task queues",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Operational Tasks",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    const records = loadOperationalTaskRecords(ctx.tenantId);
    const invalidStates = Object.values(records).filter(
      (r) => r.resolutionStatus && !TASK_STATES.includes(r.resolutionStatus)
    );
    entries.push(
      createPredatorEntry({
        status: invalidStates.length === 0 ? "PASS" : "FAIL",
        module: "Operational Tasks",
        step: "workflow.state_consistency",
        actual: { invalid: invalidStates.length },
        severity: "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (ctx.role === ROLES.AGENT) {
      try {
        const wsRes = await getAgentWorkspaceRead(
          currentUser || { role: ctx.role, id: ctx.userId, tenantId: ctx.tenantId }
        );
        const model = buildAgentDailyWorkspaceModel(wsRes.data || {});
        const taskModel = buildAgentOperationalTaskModel(
          { actionQueue: model.actionQueue },
          ctx.tenantId,
          {
            agentId: currentUser?.agentId || ctx.userId,
            agentName: currentUser?.agentName || currentUser?.name || "",
          },
          {}
        );
        const uiActive = rendered?.activeTaskCount ?? null;
        const apiActive = taskModel.active?.length ?? 0;
        entries.push(
          createPredatorEntry({
            status: uiActive == null || Math.abs(apiActive - uiActive) <= 5 ? "PASS" : "WARN",
            module: "Operational Tasks",
            step: "agent.queue_sync",
            actual: { api: apiActive, ui: uiActive },
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );

        const stale = (taskModel.active || []).filter(
          (t) => t.overdue && t.resolutionStatus !== "COMPLETED"
        );
        entries.push(
          createPredatorEntry({
            status: stale.length === 0 ? "PASS" : "WARN",
            module: "Operational Tasks",
            step: "agent.stale_tasks",
            actual: { staleCount: stale.length },
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      } catch (err) {
        entries.push(
          createPredatorEntry({
            status: "FAIL",
            module: "Operational Tasks",
            step: "agent.model_build",
            actual: err?.message || String(err),
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    } else {
      try {
        const payload = await resolvePredatorOpsPayload(
          currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
          opsPayload
        );
        const execModel = buildExecutiveInterventionModel(payload, { tenantId: ctx.tenantId });
        const taskModel = buildExecutiveOperationalTaskModel(
          execModel.interventionQueues,
          ctx.tenantId,
          payload
        );

        const linked = (taskModel.allTasks || []).filter((t) => t.linkedInterventionId);
        const orphanTasks = linked.filter(
          (t) =>
            !(execModel.interventionQueues?.allIssues || []).some(
              (i) => i.id === t.linkedInterventionId
            )
        );
        entries.push(
          createPredatorEntry({
            status: orphanTasks.length === 0 ? "PASS" : "WARN",
            module: "Operational Tasks",
            step: "intervention.linkage",
            actual: { linked: linked.length, orphan: orphanTasks.length },
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );

        const clusterSum = (taskModel.clusters || []).reduce((s, c) => s + (c.count || 0), 0);
        const clusterOk =
          clusterSum === 0 ||
          clusterSum + (taskModel.singles?.length || 0) <= (taskModel.active?.length || 0) + 2;
        entries.push(
          createPredatorEntry({
            status: clusterOk ? "PASS" : "WARN",
            module: "Operational Tasks",
            step: "queue.cluster_counts",
            actual: {
              clusters: taskModel.clusters?.length ?? 0,
              members: clusterSum,
              singles: taskModel.singles?.length ?? 0,
            },
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );

        const uiActive = rendered?.activeTaskCount ?? null;
        const apiActive = taskModel.active?.length ?? 0;
        if (uiActive != null) {
          entries.push(
            createPredatorEntry({
              status: Math.abs(apiActive - uiActive) <= 4 ? "PASS" : "WARN",
              module: "Operational Tasks",
              step: "ui.active_task_sync",
              actual: { api: apiActive, ui: uiActive },
              tenantId: ctx.tenantId,
              role: ctx.role,
              userId: ctx.userId,
            })
          );
        }

        const crossTenant = (payload.evidence || []).filter(
          (r) => r.tenantId && str(r.tenantId) !== str(ctx.tenantId)
        );
        entries.push(
          createPredatorEntry({
            status: crossTenant.length === 0 ? "PASS" : "FAIL",
            module: "Operational Tasks",
            step: "tenant.evidence_scope",
            actual: { crossTenant: crossTenant.length },
            severity: "high",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      } catch (err) {
        entries.push(
          createPredatorEntry({
            status: "FAIL",
            module: "Operational Tasks",
            step: "executive.model_build",
            actual: err?.message || String(err),
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    }

    const recordTenantIds = Object.values(records)
      .map((r) => r.tenantId)
      .filter(Boolean);
    if (recordTenantIds.length) {
      entries.push(
        ...checkTenantConsistency({
          module: "Operational Tasks",
          step: "store.tenant",
          ctx,
          profileTenantId: ctx.tenantId,
          rowTenantIds: recordTenantIds,
        })
      );
    }

    return {
      module: "Operational Tasks",
      summary: summarizePredatorEntries(entries),
      entries,
    };
  });
}
