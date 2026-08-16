# 01 — Database Schema

Supabase `public` schema. Inspect `supabase/migrations/`, `supabase/sql/`, and `primecare_public_schema.sql` before assuming columns exist on an environment.

**Legend — RLS:** Yes = policies in pilot migration + patches. **R/W** = typical authenticated role access (UI + RLS combined).

---

## tenants

| Attribute | Value |
|-----------|-------|
| **Purpose** | Distributor / HQ workspace registry |
| **Module** | Operations / Executive |
| **PK** | `id` (uuid) |
| **Business key** | `tenant_code` (unique) |
| **Required** | `tenant_name`, `status` |
| **Optional** | `legal_name`, `country`, `state`, `timezone`, `metadata` |
| **Relationships** | Parent of all `tenant_id` FKs |
| **Constraints** | UNIQUE `tenant_code` |
| **RLS** | Yes — executive/admin |
| **Read** | executive, admin (ops) |
| **Write** | executive |

---

## profiles

| Attribute | Value |
|-----------|-------|
| **Purpose** | Auth user → PrimeCare role, tenant, lab/agent scope |
| **Module** | Operations Center |
| **PK** | `user_id` → auth.users |
| **Business key** | one per auth user |
| **Required** | `user_id`, `role`, `tenant_id` |
| **Optional** | `lab_id`, `agent_id`, `display_name`, `email`, `distributor_id`, `active`, `username` |
| **Relationships** | `tenant_id` → tenants |
| **RLS** | Yes — tenant-scoped |
| **Read** | self + ops roles |
| **Write** | provisioning APIs (ops) |

---

## labs

| Attribute | Value |
|-----------|-------|
| **Purpose** | Customer lab master |
| **Module** | Labs |
| **PK** | `id` (uuid) |
| **Business key** | `(tenant_id, lab_id)` |
| **Required** | `tenant_id`, `lab_id`, `lab_name` |
| **Optional** | `owner_name`, `phone`, `area`, `assigned_agent_id`, `status`, `credit_terms`, `ordering_mode` |
| **Relationships** | → orders, AR, qualifications, ownership |
| **RLS** | Yes — lab visibility |
| **Read** | agent (visible), lab (own), admin, executive |
| **Write** | admin, executive, distributor create policies |

---

## lab_ownership

| Attribute | Value |
|-----------|-------|
| **Purpose** | Agent ownership slots per lab |
| **Module** | Operations |
| **PK** | `id` (uuid) |
| **Business key** | one ACTIVE per `(tenant_id, lab_id)` |
| **Required** | `tenant_id`, `lab_id`, `status` |
| **Optional** | `primary_agent_id`, `secondary_agent_id`, `manager_id` |
| **RLS** | Yes — ops tenant |
| **Read** | admin, executive |
| **Write** | admin, executive |

---

## orders

| Attribute | Value |
|-----------|-------|
| **Purpose** | **Financial order SoT** |
| **Module** | Orders / Lab Ordering |
| **PK** | `id` (uuid) |
| **Business key** | `order_id` text; UNIQUE `(tenant_id, order_id)` |
| **Required** | `tenant_id`, `order_id`, `lab_id`, `status`, `total_amount` |
| **Optional** | `fulfilled_at`, `invoice_id`, `client_request_id`, delivery columns (Phase 3A), flags |
| **Relationships** | → invoice, lines, shipment, ledger |
| **RLS** | Yes — lab visibility |
| **Read** | lab (own), agent, admin, executive |
| **Write** | lab insert; admin/executive status update |

---

## order_items

| Attribute | Value |
|-----------|-------|
| **Purpose** | Line items (portal / legacy path) |
| **Module** | Orders |
| **PK** | `id` (uuid) |
| **Business key** | `order_item_id` (when migrated) |
| **Join** | `order_id` → orders.order_id (text, no FK) |
| **Required** | `order_id`, `product_id`, `quantity` |
| **RLS** | Yes — via lab/order |
| **Read/Write** | same as parent order |

---

## order_lines

| Attribute | Value |
|-----------|-------|
| **Purpose** | Normalized lines for invoice/fulfill RPCs |
| **Module** | Orders |
| **PK** | `id` (uuid) |
| **Join** | `(tenant_id, order_id)` |
| **Required** | `tenant_id`, `order_id`, `product_id`, `quantity` |
| **RLS** | Yes — via parent order |
| **Note** | Coexists with order_items — detail reads try both |

---

## invoices

