import { persistHqNavContext } from "@/operations/hqGlobalSearchEngine.js";
import { ACTION_PLAN_TYPES } from "@/operations/executiveActionQueueTypes.js";

function str(v) {
  return String(v ?? "").trim();
}

/** WRITE plan.action → modal key for in-tower execution (Sprint 2). */
export const EXECUTIVE_QUEUE_WRITE_MODAL = {
  open_qualification_review: "qualification",
  advance_qualification_pipeline: "qualification",
  review_qualification: "qualification",
  renew_lab_contract: "contract_renewal",
  mark_contract_under_review: "contract_renewal",
  open_contract_renewal: "contract_renewal",
  approve_commission: "commission",
};

/**
 * @param {import('@/operations/executiveActionQueueTypes.js').ExecutiveActionPlan} plan
 * @returns {'qualification'|'contract_renewal'|'commission'|null}
 */
export function resolveExecutiveWriteModal(plan) {
  if (!plan || plan.type !== ACTION_PLAN_TYPES.WRITE) return null;
  return EXECUTIVE_QUEUE_WRITE_MODAL[str(plan.action)] || null;
}

/**
 * Execute a queue action plan.
 * WRITE actions open in-tower modals (Sprint 2); NAVIGATE still routes to pages.
 *
 * @returns {{ handled: boolean, type?: string, message?: string, modal?: string, item?: object }}
 */
export function executeExecutiveActionPlan({
  plan,
  item,
  setActivePage,
  onWorkflowAction,
  onOpenWriteModal,
}) {
  if (!plan?.type || !plan?.action) {
    return { handled: false, message: "Invalid action plan" };
  }

  if (plan.type === ACTION_PLAN_TYPES.WORKFLOW) {
    onWorkflowAction?.(plan.action, item);
    return { handled: true, type: "workflow" };
  }

  if (plan.type === ACTION_PLAN_TYPES.WRITE) {
    const modal = resolveExecutiveWriteModal(plan);
    if (modal && onOpenWriteModal) {
      onOpenWriteModal(modal, item);
      return { handled: true, type: "write_modal", modal };
    }
  }

  if (plan.type === ACTION_PLAN_TYPES.NAVIGATE) {
    const page = str(plan.action);
    const payload = plan.payload || {};
    const refs = item?.entityRefs || {};

    const context = {
      page,
      source: "executive_action_queue",
      queueItemId: item?.id,
      ...refs,
      ...payload,
    };

    if (page === "qualificationReview") {
      context.labId = str(payload.labId || refs.labId);
      context.focusLabId = context.labId;
    }
    if (page === "labContractEngine") {
      context.contractId = str(payload.contractId || refs.contractId);
      context.distributorId = str(payload.distributorId || refs.distributorId);
      context.renewalIntent = true;
    }
    if (page === "commissionEngine") {
      context.distributorId = str(payload.distributorId || refs.distributorId);
      context.periodYmd = str(payload.periodYmd || refs.periodYmd);
      context.commissionEntryId = str(payload.entryId || refs.commissionEntryId);
    }
    if (page === "operationsCenter") {
      context.tab = str(payload.tab);
      context.labId = str(payload.labId || refs.labId);
      context.openAssignDrawer = Boolean(payload.openAssignDrawer);
      context.tenantId = str(payload.tenantId || refs.tenantId);
      context.labTenantId = str(payload.labTenantId || refs.distributorId);
    }

    persistHqNavContext(context);
    setActivePage?.(page);
    return { handled: true, type: "navigate" };
  }

  return { handled: false, message: "Unknown action type" };
}
