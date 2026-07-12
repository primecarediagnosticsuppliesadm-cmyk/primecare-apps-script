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
| Employees | `workspace` | Employee Workspace (deep-link; hidden from sub-nav) |
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
| **Employees** | Directory, Employee Workspace, Quick View navigation | Profile provisioning (Operations Center) |
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
| `EmployeeCompensation360Panel` | **DEPRECATED** — superseded by `Employee360Workspace`; retained for verify scripts until browser UAT cleanup PR |
| `Employee360Workspace` | **NEW** — canonical Employee Workspace (full page + Quick View compact mode) |
| `employee360WorkspaceModel.js` | **NEW** — compose-only read model for workspace sections |
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
| `verify-employee-ownership.mjs` | Employee Workspace ownership tab |
| `verify-employee360-workspace.mjs` | Employee Workspace IA, Today budget, operational status, quick actions, HR gate |
| `verify-employee360-business-profile.mjs` | Employee Workspace business profile compose + action handler |
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
| **Employee Workspace** | Canonical full-page workspace — opened from directory row click |
| **Employee Quick View** | Compact Today-only drawer — opened from directory overflow action |
| **Columns** | Employee, Role, Department (placeholder), Plan, Assignment Status, Payroll Status, Updated, Actions |

Directory filter/search state lives on the page shell (`employeeSearch`, role/plan/assignment filters) so it survives workspace navigation and back.

---

## Employee Workspace (canonical employee experience)

Employee Workspace is the **benchmark 360 pattern** for future Lab, Distributor, Customer, and Vendor workspaces. It is action-oriented — not an information dump. Employee Workspace **composes** existing read models; it is **not** a new source of truth.

### A. Surface architecture

| Surface | Role | Entry |
|---------|------|-------|
| **Employee Directory** | Canonical employee list — search, filters, bulk actions | `employees/directory` |
| **Employee Workspace** | Canonical full employee workspace | Directory row click → `employees/workspace` |
| **Employee Quick View** | Compact Today-only drawer | Directory overflow → Quick view |

The workspace screen is **deep-link only** (`navHidden: true` in `peopleOpsNavigation.js`) — it does not appear in the Employees sub-nav bar.

### B. Workspace tabs

| Tab | Purpose | Visibility |
|-----|---------|------------|
| **Today** | What should I do? Why? What happens if I don't? | Always |
| **Compensation** | Current plan + assignment history | Always |
| **Payroll** | Payroll + commission + adjustments by period | Always |
| **Ownership** | Lab and territory attribution | Field roles (agents) only |
| **History** | Business milestones + operational activity (single chronological list) | Always |
| **Documents / Assets / Leave** | HR lifecycle modules | Hidden until `PEOPLE_OPS_HR_MODULE_ENABLED = true` |

Never expose unfinished HR modules or fake-data tabs.

### C. Today-tab page budget

Maximum surfaces on Today (enforced in `employee360WorkspaceModel.js`):

| Element | Max |
|---------|-----|
| Next Best Action | 1 |
| Current Tasks | 5 |
| Operational Status card | 1 |
| Employee Snapshot | 1 |
| Relationship Summary | 1 (full workspace only; omitted in Quick View) |

**Prohibited on Today:** duplicated KPI grids, executive summary panels, inline write forms.

Quick View renders Today only in compact mode inside `EmployeeCompensation360Drawer`.

### D. Operational Status vocabulary

Replace abstract numeric health scores. Only these states:

| Status | Meaning |
|--------|---------|
| **Ready** | No blocking issues for this employee in current reporting context |
| **Needs Attention** | Action recommended but not blocking |
| **Blocked** | Cannot proceed safely until resolved |

Built by `buildEmployee360OperationalStatus()` from existing assignment, payroll, and ownership read signals.

### E. Information ownership

| Domain | Owner module / SoT | Workspace role |
|--------|-------------------|----------------|
| Identity / profile | Operations Center / `profiles` | Snapshot + relationship summary (read compose) |
| Compensation | Compensation module | Compensation tab + NBA/tasks |
| Payroll + commission | Payroll module | Payroll tab |
| Territory + lab ownership | Business Ownership / Operations Center | Ownership tab + relationship summary |
| History | Audit + lifecycle read models | History tab (merged milestones + activity) |

Employee Workspace **must not** become a write SoT or duplicate owner-module calculations.

### F. Write-path rules

All mutations route to owner modules — **no duplicated write behavior** inside Employee Workspace.

| Action | Write path |
|--------|------------|
| Assign Plan | `CompensationActionDrawer` → `compensationPlanAdminSupabaseApi` assign |
| Change Plan | `CompensationActionDrawer` → existing change write path |
| End Assignment | Compensation → Assignments workflow (existing) |
| Deactivate Employee | Operations Center provisioning |
| Payroll actions | People Operations → Payroll module |
| Ownership actions | Ownership module / Operations Center `labOwnershipApi` |

Directory-launched assign/change flows lock the employee in `CompensationActionDrawer`.

### G. History model

`buildEmployee360History()` merges:

- **Business milestones** — plan assignments, ownership changes, payroll run events (Flag icon)
- **Operational activity** — audit and workflow activity (Zap icon)

Single chronological list; event type differentiated by icon. Sources remain existing audit and lifecycle read models — no duplicate events.

### H. Role and permission rules

Permissions unchanged from `employeeCompensation360Permissions()` and `compensationAdminPermissions()`:

| Capability | Founder | Executive | HR | Payroll Admin | Finance | Admin | Agent |
|------------|---------|-----------|-----|---------------|---------|-------|-------|
| View Employee Workspace | Yes | Yes | Yes | Yes | Yes | Yes | Own only |
| Quick Actions (assign/change) | — | Yes | Assign | Assign | — | — | — |
| Ownership tab content | View | View | View | View | View | View | Own labs only |
| Deactivate | — | Via Ops Center | Via Ops Center | — | — | Via Ops Center | — |

Do **not** broaden permissions in workspace UI. Agent self-view must not expose HR/admin actions.

### I. Future 360 standard

Employee Workspace is the reference pattern for:

- Lab Workspace
- Distributor Workspace
- Customer Workspace
- Vendor Workspace

Pattern:

1. Full canonical workspace page
2. Compact quick-view drawer (Today only)
3. Action-oriented Today tab with page budget
4. Owner-module write routing (no inline mutations)
5. Compose-only read model (`*WorkspaceModel.js`)

### Routing (current implementation)

Navigation is **in-page React state** (`peopleOpsRoute`, `selectedEmployeeProfileId`, `employee360ViewMode`) — not URL-backed.

| Flow | Behavior |
|------|----------|
| Directory row → Workspace | Sets `employees/workspace` + loads employee 360 read |
| Back → Directory | Clears workspace selection; directory filters preserved (page-level state) |
| Compensation Assignments | Closes workspace by design |
| Quick View + full Workspace | Mutually exclusive — drawer only when `employee360ViewMode === 'quick'` |

**Known gap:** Browser refresh and back/forward do **not** restore Employee Workspace or selected employee. Deep URL routing is a future enhancement — not in this slice.

### Implementation assets

| Asset | Role |
|-------|------|
| `employee360WorkspaceModel.js` | Compose-only workspace sections |
| `peopleOpsHrModuleConfig.js` | HR module gate (`PEOPLE_OPS_HR_MODULE_ENABLED`) |
| `components/peopleOps/employee360/*` | Workspace UI components |
| `EmployeeCompensation360Drawer.jsx` | Quick View shell |
| `Employee360Workspace.jsx` | Full + compact workspace renderer |

Verification: `verify-employee360-workspace.mjs`, `verify-employee360-business-profile.mjs`, `verify-people-operations-enterprise-ux.mjs`.

---

## Compensation Plans (operational page standard)

The Compensation Plans screen answers one question:

**"Are compensation plans ready, and which plan needs management?"**

### A. Approved layout

| Zone | Rule |
|------|------|
| Page title + business purpose | `PeopleOpsModuleFrame` — one sentence |
| Primary CTA | **Create Plan** — opens `CompensationPlanActionDrawer` |
| Readiness summary | One compact card (e.g. active count + draft review CTA) |
| Search + status filter | Above the table |
| Primary table | Single `EnterpriseDataTable` of compensation plans |
| Plan details / simulation | Collapsed secondary section — only when a plan is explicitly opened |

**Prohibited on the operational Plans page:**

- Payroll workflow progress strip
- Full executive summary KPI grids
- Distribution analytics
- Timeline analytics
- Duplicate KPI layers
- Inline create/edit forms
- Unrelated enterprise blockers (Dashboard owns those)

### B. Plan write workflow

| Action | Surface | Write path |
|--------|---------|------------|
| Create | `CompensationPlanActionDrawer` (create) | `createCompensationPlan` |
| Edit draft | Drawer or collapsed details editor | `saveCompensationPlanAdmin` |
| Duplicate | Drawer confirmation | `duplicateCompensationPlan` |
| Activate / Deactivate | Drawer confirmation | `activateCompensationPlan` / `deactivateCompensationPlan` |

Mutation errors **must appear inside the action surface** (`ActionErrorSummary` in drawer or details panel).

The page-level `DataFetchError` banner is **reserved for page-load failures** (plans failed to load, permissions unresolved).

Handlers return structured results:

```js
{ success: true, data? } | { success: false, error: MappedMutationError }
```

Success UI (drawer close, toast, table refresh) runs **only when `success === true`**.

### C. Platform action-feedback rule

**"The result of an action must appear where the action occurred."**

| Error class | Display |
|-------------|---------|
| Page-load failure | Page banner + retry; may show stale data note |
| Mutation/action failure | Drawer, modal, form, or row context |
| Global/system failure | Global banner |

Mutation feedback must:

- Preserve entered values
- Keep the action surface open
- Focus the error summary or invalid field (`role="alert"`, keyboard-focusable)
- Use business language via `mapCompensationPlanMutationError()`
- Provide one clear recovery action
- Log technical detail without exposing raw database errors in production copy

Shared component: `ActionErrorSummary` — reusable, minimal, not coupled to Compensation-only domains; **not** used for read/load failures.