| Attribute | Value |
|-----------|-------|
| **Purpose** | One billing doc per fulfilled order |
| **Module** | Finance |
| **PK** | `id` (uuid) |
| **Business key** | `invoice_number`; UNIQUE `(tenant_id, order_id)` |
| **Required** | `tenant_id`, `lab_id`, `order_id`, `invoice_number`, `total_amount`, `status` |
| **Status** | draft, sent, partially_paid, paid, cancelled, failed |
| **RLS** | Yes — select authenticated; writes via RPC |
| **Read** | lab (own), ops roles |
| **Write** | RPC / service patterns |

---

## invoice_line_items

| Attribute | Value |
|-----------|-------|
| **Purpose** | Immutable invoice line snapshot |
| **Module** | Finance |
| **PK** | `id` (uuid) |
| **FK** | `invoice_id` → invoices |
| **RLS** | Yes |
| **Read** | invoice detail, PDF generation **only this table** |

---

## payments

| Attribute | Value |
|-----------|-------|
| **Purpose** | Collection receipts |
| **Module** | Collections |
| **PK** | `id` (uuid) |
| **Business key** | `payment_id`; UNIQUE `(tenant_id, payment_id)` |
| **Required** | `tenant_id`, `payment_id`, `lab_id`, `amount_received` |
| **Optional** | `order_id`, `mode`, `agent_id` |
| **Rule** | **No invoice_id column** |
| **RLS** | Yes |
| **Read** | lab (own), agent, admin |
| **Write** | agent insert, admin, RPC |

---

## invoice_payment_allocations

| Attribute | Value |
|-----------|-------|
| **Purpose** | **Canonical invoice payment application** |
| **Module** | Finance |
| **PK** | `id` (uuid) |
| **Join** | `payment_id` (text), `invoice_id` (uuid) |
| **RLS** | Yes |
| **Write** | `allocate_payment_to_invoice` RPC |

---

## ar_credit_control

| Attribute | Value |
|-----------|-------|
| **Purpose** | **Canonical collections outstanding per lab** |
| **Module** | Collections / Credit |
| **PK** | `id` (uuid) |
| **Business key** | `(tenant_id, lab_id)` |
| **Required** | `outstanding`, `credit_limit`, `credit_hold` |
| **RLS** | Yes |
| **Read** | lab (own), agent, admin |
| **Write** | fulfill bump, payment RPC, admin |

---

## inventory

| Attribute | Value |
|-----------|-------|
| **Purpose** | Current stock per product per tenant |
| **Module** | Inventory |
| **PK** | `id` (uuid) |
| **Business key** | `(tenant_id, product_id)` |
| **Constraint** | `current_stock >= 0` |
| **RLS** | Yes |
| **Read** | admin, executive, lab (catalog) |
| **Write** | admin, executive; fulfill/PO RPCs |

---

## inventory_ledger

| Attribute | Value |
|-----------|-------|
| **Purpose** | Stock movement audit |
| **Module** | Inventory |
| **PK** | `id` (uuid) |
| **Key fields** | `movement_type`, `order_id`, `quantity`, `stock_before/after` |
| **RLS** | Yes |
| **Write** | ORDER_OUT on fulfill, PURCHASE_IN on PO receive |

---

## purchase_orders / purchase_order_items

| Attribute | Value |
|-----------|-------|
| **Purpose** | HQ procurement |
| **Module** | Purchase |
| **Business key** | `po_id` |
| **RLS** | Yes — ops |
| **Write** | admin, executive (freeze-aware) |

---

## lab_qualifications

| Attribute | Value |
|-----------|-------|
| **Purpose** | Sales qualification + pipeline per lab |
| **Module** | Qualification Review |
| **PK** | `id` (uuid) |
| **Business key** | `(tenant_id, lab_id)` |
| **RLS** | Yes — lab visibility |

---

## agent_visits

| Attribute | Value |
|-----------|-------|
| **Purpose** | Field visit log |
| **Module** | Agent Visits |
| **PK** | `id` (uuid) |
| **Business key** | `visit_id` (text — no unique DB constraint) |
| **Follow-up** | `next_follow_up_date`, `next_follow_up_type`, `next_action`, `follow_up_required` |
| **RLS** | Yes — agent work + lab visibility |

---

## lab_product_intelligence

| Attribute | Value |
|-----------|-------|
| **Purpose** | Incumbent purchasing mix (N product lines per lab) |
| **Module** | Agent Visits — Products & Purchasing step |
| **PK** | `id` (uuid) |
| **Cardinality** | labs 1 : N product lines |
| **RLS** | Yes — lab visibility; agent write when lab visible |

