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
