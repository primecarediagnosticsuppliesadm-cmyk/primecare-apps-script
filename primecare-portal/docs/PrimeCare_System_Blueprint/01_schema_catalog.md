# 01 — Schema Catalog

Major tables and objects in PrimeCare QA/Prod Supabase (`public` schema).  
**Owner module** = primary business owner in the portal codebase.

---

## Schema layers

| Layer | Location | Notes |
|-------|----------|-------|
| Baseline dump | `primecare_public_schema.sql` | Core ERP CREATE TABLE |
| Manual SQL | `supabase/sql/*.sql` | RLS, features, patches |
| Migrations | `supabase/migrations/*.sql` | 13 formal migrations (Jun–Jul 2026) |

---

## Core identity & tenancy

### `tenants`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Distributor / HQ workspace registry |
| **Owner module** | Operations / Executive |
| **PK** | `id` (uuid) |
| **Business key** | `tenant_code` (unique) |
| **Required** | `tenant_name`, `status` |
| **Optional** | `legal_name`, `country`, `state`, `timezone`, `metadata` (jsonb) |
| **Indexes** | PK |
| **Unique** | `tenant_code` |
| **RLS** | Yes — executive/admin select/write |
| **Relationships** | Parent of virtually all `tenant_id` FKs |

### `profiles`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Supabase Auth → PrimeCare identity (role, tenant, lab/agent scope) |
| **Owner module** | Operations Center |
| **PK** | `user_id` (uuid) → `auth.users(id)` CASCADE |
| **Business key** | One row per auth user |
| **Required** | `user_id`, `role`, `tenant_id` |
| **Optional** | `lab_id`, `agent_id`, `agent_name`, `display_name`, `email`, `phone`, `username`, `distributor_id`, `territory`, `active`, `last_login_at` |
| **Indexes** | `idx_profiles_tenant_role`, `idx_profiles_lab_id`, `idx_profiles_agent_id`, partial unique on `lower(username)` |
| **Unique** | `user_id`; partial unique `username` |
| **RLS** | Yes — tenant-scoped select/insert/update/delete; executive cross-tenant |
| **Relationships** | `tenant_id` → tenants; `distributor_id` → tenants |

### `users` (legacy)
| Attribute | Value |
|-----------|-------|
| **Purpose** | Legacy agent directory; backfill source for provisioning |
| **Owner module** | Operations Center |
| **PK** | `id` (uuid) |
| **Business key** | `user_code` / email |
| **RLS** | Yes (ops roles) |
| **Note** | Prefer `profiles` for new auth; `users` still used in directory backfill |

---

## Labs & commercial

### `labs`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Lab/customer master per distributor tenant |
| **Owner module** | Labs / Operations |
| **PK** | `id` (uuid) |
| **Business key** | `(tenant_id, lab_id)` unique — `lab_id` normalized `upper(trim())` |
| **Required** | `tenant_id`, `lab_id`, `lab_name` |
| **Optional** | `owner_name`, `phone`, `area`, `gst_number`, `credit_terms`, `status`, `assigned_agent_id`, `agent_id`, `agent_name`, `active` |
| **Indexes** | `idx_labs_tenant_lab`, `idx_labs_tenant_agent` |
| **RLS** | Yes — `labs_select_by_role`, admin write, distributor insert policies |
| **Relationships** | `tenant_id` → tenants; 1:1 AR row per lab; parent of orders scoped by `lab_id` |

### `ar_credit_control`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Per-lab AR ledger — **canonical for collections outstanding** |
| **Owner module** | Collections / Credit & Risk |
| **PK** | `id` (uuid) |
| **Business key** | `(tenant_id, lab_id)` unique |
| **Required** | `tenant_id`, `lab_id` |
| **Key fields** | `outstanding`, `total_delivered`, `total_paid`, `credit_limit`, `credit_hold`, `days_overdue`, `allowed_overdue_days`, `payment_status`, `collections_notes`, follow-up dates |
| **Indexes** | `idx_ar_credit_tenant_lab` |
| **RLS** | Yes — lab visibility select; ops/agent update; insert via RPC/policy |
| **Relationships** | Paired 1:1 with lab per tenant; surfaced in `v_labs_credit` view |

