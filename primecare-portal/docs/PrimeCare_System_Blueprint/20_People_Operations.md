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
├── Budgeting                   Workforce planning envelope (Phase 8.3 — planning only)
├── Ownership                   Business Ownership sales hierarchy (Phase 8.4 — read façade over lab_ownership)
├── Settings                    Payroll configuration (policies display, export prefs) — phased
└── [Future] Finance budget link   Company P&L budget remains in Finance; People Ops owns payroll envelope only
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
| Ownership | `explorer` | Ownership Explorer (new) |
| Ownership | `territories` | Territory dashboard |
| Ownership | `dashboard` | Role-scoped ownership KPIs |
| Ownership | `timeline` | Ownership timeline |
| Settings | `configuration` | Placeholder (Phase 8.1 shell) |

---

## Navigation

- **L1:** Sidebar menu **People Operations** (`compensationPayroll` permission key).
- **L2:** Module bar inside page (Dashboard, Employees, Compensation, Payroll, Budgeting, Ownership, Reports, Settings).
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

## People Operations budgeting (Phase 8.3 — planning layer)

People Operations owns **payroll envelope** planning, not company P&L. Phase 8.3 is **read/plan only** — no schema, APIs, or mutations.

| Metric | Source |
|--------|--------|
| **Current payroll** | Reporting-context run lines (`net_payable`) via `buildContextPayrollKpis` |
| **Projected payroll** | `intelligence.forecast` scenarios (`forecastMetrics` / `calculateCompensationPreview` preview-only) |
| **Approved budget** | Derived planning envelope: current payroll + 25% headroom (session/UI only until Phase 8.6 persistence) |
| **Budget variance** | Approved envelope − projected payroll |
| **Headcount planning** | Employee directory + session headcount positions |
| **Department allocation** | Employees grouped by department placeholder (`HQ`) with run-line rollups |
| **Scenario planning** | Reuses `FORECAST_SCENARIO_PRESETS` + headcount scenario templates |
| **Budget history** | Session timeline of saved planning snapshots (read-only display) |

No Finance table mutations. Finance may **read** locked payroll totals via existing EFI patterns.

### Budgeting screens

| Screen | Purpose |
|--------|---------|
| `overview` | Executive KPIs + monthly payroll, budget vs actual, headcount, department charts |
| `headcount` | Role table: current, target, open, hiring/annual cost; session positions |
| `department-budget` | Department table with expandable rows |
| `scenarios` | What-if scenarios; instant recalculation; never writes payroll |
| `history` | Read-only session timeline |

---

## Business ownership (Phase 8.4 — sales operating layer)

PrimeCare is a **Diagnostics Distribution Operating System**, not a generic HRIS. Phase 8.4 adds a **People Ops read façade** over the existing canonical ownership model — it does **not** invent a second ownership system.

### Architecture discovery (canonical SoT)

| Layer | Asset | Role |
|-------|--------|------|
| **Canonical table** | `lab_ownership` | One ACTIVE row per lab; INACTIVE = history |
| **Legacy sync** | `labs.assigned_agent_id` | Fallback via `buildOwnershipIndex` only |
| **Engine** | `src/operations/labOwnershipEngine.js` | Index, enrich, metrics |
| **Write API** | `src/api/labOwnershipApi.js` | Operations Center assign/transfer/remove |
| **Ops UI** | `LabOwnershipDrawer` / Panel | Mutation surface (unchanged) |
| **People Ops read** | `businessOwnershipModel.js` + `loadPeopleOpsOwnershipRead` | Explorer / Lab 360 / Employee 360 / territories |
| **Payroll attribution** | `payments.agent_id` → else ownership snapshot | Engine rules in doc 19 — **not** changed here |

**Verdict:** Reuse `lab_ownership`. Do not create parallel ownership tables or duplicate write paths.

### Ownership chain (read model)

```
Executive → Admin → Agent → Lab → Collections → Future Hierarchical Compensation (preview)
```

### Business ownership record (derived)

| Field | Source |
|-------|--------|
| Primary Agent | `lab_ownership.primary_agent_id` or legacy `assigned_agent_id` |
| Reporting Admin | `lab_ownership.manager_id` |
| Reporting Executive | Tenant executive profile(s) — derived |
| Effective From | `lab_ownership.assigned_at` |
| Effective To | INACTIVE row `updated_at` when history exists |
| Ownership Status | ACTIVE / INACTIVE / UNASSIGNED |

### Sales organization

**Executive → Admin → Agent** only. No org charts or HR reporting lines. Admin–agent links from `lab_ownership`; executive–admin is tenant-level visibility.

### Territory management

Business territories derived from lab `area` labels (e.g. Hyderabad West, Vizag). Dashboard only — no routing engine.

### Compensation preview (future hierarchical)

Labeled **Future Hierarchical Compensation**: Collection → Agent direct commission (existing preview lines) → Admin/Executive override placeholders (₹0). No engine change.

### Reads (no schema change)

- `loadExecutiveCompensationCenterRead` (unchanged)
- `getLabOwnershipRead` ACTIVE + INACTIVE via `loadPeopleOpsOwnershipRead`
- `businessOwnershipModel.js` (façade) + `labOwnershipEngine.js` (canonical)

