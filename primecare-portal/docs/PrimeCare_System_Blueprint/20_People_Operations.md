# 20 — People Operations

HQ workforce, compensation design, and payroll operations for PrimeCare.

---

## Product vision

**Executive Compensation** (Phases 3–7.2) delivered a production-ready HQ payroll engine: cash-only commission, immutable payroll runs, plan administration, profile-primary employees, reporting context, and executive analytics.

**People Operations** is the **product evolution** of that capability — an enterprise HRIS-style HQ surface (BambooHR / Rippling / Workday patterns) where **Payroll is one module**, not the entire product.

| Principle | Rule |
|-----------|------|
| **Engine reuse** | Payroll engine, compensation engine, reporting context, Employee 360, workflow, and analytics are **not rebuilt** |
| **Façade** | `executiveCompensationModel.js` remains the read-model orchestrator |
| **No finance mutation** | People Operations never mutates orders, invoices, payments, AR, inventory, or GL |
| **Provisioning boundary** | User create/deactivate remains **Operations Center**; Employees module links there |
| **Growth commission** | **Commission Management** stays separate (not payroll SoT) |

Executive Compensation documentation in `19_Executive_Compensation_Payroll_Engine.md` remains authoritative for **domain rules, schema, workflow, and invariants**. This document owns **product structure, navigation, modules, and UX evolution**.

---

## Evolution from Executive Compensation

| Before (Phase 4–7) | After (Phase 8+) |
|--------------------|------------------|
| Single page, nine flat tabs | **People Operations** product with module navigation |
| Menu: "Executive Compensation" | Menu: **People Operations** (`compensationPayroll` route key unchanged) |
| `ExecutiveCompensationCenterPage` | `PeopleOperationsPage` (same implementation path, module shell) |
| Intelligence on Overview | **Reports → Analytics** (Overview reserved for operational KPIs) |

No domain tables, workflow states, or calculation rules change in Phase 8.0–8.1.

---

## Module hierarchy

```
People Operations
├── Dashboard                 Operational cycle overview (reporting context + KPIs)
├── Employees                 Directory + Employee 360
├── Compensation                Plans, assignments, simulator (no payroll runs)
├── Payroll                     Periods, run review, ledger, activity, exports
├── Reports                     Executive analytics (ratios, rankings, territory, forecast)
├── Settings                    Payroll configuration (policies display, export prefs) — phased
└── [Future] Budget & Workforce Planning   Phase 8.6 — envelope vs actual from payroll totals
```

### Explicitly out of Year 1 scope (roadmap only)

Talent, ATS, Recruitment, Onboarding, Offboarding, Leave, Benefits, Performance reviews, Documents, Manager hierarchy, Department hierarchy, Org charts, Bank files, GL, Accounting, Time tracking.

---

## Screen hierarchy

| Module | Screen ID | Legacy tab / source |
|--------|-----------|---------------------|
| Dashboard | `home` | Overview (KPIs + trends; no analytics panel) |
| Employees | `directory` | Employees |
| Compensation | `plans` | Compensation Plans |
| Compensation | `assignments` | Plan Assignments |
| Payroll | `periods` | Payroll Periods |
| Payroll | `run-review` | Payroll Preview |
| Payroll | `commission-ledger` | Commission History |
| Payroll | `activity` | Audit |
| Payroll | `exports` | Exports |
| Reports | `analytics` | ExecutiveCompensationIntelligencePanel |
| Settings | `configuration` | Placeholder (Phase 8.1 shell) |

---

## Navigation

- **L1:** Sidebar menu **People Operations** (`compensationPayroll` permission key).
- **L2:** Module bar inside page (Dashboard, Employees, Compensation, Payroll, Reports, Settings).
- **L3:** Sub-screen bar when module has multiple screens (Compensation, Payroll).
- **Global:** Reporting context card on Dashboard; period/run selection propagates via existing `reportingSelection` on `buildExecutiveCompensationModel`.

Route key remains `compensationPayroll` for permissions and prefetch compatibility. Page component: `PeopleOperationsPage`.

---

## Role matrix (People Operations)

| Capability | Founder | Executive | HR | Payroll Admin* | Finance | Admin | Agent |
|------------|---------|-----------|-----|----------------|---------|-------|-------|
| Dashboard | View | View + act | View | View | View | View | — |
| Employees directory | View | View | View | View | View | View | — |
| Employee 360 | View | View | View | View | View | View | Own only |
| Compensation plans | View | Edit | View | View | View | View | — |
| Plan assignments | View | Edit | Assign | Assign | View | View | — |
| Payroll preview/submit | — | Approve path | Generate/submit | Generate/submit | View | View | — |
| Approve/lock/export/paid | — | Yes | No | No | View | No | — |
| Reports analytics | View | View | View | View | View | View | — |
| Settings | View | Edit | View | View | View | View | — |

\*Payroll Admin uses `hr` role today until dedicated role is certified.

Agent self-service: **My Pay** (Employee 360) — Phase 8.2; not in Phase 8.1 menu.

Full RBAC: `compensationPlanAdminWorkflow.js`, `payrollWorkflowUi.js`, `employeeCompensation360Workflow.js`, `04_Role_Access_Matrix.md`.

---

## Module ownership

