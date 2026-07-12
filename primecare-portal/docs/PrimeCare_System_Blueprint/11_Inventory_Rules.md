# 11 — Inventory Rules

Stock snapshot, ledger movements, procurement receive, catalog coupling, and **module UX certification roadmap** (documentation only until Sprint 1A approval).

---

## Source of truth

| Concern | SoT |
|---------|-----|
| Current stock | `inventory.current_stock` |
| Movement audit | `inventory_ledger` |
| Catalog availability | `v_lab_catalog` / inventory join |

---

## Constraints

- `current_stock >= 0` (DB check)
- **No backorder** on lab order create — validate against on-hand
- Fulfilled order → **ORDER_OUT** per SKU (idempotent)
- Cancelled order → no ORDER_OUT (except documented seeds)

---

## Fulfillment deduction

- `applyLabOrderInventoryDeduction` / `deduct_inventory_for_order` RPC
- Idempotent via `orders.inventory_updated` + ledger check

---

## Procurement receive

- `receivePurchaseOrderWrite` → inventory increase + **PURCHASE_IN** ledger
- Verified: `verify-procurement-inventory-flow.mjs` (`--mutate`)

---

## Catalog coupling (deferred debt)

- Master catalog create **still seeds inventory row** (GAP-001 / DA-001)
- Do not assume ledger-first inventory without architecture change
- UX handoffs from Stock → Catalog / Purchase address discoverability only — **do not** invent Adjust/Transfer APIs without blueprint + approval

---

## Valuation KPI

- Cost fallback: inventory → `products.cost_price`
- `verify-inventory-dashboard-kpi.mjs`

---

## Bounded reads

- `HQ_INVENTORY_COLUMNS`, `HQ_INVENTORY_LEDGER_COLUMNS` in `hqReadBounds.js`
- Limits: 5000–10000 rows with date windows

---

## Verification

- `verify-inventory-reconciliation.mjs` — no negative stock
- `verify-inventory-ledger-integrity.mjs` — alias → reconciliation
- `verify-procurement-inventory-flow.mjs`
- `verify-inventory-dashboard-kpi.mjs`
- `verify-inventory-action-feedback.mjs` — Sprint 1A UX gate
- `verify-inventory-navigation-context.mjs` — Sprint 1B UX gate
- `verify-inventory-admin-flow.mjs` — write-path parity
- `verify-order-inventory-sync.mjs` — ORDER_OUT boundary

---

## Freeze

Procurement writes may be blocked when `VITE_HQ_PROCUREMENT_FROZEN` — inventory reads still allowed.

---

## Inventory action feedback (Sprint 1A — UI/UX only)

**Scope:** Master Catalog create/edit/enable/disable and Purchase Receive stock.  
**Not changed:** schema, APIs, RPCs, ledger semantics, ORDER_OUT, PURCHASE_IN, opening-stock write logic, reorder engine, permissions, RLS.

| Concern | Behavior |
|---------|----------|
| Mutation error classification | `src/inventory/mapInventoryMutationError.js` — business-facing codes (SKU exists, SKU disabled, negative stock, opening already initialized, receipt already processed, permission denied, unexpected write). Never expose raw Postgres as primary UI copy. |
| Inline errors | `ActionErrorSummary` at the action site (catalog modal / toggle zone / receive form) — not page-level load banners / `DataFetchError`. |
| Busy state | Loading labels: Creating SKU… / Saving Opening Stock… / Saving SKU… / Enabling SKU… / Disabling SKU… / Receiving Stock…; `aria-busy`; duplicate-submit guards. |
| Failure lifecycle | Modal/form remains open; entered values preserved. |
| Success lifecycle | Toast; silent catalog refresh (preserve search/sort/scroll); receive clears form only on success; filters/tabs preserved. |
| Verify | `verify-inventory-action-feedback.mjs` |

---

## Inventory context & continuity (Sprint 1B — UI/UX only)

**Scope:** Stock hub Start Here, context strip, SKU selection, differentiated empty states, return paths to Purchase / Master Catalog / Orders.  
**Not changed:** schema, APIs, RPCs, ledger, ORDER_OUT, PURCHASE_IN, opening-stock logic, reorder engine, Sprint 1A mutation behavior, permissions, RLS.

| Concern | Behavior |
|---------|----------|
| Start Here | Action-oriented CTAs from existing `stockHealth` Critical/Reorder counts only — Receive PO, Review Critical, Create PO, Review Reorder, Investigate Risk, Set Opening Stock (empty inventory). No invented prioritization. |
| Context strip | One compact Viewing row: view, selected SKU, category, warehouse (if present), search, filters, sort, freeze. |
| Selection | Obvious selected row + `aria-selected` + Selected SKU panel; survives silent refresh; outside-filter recovery via Clear Filters / Return to Inventory (never silent clear). |
| Return context | `primecare_inventory_return_context`; destinations show Back to Inventory and restore search/filters/selection/tab. |
| Empty states | No inventory / search / filters / critical / reorder / focused outside / read failure — each with one recovery action. |
| Page budget | First viewport: header, strip, Start Here, filters, list, selected SKU. Valuation/KPI summary collapsed secondary. |
| Verify | `verify-inventory-navigation-context.mjs` |

---

## Module UX certification (Founder-finalized 2026-07-11)

**Baseline document:** [`docs/QA/modules/inventory/Architecture_Review_Certification_Baseline.md`](../QA/modules/inventory/Architecture_Review_Certification_Baseline.md)  
**Methodology / taxonomy / tiers:** [16_Certification_Framework.md](./16_Certification_Framework.md)

| Tier | Definition | Inventory status |
|------|------------|------------------|
| **Bronze** | Domain Integrity | **Met** (ledger SoT + automated integrity) |
| **Silver** | Operational Workspace | **Not met** |
| **Gold** | Certified UX + Verification + Signed Manual UAT | **Not met** |

### Logical workspaces (identify only — do not redesign domain)

Inventory Overview · Stock Ledger · Inventory Health · Receiving · Reorder · Purchase Administration · Catalog Master · (ORDER_OUT via Orders)

Purchase Operations currently combines **Receiving**, **Reordering**, and **Purchase Administration** in one operational workspace. Certification issue = **cognitive load** (INV-CERT-001), not file size. Engineering decomposition = **RC2**.

### Sprint roadmap (UI/UX only — no schema/API/ledger/ORDER_OUT/PURCHASE_IN/opening-stock/reorder-engine/RLS changes)

| Sprint | Focus | Closes (primary) |
|--------|-------|------------------|
| **1A** | Mutation feedback on existing Catalog / Purchase receive writes — **shipped** (UI only) | Trust slice |
| **1B** | **Action-oriented** Start Here + context continuity — **shipped** (UI only) | INV-CERT-002, 003, 004 |
| **1C** | Visual / cognitive workspace shells (Receiving vs Reorder vs Purchase Admin); collapse analytics | INV-CERT-001, 006 |
| **Closure** | High UX defects + inventory QA pack + signed Manual UAT | Path to Gold |
| **Future** | INV-CERT-012 recommendation explainability (Current/Min/Reorder/Consumption/Rule/Reason/Trust Level; no fake %) | Not Sprint 1 blocker |
| **RC2** | Purchase file decomposition, GAP-001 split, Adjust/Transfer (blueprint-first), exports | Deferred |

### Do not break during Inventory UX sprints

Inventory ledger semantics · stock calculations · ORDER_OUT · PURCHASE_IN · opening stock write path · reorder engine · permissions · RLS · financial posting.
