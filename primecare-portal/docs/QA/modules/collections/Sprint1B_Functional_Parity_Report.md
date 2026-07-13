# Sprint 1B — Agent Collections Functional Parity Report

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1B |
| Module | Collections → Agent work queue |
| Date | 2026-07-11 |
| Scope | Agent interaction feedback only |

## Summary

Sprint 1B improves agent daily collection workflow predictability without changing write paths, ownership rules, or route prioritization.

**Parity verdict: PASS** — all pre-change agent workflows remain reachable with identical APIs and business rules.

## Workflow parity matrix

| Workflow | Pre-change surface | Post-change surface | Write API | Parity |
|----------|-------------------|---------------------|-----------|--------|
| View work queue | Route-ordered cards | Same + selected highlight | Read-only | **PASS** |
| Search labs | Immediate filter | Debounced filter (300ms) | Read-only | **PASS** |
| Open payment drawer | `openCollectionPanel` | Same | Read-only | **PASS** |
| Record payment | Drawer + `createPaymentWrite` | Same + duplicate guard | `createPaymentWrite` | **PASS** |
| Upload proof | Post-payment evidence API | Same + field status/progress | `uploadOperationalEvidence` | **PASS** |
| Refresh queue | Header Refresh | Same + feedback toast + drawer re-hydrate | Read-only | **PASS** |
| Ownership filter | `filterCollectionsForUser` | Unchanged | Unchanged | **PASS** |
| Route ordering | `useAgentDailyOs` / `sortByAgentRouteOrder` | Unchanged | Unchanged | **PASS** |
| HQ Credit & Risk | Command center + drawer | Unchanged | Unchanged | **PASS** |
| Sprint 1A payment errors | Drawer `ActionErrorSummary` | Retained | Unchanged | **PASS** |

## Intentional behavior changes (UX only)

| Change | Classification | Functional impact |
|--------|----------------|-------------------|
| Selected lab ring + context strip | UX refinement | None |
| Debounced search | UX refinement | None |
| Search-aware empty states | UX refinement | None |
| Session persistence (search + selection) | UX refinement | Restores agent context on refresh |
| Refresh toast + drawer re-hydrate | UX refinement | None |
| Evidence upload status on field | UX refinement | None |
| Drawer stays open when proof fails after payment | UX refinement | Payment already saved; enables retry |
| Duplicate submission guard | UX refinement | Prevents double payment click |

## Out of scope (unchanged)

- Payment allocation, AR calculations, RPCs, schema, RLS
- Navigation architecture, HQ Command Center, routing
- Ownership filtering, Daily OS prioritization, route ordering

## Regression checks

- `verify-agent-collections-interaction-feedback.mjs`
- `verify-agent-collections-ownership-filter.mjs`
- `verify-credit-risk-admin-flow.mjs`
- `verify-no-finance-mutation.mjs`

## Sign-off

| Role | Result |
|------|--------|
| Functional parity | **PASS** |
| Automated verify | **GO** |
| Manual UAT | Pending |
