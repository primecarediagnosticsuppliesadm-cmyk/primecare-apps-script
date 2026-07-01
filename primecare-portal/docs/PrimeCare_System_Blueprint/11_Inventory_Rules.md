# 11 — Inventory Rules

Stock snapshot, ledger movements, procurement receive, catalog coupling.

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
- `verify-procurement-inventory-flow.mjs`
- `verify-inventory-dashboard-kpi.mjs`

---

## Freeze

Procurement writes may be blocked when `VITE_HQ_PROCUREMENT_FROZEN` — inventory reads still allowed.
