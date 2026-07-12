# Sprint 1B — Inventory Context & Continuity (Pre-Implementation)

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1B |
| Module | Inventory (Stock hub) + return paths |
| Date | 2026-07-11 |
| Gate | **ALLOWED** (UI/UX only) |
| Depends on | Sprint 1A action feedback (unchanged) |

## Defects addressed

| ID | Issue |
|----|-------|
| INV-CERT-002 | No action-oriented Start Here |
| INV-CERT-003 | Stock lacks Receive / Opening handoffs |
| INV-CERT-004 | Weak context + return path |

---

## 1. Feature Inventory

| Feature | Current UI | Read paths | Write paths | Permission | Parity after |
|---------|------------|------------|-------------|------------|--------------|
| Stock list | StockPage table/cards | `getStockDashboard` | None | admin/executive | Same + selection |
| Critical / Reorder counts | KPI cards from `stockHealth` | Same rows | None | same | Same buckets; Start Here filters |
| Search / tenant filter | Filter row | Client filter | None | same | Same + strip + Clear Filters |
| Value analytics | `HqInventoryValueAnalytics` | Economics bundle | None | same | Collapsed (not removed) |
| Movements / Health tabs | Embedded pages | Existing | None | same | Unchanged |
| Receive / Create PO | Purchase page | Purchase reads | Receive write (1A) | same | Handoff + Back to Inventory |
| Opening stock / catalog | Master Catalog | Catalog reads | Catalog writes (1A) | same | Handoff + Back to Inventory |
| ORDER_OUT | Orders | Orders | Fulfill | same | Back to Inventory only |

---

## 2. Current Context Flow

| State | Today | After 1B |
|-------|-------|----------|
| Selected SKU | None | React + return session |
| Search / tenant filter | React only | + strip + return restore |
| Health attention filter | None | Client filter on existing `stockHealth` |
| Sort | None | Optional client sort (name / health) |
| Expanded / detail | None | Selected SKU detail panel |
| Session return | None | `primecare_inventory_return_context` |
| Nav to Purchase tab | None | `hq_nav_context` tab hint |

---

## 3. Files affected

| File | Change |
|------|--------|
| `src/inventory/inventoryWorkflowReturn.js` | **Create** |
| `src/inventory/inventoryContextUi.js` | **Create** |
| `src/components/inventory/InventoryContextStrip.jsx` | **Create** |
| `src/components/inventory/InventoryStartHere.jsx` | **Create** |
| `src/pages/StockPage.jsx` | Start Here, strip, selection, empty states, page budget |
| `src/pages/PurchaseOrdersPage.jsx` | Back to Inventory + consume tab nav |
| `src/pages/MasterCatalogPage.jsx` | Back to Inventory |
| `src/pages/OrdersPage.jsx` | Back to Inventory |
| `src/PrimeCareWebPortal.jsx` | Pass `setActivePage` |
| `scripts/verify-inventory-navigation-context.mjs` | **Create** |
| Blueprint 11 / 13 / CHANGELOG | Document |
| `docs/QA/modules/inventory/Sprint1B_*` | Docs |

**Not touched:** APIs, schema, ledger, Sprint 1A mappers, reorder engine math.

---

## 4–6. Parity / Verify / UAT

See companion Sprint 1B docs after implementation.

## Impact analysis

| Area | Impact |
|------|--------|
| Tables / APIs / RLS | None |
| Business rules | None — Start Here uses existing `stockHealth` counts only |
| Implementation gate | **ALLOWED** |