### D. Duplicate plan constraint (business mapping)

Database constraint **`compensation_plans_code_version_key`** remains authoritative — **not changed**.

| Field | Business copy |
|-------|---------------|
| Title | Plan code and version already exist |
| Message | A compensation plan with code "{code}" and version "{version}" already exists. Choose another version or open the existing plan. |
| Field errors | plan code, version |
| Recovery | **Open Existing Plan**, **Change Version** |

Raw PostgreSQL constraint text must not be the main production-facing message. Technical detail may appear in dev-only expandable section.

Client-side pre-check: `assertNoDuplicatePlanCodeVersion()` against loaded plan rows before insert.

### E. Page budget (Compensation Plans)

| Element | Maximum |
|---------|---------|
| Readiness card | 1 |
| Compact contextual notice | 1 (module dependency from page shell) |
| Primary table | 1 |
| Primary CTA | 1 |
| Summary values above table | 4 (within readiness line) |
| Inline forms | 0 |
| Trend charts | 0 |
| Unrelated payroll workflow strips | 0 |

Target viewport (1366×768 / 1440×900): title, readiness, filters, and first plan rows visible without major scrolling.

### F. Functional ownership

| Domain | Owner surface |
|--------|---------------|
| Plan administration | **Compensation Plans** |
| Employee assignment readiness | **Compensation Assignments** |
| Payroll lifecycle | **Payroll** |
| Historical analytics and trends | **Reports** |
| Enterprise-wide blockers | **Dashboard** |

Canonical relocations from Plans page:

- Payroll status → Payroll module
- Assignment readiness → Compensation Assignments
- Trends/distribution/timeline → Reports or plan details when explicitly opened

### Implementation assets

| Asset | Role |
|-------|------|
| `CompensationPlanActionDrawer.jsx` | Create, edit, duplicate, activate/deactivate surfaces |
| `mapCompensationPlanMutationError.js` | Business error mapper |
| `ActionErrorSummary.jsx` | Shared mutation error UI |
| `CompensationPlansTab.jsx` | Operational page layout |

Verification: `verify-compensation-plan-action-feedback.mjs`, `verify-compensation-plan-management.mjs`, `verify-compensation-ui-actions.mjs`.

### Compensation Assignments module

| Surface | Rule |
|---------|------|
| **Summary cards** | Plans, Assignments, Active, Inactive, Draft counts (assignments context) |
| **Row actions** | Assign, Change Plan, End Assignment, View — table actions on assignments screen |
| **Assigned count** | Clickable — navigates to Assignments filtered by plan |

#### Assignment write workflow (Sprint 1A)

| Action | Surface | Write path |
|--------|---------|------------|
| Assign | `CompensationActionDrawer` (assign) | `assignEmployeeToPlan` |
| Change plan | `CompensationActionDrawer` (change) | `changeEmployeePlanAssignment` |
| End assignment | `CompensationEndAssignmentDialog` (confirm) | `endEmployeePlanAssignment` |

Mutation errors **must appear inside the action surface** (`ActionErrorSummary` in drawer or end dialog).

Handlers return structured results:

```js
{ success: true } | { success: false, error: MappedAssignmentMutationError }
```

Success UI (drawer/dialog close, toast, table refresh) runs **only when `success === true`**.

End assignment requires explicit confirmation before calling `endEmployeePlanAssignment`.

Submit buttons show processing labels (`Assigning plan…`, `Saving change…`, `Ending assignment…`) while async.

Mapper: `mapCompensationAssignmentMutationError.js` — business copy for active assignment, role mismatch, not found, forbidden.

Verification: `verify-compensation-assignment-action-feedback.mjs`, `verify-compensation-plan-assignment.mjs`.

### Payroll module

| Surface | Rule |
|---------|------|
| **Payroll summary** | Employees, Gross, Commission, Adjustments, Recoveries, Net — from **selected reporting run** lines only |
| **Workflow progress** | Draft → Paid visualization with current stage highlighted |
| **Primary CTA** | Open Preview on periods screen |

#### Payroll workflow action feedback (Sprint 1B)

| Action | Surface | Write path |
|--------|---------|------------|
| Generate Preview | `PayrollWorkflowToolbar` | `generatePayrollPreview` |
| Submit / Approve / Reject / Lock / Export / Mark Paid | `PayrollWorkflowToolbar` modal | `payrollDomainSupabaseApi` workflow writes |

Mutation errors **must appear inside the toolbar or workflow modal** (`ActionErrorSummary`).

Handlers return structured results:

```js
{ success: true, data? } | { success: false, error: MappedPayrollMutationError }
```

Modals close **only when `success === true`**. Destructive actions use confirm modals (not `window.confirm`).

Loading labels: Generating payroll preview…, Approving payroll…, Locking payroll…, Exporting payroll…, Marking payroll paid…

Mapper: `mapPayrollWorkflowMutationError.js`

Verification: `verify-payroll-workflow-action-feedback.mjs`, `verify-payroll-rbac.mjs`, `verify-payroll-no-finance-mutation.mjs`

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
