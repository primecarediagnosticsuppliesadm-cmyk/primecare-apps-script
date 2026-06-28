# PrimeCare QA Gap Register

## Purpose
Tracks functional, UX, architecture, security, RLS, data, and production-readiness gaps found during PrimeCare QA.

## Current Environment
- QA: `primecare-portal.vercel.app` + QA Supabase
- Production: `primecare-portal-prod.vercel.app` / production aliases + Production Supabase
- Production Supabase ref: `alxhrnotnvwpblsiadxj`
- Started: 2026-06-28

## Gap Summary

| ID | Area | Severity | Status | Summary |
|---|---|---:|---|---|
| GAP-001 | Inventory Architecture | Medium | Deferred | Master Catalog currently creates inventory rows; Inventory should later manage stock movements separately. |
| GAP-002 | Production Supabase URL | Critical | Fixed | Vercel `VITE_SUPABASE_URL` initially included `/rest/v1`, causing auth URL to become `/rest/v1/auth/v1/token`. |
| GAP-003 | Missing login RPC | Critical | Fixed | Production DB was missing `resolve_login_email(identifier text)`. |
| GAP-004 | Missing profile identity columns | Critical | Fixed | Production `profiles` table was missing `email`, `username`, and `display_name` migrations. |
| GAP-005 | Profile permissions | Critical | Fixed | Authenticated users lacked table grants for `profiles`; RLS policy existed but grants were missing. |
| GAP-006 | Missing notification_events table | Low | Fixed | Frontend queried `notification_events`; production DB did not have table. |
| GAP-007 | Products write permissions | Critical | Fixed | Admin could read products but could not insert because authenticated role lacked INSERT/UPDATE/DELETE grants. |
| GAP-008 | Legacy Apps Script error logging | Medium | Open | Failed login/error logging still attempts `/api/primecare` and expects `PRIMECARE_APPS_SCRIPT_URL` even when Supabase-only mode is enabled. |
| GAP-009 | Admin UAT / PO | High | Fixed | Create PO allowed free-text invalid `product_id`; receive failed when inventory row missing. |
| GAP-010 | Admin UAT / PO | High | Fixed | No cancel/edit workflow for Draft/Ordered POs before receipt. |
| GAP-011 | Admin UAT / PO | Medium | Fixed | Cancelled/Received/Draft POs still showed Prefill Receive Form. |
| GAP-012 | Admin UAT / Labs | High | Fixed | Add Lab showed placeholder “Selected distributor” in Year-1 HQ mode (no `distributors` table). |
| GAP-013 | Supplier Master | Low | Deferred | Supplier master entity deferred; PO supplier remains free text this sprint. |
| GAP-014 | Admin UAT / Inventory KPI | High | Fixed | Inventory value KPI cards showed "Not enough cost data" while stock rows loaded; economics read did not join `products.cost_price`. |
| GAP-015 | Admin UAT / Master Catalog | High | Fixed | HQ Cost showed "Not configured" when only `cost_price` existed; display required transfer price. |
| GAP-016 | Admin UAT / Procurement UX | Medium | Fixed | Forecast Suggestions used min-stock view only; contradicted Inventory Health velocity. KPI basis labels missing. |
| GAP-017 | Admin UAT / Orders | Medium | Fixed | Fulfillment could mark Fulfilled without ORDER_OUT; cancelled orders could re-fulfill; item counts double-counted from order_lines + order_items. |
| GAP-018 | Admin UAT / Credit & Risk | Medium | Certified | KPI/AR reconcile on golden labs; 22 inactive AR rows; aging buckets 1–15/16–30/31+ (not 30/60/90 DB-driven). |
| GAP-019 | Admin UAT / Labs | Medium | Certified | Tenant isolation, ownership sync, KPI/AR reconcile; no edit API; PROSPECT status on golden labs; filters only (no text search/pagination). |
| GAP-020 | Admin UAT / Operations Center | Medium | Certified | Bundle/RLS/ownership reconcile; role escalation blocked; 26 distributor pilot ownership rows; profiles unbounded read. |

---

## GAP-001: Inventory vs Master Catalog Design

### Severity
Medium

### Type
Architecture / UX / ERP Design

### Current Behavior
- Creating a product from Master Catalog also creates an inventory row.
- Opening stock, minimum stock, and reorder quantity are captured in the product creation flow.
- Inventory page displays the resulting stock row, but does not provide a clear `Receive Stock`, `Adjust Stock`, or `Opening Stock` action.

### Expected Future Behavior
- Master Catalog should maintain product definitions only: SKU, name, category, unit, price, cost, active/inactive.
- Inventory should manage stock operations: opening stock, receiving stock, purchase-order receipt, manual adjustment, transfer, damage/write-off, stock count, and ledger.
- Inventory quantity should be derived from inventory movements / ledger, not from product definition.