---

## People Operations budgeting (Phase 8.6 — persistence)

Phase 8.6 adds tenant-configured envelope persistence (`tenant_settings` or dedicated schema). Phase 8.3 uses derived envelope only.

---

## Vertical slice implementation plan

| Slice | Scope |
|-------|--------|
| **8.1** | Product shell + module navigation; all legacy screens reachable |
| **8.1B** | Executive productivity — quick actions, approval inbox, notifications, search, favorites, workflow progress |
| **8.2** | Enterprise UX hardening — directory table, drawer 360, payroll summary, breadcrumbs, settings landing |
| **8.3** | Workforce planning & budgeting — envelope, headcount, departments, scenarios (planning only) |
| **8.4** | Business ownership — sales hierarchy, territories, ownership explorer, Lab 360, compensation preview (read-only) |
| **8.5** | Payroll UX polish — periods/run review/exports layout |
| **8.6** | Reports — analytics layout; dashboard KPI-only |
| **8.7** | Tenant-configured budget envelope persistence (schema/settings) |

Each slice: build → verify → UAT → gate before next slice.

---

## Verification (Phase 8.1+)

| Script | Purpose |
|--------|---------|
| `verify-people-operations-shell.mjs` | Module nav, screen mapping, no duplicate APIs |
| `verify-people-operations-ux.mjs` | UI framework, dashboard/reports split, errors, state preservation |
| `verify-people-operations-productivity.mjs` | Quick actions, approval inbox, notifications, search, favorites, workflow progress |
| `verify-compensation-dashboard.mjs` | Dashboard KPI presence (update labels) |
| `verify-executive-reporting-context.mjs` | Reporting context still drives model |
| `verify-compensation-no-finance-mutation.mjs` | Regression |
| `audit-phase-8-1-certification.mjs` | Shell bundle + build |
| `audit-phase-8-1a-certification.mjs` | UX bundle + regression + build |
| `audit-phase-8-1b-certification.mjs` | Productivity bundle + regression + build |
| `verify-business-ownership.mjs` | Ownership module nav, read model, no mutations |
| `verify-ownership-hierarchy.mjs` | Executive → Admin → Agent tree derivations |
| `verify-territory-dashboard.mjs` | Territory dashboard from lab areas |
| `verify-lab-ownership.mjs` | Lab 360 drawer, timeline, read-only |
| `verify-employee-ownership.mjs` | Employee 360 ownership section |
| `verify-compensation-preview-readonly.mjs` | Future override preview; no payroll writes |
| `audit-phase-8-4-certification.mjs` | Phase 8.4 ownership bundle + regression + build |

---

## Phase 8.1B — Executive productivity workspace

Phase 8.1B is **UI/productivity only**. No schema, API, RLS, payroll engine, compensation engine, or reporting-context calculation changes.

### Executive workspace (Dashboard)

| Surface | Purpose |
|---------|---------|
| **Quick Actions** | Context-aware payroll/compensation shortcuts; enable/disable from `buildPayrollWorkflowActions` |
| **Approval Inbox** | Cards for payroll awaiting approval/lock, pending exports, paid evidence, plan activation |
| **Notifications** | Information / Warning / Critical — e.g. employees without plans, overdue payroll, expiring plans |
| **Recent Activity** | Business-language feed from audit events (not raw event names) |
| **Recently Viewed** | Session-only (`sessionStorage`) — employees, plans, periods, exports, reports |
| **Favorites** | Pinned items on dashboard; `localStorage` persistence |
| **Workflow Progress** | Draft → Preview → Submitted → Approved → Locked → Exported → Paid visualization |

### Global productivity

| Surface | Purpose |
|---------|---------|
| **Global Search** | ⌘K / Ctrl+K; in-memory index from loaded model — employees, plans, assignments, payroll, exports, reports |
| **Context Panel** | Right rail (xl+): reporting context, workflow progress, current selection |
| **Empty states** | Actionable guidance instead of "No data" |
| **Toasts** | Consistent success feedback for workflow actions |

### Implementation assets

| Asset | Role |
|-------|------|
| `peopleOpsProductivityModel.js` | Pure derivations — quick actions, inbox, notifications, activity, search, workflow |
| `usePeopleOpsSessionState.js` | Recently viewed + favorites |
| `components/peopleOps/productivity/*` | Reusable panels |

Quick actions **must** reuse `buildPayrollWorkflowActions` from `payrollWorkflowUi.js` — no duplicate workflow logic.

---

## Phase 8.2 — Enterprise product hardening

Phase 8.2 is **UI/UX only**. No schema, API, RLS, payroll engine, compensation engine, workflow rules, or reporting-context calculation changes.

### Employees module

| Surface | Rule |
|---------|------|
| **Directory** | `EnterpriseDataTable` with KPI strip, filters (search, role, plan, assignment status), bulk actions |
| **Employee 360** | Slide-over drawer — directory remains visible; selection preserved across module navigation |
| **Columns** | Employee, Role, Department (placeholder), Plan, Assignment Status, Payroll Status, Updated, Actions |