| Module | Owns (UI) | Does not own |
|--------|-----------|--------------|
| **Dashboard** | Reporting context, operational KPIs, trends, promotion pipeline snapshot | Payroll calculation, finance KPIs |
| **Employees** | Directory, Employee 360 navigation | Profile provisioning (Operations Center) |
| **Compensation** | Plans, assignments, simulator | Payroll runs, commission ledger |
| **Payroll** | Periods, run review, workflow toolbar, ledger, activity, exports | Plan rule authoring (Compensation module) |
| **Reports** | Analytics presentation from `model.intelligence` | New analytics math (use `analytics/*`) |
| **Settings** | Display policies, export preferences | Workflow rule changes without blueprint |

---

## Workflow ownership

| Workflow | Owner API | UI surface |
|----------|-----------|------------|
| Preview generation | `compensationSupabaseApi.generatePayrollPreview` | Payroll → Periods / Run Review |
| Submit / approve / reject | `payrollDomainSupabaseApi` | PayrollWorkflowToolbar |
| Lock / export / paid evidence | `payrollDomainSupabaseApi` | PayrollWorkflowToolbar |
| Plan create/version/activate | `compensationPlanAdminSupabaseApi` | Compensation → Plans |
| Assign / change / end plan | `compensationPlanAdminSupabaseApi` | Compensation → Assignments |

---

## Integration boundaries

| External system | Relationship |
|-----------------|--------------|
| **Operations Center** | SoT for `profiles` create/deactivate; deep link from Employees |
| **Access & Security** | Sibling in PEOPLE menu; IAM audit |
| **Executive Financial Intelligence** | Company financial analytics; read-only cross-link |
| **Commission Management** | Growth/distributor commission; **not** payroll SoT |
| **Finance budgeting** | Fiscal budget in Finance; People Ops payroll **envelope** (Phase 8.6) consumes locked payroll totals only |

---

## Reuse matrix

| Asset | Action |
|-------|--------|
| `executiveCompensationModel.js` | **KEEP** — façade for all read models |
| `reportingContext.js` + `analytics/*` | **KEEP** |
| `compensationReadSupabaseApi.js` | **KEEP** |
| `payrollDomainSupabaseApi.js` | **KEEP** |
| `compensationPlanAdminSupabaseApi.js` | **KEEP** |
| `employeeCompensation360SupabaseApi.js` | **KEEP** |
| `EmployeeCompensation360Panel` | **MOVE** → Employees module |
| `CompensationPlansTab` | **MOVE** → Compensation → Plans |
| `CompensationPlanAssignmentsTab` | **MOVE** → Compensation → Assignments |
| `PayrollWorkflowToolbar` | **KEEP** — Payroll screens |
| `ExecutiveCompensationIntelligencePanel` | **MOVE** → Reports → Analytics |
| `ExecutiveCompensationCenterPage` | **REFACTOR** → `PeopleOperationsPage` module shell |
| `peopleOpsNavigation.js` | **NEW** — module/screen constants |
| `PeopleOperationsModuleNav` | **NEW** — L2/L3 navigation UI |

---

## People Operations budgeting (Phase 8.6 — not Finance)

People Operations owns **payroll envelope** planning, not company P&L.

| Metric | Source |
|--------|--------|
| **Payroll actual** | Sum from **reporting context** persisted run lines (`gross_pay`, `net_payable`) |
| **Payroll forecast** | Existing `forecastMetrics` scenarios (preview-only) |
| **Payroll budget** | Tenant-configured envelope (Phase 8.6 schema or `tenant_settings` JSON) |
| **Budget variance** | Budget − actual (same period) |
| **Headcount planning** | Active assignments + directory count |
| **Hiring capacity** | Envelope remaining / average cost per employee (derived) |

No Finance table mutations. Finance may **read** locked payroll totals via existing EFI patterns.

---

## Vertical slice implementation plan

| Slice | Scope |
|-------|--------|
| **8.1** | Product shell + module navigation; all legacy screens reachable |
| **8.1A** | UI/UX unification — module frame, operational dashboard, analytical reports, filter bar, errors, empty states, nav polish |
| **8.2** | Employees — enterprise directory table, My Pay route |
| **8.3** | Compensation — plans/assignments UX polish |
| **8.4** | Payroll — periods/run review/exports UX |
| **8.5** | Reports — analytics layout; dashboard KPI-only |
| **8.6** | Budget & workforce planning read module |

Each slice: build → verify → UAT → gate before next slice.

---

## Verification (Phase 8.1+)

| Script | Purpose |
|--------|---------|
| `verify-people-operations-shell.mjs` | Module nav, screen mapping, no duplicate APIs |
| `verify-people-operations-ux.mjs` | UI framework, dashboard/reports split, errors, state preservation |
| `verify-compensation-dashboard.mjs` | Dashboard KPI presence (update labels) |
| `verify-executive-reporting-context.mjs` | Reporting context still drives model |
| `verify-compensation-no-finance-mutation.mjs` | Regression |
| `audit-phase-8-1-certification.mjs` | Shell bundle + build |
| `audit-phase-8-1a-certification.mjs` | UX bundle + regression + build |

---

## Do-not-break

Inherits `19_Executive_Compensation_Payroll_Engine.md` and `15_Do_Not_Break_Rules.md`:

- Orders, invoices, payments, AR, inventory, collections SoT
- Payroll workflow invariants and immutability after lock
- Cash-only commission rules
- RLS and multi-tenant isolation

---

## Future roadmap

| Horizon | Capabilities |
|---------|--------------|
| **Year 1** | People Ops shell, directory, payroll UX, reports, payroll envelope |
| **Year 2** | Departments, managers, documents, ATS lite, adjustment UI, export email |
| **Enterprise** | Leave, benefits, full performance management, bank/GL handoff (Finance-led) |
