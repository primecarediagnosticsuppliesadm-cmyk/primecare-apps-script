/**
 * Deterministic operational task types (not generic PM tasks).
 */

export const OPERATIONAL_TASK_TYPES = [
  "COLLECTION_FOLLOW_UP",
  "QUALIFICATION_REVIEW",
  "MISSING_PROOF_REQUEST",
  "VISIT_REQUIRED",
  "LAB_REENGAGEMENT",
  "INVENTORY_VERIFICATION",
  "PAYMENT_CONFIRMATION",
  "REAGENT_FOLLOW_UP",
  "RISK_ESCALATION",
  "EXECUTIVE_REVIEW",
  "ORDER_FULFILLMENT_FOLLOW_UP",
];

export const TASK_TYPE_LABELS = {
  COLLECTION_FOLLOW_UP: "Collection follow-up",
  QUALIFICATION_REVIEW: "Qualification review",
  MISSING_PROOF_REQUEST: "Missing proof request",
  VISIT_REQUIRED: "Visit required",
  LAB_REENGAGEMENT: "Lab re-engagement",
  INVENTORY_VERIFICATION: "Inventory verification",
  PAYMENT_CONFIRMATION: "Payment confirmation",
  REAGENT_FOLLOW_UP: "Reagent follow-up",
  RISK_ESCALATION: "Risk escalation",
  EXECUTIVE_REVIEW: "Executive review",
  ORDER_FULFILLMENT_FOLLOW_UP: "Order fulfillment follow-up",
};

const CLUSTER_TO_TASK = {
  missing_proof: "MISSING_PROOF_REQUEST",
  stale_visit: "VISIT_REQUIRED",
  followup_delay: "COLLECTION_FOLLOW_UP",
  overdue_collection: "COLLECTION_FOLLOW_UP",
  pending_qualification: "QUALIFICATION_REVIEW",
  credit_hold: "RISK_ESCALATION",
  critical_stock: "INVENTORY_VERIFICATION",
  agent_inactivity: "LAB_REENGAGEMENT",
  delayed_order: "ORDER_FULFILLMENT_FOLLOW_UP",
  high_risk: "RISK_ESCALATION",
  other: "EXECUTIVE_REVIEW",
};

const AGENT_QUEUE_TO_TASK = {
  COLLECTION_DUE: "COLLECTION_FOLLOW_UP",
  OVERDUE_ACCOUNT: "COLLECTION_FOLLOW_UP",
  FOLLOW_UP_DUE: "COLLECTION_FOLLOW_UP",
  VISIT_DUE: "VISIT_REQUIRED",
  NO_VISIT: "VISIT_REQUIRED",
  CREDIT_RISK: "RISK_ESCALATION",
  QUALIFICATION_PENDING: "QUALIFICATION_REVIEW",
  ONBOARDING_PENDING: "QUALIFICATION_REVIEW",
  INACTIVE_LAB: "LAB_REENGAGEMENT",
  TASK: "COLLECTION_FOLLOW_UP",
};

function str(v) {
  return String(v ?? "").trim();
}

export function taskTypeFromCluster(clusterType) {
  return CLUSTER_TO_TASK[str(clusterType)] || "EXECUTIVE_REVIEW";
}

export function taskTypeFromAgentQueue(queueType) {
  return AGENT_QUEUE_TO_TASK[str(queueType).toUpperCase()] || "COLLECTION_FOLLOW_UP";
}

export function taskTypeFromInterventionIssue(issue) {
  if (issue?.clusterType) return taskTypeFromCluster(issue.clusterType);
  const blob = `${issue?.title} ${issue?.summary}`.toLowerCase();
  if (blob.includes("proof")) return "MISSING_PROOF_REQUEST";
  if (blob.includes("qualification")) return "QUALIFICATION_REVIEW";
  if (blob.includes("collection") || blob.includes("overdue")) return "COLLECTION_FOLLOW_UP";
  if (blob.includes("visit") || blob.includes("stale")) return "VISIT_REQUIRED";
  if (blob.includes("stock") || blob.includes("inventory")) return "INVENTORY_VERIFICATION";
  if (blob.includes("order")) return "ORDER_FULFILLMENT_FOLLOW_UP";
  if (blob.includes("payment")) return "PAYMENT_CONFIRMATION";
  if (blob.includes("reagent")) return "REAGENT_FOLLOW_UP";
  if (blob.includes("risk") || blob.includes("hold")) return "RISK_ESCALATION";
  return "EXECUTIVE_REVIEW";
}

export function agentPriorityToSeverity(priority) {
  const p = str(priority).toUpperCase();
  if (p === "CRITICAL") return "CRITICAL";
  if (p === "HIGH") return "ATTENTION";
  return "MONITORING";
}

export function interventionTaskId(interventionId) {
  return `task-int-${str(interventionId)}`;
}

export function agentQueueTaskId(queueItemId) {
  return `task-agent-${str(queueItemId)}`;
}
