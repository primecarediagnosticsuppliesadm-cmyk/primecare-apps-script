# Sprint 1A — HQ Order Action Feedback Functional Parity Report

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1A |
| Module | Orders → Order Details status actions |
| Date | 2026-07-11 |
| Scope | Interaction feedback only |

## Summary

Sprint 1A localizes mutation feedback for HQ order status actions. No APIs, schema, RPCs, lifecycle rules, inventory deduction, ORDER_OUT, AR posting, invoice/shipment generation, pricing, taxes, permissions, or RLS were changed.

**Parity verdict: PASS** — all pre-change workflows remain reachable with identical write paths.

## Workflow parity matrix

| Workflow | Pre-change surface | Post-change surface | Write API | Parity |
|----------|-------------------|---------------------|-----------|--------|
| Mark Processing | Status Actions | Same + loading label + inline errors | `updateOrderStatusWrite` | **PASS** |
| Mark Fulfilled | Status Actions | Same + loading label + inline errors | `updateOrderStatusWrite` | **PASS** |
| Cancel Order | Status Actions | Same + loading label + inline errors | `updateOrderStatusWrite` | **PASS** |
| Reset to Placed | Status Actions | Same + loading label + inline errors | `updateOrderStatusWrite` | **PASS** |
| Optional status note | Textarea above buttons | Unchanged; retained on failure | Same payload `note` | **PASS** |
| Freeze gate | Buttons disabled + banner | Unchanged; freeze message also mappable inline | Unchanged | **PASS** |
| Apps Script fallback | When allowed | Unchanged write path; failures inline | `updateOrderStatus` | **PASS** |
| Success feedback | Page-top banner | Toast (UX only) | Unchanged writes | **PASS** |
| Selection / filters / search | Preserved via React state | Explicitly preserved; no full-list reset required for status success | Unchanged | **PASS** |
| Checkout / Lab Ordering | Separate pages | Untouched | N/A | **PASS** |

## Intentional behavior changes (UX only)

| Change | Classification | Functional impact |
|--------|----------------|-------------------|
| Status mutation errors in Status Actions via `ActionErrorSummary` | UX refinement | None — same failure conditions |
| Success toast instead of page-top success banner for status actions | UX refinement | None |
| Per-action loading labels + `aria-busy` | UX refinement | None |
| Duplicate-submit guard (`inflight` ref) | UX refinement | Prevents double-click races only |
| Patch affected order + refresh detail (vs full silent list reload) | UX refinement | Same status result; preserves scroll/filters |

## Confirmations

| Check | Result |
|-------|--------|
| No feature removal | **PASS** |
| No permission changes | **PASS** |
| No lifecycle changes | **PASS** |
| No finance changes | **PASS** |

## Out of scope (unchanged)

- Schema, APIs, RPCs, ORDER_OUT, inventory deduction logic, AR posting, invoice/shipment generation
- Pricing, taxes, RLS, permissions
- Checkout, Lab Ordering, Inventory
- Layout, routing, workspace split

## Regression checks

- `verify-orders-action-feedback.mjs`
- `verify-orders-admin-flow.mjs`
- `verify-order-payment-sync.mjs`
- `verify-transaction-integrity-rpcs.mjs`
- `verify-no-finance-mutation.mjs`

## Sign-off

| Role | Result |
|------|--------|
| Functional parity | **PASS** |
| Automated verify | **GO** (build + Sprint 1A + regression scripts) |
| Manual UAT | Pending |
