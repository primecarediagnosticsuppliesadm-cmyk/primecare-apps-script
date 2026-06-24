/**
 * Executive Action Queue V1 — canonical item schema (Sprint 1A).
 * Workflow overlay keyed by queueItem.id in executiveInterventionStateStore.
 */

export const ACTION_QUEUE_SOURCE_MODULES = {
  QUALIFICATION: "qualification",
  CONTRACT_RENEWAL: "contract_renewal",
  COMMISSION: "commission",
  OWNERSHIP: "ownership",
};

export const ACTION_QUEUE_SEVERITY = {
  CRITICAL: "CRITICAL",
  ATTENTION: "ATTENTION",
  MONITORING: "MONITORING",
};

export const ACTION_PLAN_TYPES = {
  WORKFLOW: "workflow",
  WRITE: "write",
  NAVIGATE: "navigate",
};

/** @typedef {'workflow'|'write'|'navigate'} ActionPlanType */

/**
 * @typedef {object} ExecutiveActionPlan
 * @property {string} id
 * @property {string} label
 * @property {ActionPlanType} type
 * @property {string} action
 * @property {Record<string, unknown>} [payload]
 * @property {'primary'|'secondary'|'destructive'} [variant]
 */

/**
 * @typedef {object} ExecutiveActionQueueEntityRefs
 * @property {string} [labId]
 * @property {string} [labName]
 * @property {string} [tenantId]
 * @property {string} [distributorId]
 * @property {string} [contractId]
 * @property {string} [commissionEntryId]
 * @property {string} [agentKey]
 * @property {string} [periodYmd]
 */

/**
 * @typedef {object} ExecutiveActionQueueItem
 * @property {string} id
 * @property {string} sourceModule
 * @property {'CRITICAL'|'ATTENTION'|'MONITORING'} severity
 * @property {string} title
 * @property {string} summary
 * @property {string} subtitle
 * @property {string} recommendedAction
 * @property {string} [ageLabel]
 * @property {string} [owner]
 * @property {ExecutiveActionQueueEntityRefs} entityRefs
 * @property {number} impactScore
 * @property {number} revenueImpact
 * @property {number} urgencyScore
 * @property {number} ageScore
 * @property {number} severityScore
 * @property {number} [ageDays]
 * @property {string} [createdAt]
 * @property {string} [workflowState]
 * @property {boolean} [snoozed]
 * @property {object} [interventionRecord]
 * @property {ExecutiveActionPlan[]} actionPlan
 * @property {string} [clusterType]
 */

/**
 * @typedef {object} ExecutiveActionQueueModel
 * @property {ExecutiveActionQueueItem[]} items
 * @property {{ total: number, open: number, bySource: Record<string, number>, bySeverity: Record<string, number> }} counts
 * @property {string} generatedAt
 */

export function queueItemId(sourceModule, entityKey) {
  return `${String(sourceModule || "").trim()}:${String(entityKey || "").trim()}`;
}
