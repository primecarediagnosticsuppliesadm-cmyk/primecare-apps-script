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
 */

/** @type {TenantIsolationTableSpec[]} */
export const TENANT_ISOLATION_TABLE_SPECS = [
  {
    id: "labs",
    table: "v_labs_credit",
    label: "Labs (credit view)",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "lab_id", "agent_id", "agent_name", "assigned_agent_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.AGENT, ROLES.LAB],
    scope: "agent_scoped",
    optional: false,
  },
  {
    id: "orders",
    table: "orders",
    label: "Orders",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "lab_id", "order_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.LAB, ROLES.AGENT],
    scope: "lab_scoped",
  },
  {
    id: "order_lines",
    table: "order_lines",
    label: "Order lines",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "order_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.LAB],
    scope: "tenant_wide",
    optional: true,
  },
  {
    id: "payments",
    table: "payments",
    label: "Payments",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "lab_id", "payment_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.LAB, ROLES.AGENT],
    scope: "lab_scoped",
  },
  {
    id: "collections",
    table: "ar_credit_control",
    label: "Collections / AR",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "lab_id", "lab_name"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.AGENT, ROLES.LAB],
    scope: "agent_scoped",
  },
  {
    id: "inventory",
    table: "inventory",
    label: "Inventory",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "product_id"],
    allowedRoles: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.AGENT],
    scope: "tenant_wide",
  },
  {
    id: "inventory_ledger",
    table: "inventory_ledger",
    label: "Inventory ledger",
    tenantColumn: "tenant_id",
    selectColumns: ["tenant_id", "product_id"],
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
];

/** Columns expected on tenant-scoped operational tables (schema awareness). */
export const TENANT_TABLE_REQUIRED_COLUMNS = [
  "tenant_id",
  "created_at",
  "updated_at",
];
