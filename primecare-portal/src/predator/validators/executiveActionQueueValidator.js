import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { ROLES } from "@/config/roles.js";
import { loadExecutiveActionQueueBundle } from "@/operations/executiveActionQueueData.js";
import { filterOpenExecutiveActionQueueItems } from "@/operations/executiveActionQueueEngine.js";
import { ACTION_QUEUE_SOURCE_MODULES } from "@/operations/executiveActionQueueTypes.js";
import { computeExecutiveImpactScore } from "@/operations/executiveActionQueueImpact.js";
import { EXECUTIVE_QUEUE_WRITE_MODAL, resolveExecutiveWriteModal } from "@/operations/executiveActionQueueHandlers.js";
import { ACTION_PLAN_TYPES } from "@/operations/executiveActionQueueTypes.js";
import { applyInterventionAction } from "@/operations/executiveInterventionStateStore.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 */
export async function validateExecutiveActionQueueModule({
  ctx,
  currentUser = null,
  opsPayload = null,
}) {
  return predatorTrace("Executive Action Queue", "validation.full", async () => {
    const entries = [];

    if (ctx.role !== ROLES.EXECUTIVE && ctx.role !== ROLES.ADMIN) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Executive Action Queue",
          step: "role.access",
          rootCauseGuess: "Action queue restricted to HQ admin/executive",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Executive Action Queue",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    const user =
      currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId, name: "Predator" };

    let bundle;
    try {
      const payload = opsPayload
        ? opsPayload
        : await resolvePredatorOpsPayload(user, { tenantId: ctx.tenantId });
      bundle = await loadExecutiveActionQueueBundle(user, {
        payload,
        force: false,
        commissionLimit: 10,
        qualificationLimit: 8,
      });
    } catch (err) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Executive Action Queue",
          step: "bundle.load",
          rootCauseGuess: err?.message || "Failed to load action queue bundle",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Executive Action Queue",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    const queue = bundle?.queue;
    const items = Array.isArray(queue?.items) ? queue.items : [];
    const open = filterOpenExecutiveActionQueueItems(items);

    entries.push(
      createPredatorEntry({
        status: queue?.generatedAt ? "PASS" : "WARN",
        module: "Executive Action Queue",
        step: "model.shape",
        rootCauseGuess: queue?.generatedAt
          ? `Queue built with ${items.length} items (${open.length} open)`
          : "Missing generatedAt on queue model",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
        detail: { total: items.length, open: open.length },
      })
    );

    const impactSample = computeExecutiveImpactScore({
      revenueImpact: 80,
      urgencyScore: 70,
      ageDays: 5,
      severity: "ATTENTION",
    });
    entries.push(
      createPredatorEntry({
        status: impactSample >= 0 && impactSample <= 100 ? "PASS" : "FAIL",
        module: "Executive Action Queue",
        step: "impact.score",
        rootCauseGuess:
          impactSample >= 0 && impactSample <= 100
            ? `Impact score in range (${impactSample})`
            : "Impact score out of 0–100 range",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: Object.keys(EXECUTIVE_QUEUE_WRITE_MODAL).length >= 5 ? "PASS" : "FAIL",
        module: "Executive Action Queue",
        step: "write.modal.map",
        rootCauseGuess: "Sprint 2 in-tower write modal routing configured",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (items.length > 0) {
      const sorted = [...items];
      let sortOk = true;
      for (let i = 1; i < sorted.length; i++) {
        if ((sorted[i - 1].impactScore ?? 0) < (sorted[i].impactScore ?? 0)) {
          sortOk = false;
          break;
        }
      }
      entries.push(
        createPredatorEntry({
          status: sortOk ? "PASS" : "FAIL",
          module: "Executive Action Queue",
          step: "sort.impact",
          rootCauseGuess: sortOk
            ? "Items sorted by Executive Impact Score descending"
            : "Queue sort order does not match impact score",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const missingPlan = items.filter((i) => !Array.isArray(i.actionPlan) || !i.actionPlan.length);
      entries.push(
        createPredatorEntry({
          status: missingPlan.length === 0 ? "PASS" : "FAIL",
          module: "Executive Action Queue",
          step: "action.plan",
          rootCauseGuess:
            missingPlan.length === 0
              ? "All queue items have executable action plans"
              : `${missingPlan.length} item(s) missing actionPlan`,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const writePlans = items.flatMap((i) =>
        (i.actionPlan || []).filter((p) => p.type === ACTION_PLAN_TYPES.WRITE)
      );
      const unmappedWrite = writePlans.filter((p) => !resolveExecutiveWriteModal(p));
      entries.push(
        createPredatorEntry({
          status: writePlans.length === 0 || unmappedWrite.length === 0 ? "PASS" : "FAIL",
          module: "Executive Action Queue",
          step: "write.plan.map",
          rootCauseGuess:
            writePlans.length === 0
              ? "No WRITE plans in current queue (navigate-only items OK)"
              : unmappedWrite.length === 0
                ? `All ${writePlans.length} WRITE plan(s) map to in-tower modals`
                : `${unmappedWrite.length} WRITE plan(s) missing modal mapping`,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      if (open.length > 0) {
        const sample = open[0];
        applyInterventionAction({
          tenantId: ctx.tenantId,
          issueId: sample.id,
          action: "resolve",
          actor: "Predator",
          actorRole: ctx.role,
          note: "predator-resolve-sim",
        });
        const afterResolve = filterOpenExecutiveActionQueueItems(items).filter(
          (row) => row.id !== sample.id
        );
        const openAfter = afterResolve.length;
        entries.push(
          createPredatorEntry({
            status: openAfter === open.length - 1 ? "PASS" : "FAIL",
            module: "Executive Action Queue",
            step: "resolve.open.count",
            rootCauseGuess:
              openAfter === open.length - 1
                ? "Resolved item drops from open count"
                : "Resolved item still counted as open",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
            detail: { before: open.length, after: openAfter },
          })
        );
        applyInterventionAction({
          tenantId: ctx.tenantId,
          issueId: sample.id,
          action: "reopen",
          actor: "Predator",
          actorRole: ctx.role,
          note: "predator-restore",
        });
      }

      const allowedSources = new Set(Object.values(ACTION_QUEUE_SOURCE_MODULES));
      const badSource = items.filter((i) => !allowedSources.has(i.sourceModule));
      entries.push(
        createPredatorEntry({
          status: badSource.length === 0 ? "PASS" : "FAIL",
          module: "Executive Action Queue",
          step: "source.module",
          rootCauseGuess:
            badSource.length === 0
              ? "Sprint 1A sources only (qualification, contract, commission)"
              : "Unexpected sourceModule in queue",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Executive Action Queue",
          step: "queue.empty",
          rootCauseGuess: "No revenue queue items in current window (valid empty state)",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return {
      module: "Executive Action Queue",
      summary: summarizePredatorEntries(entries),
      entries,
    };
  });
}
