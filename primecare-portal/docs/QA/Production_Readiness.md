# PrimeCare Production Readiness

## Current Production Status

| Area | Status | Notes |
|---|---|---|
| Production Vercel project | ✅ | `primecare-portal-prod` created and deployed from `main`. |
| Production Supabase project | ✅ | Production project created and connected. |
| Production env vars | ✅ | Supabase URL/key and production flags configured. |
| GitHub `main` deployment | ✅ | Certified QA fixes merged into `main` and deployed. |
| Founder / Executive login | ✅ | Founder profile created and login validated. |
| Admin login | ✅ | Admin profile created and login validated. |
| Agent login | ⏳ | Pending smoke test. |
| Lab login | ✅ | Lab portal loaded; empty catalog expected until products/lab mapping. |
| Profiles RLS | ✅ | Profile grants and own/admin policies corrected. |
| Core views | ✅ | `v_lab_catalog`, `v_labs_credit`, `v_reorder_candidates`, `v_stock_dashboard` exist. |
| Notification events | ✅ | `notification_events` table created to remove frontend 404. |
| Products write | ✅ | Product creation tested after grants. |
| Inventory display | ✅ | Inventory row created from Master Catalog opening stock. |
| Inventory value KPIs | ✅ | Product `cost_price` fallback for valuation; `[inventoryValuation]` logs + reconciliation (GAP-014). |
| Master Catalog cost display | ✅ | HQ Cost / margin from catalog cost; transfer price independent (GAP-015). |
| Master Catalog price source | ✅ | HQ Price from `products.selling_price`; `[masterCatalogPricing]` logs (GAP-015). QA_SKU_003: ₹900 / ₹200 / ~78%. |
| Procurement regression scripts | ✅ | `verify-procurement-inventory-flow.mjs` dry-run; `--mutate` fails without open Ordered PO (GAP-016). |
| Admin Orders fulfillment | ✅ | Fulfillment guards, ORDER_OUT reconciliation, tenant isolation (GAP-017). |
| Admin Credit & Risk | ✅ | KPI/AR reconcile, aging buckets, allocation golden path (GAP-018). |
| Admin Labs | ✅ | Tenant isolation, ownership sync, KPI/AR reconcile (GAP-019). |
| Admin Operations Center | ✅ | User bundle, role guards, ownership sync, RLS (GAP-020). |
| Procurement forecast alignment | ✅ | Forecast Suggestions use Inventory Health velocity; PO KPI basis labels (GAP-016). |
| Admin PO product validation | ✅ | Catalog picker + API validation (GAP-009). |
| Admin PO cancel/edit | ✅ | Draft/Ordered PO recovery before receipt (GAP-010). |
| Admin PO receive guards | ✅ | Receive only Ordered/Partially Received (GAP-011). |
| Admin Add Lab HQ mode | ✅ | PrimeCare HQ tenant; no distributor placeholder (GAP-012). |
| Supplier master | ⏳ | Deferred — free-text supplier on PO (GAP-013). |
| Legacy Apps Script fallback | ⚠️ | Warning remains; should be cleaned up post-smoke. |

## Production URLs

- Production frontend: `https://primecare-portal-prod.vercel.app`
- Production Supabase ref: `alxhrnotnvwpblsiadxj`

## Must-pass before real pilot

- Admin: create product, create lab, update inventory, create order.
- Lab: see assigned catalog, place order, view invoices/payments.
- Agent: see assigned labs, visits, collections only.
- Executive: see financials, credit risk, operations, dashboards.
- End-to-end: order -> fulfillment -> invoice -> payment -> AR -> inventory update.