### `lab_ownership`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Durable agent ownership slots (primary/secondary/manager) per lab |
| **Owner module** | Operations Center |
| **PK** | `id` (uuid) |
| **Business key** | One ACTIVE row per `(tenant_id, lab_id)` |
| **Required** | `tenant_id`, `lab_id`, `status` |
| **Optional** | `primary_agent_id`, `secondary_agent_id`, `manager_id`, `assigned_at`, `assigned_by` |
| **Indexes** | `lab_ownership_active_unique_idx`, tenant/lab/agent indexes |
| **RLS** | Yes — ops read/write scoped to tenant |
| **Relationships** | Logical to `labs`; audit via `user_provisioning_events` |

### `lab_qualifications`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Sales qualification + pipeline per lab |
| **Owner module** | Qualification Review / Growth |
| **PK** | `id` (uuid) |
| **Business key** | `(tenant_id, lab_id)` unique |
| **Key fields** | Qualification scores, `founder_review_status`, pipeline stage/probability/expected value, follow-up dates |
| **Indexes** | tenant/lab, review, follow-up |
| **RLS** | Yes — same lab visibility as orders |
| **Relationships** | `tenant_id` → tenants; optional FK to labs |

### `lab_contracts`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Commercial contracts (L1B, Hybrid, etc.) — affects delivery charge waiver |
| **Owner module** | Lab Contract Engine |
| **PK** | `id` (uuid) |
| **Business key** | contract id per tenant |
| **RLS** | Yes |
| **Relationships** | `lab_id`; read by `deliveryChargeSupabaseApi` for L1B benefit |

---

## Orders & fulfillment

### `orders`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Lab sales orders — **financial SoT for order lifecycle** |
| **Owner module** | Orders / Lab Ordering |
| **PK** | `id` (uuid) |
| **Business key** | `order_id` (text) — unique per `(tenant_id, order_id)` |
| **Required** | `tenant_id`, `order_id`, `lab_id`, `status`, `total_amount` |
| **Optional** | `order_date`, `notes`, `status_notes`, `fulfilled_at`, `cancelled_at`, `inventory_updated`, `ar_posted`, `agent_id`, `invoice_id`, `client_request_id`, delivery charge columns (Phase 3A) |
| **Indexes** | `idx_orders_tenant_lab`, `idx_orders_tenant_order_date`, `idx_orders_status`, `orders_invoice_id_idx`, `orders_tenant_client_request_uidx` |
| **Unique** | `(tenant_id, order_id)`; partial unique `(tenant_id, client_request_id)` |
| **RLS** | Yes — lab visibility select; lab self-insert; ops update |
| **Relationships** | `invoice_id` → invoices; children: order_items, order_lines, shipments, payments (logical) |

### `order_items`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Line items for lab portal write path / legacy reads |
| **Owner module** | Orders / Lab Ordering |
| **PK** | `id` (uuid) |
| **Business key** | `order_item_id` (unique when migration applied) |
| **Join key** | `order_id` (text) → `orders.order_id` (no DB FK) |
| **Key fields** | `product_id`, `product_name`, `quantity`, `unit_price`, `total_price`, `tenant_id`, `lab_id` |
| **Indexes** | `idx_order_items_order_id`, `idx_order_items_tenant_order` |
| **RLS** | Yes — via lab_id or parent order |
| **Note** | Coexists with `order_lines`; RPC/invoice path prefers `order_lines` |

### `order_lines`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Normalized lines for invoices, fulfillment RPCs, metrics |
| **Owner module** | Orders |
| **PK** | `id` (uuid) |
| **Join key** | `(tenant_id, order_id)` → orders |
| **Key fields** | `product_id`, `product_name`, `quantity`, `unit_selling_price`, `net_line_total` |
| **Indexes** | `idx_order_lines_tenant_order` |
| **RLS** | Yes — via parent order lab visibility |

---

## Invoices & payments

