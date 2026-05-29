import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { checkTenantConsistency } from "@/predator/predatorChecks.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { buildExecutiveInterventionModel } from "@/operations/executiveInterventionModel.js";
import { INTERVENTION_STATES } from "@/operations/executiveInterventionStateStore.js";
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
export async function validateExecutiveInterventionModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  return predatorTrace("Executive Intervention", "validation.full", async () => {
    const entries = [];

    if (ctx.role === ROLES.LAB || ctx.role === ROLES.AGENT) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Executive Intervention",
          step: "role.access",
          rootCauseGuess: "Executive workspace restricted to admin/executive roles",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Executive Intervention",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    let model;
    try {
      const payload = await resolvePredatorOpsPayload(
        currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
        opsPayload
      );
      model = buildExecutiveInterventionModel(payload, { tenantId: ctx.tenantId });
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Executive Intervention",
          step: "model.build",
          actual: err?.message || String(err),
          rootCauseGuess: "Executive intervention model failed to build",
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Executive Intervention",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    const apiPriorities = model.priorities?.length ?? 0;
    const apiFounder = model.founderQueue?.length ?? 0;
    const apiFeed = model.feed?.length ?? 0;
    const uiPriorities = rendered?.prioritiesCount ?? null;
    const uiFounder = rendered?.founderQueueCount ?? null;
    const uiFeed = rendered?.feedCount ?? null;

    const queueOk =
      uiPriorities == null || Math.abs(apiPriorities - uiPriorities) <= 3;
    entries.push(
      createPredatorEntry({
        status: queueOk ? "PASS" : "WARN",
        module: "Executive Intervention",
        step: "queue.priorities_consistency",
        expected: "UI priority count near API model",
        actual: { api: apiPriorities, ui: uiPriorities },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const founderOk =
      uiFounder == null || Math.abs(apiFounder - uiFounder) <= 2;
    entries.push(
      createPredatorEntry({
        status: founderOk ? "PASS" : "WARN",
        module: "Executive Intervention",
        step: "queue.founder_consistency",
        actual: { api: apiFounder, ui: uiFounder },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const feedIds = new Set((model.feed || []).map((r) => r.id));
    const feedOrdered =
      (model.feed || []).length < 2 ||
      Date.parse(model.feed[0]?.createdAt || "") >=
        Date.parse(model.feed[model.feed.length - 1]?.createdAt || "");
    entries.push(
      createPredatorEntry({
        status: feedOrdered && feedIds.size === (model.feed || []).length ? "PASS" : "WARN",
        module: "Executive Intervention",
        step: "feed.ordering",
        expected: "Feed sorted newest-first without duplicate ids",
        actual: {
          count: apiFeed,
          ordered: feedOrdered,
          unique: feedIds.size,
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const staleEscalations = (model.founderQueue || []).filter((item) => {
      const age = str(item.escalationAge);
      return age.includes("d") && parseInt(age, 10) >= 30;
    });
    entries.push(
      createPredatorEntry({
        status: staleEscalations.length === 0 ? "PASS" : "WARN",
        module: "Executive Intervention",
        step: "escalation.stale_detection",
        actual: { staleCount: staleEscalations.length },
        rootCauseGuess:
          staleEscalations.length === 0
            ? "No 30d+ founder escalations in sample"
            : "Long-running escalations may need review",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const crossTenantEvidence = (model.payload?.evidence || []).filter(
      (r) => r.tenantId && str(r.tenantId) !== str(ctx.tenantId)
    );
    entries.push(
      createPredatorEntry({
        status: crossTenantEvidence.length === 0 ? "PASS" : "FAIL",
        module: "Executive Intervention",
        step: "tenant.evidence_scope",
        actual: { crossTenant: crossTenantEvidence.length },
        severity: "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const collectionTenantIds = (model.payload?.collections || [])
      .map((c) => c.tenantId || c.tenant_id)
      .filter(Boolean);
    if (collectionTenantIds.length) {
      entries.push(
        ...checkTenantConsistency({
          module: "Executive Intervention",
          step: "collections.tenant",
          ctx,
          profileTenantId: ctx.tenantId,
          rowTenantIds: collectionTenantIds,
        })
      );
    }

    entries.push(
      createPredatorEntry({
        status: (model.healthStrip || []).length >= 5 ? "PASS" : "WARN",
        module: "Executive Intervention",
        step: "health.strip_hydration",
        actual: { tiles: (model.healthStrip || []).length },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const iq = model.interventionQueues || {};
    const clusterMemberSum = (iq.clusters || []).reduce((s, c) => s + (c.count || 0), 0);
    const clusterCountOk =
      clusterMemberSum === 0 ||
      clusterMemberSum + (iq.singles?.length || 0) <= (model.priorities?.length || 0) + 5;
    entries.push(
      createPredatorEntry({
        status: clusterCountOk ? "PASS" : "WARN",
        module: "Executive Intervention",
        step: "queue.cluster_counts",
        expected: "Grouped cluster member counts align with priority pool",
        actual: {
          clusters: (iq.clusters || []).length,
          clusterMembers: clusterMemberSum,
          singles: iq.singles?.length ?? 0,
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const invalidStates = (iq.allIssues || []).filter(
      (i) => i.workflowState && !INTERVENTION_STATES.includes(i.workflowState)
    );
    entries.push(
      createPredatorEntry({
        status: invalidStates.length === 0 ? "PASS" : "FAIL",
        module: "Executive Intervention",
        step: "workflow.state_consistency",
        actual: { invalid: invalidStates.length },
        severity: "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const escalatedFirst = (iq.founderActive || []).length < 2 || (iq.founderActive || [])[0]?.workflowState === "ESCALATED" || (iq.founderActive || [])[0]?.severity === "CRITICAL";
    entries.push(
      createPredatorEntry({
        status: escalatedFirst ? "PASS" : "WARN",
        module: "Executive Intervention",
        step: "queue.escalation_ordering",
        rootCauseGuess: "Founder queue should surface critical/escalated items first",
        actual: {
          topState: (iq.founderActive || [])[0]?.workflowState,
          topSeverity: (iq.founderActive || [])[0]?.severity,
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const staleUnresolved = (iq.allIssues || []).filter(
      (i) =>
        i.workflowState !== "RESOLVED" &&
        i.ageDays >= 30 &&
        !["WAITING", "RESOLVED"].includes(i.workflowState)
    );
    entries.push(
      createPredatorEntry({
        status: staleUnresolved.length === 0 ? "PASS" : "WARN",
        module: "Executive Intervention",
        step: "workflow.stale_unresolved",
        actual: { staleCount: staleUnresolved.length },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const uiActive = rendered?.activeInterventionCount ?? null;
    const apiActive =
      (iq.singles?.length ?? 0) +
      (iq.clusters || []).reduce((s, c) => s + (c.count || 0), 0);
    if (uiActive != null) {
      entries.push(
        createPredatorEntry({
          status: Math.abs(apiActive - uiActive) <= 4 ? "PASS" : "WARN",
          module: "Executive Intervention",
          step: "ui.active_intervention_sync",
          actual: { api: apiActive, ui: uiActive },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (uiFeed != null && apiFeed > 0 && uiFeed === 0) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Executive Intervention",
          step: "ui.feed_hydration",
          actual: { apiFeed, uiFeed },
          rootCauseGuess: "UI feed count stale — refresh executive workspace",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Executive Intervention",
          step: "drawer.payload_ready",
          rootCauseGuess: "Ops payload available for executive drilldown drawer",
          actual: {
            labs: (model.payload?.collections || []).length,
            visits: (model.payload?.visits || []).length,
            evidence: (model.payload?.evidence || []).length,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return {
      module: "Executive Intervention",
      summary: summarizePredatorEntries(entries),
      entries,
    };
  });
}