### Business Reason
As PrimeCare scales to multiple warehouses, distributors, and labs, product definition and physical stock must remain separate. Stock must be auditable through ledger movements.

### Recommendation
Post-pilot, redesign as:

1. Master Catalog: Product master only.
2. Inventory: Stock state + movement actions.
3. Inventory Ledger: Authoritative movement history.
4. Purchase / Reorder: Stock receipt should increase inventory through ledger.

### Status
Deferred. Not a pilot blocker.

---

## GAP-008: Legacy Apps Script Error Logging in Supabase-only Production

### Severity
Medium

### Type
Code cleanup / Production hardening

### Current Behavior
When a failed login or client error occurs, the app may call `/api/primecare`, which then fails with:

`Missing PRIMECARE_APPS_SCRIPT_URL environment variable`

### Expected Behavior
When `VITE_ENABLE_LEGACY_APPS_SCRIPT=false`, the frontend should not call legacy Apps Script logging or `/api/primecare` paths.

### Recommendation
Guard all legacy logging/fallback calls behind the legacy flag, or replace them with Supabase-native `notification_events` / `event_log` logging.

### Status
Open. Not blocking core production smoke test unless it appears during normal successful workflows.

---

## GAP-009: Create PO Allows Invalid product_id (Admin UAT)

### Severity
High

### Type
Operator safety / Procurement

### Current Behavior (before fix)
- Create PO used free-text Product ID and Product Name.
- Invalid SKU (e.g. `test`) could be submitted.
- Receive Stock failed late with missing inventory row.

### Fix (2026-06-28)
- Product selector from Master Catalog only.
- API validates product exists for tenant before PO insert.
- Unit cost defaults from product `cost_price`; quantity and unit cost must be &gt; 0.
- Receive path validates PO status and remaining quantity; auto-creates zero inventory row when product exists.

### Status
**Fixed**

---

## GAP-010: PO Correction Workflow Missing (Admin UAT)

### Severity
High

### Type
Operator safety / Procurement

### Current Behavior (before fix)
- Bad PO could not be edited, cancelled, or remapped before receipt.

### Fix (2026-06-28)
- Cancel PO for Draft/Ordered when `received_qty = 0`.
- Edit PO (supplier, quantity, unit cost, status, catalog product) when `received_qty = 0`.

### Status
**Fixed**

---

## GAP-011: Cancelled/Received PO Shows Receive Action (Admin UAT)

### Severity
Medium

### Type
UX / Operator safety

### Current Behavior (before fix)
- History list showed “Prefill Receive Form” for all PO statuses.

### Fix (2026-06-28)
- Receive / Prefill only for **Ordered** and **Partially Received** with remaining quantity.
- Draft, Received, and Cancelled POs hide receive action.

### Status
**Fixed**

---

## GAP-012: Add Lab Distributor Placeholder (Admin UAT)

### Severity
High

### Type
UX / Year-1 HQ mode

### Current Behavior (before fix)
- Add Lab modal showed “Creating lab under: Selected distributor”.
- Distributor OS deferred; no `public.distributors` table in production.

### Fix (2026-06-28)
- HQ/Admin Add Lab auto-uses current tenant.
- Read-only organization label **PrimeCare HQ**; no distributor selection required.

### Status
**Fixed**

---

## GAP-013: Supplier Master Deferred

### Severity
Low

### Type
Architecture / Deferred

### Current Behavior
- PO supplier is free text.

### Expected Future Behavior
- Supplier master with default pricing, contacts, and PO history.

### Status
**Deferred** — out of scope for this sprint.

---

## GAP-014: Inventory Dashboard KPI Missing Cost Data (Admin UAT)

### Severity
High

### Type
Data / Inventory valuation / KPI accuracy

### Current Behavior (before fix)
- Stock tab showed inventory rows correctly from `v_stock_dashboard`.
- Value analytics KPI cards showed **"Not enough cost data"** for all amount fields.
- `getInventoryHealthRead()` read `public.inventory` only; that table has no unit-cost column.
- `products.cost_price` was never joined on the economics path.

### Expected Behavior
Valuation priority (Year-1 HQ):

1. Inventory unit cost (when present on row)
2. `products.cost_price` fallback
3. **"Not enough cost data"** only when both are null/≤0

No estimated values.

### Fix (2026-06-28)
- `resolveInventoryUnitCost.js` — central resolver + `[inventoryValuation]` per-SKU logs.
- `getInventoryHealthRead()` — batch-fetch `products.cost_price` and resolve before economics.
- `inventoryValueAnalyticsEngine.js` — `[inventoryValuationReconciliation]` dashboard total cross-check.
- Verification: `node scripts/verify-inventory-dashboard-kpi.mjs` (QA Supabase live data).