### `invoices`
| Attribute | Value |
|-----------|-------|
| **Purpose** | One billing document per fulfilled order (idempotent RPC) |
| **Owner module** | Invoices / Collections |
| **PK** | `id` (uuid) |
| **Business key** | `invoice_number`; unique `(tenant_id, order_id)` |
| **Required** | `tenant_id`, `lab_id`, `order_id`, `invoice_number`, `total_amount`, `status` |
| **Status enum** | `draft`, `sent`, `partially_paid`, `paid`, `cancelled`, `failed` |
| **Optional** | PDF fields (`pdf_storage_path`, `pdf_generated_at`), `sent_at`, `paid_at`, snapshots, `created_source` |
| **Indexes** | tenant/order, tenant/number, tenant/lab/date, status, pdf path |
| **RLS** | Yes — authenticated select; writes via RPC/service patterns |
| **Relationships** | `orders.invoice_id` back-link; children: invoice_line_items, allocations |

### `invoice_line_items`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Immutable invoice line snapshot at generation time |
| **Owner module** | Invoices |
| **PK** | `id` (uuid) |
| **FK** | `invoice_id` → invoices |
| **RLS** | Yes |
| **Rule** | PDF generation reads **only** invoice_line_items, not live catalog |

### `payments`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Collection receipts against lab AR |
| **Owner module** | Collections |
| **PK** | `id` (uuid) |
| **Business key** | `payment_id` — unique `(tenant_id, payment_id)` |
| **Required** | `tenant_id`, `payment_id`, `lab_id`, `amount_received` |
| **Optional** | `order_id`, `payment_date`, `mode`, `outstanding_balance`, `note`, `collected_by`, `agent_id` |
| **Indexes** | lab, payment_date, tenant/lab, tenant/date |
| **RLS** | Yes — lab visibility; agent insert; ops update |
| **Rule** | **No `payments.invoice_id`** — use `invoice_payment_allocations` |

### `invoice_payment_allocations`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Junction: payment → invoice allocation amounts — **canonical for invoice open balance** |
| **Owner module** | Collections / Invoices |
| **PK** | `id` (uuid) |
| **Join keys** | `payment_id` (text), `invoice_id` (uuid) — text match, no formal FK on payment_id |
| **RLS** | Yes |
| **Rule** | Invoice status derived from allocations + sent/PDF lifecycle |

### `invoice_number_sequences`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Per-tenant invoice number allocation (`INV-YYYY-NNNNNN`) |
| **Owner module** | Invoices (RPC) |
| **RLS** | Enabled; deny authenticated direct access |

---

## Inventory & procurement

### `inventory`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Current stock snapshot per product per tenant |
| **Owner module** | Inventory / Catalog |
| **PK** | `id` (uuid) |
| **Business key** | `(tenant_id, product_id)` unique |
| **Required** | `tenant_id`, `product_id`, `current_stock` |
| **Constraint** | `current_stock >= 0` (non-negative) |
| **RLS** | Yes — admin/executive/lab read; admin/executive write |

### `inventory_ledger`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Stock movement audit (ORDER_OUT, PURCHASE_IN, adjustments) |
| **Owner module** | Inventory |
| **PK** | `id` (uuid) |
| **Key fields** | `movement_type`, `quantity`, `order_id`, `reference_type`, `stock_before`, `stock_after` |
| **RLS** | Yes |
| **Rule** | Fulfilled orders must produce ORDER_OUT per SKU (idempotent) |

### `products`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Product master (catalog metadata, cost/sell price) |
| **Owner module** | Master Catalog |
| **Business key** | `(tenant_id, product_id)` |
| **RLS** | Yes |
| **Note** | Master catalog create still seeds inventory row (GAP-001 / deferred) |

### `purchase_orders` / `purchase_order_items`
| Attribute | Value |
|-----------|-------|
| **Purpose** | HQ procurement; receive flow updates inventory + ledger |
| **Owner module** | Purchase Orders |
| **Business key** | `po_id` |
| **RLS** | Yes — ops roles |
| **Relationships** | PO header → line items; receive → inventory |

---

## Logistics (operational)