### Compensation module

| Surface | Rule |
|---------|------|
| **Summary cards** | Plans, Assignments, Active, Inactive, Draft counts |
| **Row actions** | Overflow menu — View, Edit, Duplicate, Deactivate, History |
| **Assigned count** | Clickable — navigates to Assignments filtered by plan |

### Payroll module

| Surface | Rule |
|---------|------|
| **Payroll summary** | Employees, Gross, Commission, Adjustments, Recoveries, Net — from **selected reporting run** lines only |
| **Workflow progress** | Draft → Paid visualization with current stage highlighted |
| **Primary CTA** | Open Preview on periods screen |

### Dashboard

Operational only — no analytical duplication. KPI cards and Pending Actions derive from **current reporting context** (single selected run). Reporting context card shows Period, Version, Generated, Generated By, Status, Last Refresh.

### Reports

Analytics only — trends, intelligence panel. No workflow or editing actions.

### Settings

Configuration landing with phased cards (Payroll Policies, Approval Matrix, Export Templates, Work Calendars, Pay Cycles) — **Available in Phase 8.6**, no editable settings.

### Navigation

Every module: page title, description, breadcrumb (`People Operations > Module > Screen`). Sticky module nav and sticky filter bars.

### QA seed

`seed-qa-people-ops-display-names.mjs` — realistic QA persona display names only; no production changes.

### Verification

| Script | Purpose |
|--------|---------|
| `verify-people-operations-enterprise-ux.mjs` | Enterprise components, drawer, overflow menus, settings landing |
| `verify-people-operations-navigation.mjs` | Breadcrumbs, sticky nav |
| `verify-people-operations-dashboard.mjs` | Reporting-context KPI derivation, no analytics on dashboard |
| `verify-people-operations-payroll-layout.mjs` | Payroll summary + workflow visualization |
| `verify-people-operations-table-standardization.mjs` | EnterpriseDataTable + PeopleOpsTableShell |
| `audit-phase-8-2-certification.mjs` | Full bundle + regression + build |
| `verify-workforce-budgeting.mjs` | Budgeting module, planning workspace, no mutations |
| `verify-headcount-planning.mjs` | Headcount table, session positions |
| `verify-budget-scenarios.mjs` | Scenario calculations, forecast reuse |
| `verify-budget-dashboard.mjs` | Budget overview KPIs and charts |
| `audit-phase-8-3-certification.mjs` | Workforce planning bundle + regression + build |

---

## Phase 8.3 — Workforce planning & budgeting

Planning layer only — no schema, APIs, payroll workflow, or finance mutations.

| Screen | ID |
|--------|-----|
| Budget Overview | `overview` |
| Headcount Planning | `headcount` |
| Department Budget | `department-budget` |
| Scenario Planning | `scenarios` |
| Budget History | `history` |

Approved budget = derived envelope (current reporting-context payroll + 25% headroom). Headcount positions and scenario history are **session-only** until Phase 8.6 persistence.

---

## Do-not-break

Inherits `19_Executive_Compensation_Payroll_Engine.md` and `15_Do_Not_Break_Rules.md`:

- Orders, invoices, payments, AR, inventory, collections SoT
- Payroll workflow invariants and immutability after lock
- Cash-only commission rules
- RLS and multi-tenant isolation

---

## RC5 — Founder UX & business language (UI only)

People Operations surfaces use **business language** for founders, HR, and finance managers:

| Pattern | Rule |
|---------|------|
| Warnings | Problem → Reason → Primary CTA (never silent technical jargon) |
| Empty states | Explain what is missing and the next action |
| Terminology | Compensation Plan, Compensation Assignment, Business Ownership, Reporting Structure, Payroll Preview, Payroll Run |
| Help | Every major module has “What does this page do?” |
| Onboarding | Dismissible five-step path: Employees → Compensation → Business Ownership → Payroll → Reports |

**Not changed in RC5:** schema, APIs, calculations, write paths, finance/collections/ownership engines.

Verification: `verify-rc5-business-language.mjs`, `audit-rc5-founder-certification.mjs`.

---

## RC6 — Founder dashboard actionability (UI only)

Dashboard answers three questions in under 15 seconds:

| Widget | Business question |
|--------|-------------------|
| **What needs my attention today?** | What requires my decision? |
| **Current Payroll Cycle** | Where are we in payroll? |
| **Business Activity Today** | What changed today? |

Every payroll status shows **Status → Explanation → Primary CTA**. Activity never shows internal event names. Section `?` help explains why the card matters.

**Not changed in RC6:** schema, APIs, calculations, write paths.

Verification: `verify-rc6-founder-language.mjs`, `audit-rc6-founder-certification.mjs`.

---

## Future roadmap

| Horizon | Capabilities |
|---------|--------------|
| **Year 1** | People Ops shell, directory, payroll UX, reports, payroll envelope |
| **Year 2** | Departments, managers, documents, ATS lite, adjustment UI, export email |
| **Enterprise** | Leave, benefits, full performance management, bank/GL handoff (Finance-led) |