### Verification evidence (QA tenant `f168b98f-47a6-42c3-b788-24c00436fac2`)
- `QA_SKU_003`: 120 × ₹200 = **₹24,000** (`source: product`; post-receive stock)
- HQ total reconciles: **₹33,956** = Σ(`current_stock × resolvedUnitCost`) across 4 SKUs
- Fallback cases A/B/C pass; no duplicate SKU valuation

### Status
**Fixed**

---

## GAP-015: Master Catalog HQ Cost Display (Admin UAT)

### Severity
High

### Type
UX / Data mapping

### Current Behavior (before fix)
- Inventory valuation correctly used `products.cost_price`.
- Master Catalog showed **HQ Cost: Not configured** because display required both cost and transfer price; transfer price is not stored in Year-1 schema.

### Fix (2026-06-28)
- Split `hqCostConfigured`, `hqTransferConfigured`, `hqMarginConfigured` in `masterCatalogEngine.js`.
- HQ Cost and margin (price vs cost) display independently of transfer price.
- `enrichCatalogWithProductMetadata` backfills `cost_price` / `selling_price` from `products`.
- **Follow-up:** `resolveMasterCatalogPricing()` — `products.selling_price` / `cost_price` authoritative; view/lab prices are fallback only (fixes mixed-source HQ Price ₹10 vs cost ₹200).
- QA log: `[masterCatalogPricing]`.

### Verification evidence (QA tenant)
- `QA_SKU_003`: HQ Price ₹900, HQ Cost ₹200, margin ~78%, stock 120
- `QA_SKU_002`: HQ Price ₹800, HQ Cost ₹150, margin ~81%
- `QA TEST KIT D`: HQ Price ₹13, HQ Cost ₹12, margin ~8%
- Transfer Price: Not configured (deferred)

### Status
**Fixed**

---

## GAP-016: Purchase Forecast vs Inventory Health Contradiction (Admin UAT)

### Severity
Medium

### Type
UX / Procurement intelligence

### Current Behavior (before fix)
- Inventory Health showed projected stockout (~19 days) but Purchase Forecast Suggestions showed all zeros.
- Forecast Suggestions used `v_reorder_candidates` (min-stock only) with missing `days_left`.
- PO KPI cards lacked period/basis labels.

### Fix (2026-06-28)
- Forecast Suggestions derive from `getInventoryHealthRead()` velocity + urgency (aligned with Inventory → Health).
- Empty state explains why Low-urgency / >30-day stockouts are excluded.
- PO KPI cards label scope (tenant, status basis, value sum).
- Regression: `node scripts/verify-procurement-inventory-flow.mjs` (dry-run); `--mutate` requires open Ordered PO and fails clearly if missing.

### Status
**Fixed**

---

## GAP-017: Admin Orders Fulfillment Integrity (Admin UAT)

### Severity
Medium

### Type
Operator safety / Inventory integrity

### Current Behavior (before fix)
- `updateOrderStatusWrite` could mark **Fulfilled** even when `applyLabOrderInventoryDeduction` failed or no ORDER_OUT ledger was written.
- Fulfillment read **`order_items` only**; legacy `order_lines`-only orders fulfilled without deduction.
- Cancelled orders could be re-fulfilled from UI; status action buttons stayed enabled.
- List item counts summed both `order_lines` and `order_items` (double-count risk).

### Fix (2026-06-28)
- Block **Cancelled → Fulfilled** in API; disable status actions on cancelled/fulfilled orders in `OrdersPage.jsx`.
- Fail fulfillment when deduction fails or ORDER_OUT ledger missing; fail when no line items.
- `fetchOrderLineItemsForFulfillment()` — `order_items` first, `order_lines` fallback (matches detail read).
- `fetchOrderLineCountsForOrders()` — prefer `order_items` count per order, fallback `order_lines`.
- Regression: `node scripts/verify-orders-admin-flow.mjs`.

### Verification evidence (QA tenant)
- 64 orders visible; all belong to `qa-tenant-001`; no foreign-tenant RLS leak.
- KPI cards reconcile with order list (64 total; 55 fulfilled; Active Value ₹20,998).
- 50/50 header totals match line sums; 30/30 fulfilled orders have single ORDER_OUT per SKU.
- Known seed exception: `QA_ORD_001` (cancelled with historical seed ledger row).

### Status
**Fixed**

---

## GAP-018: Admin Credit & Risk Certification (Admin UAT)

### Severity
Medium

### Type
Financial integrity / AR reconciliation / UX clarity

### Current Behavior (certified 2026-06-28)
- HQ Credit & Risk Command Center KPIs reconcile with `ar_credit_control` outstanding (live: **₹1,500**).
- Golden labs (`QA_LAB_*`) pass collection audit with zero issues.
- Payment allocation golden path: payment fully allocated, invoice open balance **₹0**.
- Aging buckets in UI: **Current**, **1–15**, **16–30**, **31+** (client-side from `days_overdue` field).
- 22 inactive AR rows flagged `ar_row_no_activity` (non-golden labs; no collections relevance).