### `order_shipments`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Operational delivery tracking — **one per fulfilled order** |
| **Owner module** | Logistics & Delivery |
| **PK** | `shipment_id` (text, pattern `SHP-{order_id}`) |
| **Business key** | `(tenant_id, order_id)` unique |
| **Required** | `tenant_id`, `order_id`, `dispatch_status` |
| **Status enum** | `ready_for_dispatch`, `assigned`, `out_for_delivery`, `delivered`, `delivery_failed`, `rescheduled`, `returned` |
| **Optional** | lab/dispatch/courier/POD fields, `delivery_charge_amount`, `delivery_charge_reason` (Phase 3A) |
| **Indexes** | tenant/status, tenant/created, order_id, courier_id |
| **RLS** | Yes — ops CRUD; agents see assigned shipments |
| **Relationships** | Logical to orders; `courier_id` → logistics_couriers (text ref) |

### `shipment_status_events`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Audit timeline for shipment status transitions |
| **Owner module** | Logistics |
| **PK** | `event_id` (uuid) |
| **FK** | `shipment_id` → order_shipments CASCADE |
| **RLS** | Yes |

### `logistics_couriers`
| Attribute | Value |
|-----------|-------|
| **Purpose** | HQ courier directory for dispatch assignment |
| **Owner module** | Logistics Phase 2 |
| **PK** | `courier_id` (text) |
| **RLS** | Yes — ops tenant-scoped CRUD |

### `tenant_delivery_policy`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Per-tenant delivery charge rules (Phase 3A — operational only) |
| **Owner module** | Logistics / Delivery Policy |
| **PK** | `tenant_id` (uuid) → tenants CASCADE |
| **Defaults** | standard ₹150, free threshold ₹5000, currency INR |
| **RLS** | Yes — ops read/write |

---

## Field operations

### `agent_visits`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Field agent visit log per lab |
| **Owner module** | Agent Visits |
| **PK** | `id` (uuid) |
| **Business key** | `visit_id` (text — **no unique constraint in schema**) |
| **RLS** | Yes — agent work + lab visibility |

---

## Notifications

### `notification_events`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Internal event log for in-app notifications |
| **Owner module** | Notification Center |
| **PK** | `event_id` |
| **RLS** | Yes — role/target visibility |

### `notification_templates`, `notification_preferences`, `notification_delivery_log`
| Attribute | Value |
|-----------|-------|
| **Purpose** | Template config, user prefs, delivery audit |
| **RLS** | Yes on all |

---

## Audit & evidence (no single `audit` table)

| Table | Purpose | RLS |
|-------|---------|-----|
| `user_provisioning_events` | HQ user provisioning audit (append-only) | Yes |
| `lab_assignment_history` | Agent ↔ lab transfer history | Yes |
| `event_log` | Generic tenant events (jsonb payload) | Enabled — **no policies in migrations** |
| `operational_evidence` | Evidence file metadata + storage | Yes |
| `commission_entries` / `commission_payouts` | Commission ledger (separate from lab payments) | Yes |

---

## Views (read-only, security invoker where patched)

| View | Purpose |
|------|---------|
| `v_labs_credit` | Labs + AR join for collections UI |
| `v_lab_catalog` | Lab-facing product catalog with stock |
| `v_stock_dashboard` | HQ inventory health |
| `v_reorder_candidates` | Reorder forecast |

---

## Known schema gaps (document, do not hide)

1. **Dual line models** — `order_items` and `order_lines` coexist; app must handle both.
2. **`tenant_id` type drift** — uuid in most tables; text in some legacy `order_items` / early payment migrations.
3. **Text business keys without FKs** — `order_id`, `payment_id` joins enforced in RPCs, not always DB FKs.
4. **`event_log` RLS** — enabled without policies → denies unless bypassed.
5. **Phase 3A columns** — may exist in code before migration applied on environment (QA gap observed for delivery columns).
6. **Migrations vs sql/** — not all `supabase/sql` scripts are in `migrations/` folder.

---

## Formal migrations index

| Migration | Summary |
|-----------|---------|
| `20260624120000` | HQ profiles RLS tenant scope |
| `20260624120001` | Orders/payments date indexes |
| `20260624120002`–`005` | Invoice system phases 1, 2, 3, 5 |
| `20260624130000`–`003` | Sprint 1 AR reconcile + transaction RPCs |
| `20260628120000` | Logistics Phase 1A shipments |
| `20260630120000` | Logistics Phase 2 couriers |
| `20260701120000` | Logistics Phase 3A delivery charges |
