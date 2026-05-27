/** @readonly */
export const NOTIFICATION_EVENT_TYPES = [
  "order_created",
  "order_fulfilled",
  "payment_received",
  "collection_due",
  "credit_hold_triggered",
  "low_stock",
  "purchase_order_created",
  "purchase_order_received",
  "agent_visit_logged",
  "qualification_updated",
];

/** @readonly */
export const NOTIFICATION_CHANNELS = [
  "in_app",
  "email_placeholder",
  "whatsapp_placeholder",
  "sms_placeholder",
];

/** Channels that must never perform live external delivery in this foundation phase. */
export const PLACEHOLDER_CHANNELS = [
  "email_placeholder",
  "whatsapp_placeholder",
  "sms_placeholder",
];

/** @readonly */
export const NOTIFICATION_SEVERITIES = ["info", "low", "medium", "high", "critical"];

/** @readonly */
export const NOTIFICATION_EVENT_STATUSES = ["pending", "read", "acknowledged", "archived"];

/** @readonly */
export const NOTIFICATION_DELIVERY_STATUSES = [
  "placeholder_not_sent",
  "logged_in_app",
  "skipped",
  "failed",
];

export const NOTIFICATION_SOURCE_MODULES = [
  "orders",
  "collections",
  "inventory",
  "purchase_orders",
  "agent_visits",
  "qualification",
  "system",
];