### Residual risks (non-blocking)
- `days_overdue` is stored on AR/view — not recomputed from invoice due dates in application code.
- Invoice auto-allocation requires linked `orderId` on payment; unlinked cash may remain unallocated.
- Bounded AR reads omit `days_overdue` column — enriched via `v_labs_credit`.
- Legacy dual-ledger drift possible on non-golden labs; golden path clean.

### Verification
- `node scripts/verify-credit-risk-admin-flow.mjs` — **16 PASS, 1 WARN**
- `node scripts/verify-financial-reconciliation.mjs` — **PASS**
- `node scripts/verify-collection-inconsistencies.mjs` — golden labs clean

### Status
**Certified** (GO for Credit & Risk module; payment recording manual UAT recommended)

---

## GAP-019: Admin Labs Certification (Admin UAT)

### Severity
Medium

### Type
Tenant isolation / lab lifecycle / assignment integrity / UX completeness

### Current Behavior (certified 2026-06-28)
- HQ Labs directory reads `v_labs_credit` via `getLabsCredit()` — **26 labs** scoped to `qa-tenant-001`; RLS blocks foreign tenants.
- Portfolio outstanding **₹1,500** reconciles with Σ `ar_credit_control.outstanding`.
- Golden labs (`QA_LAB_001–003`) present; `labs.assigned_agent_id` matches ACTIVE `lab_ownership.primary_agent_id`.
- Agent visibility driven by `lab_ownership` RLS (agent sees owned labs only; lab user sees `QA_LAB_001` only).
- Add Lab HQ mode: `createLabWrite` validates required fields and operating tenant; defaults `status=ACTIVE` on insert.
- Credit/Orders integration: golden labs visible in Collections read; order `lab_id`s exist in labs directory.

### Residual risks (non-blocking)
- **No `updateLabWrite` / HQ edit form** — review drawer read-only; status/contact/credit limit edits require Ops Center or DB.
- **No text search or pagination** on Labs directory — credit/attention filters only; bounded full list (5,000 cap).
- Golden labs live with `status=PROSPECT` while `labs.active=true` — portfolio “active labs” KPI undercounts (uses `status===active` only).
- Duplicate lab **names** allowed — uniqueness is `(tenant_id, lab_id)` only.
- Orders lab filter built from orders in scope — does not exclude inactive labs from historical orders.
- Manual “Create lab” UI UAT still open in checklist.

### Verification
- `node scripts/verify-labs-admin-flow.mjs` — **29 PASS, 6 WARN, 0 FAIL**
- `node scripts/verify-hq-rls-reads.mjs` — Labs module matrix
- `node scripts/verify-collection-inconsistencies.mjs` — golden labs clean

### Status
**Certified** (GO for Labs module; manual create-lab UAT and edit workflow remain open)

---

## GAP-020: Admin Operations Center Certification (Admin UAT)

### Severity
Medium

### Type
User provisioning / role guards / lab ownership integrity / RLS

### Current Behavior (certified 2026-06-28)
- `loadOperationsCenterAdminBundle()` loads **14** tenant-scoped directory users; KPI strip reconciles with `computeProvisioningKpis`.
- Golden QA profiles present: admin, executive, agent (`QA_TEST_AGENT_001`), lab (`QA_LAB_001`).
- Admin cannot assign executive role (`validateActorRoleAssignment` + filtered role dropdown).
- **26** HQ-lab ACTIVE `lab_ownership` rows; golden labs sync with `labs.assigned_agent_id`; no duplicate ACTIVE keys per lab.
- **26** distributor-pilot ownership rows with non-HQ `lab_tenant_id` (WARN only).
- Agent RLS: own profile + ownership-scoped labs; lab user sees only own profile; lab_ownership denied.

### Residual risks (non-blocking)
- Profiles/users/ownership reads have **no explicit `.limit()`** — tenant filter + RLS only.
- Manual UAT open: create user UI, reset password, bulk lab/distributor assignment flows.
- Executive cross-tenant profile read may be limited in QA env (WARN in script).
- Distributor pilot ownership rows reference labs outside HQ `labs` table — expected for multi-tenant pilot data.
- `verify-provisioning-role-guard.mjs` Node import path still broken (logic certified via SSR in ops script).

### Verification
- `node scripts/verify-operations-center-admin-flow.mjs` — **35 PASS, 4 WARN, 0 FAIL**
- `node scripts/verify-hq-rls-reads.mjs` — profiles module matrix
- `node scripts/verify-labs-admin-flow.mjs` — ownership golden sync

### Status
**Certified** (GO for Operations Center module; manual provisioning UAT recommended)
