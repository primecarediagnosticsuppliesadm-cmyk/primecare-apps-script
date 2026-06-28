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
