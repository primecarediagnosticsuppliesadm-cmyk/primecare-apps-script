# Sprint 1A — Collections Payment Functional Parity Report

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1A |
| Module | Collections / Credit & Risk → Payment interaction |
| Date | 2026-07-11 |
| Scope | Interaction feedback only |

## Summary

Sprint 1A localizes mutation feedback for collection payment and follow-up workflows. No APIs, schema, business rules, allocation logic, or AR calculations were changed.

**Parity verdict: PASS** — all pre-change workflows remain reachable with identical write paths.

## Workflow parity matrix

| Workflow | Pre-change surface | Post-change surface | Write API | Parity |
|----------|-------------------|---------------------|-----------|--------|
| Record payment (agent drawer) | `AgentCollectionPaymentDrawer` | Same drawer + inline `ActionErrorSummary` | `createPaymentWrite` | **PASS** |
| Record payment (Credit & Risk) | Same drawer | Same + inline errors | `createPaymentWrite` | **PASS** |
| Record payment (HQ expanded row) | `CollectionExpandedPanel` | Same + inline errors | `createPaymentWrite` | **PASS** |
| Save follow-up only (zero amount) | Payment / follow-up forms | Same + inline errors | `updateCollectionNotesWrite` | **PASS** |
| Optional proof upload after payment | Evidence field | Unchanged; warning toast on proof-only failure | `uploadOperationalEvidence` | **PASS** |
| Order-linked payment + allocation | `createPaymentWrite` → allocation RPC | Unchanged write path | Unchanged | **PASS** |
| Apps Script fallback (legacy) | `updateCollection` when allowed | Unchanged; failures now inline | Unchanged | **PASS** |
| Success toast on payment | Toast | Unchanged | Unchanged | **PASS** |
| Drawer close on success | Agent / Credit & Risk | Unchanged (enhanced for follow-up success) | Unchanged | **PASS** |
| Command Center / Agent Queue | HQ / Agent surfaces | Unchanged | Read-only | **PASS** |
| Navigation / routing | Collections page routes | Unchanged | Unchanged | **PASS** |

## Intentional behavior changes (UX only)

| Change | Classification | Functional impact |
|--------|----------------|-------------------|
| Mutation errors in drawer/panel instead of error toast | UX refinement | None — same failure conditions |
| Context-aware loading labels | UX refinement | None |
| Drawer stays open on mutation failure | UX refinement | Preserves entered values |
| Follow-up-only success closes agent/C&R drawer | UX refinement | Aligns with success lifecycle |

## Defects addressed

| ID | Severity | Resolution |
|----|----------|------------|
| COL-CERT-002 | High | Payment failures show drawer-local `ActionErrorSummary` |
| COL-CERT-010 | Medium | Processing labels (`Recording payment…`, `Saving follow-up…`) |

## Out of scope (unchanged)

- Navigation, Command Center, Agent Queue, workspace split, routing
- APIs, RPCs, payment allocation, AR calculations, schema, RLS

## Regression checks

- `verify-collections-payment-action-feedback.mjs` — Sprint 1A gate
- `verify-credit-risk-admin-flow.mjs` — Credit & Risk KPI / aging
- `verify-agent-collections-ownership-filter.mjs` — Agent ownership filter
- `verify-collection-inconsistencies.mjs` — AR hygiene

## Sign-off

| Role | Result |
|------|--------|
| Functional parity | **PASS** |
| Automated verify | **GO** (build + Sprint 1A + regression scripts) |
| Manual UAT | Pending |
