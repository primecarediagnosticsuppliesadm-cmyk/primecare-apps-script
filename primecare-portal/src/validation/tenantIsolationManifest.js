import { ROLES } from "@/config/roles.js";

/**
 * Operational tables/views for Phase 2 tenant + role isolation probes.
 * Read-only diagnostics — does not mutate schema or RLS.
 *
 * @typedef {Object} TenantIsolationTableSpec
 * @property {string} id
 * @property {string} table
 * @property {string} label
 * @property {string} tenantColumn
 * @property {string[]} selectColumns
 * @property {string[]} allowedRoles — roles that may legitimately read rows
 * @property {'tenant_wide'|'agent_scoped'|'lab_scoped'|'admin_only'} scope
 * @property {boolean} [optional] — probe failure is WARN not FAIL
 * @property {boolean} [notificationsFoundation] — skip or INFO until foundation migration + env flag
 * @property {boolean} [executiveCrossTenantReadable] — executive may read rows for any public.tenants id
 */

/** @type {TenantIsolationTableSpec[]} */
export const TENANT_ISOLATION_TABLE_SPECS = [
  {
    id: "labs",
    table: "v_labs_credit",
    label: "Labs (credit view)",
    tenantColumn: "tenant_id",
    // Keep projection minimal: this view does not reliably expose assignment columns.
    selectColumns: ["tenant_id", "lab_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.AGENT, ROLES.LAB],
    scope: "agent_scoped",
    optional: false,
    executiveCrossTenantReadable: true,
  },
  {
    id: "orders",
    table: "orders",
    label: "Orders",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "lab_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.LAB, ROLES.AGENT],
    scope: "lab_scoped",
    executiveCrossTenantReadable: true,
  },
  {
    id: "order_lines",
    table: "order_lines",
    label: "Order lines",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.LAB],
    scope: "tenant_wide",
    optional: true,
  },
  {
    id: "payments",
    table: "payments",
    label: "Payments",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "lab_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.LAB, ROLES.AGENT],
    scope: "lab_scoped",
    executiveCrossTenantReadable: true,
  },
  {
    id: "invoices",
    table: "invoices",
    label: "Invoices",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "lab_id", "order_id", "invoice_number", "status"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.LAB, ROLES.AGENT],
    scope: "lab_scoped",
    optional: true,
    executiveCrossTenantReadable: true,
  },
  {
    id: "invoice_line_items",
    table: "invoice_line_items",
    label: "Invoice line items",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "invoice_id", "order_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.LAB, ROLES.AGENT],
    scope: "lab_scoped",
    optional: true,
    executiveCrossTenantReadable: true,
  },
  {
    id: "invoice_payment_allocations",
    table: "invoice_payment_allocations",
    label: "Invoice payment allocations",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "payment_id", "invoice_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.LAB, ROLES.AGENT],
    scope: "lab_scoped",
    optional: true,
    executiveCrossTenantReadable: true,
  },
  {
    id: "collections",
    table: "ar_credit_control",
    label: "Collections / AR",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "lab_id", "lab_name"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.AGENT, ROLES.LAB],
    scope: "agent_scoped",
    executiveCrossTenantReadable: true,
  },
  {
    id: "inventory",
    table: "inventory",
    label: "Inventory",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "product_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.AGENT],
    scope: "tenant_wide",
    executiveCrossTenantReadable: true,
  },
  {
    id: "inventory_ledger",
    table: "inventory_ledger",
    label: "Inventory ledger",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "admin_only",
    optional: true,
  },
  {
    id: "purchase_orders",
    table: "purchase_orders",
    label: "Purchase orders",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "admin_only",
    optional: true,
  },
  {
    id: "purchase_order_items",
    table: "purchase_order_items",
    label: "Purchase order items",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "admin_only",
    optional: true,
  },
  {
    id: "qualifications",
    table: "lab_qualifications",
    label: "Lab qualifications",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "lab_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "admin_only",
    executiveCrossTenantReadable: true,
  },
  {
    id: "lab_contracts",
    table: "lab_contracts",
    label: "Lab commercial contracts",
    tenantColumn: "distributor_id",
    selectColumns: ["distributor_id", "lab_id", "contract_number", "status"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "admin_only",
    optional: true,
    executiveCrossTenantReadable: true,
  },
  {
    id: "distributor_billing_payments",
    table: "distributor_billing_payments",
    label: "Distributor platform billing payments",
    tenantColumn: "distributor_id",
    selectColumns: ["distributor_id", "payment_type", "amount", "payment_date"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "admin_only",
    optional: true,
    executiveCrossTenantReadable: true,
  },
  {
    id: "commission_entries",
    table: "commission_entries",
    label: "Commission entries",
    tenantColumn: "distributor_id",
    selectColumns: ["distributor_id", "period_ymd", "agent_key", "status", "commission_amount"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "admin_only",
    optional: true,
    executiveCrossTenantReadable: true,
  },
  {
    id: "commission_payouts",
    table: "commission_payouts",
    label: "Commission payouts",
    tenantColumn: "distributor_id",
    selectColumns: ["distributor_id", "period_ymd", "total_commission", "status"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "admin_only",
    optional: true,
    executiveCrossTenantReadable: true,
  },
  {
    id: "visits",
    table: "agent_visits",
    label: "Agent visits",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "lab_id", "agent_id", "agent_name"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.AGENT],
    scope: "agent_scoped",
  },
  {
    id: "profiles",
    table: "profiles",
    label: "Profiles / users",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "user_id", "role"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "tenant_wide",
    optional: true,
  },
  {
    id: "notification_events",
    table: "notification_events",
    label: "Notification events",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "event_type", "target_lab_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "tenant_wide",
    optional: true,
    notificationsFoundation: true,
  },
  {
    id: "notification_templates",
    table: "notification_templates",
    label: "Notification templates",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "event_type", "channel"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "tenant_wide",
    optional: true,
    notificationsFoundation: true,
  },
  {
    id: "notification_preferences",
    table: "notification_preferences",
    label: "Notification preferences",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "user_id", "event_type", "channel"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "tenant_wide",
    optional: true,
    notificationsFoundation: true,
  },
  {
    id: "notification_delivery_log",
    table: "notification_delivery_log",
    label: "Notification delivery log",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "channel", "status"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE],
    scope: "tenant_wide",
    optional: true,
    notificationsFoundation: true,
  },
];

/**
 * Columns required to validate tenant isolation in-browser.
 * Timestamps vary by table/view; tenant isolation must not WARN purely due to missing updated_at.
 */
export const TENANT_TABLE_REQUIRED_COLUMNS = ["tenant_id"];

/** Optional schema hints (WARN only if missing and table is expected to have them). */
export const TENANT_TABLE_OPTIONAL_COLUMNS = ["created_at", "updated_at"];