---

## order_shipments

| Attribute | Value |
|-----------|-------|
| **Purpose** | **Operational delivery SoT** |
| **Module** | Logistics |
| **PK** | `shipment_id` (text) |
| **Business key** | `(tenant_id, order_id)` unique |
| **Required** | `dispatch_status` (default ready_for_dispatch) |
| **RLS** | Yes — ops; agent assigned |
| **Read** | admin, executive, assigned agent |
| **Write** | admin, executive |

---

## shipment_status_events

| Attribute | Value |
|-----------|-------|
| **Purpose** | Shipment transition audit |
| **Module** | Logistics |
| **PK** | `event_id` (uuid) |
| **FK** | `shipment_id` CASCADE |
| **RLS** | Yes |

---

## logistics_couriers

| Attribute | Value |
|-----------|-------|
| **Purpose** | Courier directory |
| **Module** | Logistics Phase 2 |
| **PK** | `courier_id` (text) |
| **RLS** | Yes — ops CRUD |

---

## logistics_warehouses

| Attribute | Value |
|-----------|-------|
| **Purpose** | Warehouse registry for route planning |
| **Module** | Logistics Phase 4 |
| **PK** | `warehouse_id` (text) |
| **Unique** | `(tenant_id, warehouse_code)` |
| **RLS** | Yes — ops CRUD |

---

## delivery_routes

| Attribute | Value |
|-----------|-------|
| **Purpose** | Operational delivery route plan |
| **Module** | Logistics Phase 4 |
| **PK** | `id` (uuid) |
| **Business key** | `(tenant_id, route_code)` unique |
| **Fields** | `route_name`, `warehouse_id`, `delivery_day`, `vehicle_type`, `capacity`, `active`, `route_status`, `courier_id`, `planned_date` |
| **RLS** | Yes — ops CRUD |
| **Finance** | **None** |

---

## delivery_route_shipments

| Attribute | Value |
|-----------|-------|
| **Purpose** | Shipment stop on a route with sequence |
| **Module** | Logistics Phase 4 |
| **PK** | `id` (uuid) |
| **FK** | `route_id` → `delivery_routes`, `shipment_id` → `order_shipments` |
| **Unique** | one route per shipment (`shipment_id` unique) |
| **Fields** | `sequence_number`, `planned_delivery_time` |
| **RLS** | Yes — ops via route tenant |

---

## labs.preferred_delivery_day (Phase 4)

| Attribute | Value |
|-----------|-------|
| **Purpose** | Lab preferred delivery day for route planning groups |
| **Values** | `mon` … `sun` or NULL |
| **Module** | Logistics / Operations Center lab profile |

---

## tenant_delivery_policy

| Attribute | Value |
|-----------|-------|
| **Purpose** | Tenant delivery charge defaults (Phase 3A + policy foundation) |
| **Module** | Logistics |
| **PK** | `tenant_id` |
| **Defaults** | policy_type `standard`, ₹150 standard, ₹5000 free threshold |
| **RLS** | Yes — ops |

---

## notification_events (+ templates, preferences, delivery_log)

| Table | Purpose | RLS |
|-------|---------|-----|
| notification_events | In-app event log | Yes |
| notification_templates | Message templates | Yes |
| notification_preferences | User prefs | Yes |
| notification_delivery_log | Delivery audit | Yes |

---

## compensation / payroll tables (Phase 3A foundation)

Phase 3A creates the schema, lifecycle constraints, RLS helpers/policies, attribution snapshot infrastructure, and audit/event infrastructure. Phase 3B adds the preview-only calculation service and draft preview persistence. Phase 3C completes backend payroll-domain workflow: approve/reject/lock/export/pay evidence, adjustment records, immutable lock guards, and RBAC domain services. No accounting entry, bank payout, GL posting, disbursement record, Finance/O2C mutation, dashboard, or payroll UI page exists in Phase 3C.

