# Sprint 1D — People Operations Navigation & Context

**Gate:** APPROVED  
**Date:** 2026-07-11  
**Commit:** `fix(people-ops): improve navigation and context awareness`

---

## 1. Feature Inventory

| Area | Current (pre-1D) | Sprint 1D change |
|------|------------------|------------------|
| Module navigation | Basic `aria-selected`, sticky L2/L3 nav | Stronger active module/screen rings |
| Breadcrumbs | Display-only labels | Clickable ancestor crumbs with `route` metadata |
| Reporting period | React state only; lost on refresh | `sessionStorage` restore on load |
| Payroll run selection | React state only | Persisted with period in `sessionStorage` |
| Context strip | Sidebar widget only | Compact **Viewing:** strip on module frames |
| Employee workspace trail | Manual non-clickable crumbs | Unified `buildPeopleOpsBreadcrumbs` with Directory link |
| Payroll period row | Light `bg-indigo-50/40` | Brand ring highlight for selected period |
| Payroll preview empty | Generic description | Period-aware empty copy |
| Back / drawer close | Directory filters preserved (1C) | Period/run also preserved (no workflow change) |

**Out of scope (unchanged):** Assignment workflow (1A), payroll workflow (1B), directory interaction (1C), budgeting, collections, distributor OS, APIs, schema, RLS, calculations.

---

## 2. Files Affected

| File | Change |
|------|--------|
| `src/peopleOps/peopleOpsNavigation.js` | Navigable breadcrumb routes; workspace trail |
| `src/peopleOps/peopleOpsReportingContextStorage.js` | **NEW** — session period/run persistence |
| `src/components/peopleOps/PeopleOpsBreadcrumbs.jsx` | Clickable crumbs, `aria-current` |
| `src/components/peopleOps/PeopleOpsContextStrip.jsx` | **NEW** — orientation strip |
| `src/components/peopleOps/PeopleOpsModuleFrame.jsx` | `onBreadcrumbNavigate` prop |
| `src/components/peopleOps/PeopleOperationsModuleNav.jsx` | Active state rings |
| `src/components/peopleOps/PeopleOpsPayrollEmptyState.jsx` | Period-aware empty copy |
| `src/components/peopleOps/PeopleOpsDashboard.jsx` | Forward nav/context props |
| `src/components/peopleOps/PeopleOpsReportsPanel.jsx` | Forward nav/context props |
| `src/components/peopleOps/PeopleOpsSettingsLanding.jsx` | Forward nav/context props |
| `src/pages/ExecutiveCompensationCenterPage.jsx` | Session restore, context props, highlights |
| `scripts/verify-people-operations-navigation-context.mjs` | **NEW** |
| `docs/PrimeCare_System_Blueprint/20_People_Operations.md` | Sprint 1D section |
| `docs/PrimeCare_System_Blueprint/13_Verification_Matrix.md` | New verify script row |
| `docs/PrimeCare_System_Blueprint/CHANGELOG.md` | Sprint 1D entry |

---

## 3. Functional Parity Report

| Capability | Before | After | Parity |
|------------|--------|-------|--------|
| Module/screen routing | `navigatePeopleOps` + `peopleOpsRoute` | Same | ✅ |
| Payroll workflow actions | Sprint 1B toolbar/modals | Untouched | ✅ |
| Assignment drawer/dialog | Sprint 1A handlers | Untouched | ✅ |
| Directory search/filters/selection | Sprint 1C | Untouched | ✅ |
| `buildExecutiveCompensationModel` | `reportingSelection` prop | Same contract | ✅ |
| Budgeting / ownership modules | Breadcrumbs only | Extra props ignored; no logic change | ✅ |
| Permissions / RLS | Unchanged | Unchanged | ✅ |

**Net:** Orientation-only UX; zero business-rule or API parity drift.

---

## 4. Verification Plan

```bash
cd primecare-portal
npm run build
node scripts/verify-people-operations-navigation-context.mjs
node scripts/verify-people-operations-enterprise-ux.mjs
node scripts/verify-no-finance-mutation.mjs
```

Regression (unchanged scripts still expected GO):

- `verify-people-operations-navigation.mjs`
- `verify-compensation-assignment-action-feedback.mjs`
- `verify-payroll-workflow-action-feedback.mjs`
- `verify-employee-directory-interaction-feedback.mjs`

---

## 5. Manual UAT Checklist

### Executive role

- [ ] Open People Operations → Dashboard. Breadcrumb shows **People Operations** (current). L2 **Dashboard** has active ring.
- [ ] Click **Payroll** module → **Pay Periods**. Breadcrumb: People Operations > Payroll > Pay Periods. **Viewing:** shows pay period + run.
- [ ] Select a different period row → row has brand ring; context strip updates.
- [ ] Refresh browser → same period/run restored.
- [ ] Click breadcrumb **People Operations** → returns to Dashboard.
- [ ] Open **Employees** > **Directory** → open **Employee Workspace**. Breadcrumb: … > Directory (clickable) > Employee name. **Viewing:** includes employee name.
- [ ] Click **Directory** crumb → back to directory; filters unchanged.
- [ ] Close compensation action drawer → period/run unchanged.
- [ ] **Payroll Preview** with no lines → empty state mentions selected period.
- [ ] **Compensation** > **Plans** → **View assignments** on a plan → assignments screen; **Viewing:** shows plan filter if applicable.

### Regression (must not break)

- [ ] Assign / change / end assignment still use drawer/dialog feedback (1A).
- [ ] Payroll submit/approve/lock still use inline toolbar errors (1B).
- [ ] Directory debounced search, row selection, export toast still work (1C).
