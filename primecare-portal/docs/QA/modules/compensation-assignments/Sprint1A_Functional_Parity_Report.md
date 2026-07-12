# Sprint 1A — Compensation Assignments Functional Parity Report

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1A |
| Module | People Operations → Compensation → Assignments |
| Date | 2026-07-11 |
| Scope | Interaction feedback only |

## Summary

Sprint 1A localizes mutation feedback for compensation assignment workflows. No APIs, schema, business rules, or calculations were changed.

**Parity verdict: PASS** — all pre-change workflows remain reachable with identical write paths.

## Workflow parity matrix

| Workflow | Pre-change surface | Post-change surface | Write API | Parity |
|----------|-------------------|---------------------|-----------|--------|
| Assign employee to plan | `CompensationActionDrawer` (assign) | Same drawer + inline errors | `assignEmployeeToPlan` | **PASS** |
| Change employee plan | `CompensationActionDrawer` (change) | Same drawer + inline errors | `changeEmployeePlanAssignment` | **PASS** |
| End assignment | Table row → immediate API call | Table row → confirm dialog → API | `endEmployeePlanAssignment` | **PASS** (enhanced) |
| View assignment | Row → Employee 360 | Unchanged | Read-only | **PASS** |
| Segment filters (all/active/unassigned/history) | Assignments tab | Unchanged | Read-only | **PASS** |
| Directory-driven assign/change intent | Directory → Assignments drawer | Unchanged routing | Unchanged | **PASS** |
| Assignment history preservation | API metadata | Unchanged | Unchanged | **PASS** |
| Role permissions (assign/change/end) | `compensationAdminPermissions` | Unchanged | Unchanged | **PASS** |
| Duplicate active assignment guard | API `employee_already_has_active_assignment` | Same + business-mapped drawer error | Unchanged | **PASS** |
| Plan role scope validation | API `compensation_plan_role_mismatch` | Same + business-mapped drawer error | Unchanged | **PASS** |

## Intentional behavior changes (UX only)

| Change | Classification | Functional impact |
|--------|----------------|-------------------|
| Mutation errors in drawer/dialog instead of page banner | UX refinement | None — same failure conditions |
| End assignment requires confirmation | UX refinement | Prevents accidental end; same API on confirm |
| Submit buttons show processing labels | UX refinement | None |
| Drawer stays open on mutation failure | UX refinement | Preserves entered values |

## Out of scope (unchanged)

- Payroll workflow toolbar
- Employee directory bulk assign busy state
- Budgeting session writes
- Navigation / URL routes
- Collections / Distributor OS

## Regression checks

- `verify-compensation-plan-assignment.mjs` — assignment tab + APIs
- `verify-compensation-plan-action-feedback.mjs` — plans pattern unaffected
- `verify-compensation-no-finance-mutation.mjs` — finance boundary
- `verify-role-plan-validation.mjs` — role scope rules

## Sign-off

| Role | Result |
|------|--------|
| Functional parity | **PASS** |
| Automated verify | Pending post-build |
| Manual UAT | Pending |
