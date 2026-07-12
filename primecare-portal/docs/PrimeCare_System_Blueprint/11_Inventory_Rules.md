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
- `verify-inventory-workspace-simplification.mjs` — Sprint 1C UX gate
- `verify-inventory-certification-closure.mjs` — Closure (INV-CERT-005/007/001)
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

## Inventory workspace simplification (Sprint 1C — UI/UX only)

**Scope:** Operational-first presentation hierarchy on the Stock hub. Single workspace (`data-inventory-workspace="hq"`) — no module split.  
**Not changed:** schema, APIs, RPCs, ledger, ORDER_OUT, PURCHASE_IN, opening-stock logic, reorder engine, Sprint 1A mutation errors, Sprint 1B return-context behavior, permissions, RLS.

| Concern | Behavior |
|---------|----------|
| Primary question | “What inventory work should I do now?” |
| First viewport | Header → Context strip → Start Here → Search/Filters → Inventory list → Selected SKU. No stacked dashboards. |
| Selected SKU hierarchy | Expected action + operational stock fields expanded; SKU details / audit identifiers / purchase-history note collapsed. |
| Secondary | Stock summary & valuation (KPIs + analytics + portfolio note) collapsed below operational content. |
| Discoverability | Within ~5s: selected SKU, expected action, and reason from existing `stockHealth`. |
| Verify | `verify-inventory-workspace-simplification.mjs` |

---

## Certification Closure (2026-07-12 — UI/docs only)

| Concern | Behavior |
|---------|----------|
| INV-CERT-005 | Consolidated UAT + evidence index/checklist/sign-off under `docs/QA/modules/inventory/Certification_*` |
| INV-CERT-007 | Movements: non-opening `IN` → **Historical Inventory Movement** (no Adjust UI) |
| INV-CERT-001 | Purchase visual groups Replenishment / Receiving / Purchase administration; Purchase cert deferred |
| Gold | **CONDITIONAL** until signed Closure UAT; then freeze except bugs/security |
| Verify | `verify-inventory-certification-closure.mjs` |

---

## Module UX certification (Founder-finalized 2026-07-11)

**Baseline document:** [`docs/QA/modules/inventory/Architecture_Review_Certification_Baseline.md`](../QA/modules/inventory/Architecture_Review_Certification_Baseline.md)  
**Methodology / taxonomy / tiers:** [16_Certification_Framework.md](./16_Certification_Framework.md)

| Tier | Definition | Inventory status |
|------|------------|------------------|
| **Bronze** | Domain Integrity | **Met** (ledger SoT + automated integrity) |
| **Silver** | Operational Workspace | **Met** (Stock hub — Sprint 1A–1C) |
| **Gold** | Certified UX + Verification + Signed Manual UAT | **CONDITIONAL** — Closure pack complete; human UAT sign-off pending |


### Logical workspaces (identify only — do not redesign domain)

Inventory Overview · Stock Ledger · Inventory Health · Receiving · Reorder · Purchase Administration · Catalog Master · (ORDER_OUT via Orders)

Purchase Operations uses **visual workspace groups** (Replenishment · Receiving · Purchase administration) for cognitive load (INV-CERT-001 Closure). **Dedicated Purchase module certification** is Founder-authorized as a **separate track** (baseline finalized 2026-07-12) — do not start it *from* Inventory Closure alone. Engineering file decomposition remains RC2 and is **not** a Purchase Sprint 1 blocker (PUR-CERT-001).

### Sprint roadmap (UI/UX only — no schema/API/ledger/ORDER_OUT/PURCHASE_IN/opening-stock/reorder-engine/RLS changes)

| Sprint | Focus | Closes (primary) |
|--------|-------|------------------|
| **1A** | Mutation feedback on existing Catalog / Purchase receive writes — **shipped** (UI only) | Trust slice |
| **1B** | **Action-oriented** Start Here + context continuity — **shipped** (UI only) | INV-CERT-002, 003, 004 |
| **1C** | Visual / cognitive workspace shells; collapse analytics — **shipped** (UI only) | INV-CERT-001, 006 |
| **Closure** | Evidence pack + Adjustment label honesty + Purchase visual grouping — **shipped** (UI/docs) | INV-CERT-005 / 007 / 001 |
| **Future** | INV-CERT-012 recommendation explainability (Current/Min/Reorder/Consumption/Rule/Reason/Trust Level; no fake %) | Not Gold blocker |
| **RC2** | Purchase file decomposition, GAP-001 split, Adjust/Transfer (blueprint-first), exports | Deferred |

