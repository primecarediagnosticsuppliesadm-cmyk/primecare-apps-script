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
| **Optional** | `owner_name`, `phone`, `area`, `assigned_agent_id`, `status`, `credit_terms` |
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
| **RLS** | Yes — agent work + lab visibility |

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

## tenant_delivery_policy

| Attribute | Value |
|-----------|-------|
| **Purpose** | Tenant delivery charge defaults (Phase 3A) |
| **Module** | Logistics |
| **PK** | `tenant_id` |
| **Defaults** | ₹150 standard, ₹5000 free threshold |
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

## Audit / access (no single `audit` table)

| Table | Purpose | RLS |
|-------|---------|-----|
| user_provisioning_events | Provisioning audit | Yes |
| lab_assignment_history | Agent transfer history | Yes |
| operational_evidence | Evidence metadata | Yes |
| event_log | Generic events | Yes — **no policies** (gap) |
| commission_entries | Commission ledger (≠ lab payments) | Yes |

---

## Views (read-only)

| View | Use |
|------|-----|
| v_labs_credit | Labs + AR |
| v_lab_catalog | Lab ordering catalog |
| v_stock_dashboard | Inventory health |
| v_reorder_candidates | Reorder forecast |

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

Full manual SQL: `supabase/sql/` (52 files).
