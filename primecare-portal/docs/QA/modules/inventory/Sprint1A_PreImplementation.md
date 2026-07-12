# Sprint 1A — Inventory Action Feedback (Pre-Implementation)

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1A |
| Module | Inventory-adjacent writes (Master Catalog + Purchase Receive) |
| Date | 2026-07-11 |
| Gate | **ALLOWED** (UI/UX only) |
| Baseline | `Architecture_Review_Certification_Baseline.md` |

## Scope

Improve interaction feedback for existing inventory write actions. No schema, API, RPC, ledger, ORDER_OUT, PURCHASE_IN semantics, opening-stock logic, reorder engine, permission, layout, or workflow changes.

### In scope

| Action | Current UI | Handler | Permission | Write API | Business rule | Parity after |
|--------|------------|---------|------------|-----------|---------------|--------------|
| Create SKU (+ optional opening stock) | Master Catalog modal | `ProductFormModal` submit | admin/executive; catalog freeze | `createHqProductWrite` | Seeds product + inventory; opening `IN` when qty > 0 | **Same** + inline errors / busy / toast |
| Edit SKU thresholds/pricing | Master Catalog modal | same | same | `updateHqProductWrite` | Does not change `current_stock` | **Same** |
| Enable SKU | Row Enable | `handleToggleActive` | same | `setHqProductActiveWrite(true)` | Soft activate | **Same** |
| Disable SKU | Row Disable | `handleToggleActive` | same | `setHqProductActiveWrite(false)` | Soft deactivate; inventory retained | **Same** |
| Receive stock / purchase receipt | Purchase → Receive tab | `handleReceivePurchaseOrder` | admin/executive; procurement freeze | `receivePurchaseOrderWrite` | ↑ stock + `PURCHASE_IN` | **Same** |

### Out of scope

Reorder engine · Adjustments · Transfers · Cycle counts · Start Here · Explainability · Layout/KPI/workspace split · Create PO feedback (unless incidental)

---

## Files affected

| File | Change |
|------|--------|
| `src/inventory/mapInventoryMutationError.js` | **Create** |
| `src/inventory/inventoryActionUi.js` | **Create** — loading labels |
| `src/pages/MasterCatalogPage.jsx` | Wire Action Pattern |
| `src/pages/PurchaseOrdersPage.jsx` | Receive Action Pattern only |
| `scripts/verify-inventory-action-feedback.mjs` | **Create** |
| `scripts/verify-inventory-admin-flow.mjs` | **Create** — write-path parity gate |
| `scripts/verify-inventory-ledger-integrity.mjs` | **Create** — alias → reconciliation |
| `scripts/verify-order-inventory-sync.mjs` | **Create** — ORDER_OUT path untouched gate |
| Blueprint 11 / 13 / CHANGELOG | Document Sprint 1A |
| `docs/QA/modules/inventory/Sprint1A_*` | Pre-impl, parity, UAT |

**Not touched:** `primecareSupabaseApi.js` write bodies, RPCs, schema, RLS, StockPage layout, reorder tabs.

---

## Verification Plan

| Script | Purpose |
|--------|---------|
| `verify-inventory-action-feedback.mjs` | Sprint 1A UX gate |
| `npm run build` | Compile |
| `verify-inventory-admin-flow.mjs` | Catalog/receive write APIs still wired |
| `verify-inventory-ledger-integrity.mjs` | No negative stock (reconciliation) |
| `verify-order-inventory-sync.mjs` | ORDER_OUT path unchanged |
| `verify-no-finance-mutation.mjs` | Finance boundary |

---

## Manual UAT

See `Sprint1A_UAT_Checklist.md`.

---

## Impact analysis

| Area | Impact |
|------|--------|
| Tables / APIs / RLS | None |
| Business rules | None |
| Regression risk | Low — UX feedback only |
| Implementation gate | **ALLOWED** |
