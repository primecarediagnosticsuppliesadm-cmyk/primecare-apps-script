# Sprint 1B — Payroll Workflow Functional Parity Report

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1B |
| Module | People Operations → Payroll |
| Date | 2026-07-11 |
| Scope | Interaction feedback only |

## Summary

Sprint 1B localizes mutation feedback for payroll workflow actions. No APIs, schema, business rules, or calculations were changed.

**Parity verdict: PASS**

## Workflow parity matrix

| Workflow | Pre-change | Post-change | Write API | Parity |
|----------|------------|-------------|-----------|--------|
| Generate Preview | Toolbar button | Same + inline error + loading label | `generatePayrollPreview` | **PASS** |
| Submit Preview | Confirm → API | Modal confirm + inline error | `submitPayrollRunWrite` | **PASS** |
| Approve Payroll | window.confirm → API | Modal confirm + inline error | `approvePayrollRunWrite` | **PASS** |
| Reject Payroll | Modal → immediate close | Modal awaits success | `rejectPayrollRunWrite` | **PASS** |
| Lock Payroll | window.confirm → API | Modal confirm + inline error | `lockPayrollRunWrite` | **PASS** |
| Generate Export | window.confirm → API | Modal confirm + inline error | `generatePayrollExportWrite` | **PASS** |
| Mark Paid Evidence | Modal → immediate close | Modal awaits success | `recordPayrollPaidWrite` | **PASS** |
| Reporting period / run selection | Page state | Preserved on success refresh | — | **PASS** |
| Payroll RBAC | `payrollWorkflowUi` | Unchanged | — | **PASS** |

## Intentional UX changes only

- Errors in toolbar or modal (`ActionErrorSummary`), not global banner
- Modals close only on `success === true`
- Loading labels on all workflow buttons
- `window.confirm` replaced with accessible confirm modals

## Out of scope (unchanged)

- Compensation Assignments (Sprint 1A)
- Directory, Budgeting, Navigation
- Collections, Distributor OS

## Sign-off

| Role | Result |
|------|--------|
| Functional parity | **PASS** |
| Automated verify | Pending post-build |
| Manual UAT | Pending |
