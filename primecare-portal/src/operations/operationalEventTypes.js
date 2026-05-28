/**
 * Normalized operational event types (append-only ledger).
 */

export const OPERATIONAL_EVENT_TYPES = [
  "visit_logged",
  "proof_uploaded",
  "collection_recorded",
  "order_created",
  "order_fulfilled",
  "qualification_updated",
  "intervention_created",
  "intervention_escalated",
  "intervention_resolved",
  "intervention_acknowledged",
  "task_created",
  "task_assigned",
  "task_completed",
  "task_escalated",
  "escalation_created",
  "escalation_acknowledged",
  "payment_received",
  "inventory_adjusted",
  "reorder_triggered",
  "event_corrected",
];

export const EVENT_TYPE_LABELS = {
  visit_logged: "Visit logged",
  proof_uploaded: "Proof uploaded",
  collection_recorded: "Collection recorded",
  order_created: "Order created",
  order_fulfilled: "Order fulfilled",
  qualification_updated: "Qualification updated",
  intervention_created: "Intervention created",
  intervention_escalated: "Intervention escalated",
  intervention_resolved: "Intervention resolved",
  intervention_acknowledged: "Intervention acknowledged",
  task_created: "Task created",
  task_assigned: "Task assigned",
  task_completed: "Task completed",
  task_escalated: "Task escalated",
  escalation_created: "Escalation created",
  escalation_acknowledged: "Escalation acknowledged",
  payment_received: "Payment received",
  inventory_adjusted: "Inventory adjusted",
  reorder_triggered: "Reorder triggered",
  event_corrected: "Correction recorded",
};

/** Maps operational types → notification_events.event_type when durable sync is possible. */
export const NOTIFICATION_EVENT_MAP = {
  visit_logged: "agent_visit_logged",
  order_created: "order_created",
  order_fulfilled: "order_fulfilled",
  payment_received: "payment_received",
  collection_recorded: "collection_due",
  qualification_updated: "qualification_updated",
  reorder_triggered: "purchase_order_created",
  inventory_adjusted: "low_stock",
};

export const ENTITY_TYPES = [
  "intervention",
  "task",
  "lab",
  "visit",
  "evidence",
  "collection",
  "order",
  "agent",
  "inventory",
];
