# Sprint 1B — Purchase Context & Continuity (Pre-Implementation)

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1B |
| Module | Purchase / Reorder |
| Date | 2026-07-12 |
| Gate | **ALLOWED** (UI/UX only) |
| Depends on | Sprint 1A action feedback (unchanged) |

## Defects addressed

| ID | Issue |
|----|-------|
| PUR-CERT-002 | No action-oriented Start Here |
| PUR-CERT-004 | Weak workflow context |
| PUR-CERT-013 | Pending receipts attention (partial — Start Here + counts) |

---

## 1. Feature Inventory

| Feature | Current UI | Read paths | Write paths | Permission | Parity after |
|---------|------------|------------|-------------|------------|--------------|
| Forecast / Reorder / Smart | Tabs | Health + `v_reorder_candidates` | Create / bulk (1A) | admin/executive | Same + Start Here handoffs |
| Create / Receive / History | Tabs | PO reads | create/update/cancel/receive (1A) | same | Same |
| Search / status filter | History | Client filter | None | same | Same + strip + Clear Filters |
| Open / Critical / Blocked counts | Tab KPIs / summary | Existing arrays | None | same | Start Here uses same counts only |
| Inventory return | Back to Inventory | session | None | same | Preserved |
| Freeze | Banner | `isHqProcurementWriteBlocked` | Blocks writes | same | Strip + banner |

---

## 2. Current Context Flow

| State | Today | After 1B |
|-------|-------|----------|
| Selected PO | Receive form / candidate only | History `aria-selected` + Selected panel + return restore |
| Search / status filter | History React state | + strip + Clear Filters / outside-filter recovery |
| Sort | None | Client sort on History (date/status/product) |
| Expanded | Edit dialog | Unchanged |
| Session return | Inventory → Purchase only | + `primecare_purchase_return_context` for Inventory/Orders |
| Nav tab hint | `hq_nav_context` | Unchanged |

---

## 3. Files affected

| File | Change |
|------|--------|
| `src/purchase/purchaseWorkflowReturn.js` | **Create** |
| `src/purchase/purchaseContextUi.js` | **Create** |
| `src/components/purchase/PurchaseStartHere.jsx` | **Create** |
| `src/components/purchase/PurchaseContextStrip.jsx` | **Create** |
| `src/pages/PurchaseOrdersPage.jsx` | Start Here, strip, selection, empty, page budget, return write/restore |
| `src/pages/StockPage.jsx` | Back to Purchase |
| `src/pages/OrdersPage.jsx` | Back to Purchase |
| `scripts/verify-purchase-navigation-context.mjs` | **Create** |
| Blueprint 11 / 13 / CHANGELOG | Document |
| `docs/QA/modules/purchase/Sprint1B_*` | Docs |

**Not touched:** APIs, schema, PURCHASE_IN, ledger, Sprint 1A mappers, reorder math, queue hierarchy (1C), Suppliers honesty (1C).

---

## 4–6. Parity / Verify / UAT

See companion Sprint 1B docs after implementation.

## Known verification blocker (documented, not fixed)

`verify-procurement-inventory-flow.mjs` fails under plain Node due to `@/` imports in `resolveInventoryUnitCost.js`. Out of scope for Sprint 1B.
