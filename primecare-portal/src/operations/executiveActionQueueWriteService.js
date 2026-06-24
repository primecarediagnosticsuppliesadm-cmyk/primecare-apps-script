import {
  appendOperationalEvent,
  emitInterventionLedgerEvent,
} from "@/operations/operationalEventBridge.js";
import { invalidateOperationsCommandCenterCache } from "@/operations/operationsCommandCenterLoader.js";
import { applyInterventionAction } from "@/operations/executiveInterventionStateStore.js";
import { syncTaskFromInterventionAction } from "@/operations/operationalTaskModel.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * After a successful queue write: ledger event, cache bust, resolve intervention, refresh.
 */
export async function finalizeExecutiveQueueWrite({
  tenantId,
  currentUser,
  queueItem,
  summary,
  eventType = "ops",
  sourceModule = "executive_action_queue",
  metadata = {},
  onRefresh,
}) {
  const actor = str(currentUser?.name || currentUser?.email || "Executive");
  const actorRole = str(currentUser?.role || "executive");

  if (tenantId && queueItem?.id) {
    applyInterventionAction({
      tenantId,
      issueId: queueItem.id,
      action: "resolve",
      actor,
      actorRole,
      note: summary,
    });
    syncTaskFromInterventionAction({
      tenantId,
      issue: queueItem,
      action: "resolve",
      actor,
    });
    try {
      await emitInterventionLedgerEvent({
        tenantId,
        issue: queueItem,
        action: "resolve",
        actor,
        actorRole,
        assignTo: "",
      });
    } catch (err) {
      console.warn("[Action Queue] intervention ledger emit failed", err);
    }
  }

  if (tenantId) {
    invalidateOperationsCommandCenterCache(tenantId);
    try {
      await appendOperationalEvent({
        tenantId,
        eventType,
        actor,
        actorRole,
        sourceModule,
        linkedLabId: str(queueItem?.entityRefs?.labId),
        linkedEntityId:
          str(queueItem?.entityRefs?.contractId) ||
          str(queueItem?.entityRefs?.commissionEntryId) ||
          str(queueItem?.id),
        metadata: {
          summary,
          queueItemId: queueItem?.id,
          sourceModule: queueItem?.sourceModule,
          ...metadata,
        },
        severity: queueItem?.severity || "ATTENTION",
      });
    } catch (err) {
      console.warn("[Action Queue] operational event append failed", err);
    }
  }

  if (onRefresh) {
    await onRefresh(true);
  }

  return { success: true };
}
