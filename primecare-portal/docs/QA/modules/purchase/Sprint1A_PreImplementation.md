# Sprint 1A — Purchase Action Feedback & Trust (Pre-Implementation)

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1A |
| Module | Purchase / Reorder |
| Date | 2026-07-12 |
| Gate | **ALLOWED** (UI/UX only) |
| Baseline | `Architecture_Review_Certification_Baseline.md` (Founder-finalized) |

## Scope

Improve interaction feedback for existing Purchase write actions. No schema, API, RPC, PURCHASE_IN, ledger, ORDER_OUT, reorder engine, receiving eligibility, finance, permission, layout, Start Here, or queue changes.

### Feature inventory (in scope)

| Workflow | Current UI | Handler | Permission | Write API | Business rule | Parity after |
|----------|------------|---------|------------|-----------|---------------|--------------|
| Create PO | Create tab form | `handleCreatePurchaseOrder` | admin/executive; procurement freeze | `createPurchaseOrderWrite` | Draft/Ordered; catalog product; qty/cost > 0 | **Same** + Action Pattern |
| Create draft from Forecast | Forecast row CTA | `handleCreateDraftPoFromTrigger` | same | `createPurchaseOrderWrite` | Blocked if open PO (`canAutoCreate`) | **Same** |
| Bulk Critical drafts | Forecast bulk button | `handleBulkCreateCriticalDraftPos` | same | loop `createPurchaseOrderWrite` | CRITICAL + canAutoCreate only | **Same** |
| Edit PO | History → Edit dialog | `handleSaveEditPo` | same | `updatePurchaseOrderWrite` | Draft/Ordered; received_qty = 0 | **Same** + dialog stays open on fail |
| Cancel PO | History → Cancel | `handleCancelPo` | same | `cancelPurchaseOrderWrite` | Draft/Ordered; received_qty = 0 | **Same** |
| Receive PO | Receive tab | `handleReceivePurchaseOrder` | same | `receivePurchaseOrderWrite` | Ordered/Partial; qty ≤ remaining → stock + **PURCHASE_IN** | **Same** (mapper moves to Purchase) |
| Freeze Purchase | Banner + early return | `isHqProcurementWriteBlocked` | freeze flag | N/A (blocks UI writes) | No writes when frozen | **Same** + action-site frozen message |

### Out of scope

Start Here · Queue hierarchy · Suppliers · Navigation · Context strip · Pending Receipts UX · Explainability (PUR-CERT-015) · Layout/KPI redesign · Engineering file split

---

## Files affected

| File | Change |
|------|--------|
| `src/purchase/mapPurchaseMutationError.js` | **Create** |
| `src/purchase/purchaseActionUi.js` | **Create** — busy labels |
| `src/pages/PurchaseOrdersPage.jsx` | Wire Action Pattern on all in-scope writes |
| `scripts/verify-purchase-action-feedback.mjs` | **Create** |
| `scripts/verify-inventory-action-feedback.mjs` | Receive mapper ownership → Purchase |
| Blueprint 11 / 13 / CHANGELOG | Document Sprint 1A |
| `docs/QA/modules/purchase/Sprint1A_*` | Pre-impl, parity, UAT |

**Not touched:** `primecareSupabaseApi.js` write bodies, RPCs, schema, RLS, reorder calc, StockPage.

---

## Verification Plan

| Script | Purpose |
|--------|---------|
| `verify-purchase-action-feedback.mjs` | Sprint 1A UX gate |
| `npm run build` | Compile |
| `verify-procurement-inventory-flow.mjs` | PURCHASE_IN integrity |
| `verify-rc1-procurement-lifecycle.mjs` | Cancel/update/receive wiring |
| `verify-no-finance-mutation.mjs` | Finance boundary |

---

## Manual UAT

See `Sprint1A_UAT_Checklist.md`.

---

## Impact analysis

| Area | Impact |
|------|--------|
| Tables / APIs / RLS | None |
| PURCHASE_IN / ledger / ORDER_OUT | None |
| Business rules | None |
| Regression risk | Low — UX feedback only |
| Implementation gate | **ALLOWED** |
| Closes | PUR-CERT-003 (primary) |
