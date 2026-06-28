# PrimeCare Active Set Addendum — 2026-06-28

## Context
This addendum updates the Active Set with production deployment, QA certification, and architecture notes discovered during the June 2026 production setup.

## Production Environment Decision
PrimeCare now uses dedicated QA and Production environments:

- QA: `primecare-portal.vercel.app` + QA Supabase
- Production: `primecare-portal-prod.vercel.app` + Production Supabase
- Production Supabase ref: `alxhrnotnvwpblsiadxj`

## GitHub / Deployment Decision
Use one repository and branch-based deployment:

- `qa` branch for QA testing
- `main` branch for production

Separate repositories for QA and Production are not recommended because they increase code drift risk.

## Production Bootstrap Notes
The production database required several missing migrations/grants during smoke testing:

- `resolve_login_email(identifier text)` RPC
- profile identity columns: `email`, `username`, `display_name`
- authenticated grants on `profiles`
- authenticated grants on views and product/inventory tables
- `notification_events` table

## Inventory Architecture Gap
Current system behavior:

- Master Catalog product creation also creates an inventory row.
- Opening stock, minimum stock, and reorder quantity are captured during product creation.

Future target:

- Master Catalog should define products only.
- Inventory should manage stock receipt, adjustment, transfer, cycle count, and ledger.
- Inventory Ledger should be the source of truth.

Status: Deferred. Not a pilot blocker.

## Inventory Valuation (2026-06-28)
Year-1 HQ inventory value KPIs resolve unit cost as:

1. Inventory unit cost (when present on row)
2. `products.cost_price` fallback
3. Missing-cost message only when both unavailable

Master Catalog HQ Cost uses the same catalog `cost_price`. Transfer price remains deferred.

## Procurement Forecast Alignment (2026-06-28)
- **Inventory → Health** and **Purchase → Forecast Suggestions** share 30-day ORDER_OUT velocity and urgency thresholds (Critical / High / Medium).
- **Reorder Candidates** tab remains min-stock based (`v_reorder_candidates`).
- Regression: `node scripts/verify-procurement-inventory-flow.mjs` (dry-run default; `--mutate` for receive test).

## Production Testing Status
Validated so far:

- Founder / Executive login
- Admin login
- Lab login
- Product creation from Master Catalog
- Inventory display of created SKU
- Notification table creation
- Supabase-only production environment

Pending:

- Agent login and ownership filtering
- Create lab
- Lab assigned catalog
- Lab order placement
- Fulfillment
- Invoice
- Payment
- AR reconciliation
- Executive KPI update