| Table | Purpose | RLS expectation |
|-------|---------|-----------------|
| compensation_plans | Versioned salary, allowance, commission, promotion, bonus, and incentive rules | Executive full; HR draft/support; admin read/recommend; no lab/distributor ownership |
| compensation_plan_assignments | Profile-primary employee-to-plan effective-dated history | Executive/HR manage; agent own read after lock/export |
| payroll_periods | Monthly payroll window and lifecycle state | Executive approve/lock/export; HR preview/submit |
| payroll_runs | Payroll run header, status, totals, approval/lock/export state | Executive full; HR preview/submit; admin read/recommend |
| payroll_run_lines | Employee-level salary, allowances, cash-only commission (agent role), incentives, adjustments, net payable; `profile_user_id` primary, `employee_name`/`employee_role` denormalized | Executive/HR scoped; agent own locked/exported history only |
| compensation_commission_entries | Cash-collected commission entries, or successor to existing commission_entries if migrated | Executive approval; HR preview; cash-only source |
| compensation_adjustments | Manual adjustments, penalties, and recoveries | Executive approval required |
| compensation_audit_events | Append-only compensation audit | Role-scoped read; no broad cross-agent exposure |
| compensation_approval_events | Approval/rejection/lock/export evidence | Executive-owned workflow audit |
| payroll_exports | Export metadata/checksum/storage reference | Executive export; HR no export without approval |
| compensation_attribution_snapshots | Payment/lab/agent/ownership/rule/source snapshot evidence | Executive/HR/Admin scoped; agent own snapshot visibility only |

Payroll tables are derived from operational SoT and must not mutate `orders`, `invoices`, `payments`, `invoice_payment_allocations`, `ar_credit_control`, inventory, logistics, or accounting records. Commission must be based on `payments` cash actually collected only. See [19_Executive_Compensation_Payroll_Engine.md](./19_Executive_Compensation_Payroll_Engine.md).

Phase 3B preview rows must remain `draft`. `payroll_runs.metadata`, `payroll_run_lines.calculation_snapshot`, and `compensation_commission_entries.metadata` carry `plan_id`, `plan_version`, `rule_version`, and `calculated_at` for versioning. Approval events and export rows are not created by preview calculation.

Phase 3C allows payroll statuses `draft`, `previewed`, `submitted`, `approved`, `locked`, `exported`, `paid`, and `void`. `paid` is payroll-domain evidence only and must not insert/update `payments`, AR, invoices, allocations, orders, inventory, logistics, GL, bank, or disbursement tables. Locked/exported/paid payroll details are immutable; reopen creates a new draft run version.

---

## Audit / access (no single `audit` table)

| Table | Purpose | RLS |
|-------|---------|-----|
| user_provisioning_events | Provisioning audit | Yes |
| lab_assignment_history | Agent transfer history | Yes |
| operational_evidence | Evidence metadata | Yes |
| event_log | Generic events | Yes — **no policies** (gap) |
| commission_entries | Existing commission ledger (not payroll SoT after Phase 1 compensation Blueprint) | Yes |
| compensation_audit_events | HQ compensation/payroll audit foundation | Yes |

---

## Views (read-only)

| View | Use |
|------|-----|
| v_labs_credit | Labs + AR |
| v_lab_catalog | Lab ordering catalog |
| v_stock_dashboard | Inventory health |
| v_reorder_candidates | Reorder forecast |

---

## Domain projections (read-only)

| Projection | Domain | Grain | Source-of-truth inputs | RLS |
|------------|--------|-------|------------------------|-----|
| `proj_order_v1` | Orders | `(tenant_id, order_id)` | `orders`, line counts, lab display | Yes — lab visibility |
| `proj_lab_receivable_v1` | Collections | `(tenant_id, lab_id)` | `ar_credit_control`, `payments` | Yes — lab visibility |
| `proj_lab_profile_v1` | Laboratory | `(tenant_id, lab_id)` | `labs`, `lab_ownership`, `lab_qualifications`, tenant/profile display fields | Yes — lab visibility |
| tenant metric projections | Dashboard / Executive | `tenant_id` | Domain projections | Yes — tenant/executive scope |

`proj_lab_profile_v1` is read-only and owns only lab identity/profile/ownership/qualification/ordering display fields. It must not own invoices, payments, receivables, allocations, commissions, order status, or finance calculations. Labs list adapters compose it with `proj_lab_receivable_v1` when credit fields are needed.

---

## Migration index

| File | Domain |
|------|--------|
| 20260624120000–001 | Profiles RLS, order indexes |
| 20260624120002–005 | Invoice phases 1–5 |
| 20260624130000–003 | Sprint 1 transaction RPCs |
| 20260628120000 | Shipments Phase 1A |
| 20260630120000 | Couriers Phase 2 |
| 20260701120000 | Delivery charges Phase 3A |
| 20260703120000 | Lab ordering governance (`ordering_mode`) |
| 20260703120001 | Delivery policy foundation (`policy_type` + flags) |
| 20260704120000 | Logistics Phase 4 route planning |

Full manual SQL: `supabase/sql/` (52 files).
