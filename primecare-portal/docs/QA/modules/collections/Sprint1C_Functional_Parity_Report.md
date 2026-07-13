# Sprint 1C — Collections Workspace Separation Functional Parity Report

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1C |
| Module | Collections — workspace separation |
| Date | 2026-07-11 |
| Scope | Visual / structural UX only |

## Summary

Sprint 1C separates Collections personas into dedicated workspace shells, each framed around one primary business question. Data loading, mutations, and routing are unchanged.

**Parity verdict: PASS** — all pre-change actions remain reachable.

## Workflow parity matrix

| Workflow | Pre-change | Post-change | Write path | Parity |
|----------|------------|-------------|------------|--------|
| Agent work queue | Inline queue cards | `AgentCollectionsWorkspace` | Read-only list | **PASS** |
| Agent record payment | Payment drawer | Same drawer | `createPaymentWrite` | **PASS** |
| HQ credit intervention | Command center | `HqCreditRiskWorkspace` | Read + drawer pay | **PASS** |
| HQ credit record payment | Drawer | Same drawer | `createPaymentWrite` | **PASS** |
| HQ receivables browse | Accordion rows | `HqReceivablesWorkspace` | Read-only | **PASS** |
| HQ receivables record payment | Inline expand | Same expand panel | `createPaymentWrite` | **PASS** |
| Lab account timeline | Inline timeline | `LabAccountWorkspace` | Read-only | **PASS** |
| Lab payment advice | Timeline action | Same | Info toast only | **PASS** |
| Distributor scoped view | Embedded page | Same workspace shell | Scoped read | **PASS** |
| Search / filter | Sticky bar | `CollectionsSearchBar` | Client filter | **PASS** |
| Refresh | Page header | Same | `loadCollections` | **PASS** |

## Intentional behavior changes (UX only)

| Change | Classification | Functional impact |
|--------|----------------|-------------------|
| Workspace shells with primary-question headers | UX refinement | None |
| Persona blocks in dedicated components | Structural | None |
| Clearer section boundaries (summary / find / act) | UX refinement | None |

## Out of scope (unchanged)

- APIs, schema, RLS, RPCs, payment allocation, AR calculations, business rules
- Navigation routes, ownership filter, Daily OS ordering

## Regression checks

- `verify-collections-workspace-separation.mjs`
- `verify-credit-risk-admin-flow.mjs`
- `verify-no-finance-mutation.mjs`

## Sign-off

| Role | Result |
|------|--------|
| Functional parity | **PASS** |
| Automated verify | **GO** |
| Manual UAT | Pending |