### Certification Closure notes (2026-07-12)

- Ledger non-opening `IN` display: **Historical Inventory Movement** (not actionable Adjustment).
- Evidence: `docs/QA/modules/inventory/Certification_*`.
- After signed Manual UAT: Inventory **Gold**; freeze except bug fixes and security updates. Do not begin Purchase certification **from Inventory Closure** — use the Purchase baseline track below.

---

## Purchase / Reorder module UX certification (Founder-finalized 2026-07-12)

**Baseline document:** [`docs/QA/modules/purchase/Architecture_Review_Certification_Baseline.md`](../QA/modules/purchase/Architecture_Review_Certification_Baseline.md)  
**Methodology / taxonomy / tiers:** [16_Certification_Framework.md](./16_Certification_Framework.md)

| Tier | Definition | Purchase status |
|------|------------|-----------------|
| **Bronze** | Domain Integrity | **Met** (PO SoT + receive → PURCHASE_IN + integrity verifies) |
| **Silver** | Operational Workspace | **Not met** |
| **Gold** | Certified UX + Verification + Signed Browser UAT | **Not met** |

### Founder decisions (documentation only)

| ID | Decision |
|----|----------|
| **PUR-CERT-001** | One workspace combining Replenishment + Receiving + Purchase Administration = **operational complexity** (user), not engineering structure. Engineering decomposition **RC2**. **Not a Sprint 1 blocker.** |
| **PUR-CERT-015** | Recommendations without WHY → future cards (Current Stock · Min · Forecast · Supplier · Rule · Reason · Trust High/Med/Low; **no %**). **Not Sprint 1. Not Gold blocker.** |
| **Sprint 1B** | **Action-oriented** Start Here only: Create Purchase Orders · Receive Pending Deliveries · Review Critical Reorders · Investigate Blocked Purchase Orders — **no stats-only cards** |

### Purchase Sprint 1A — Action feedback & trust (2026-07-12 — UI only)

**Scope:** Create / Edit / Cancel / Bulk Critical drafts / Receive / Freeze interaction feedback.  
**Not changed:** schema, APIs, RPCs, PURCHASE_IN semantics, ledger, ORDER_OUT, reorder engines, receiving eligibility, finance, permissions, RLS, layout, Start Here, queues, Suppliers, explainability.

| Concern | Behavior |
|---------|----------|
| Mutation errors | `mapPurchaseMutationError` → business titles (already exists / frozen / already received / supplier unavailable / permission denied / unexpected). **Never** primary Postgres text. |
| Error placement | `ActionErrorSummary` at the action site (Create form, Forecast, Receive form, History, Edit dialog) — not page-level mutation banners |
| Busy labels | Creating / Saving / Cancelling / Receiving Purchase Order... · Creating Critical Purchase Orders... |
| Interaction | Inflight refs · `aria-busy` · disable duplicate submit · edit dialog stays open on failure · preserve form values on failure |
| Success | Toast · `refreshAll({ silent: true })` preserves search/filters/tab |
| Verify | `verify-purchase-action-feedback.mjs` |
| Closes | **PUR-CERT-003** (Trust) |

### Purchase Sprint roadmap (UI/UX only — no schema/API/RPC/PURCHASE_IN/ledger/reorder-engine/RLS/permission changes)

| Sprint | Focus | Closes (primary) |
|--------|-------|------------------|
| **1A** | Mutation feedback on Create / Update / Cancel / Bulk / Receive — **shipped** (UI only) | PUR-CERT-003 |
| **1B** | **Action-oriented** Start Here + context continuity | PUR-CERT-002, 004, 013 |
| **1C** | Queue hierarchy + Suppliers honesty | PUR-CERT-007, 009 |
| **Closure** | QA pack + signed browser UAT | PUR-CERT-005, 012 |
| **Future** | PUR-CERT-015 / 010 Trust & Explainability cards | Not Gold blocker |
| **RC2** | PUR-CERT-001 engineering split; exports; multi-line; orphan forecast page | Deferred |

### Do not break during Purchase UX sprints

Purchase order write semantics · PURCHASE_IN · inventory ledger · ORDER_OUT · reorder calculation engines · receiving eligibility rules · financial posting · permissions · RLS.

### Do not break during Inventory UX sprints

Inventory ledger semantics · stock calculations · ORDER_OUT · PURCHASE_IN · opening stock write path · reorder engine · permissions · RLS · financial posting.
