# Blueprint CHANGELOG

Gaps, conflicts, and structural changes. **Add entry when doc vs code disagree or structure changes.**

---

## 2026-07-08 — RC2 Enterprise UX Hardening

### Change

- Enterprise design tokens (`enterpriseLayout.js`) and dense typography/spacing.
- Shared RC2 components: `RoleChip`, `EnterpriseMetricStrip`, `ExecutiveCommandCenterShell`, `Lab360SectionNav`.
- Compact KPI cards, section cards, module frames, and table density.
- Executive Command Center (Admin Dashboard) and Founder Command Center layouts.
- People Ops dashboard metric strip + inline reporting toolbar.
- Employee directory avatars + role chips; Employee 360 business-first section order.
- Lab 360 tabbed drawer navigation; professional Settings landing copy.

### Not changed

- Schema, Supabase, APIs, business logic, calculations, payroll engine, finance, collections, workflows, RLS.

### Verification

- `node scripts/audit-rc2-ui-certification.mjs`

---

## 2026-07-08 — Phase 9.3 Collection Compensation & Executive Performance (Year 1–3 final business layer)

### Change

- Read-model compose layer connecting payroll preview, ownership hierarchy, collections, and intelligence.
- `collectionCompensationModel`, `hierarchicalCompensationModel`, `executivePerformanceModel`, `employee360BusinessProfileModel`, `labPerformanceContributionModel`, `founderPerformanceCardsEngine`.
- Collection Compensation Dashboard on People Ops payroll run-review.
- Hierarchical compensation panel on Business Ownership.
- Executive performance KPIs + rankings on Reports.
- Employee 360 business profile (read-only).
- Lab performance contribution in Commercial Lab 360 and Lab Ownership 360.
- Founder OS performance decision cards (rule-based).
- Business ownership role rollups (executive / admin / agent / lab).

### Not changed

- Schema, migrations, RLS, payroll engine, commission engine, finance mutation paths, collections workflow, commercial SoT.

### Verification

- `node scripts/audit-phase-9-3-certification.mjs`

---

## 2026-07-08 — Phase 9.2 Founder Operating System & Decision Engine

### Change

- Blueprint `23_Founder_Operating_System.md`.
- Founder OS page (`founderOperatingSystem`) — compose workspace over ops, commercial, compensation reads.
- Rule-based insights + top-5 priorities + decision queue + global search index.
- Executive FOUNDER sidebar section; `founderNavigation` aliases to Founder OS.

### Not changed

- Finance, payroll, compensation engines, commercial compose logic, schema, RLS, workflow engines.

### Verification

- `node scripts/audit-phase-9-2-certification.mjs`

---

## 2026-07-08 — Phase 9.1 Platform Consolidation & Production Readiness Foundation

### Change

- Blueprint `22_Platform_Consolidation.md`.
- `platformConsolidationModel.js` — workspace homes, deep-link nav keys, KPI/report ownership, financial SoT registry, tech debt registry.
- `productionReadinessModel.js` + `ProductionReadinessDashboardPage.jsx` — Architecture Readiness (not Founder OS).
- Executive/Admin sidebar: Commercial only in GROWTH; FOUNDER section removed; deep-link keys hidden globally.
- Control Tower quick link → Commercial (not Qualification Analytics).

### Not changed

- Finance, payroll, commission engines, Commercial compose logic, schema, RLS, API mutations.

### Verification

- `node scripts/audit-phase-9-1-certification.mjs`

---

## 2026-07-08 — Phase 9.0 Commercial CRM & Lab Growth Platform

### Discovery

- No Salesforce-style CRM exists. Commercial ops already live in Qualification (`lab_qualifications`), Visits (`agent_visits`), Contracts (`lab_contracts`), Labs lifecycle, Ownership (`lab_ownership`), Revenue Funnel, and Dist OS.
- Phase 9.0 is a **compose workspace** (`commercialCrm`) — read façades only. No new CRM tables.

### Change

- Blueprint `21_Commercial_CRM.md`.
- Commercial module: Dashboard, Pipeline, Labs, Activities, Contracts, Forecast, Reports.
- Derivations in `commercialWorkspaceModel.js`; reads via existing qualification / contracts / visits APIs.

### Not changed

- Orders, Collections, Finance, Payroll, Inventory, RLS, People Ops engines, qualification/contract write APIs.

### Verification

- `node scripts/audit-phase-9-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.4 Business Ownership

### Discovery

- Canonical ownership SoT already exists: `lab_ownership` + `labOwnershipEngine` + Operations Center writes.
- Phase 8.4 reuses that model as a People Ops **read façade** — does not invent a second ownership system.
- Legacy `labs.assigned_agent_id` remains sync fallback only.

### Change

- New **Business Ownership** module: Explorer, Territories, Dashboard, Timeline.
- Derivations in `businessOwnershipModel.js` — reuses `labOwnershipEngine`, `getLabOwnershipRead`, compensation read bundle.
- Lab Ownership drawer, Employee 360 ownership section, Future Hierarchical Compensation preview (placeholders only).
- Parallel read `loadPeopleOpsOwnershipRead` — ACTIVE + INACTIVE `lab_ownership` rows; no schema migration.

### Not changed

- Payroll/compensation engines, workflow, reporting context math, finance tables, commission calculations, RLS, exports, budgeting calculations, Operations Center ownership writes.

### Verification gates

- `node scripts/audit-phase-8-4-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.3 Workforce Planning & Budgeting

### Change

- New **Budgeting** module: Budget Overview, Headcount Planning, Department Budget, Scenario Planning, Budget History.
- Planning derivations in `workforceBudgetingModel.js` — reuses `executiveCompensationModel`, `reportingContext`, `forecastMetrics`, employee directory.
- Session-only headcount positions and scenario history (`sessionStorage`) — no persistence, no mutations.
- Approved budget = derived planning envelope from reporting-context payroll (25% headroom); not Finance P&L.

### Not changed

- Payroll/compensation engines, workflow, APIs, schema, RLS, finance tables, exports.

### Verification gates

- `node scripts/audit-phase-8-3-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.2 Enterprise UX Hardening

### Change

- Employees: enterprise directory table with KPI strip, filters, bulk actions; Employee 360 in slide-over drawer.
- Compensation: executive summary cards, overflow action menus, improved status badges.
- Payroll: summary strip + workflow progress on run review; Open Preview primary CTA.
- Dashboard: reporting-context KPI cards, actionable pending tasks, no analytical duplication.
- Settings: intentional configuration landing (Phase 8.6 placeholders).
- Navigation: breadcrumbs, sticky module nav, standardized table chrome.
- QA: `seed-qa-people-ops-display-names.mjs` for realistic demo personas.

### Not changed

- Payroll/compensation engines, APIs, schema, RLS, workflow rules, finance boundaries.

### Verification gates

- `node scripts/audit-phase-8-2-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.1B Executive Productivity

### Change

- Executive workspace: Quick Actions, Approval Inbox, Notifications Center, Recent Activity, Recently Viewed, Favorites.
- Global search (⌘K / Ctrl+K) across loaded People Operations data — employees, plans, assignments, payroll, exports, reports.
- Context panel with reporting context, workflow progress visualization, and current selection.
- Productivity derivations in `peopleOpsProductivityModel.js`; session state via `sessionStorage`.
- Quick actions reuse `buildPayrollWorkflowActions` — no duplicate workflow logic.

### Not changed

- Payroll/compensation engines, APIs, schema, RLS, reporting context calculations, finance boundaries.

### Verification gates

- `node scripts/verify-people-operations-productivity.mjs`
- `node scripts/audit-phase-8-1b-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.1A UI/UX Unification

### Change

- Introduce shared People Operations UX primitives: `PeopleOpsModuleFrame`, `PeopleOpsSectionCard`, `PeopleOpsFilterBar`, `PeopleOpsDashboard`, `PeopleOpsReportsPanel`, `peopleOpsStatusTokens`.
- Operational dashboard: payroll status, pending actions, current payroll, employees, notifications, current period — **no trend charts**.
- Analytical content moved to **Reports** (trends + intelligence panel).
- Standardize errors (`DataFetchError` + retry), freshness (`DataFreshnessLabel`), success feedback (`usePortalToast`).
- Fix `ReadHealthBanner` prop (`health` not `readHealth`).
- Module state preservation: employee search/filters/360 selection retained when switching modules.
- Meaningful empty states across payroll, exports, directory.
- Navigation polish: design tokens, ARIA tablist on module nav.

### Not changed

- Payroll/commission calculations, reporting context, APIs, workflow logic, schema, RLS, finance boundaries.

### Verification gates

- `node scripts/verify-people-operations-ux.mjs`
- `node scripts/audit-phase-8-1a-certification.mjs`

---

## 2026-07-08 — People Operations Phase 8.0 / 8.1 Shell

### Change

- Add canonical product document `20_People_Operations.md` — Executive Compensation evolves into **People Operations** (module hierarchy, reuse matrix, vertical slices 8.1–8.6).
- Phase **8.1** delivers module navigation shell: Dashboard, Employees, Compensation, Payroll, Reports, Settings.
- Replace flat nine-tab UI with `PeopleOperationsModuleNav` + `peopleOpsNavigation.js`.
- Rename page export to `PeopleOperationsPage`; preserve `ExecutiveCompensationCenterPage` alias and `compensationPayroll` route key.
- Menu label: **People Operations** (`enterpriseCopy.compensationPayroll`).
- Move `ExecutiveCompensationIntelligencePanel` from Dashboard to **Reports → Analytics**.
- Settings → Configuration placeholder (no new backend).

### Not changed

- Payroll engine, compensation engine, reporting context, Employee 360, workflow, plan/assignment APIs, analytics helpers, export/audit APIs, schema, RLS, finance boundaries.

### Verification gates

- `node scripts/verify-people-operations-shell.mjs`
- `node scripts/audit-phase-8-1-certification.mjs`
- Existing compensation/payroll regression scripts

---

## 2026-07-08 — Executive Compensation Phase 7.2 Analytics Context

### Change

- Introduce canonical **Executive Reporting Context** (`periodId` + `payrollRunId`) for all executive compensation analytics.
- Refactor read-model analytics into focused helpers under `src/compensation/analytics/`; `executiveCompensationModel.js` remains the façade.
- Overview KPIs, intelligence ratios/rankings/territory/forecast baseline derive from **one selected payroll run** only.
- Add Payroll % Cash Collected and Payroll % Revenue Generated (same period window).
- Exclude Probe/smoke/automation/QA fixture identities from executive analytics.
- Profile-primary employee metrics (`profile_user_id`); trend charts use latest run per historical period only.
- Reporting Context card in Executive Compensation Center UI.

### Not changed

- Finance, AR, payments, orders, invoices, payroll approval/export/paid workflow, plan administration, assignments, RLS, schema migrations.

### Verification gates

- `node scripts/verify-executive-reporting-context.mjs`
- `node scripts/verify-compensation-ratios.mjs`
- `node scripts/verify-compensation-rankings.mjs`
- `node scripts/verify-compensation-forecast.mjs`
- `node scripts/verify-compensation-territories.mjs`
- `node scripts/audit-phase-7-2-certification.mjs`
- Existing compensation regression scripts

---

## 2026-07-07 — Enterprise Compensation Phase 7.1

### Change

- Refactor compensation domain from agent-centric to **profile-primary enterprise employee compensation**.
- Migration `20260707140000_enterprise_compensation_phase_7_1.sql`: `profile_user_id` required on assignments; `agent_id` optional except agent role; role-aware `compensation_plans.role_scope` check; HQ employee profile roles extended.
- Add role scopes: agent, admin, executive, hr, warehouse, delivery, operations, support, future.
- New Plan wizard with role defaults; Activate Plan; Assign Employee APIs and UI.
- Employee Directory + Employee Compensation 360 replace Agent-only directory (Agent 360 preserved via compatibility aliases).
- Payroll preview includes all active assigned employees; commission remains cash-only and agent-role only.

### Not changed

- Finance, AR, payments, orders, invoices, payroll approval workflow, export, GL, bank, accounting.

### Verification gates

- `node scripts/verify-enterprise-compensation-roles.mjs`
- `node scripts/verify-employee-directory.mjs`
- `node scripts/verify-role-based-payroll-preview.mjs`
- `node scripts/verify-agent-commission-isolation.mjs`
- `node scripts/verify-role-plan-validation.mjs`
- `node scripts/verify-compensation-ui-actions.mjs`
- All existing compensation verify scripts

---

## 2026-07-04 — Executive Compensation Phase 6A.1 Certification Cleanup

### Change

- Refresh stale `verify-payroll-preview.mjs` checks for Executive Compensation UI and split preview vs workflow audit ownership.
- Allow preview regeneration when a paid period has an active reopened draft run (`assertPayrollPeriodDraftForPreview` + draft-run line artifact replacement).
- Skip invalid paid-period status churn during reopened run workflow (`shouldSyncPeriodStatus` in payroll domain API).
- Add QA-only compensation seed script (`seed-qa-compensation-data.mjs --apply`) and Phase 6A.1 certification audit script.

### Not changed

- No finance, AR, payments, orders, invoice, allocation, inventory, logistics, GL, bank, or accounting mutation paths.

### Verification gates

- `node scripts/verify-payroll-preview.mjs`
- `node scripts/verify-payroll-period-generation.mjs`
- `node scripts/verify-payroll-preview-idempotency.mjs`
- `node scripts/seed-qa-compensation-data.mjs --apply` (QA only)
- `node scripts/audit-phase-6a1-certification.mjs` (QA only)

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 6A Payroll Approval Workflow UI

### Change

- Add **Payroll Workflow** toolbar to Executive Compensation Center Payroll Periods and Payroll Preview tabs.
- Wire status-gated actions: submit, approve, reject, lock, export metadata, mark paid evidence.
- Reuse Phase 3C `payrollDomainSupabaseApi` writers; no payroll calculation or finance mutation changes.
- Add confirmation for irreversible actions; reject and paid evidence forms require reason/reference fields.
- RBAC: Executive full workflow; HR generate/submit only; Admin view-only.

### Not changed

- No bank payout, GL, accounting, finance, AR, payments, orders, invoice, allocation, inventory, or logistics mutation.
- No payroll calculation rule or compensation plan rule changes.

### Verification gates

- `node scripts/verify-payroll-approval-ui.mjs`
- `node scripts/verify-payroll-workflow-actions.mjs`
- `node scripts/verify-payroll-export-ui.mjs`
- `node scripts/verify-payroll-paid-evidence.mjs`
- `node scripts/verify-payroll-no-finance-mutation.mjs`

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 5B Agent Compensation 360

### Change

- Add **Agent Compensation 360** as the single employee compensation profile from Executive Compensation → Agents.
- Add bounded read loader `loadAgentCompensation360Read` and directory loader `loadAgentCompensationDirectoryRead`.
- Add seven read-focused sections: Overview, Payroll History, Commission History, Compensation Plan (+ history), Adjustments (read-only), Promotion (review-only), Audit Timeline.
- Reuse Phase 5A `changeEmployeePlanAssignment` for plan changes from 360; no new payroll or finance mutation paths.
- Extend RBAC: Executive full view + plan change; HR view + assign plan; Admin view-only; Agent own-profile contract (future); Lab/Distributor blocked.

### Not changed

- No payroll preview calculation, approval workflow, export, mark paid, accounting, finance, AR, payments, orders, or O2C mutation.

### Verification gates

- `node scripts/verify-agent-compensation-profile.mjs`
- `node scripts/verify-agent-payroll-history.mjs`
- `node scripts/verify-agent-commission-history.mjs`
- `node scripts/verify-agent-plan-history.mjs`
- `node scripts/verify-agent-compensation-security.mjs`

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 5A Compensation Administration

### Change

- Add **Compensation Plans** and **Plan Assignments** permanent tabs to Executive Compensation Center.
- Add compensation plan administration APIs for create, draft edit, active version create, duplicate, deactivate, assignment change/end.
- Add plan details panel with fixed/variable/promotion/bonus/incentive/audit sections.
- Add read-only compensation simulator and promotion eligibility review panel (no automatic promotion).
- Extend page access to Executive (full CRUD), HR (read + assign), Admin (read-only). Agent remains own-plan read contract only.
- Enforce active-plan versioning: edits create a new plan version; retired versions preserve assignment history.

### Not changed

- No payroll preview calculation changes, approval workflow, export, paid evidence, finance, AR, payments, orders, or O2C mutation.

### Verification gates

- `node scripts/verify-compensation-plan-management.mjs`
- `node scripts/verify-compensation-plan-versioning.mjs`
- `node scripts/verify-compensation-plan-assignment.mjs`
- `node scripts/verify-compensation-simulator.mjs`
- `node scripts/verify-compensation-role-security.mjs`

---

## 2026-07-04 — Executive Compensation UI hotfix (export read columns)

### Change

- Add `generatePayrollPreview()` with draft-only payroll run, line, and commission entry persistence from cash-collected inputs.
- Add idempotent regeneration: existing draft preview for a period is cleared and rebuilt without duplicate lines or commission entries.
- Add preview generation audit evidence: generated_by/at, period, plan versions, rule version, source payment hash, calculation version.
- Add Executive UI **Generate Payroll Preview** action for draft payroll periods in the Executive Compensation Center.
- Bump compensation rule version to `PC_COMP_YEAR1_2026_PHASE4B`.

### Not changed

- No approval, lock, export, mark paid, finance/O2C mutation, or period status advancement beyond draft preview artifacts.

### Verification gates

- `node scripts/verify-payroll-preview-generation.mjs`
- `node scripts/verify-payroll-preview-idempotency.mjs`
- `node scripts/verify-payroll-calculation-rules.mjs`
- `node scripts/verify-payroll-plan-resolution.mjs`
- `node scripts/verify-payroll-period-generation.mjs`

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 4A Executive Compensation Center (Read-Only UI)

### Change

- Add Executive-only read-only Executive Compensation Center UI with dashboard KPIs, payroll periods table, payroll preview grid, agent compensation detail, compensation history timeline, and trend charts.
- Restrict `compensationPayroll` navigation and page permission to `executive` only for Phase 4A.
- Add read-only bounded loader `loadExecutiveCompensationCenterRead` sourcing payroll/compensation tables only.
- Add Phase 4A verification scripts: `verify-compensation-dashboard.mjs`, `verify-payroll-preview-ui.mjs`, `verify-compensation-history.mjs`, `verify-compensation-role-ui.mjs`.

### Not changed

- No payroll approval, lock, export, mark paid, adjustment editing, plan editing, finance mutation, database schema, or workflow behavior.
- HR/Admin/Agent/Lab/Distributor have no Executive Compensation Center access in Phase 4A.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/verify-compensation-dashboard.mjs`
- `node scripts/verify-payroll-preview-ui.mjs`
- `node scripts/verify-compensation-history.mjs`
- `node scripts/verify-compensation-role-ui.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-compensation-rls.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`

### Phase 4B gate

- GO only after Phase 4A read-only UI gates pass and review confirms no mutation hooks, finance reads beyond compensation tables, or workflow bypass.

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 3C Payroll Domain Completion

### Change

- Add backend/domain payroll workflow states through `paid`: `draft -> previewed -> submitted -> approved -> locked -> exported -> paid`.
- Define `paid` as payroll-domain evidence only, with no `payments`, AR, allocation, invoice, order, inventory, logistics, accounting, GL, bank, or disbursement mutation.
- Add immutable-after-lock rules: locked/exported/paid payroll runs and detail rows cannot be edited; reopen creates a new draft run version.
- Add adjustment domain rules for positive, negative, recovery, advance, and correction adjustments with Executive approval for payable impact.
- Add audit/workflow event vocabulary for preview, submit, approve, reject, lock, export, pay, reopen, and adjustment request/approval/rejection.
- Add CSV, Excel-ready, and accounting-ready export model rules with export metadata/checksum only.
- Add Phase 3C verification bundle for locking, immutability, RBAC, audit, export, lifecycle, adjustments, and versioning.

### Not changed

- No payroll UI, Executive dashboard, or agent self-view UI was built.
- No Finance, AR, Payments, Orders, Invoices, Collections, Inventory, Logistics, legacy Commission Engine calculation, Projection Engine, projection flag, or O2C business rule behavior changed.
- No accounting entries, bank payouts, GL postings, payment disbursement records, or bank files are created.
- Phase 3B calculation engine remains unchanged.

### Verification gates

- `node scripts/verify-payroll-lifecycle.mjs`
- `node scripts/verify-payroll-locking.mjs`
- `node scripts/verify-payroll-immutability.mjs`
- `node scripts/verify-payroll-rbac.mjs`
- `node scripts/verify-payroll-audit.mjs`
- `node scripts/verify-payroll-export.mjs`
- `node scripts/verify-payroll-adjustments.mjs`
- `node scripts/verify-payroll-versioning.mjs`
- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`

### Executive UI gate

- GO only after Phase 3C backend/domain gates pass and review confirms no UI, payout, accounting, bank, or Finance/O2C mutation was introduced.

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 3B Preview Calculation

### Change

- Add preview-only compensation calculation engine scope: cash-only commission, Year-1 salary/allowance rules, collection efficiency, promotion eligibility, draft payroll preview totals, attribution snapshot fallback, and versioned calculation snapshots.
- Define that Phase 3B may write only draft compensation/payroll preview rows and calculation audit start/finish events.
- Add verification gates for calculation, cash-only commission, promotion eligibility, attribution snapshots, payroll preview, and plan versioning.

### Not changed

- No payroll approval, submission workflow, lock, export, payout, bank integration, accounting entry, GL posting, employee portal, dashboard, UI page, manual adjustment UI, or bonus approval workflow.
- No Finance, AR, Payments, Orders, Invoices, Collections, Inventory, Logistics, legacy Commission Engine, Projection Engine, projection flag, or O2C business rule behavior changed.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/verify-compensation-schema.mjs`
- `node scripts/verify-compensation-calculation.mjs`
- `node scripts/verify-cash-only-commission.mjs`
- `node scripts/verify-promotion-eligibility.mjs`
- `node scripts/verify-attribution-snapshots.mjs`
- `node scripts/verify-payroll-preview.mjs`
- `node scripts/verify-plan-versioning.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`

### Phase 3C gate

- GO only after Phase 3B verification passes and review confirms draft-only preview behavior with no approval/export/payout or O2C mutation.

---

## 2026-07-04 — Executive Compensation & Payroll Engine Phase 3A Foundation

### Change

- Add Phase 3A compensation/payroll foundation migration for new domain tables, lifecycle constraints, indexes, RLS helpers, RLS policies, and HR role SQL constraint support.
- Implement `hr` role metadata, labels, provisioning guardrails, and placeholder navigation only.
- Add read-only foundation verification scripts: `verify-compensation-schema.mjs`, `verify-compensation-rls.mjs`, `verify-payroll-period-lifecycle.mjs`, `verify-compensation-audit.mjs`, and `verify-compensation-role-access.mjs`.
- Update Blueprint and Certification docs from planned schema to Phase 3A foundation status.

### Not changed

- No commission calculations, payroll calculations, payroll preview generation, approval workflow API, lock/export engine, payroll dashboard, payroll UI page, accounting entry, bank payout, GL posting, or disbursement record.
- No Finance, AR, Payments, Invoices, Orders, Inventory, Logistics, Collections, legacy Commission Engine calculation, Projection Engine, projection flag, or O2C business rule behavior changed.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/verify-compensation-schema.mjs`
- `node scripts/verify-compensation-rls.mjs`
- `node scripts/verify-payroll-period-lifecycle.mjs`
- `node scripts/verify-compensation-audit.mjs`
- `node scripts/verify-compensation-role-access.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`

### Phase 3B gate

- GO only after Phase 3A gates pass and local review confirms no O2C mutation or calculation behavior was introduced.

---

## 2026-07-04 — Executive Compensation & Payroll Engine Blueprint

### Change

- Add Blueprint doc `19_Executive_Compensation_Payroll_Engine.md` defining the HQ-owned compensation/payroll domain.
- Define planned `hr` role as HQ payroll support: maintain payroll data and generate previews only; no payout approval, commission approval, lock, export, accounting, or finance mutation authority.
- Resolve existing Commission Engine conflict: distributor/revenue-based commission analytics are not payroll SoT.
- Establish cash-only commission rule: `attributable_cash_collected × applicable_rate`.
- Forbid order value, invoice value, fulfilled revenue, projected revenue, outstanding receivables, or allocation totals as commission amount.
- Define canonical agent attribution: `payments.agent_id` when populated and certified; otherwise active `lab_ownership` snapshot at payment date, persisted with audit evidence.
- Define Year-1 baseline and promotion rules: first 3 months ₹20,000 salary + ₹5,000 fuel + ₹500 mobile + 3%; promotion after cumulative collections >= ₹5,00,000, collection efficiency >= 80%, and no account overdue > 90 days; promoted salary ₹25,000 + 3.5% commission.
- Define payroll ownership: Executive approves/locks/authorizes/exports; HR previews/submits; Admin views/recommends; Agent views own locked/exported history; Distributor OS has no payroll ownership.

### Not changed

- Documentation only. No app code, SQL, RLS policy, role provisioning, order lifecycle logic, finance, AR, invoice, payment, allocation, collection source records, inventory, logistics, existing commission source records, accounting, commit, or push changed.

### Implementation gate

- GO for Phase 2 implementation planning.
- NO-GO for implementation until HR role/RLS, payroll schema migrations, cash-only commission replacement, attribution snapshot design, approval/export workflows, verification scripts, and UAT checklist are reviewed and approved.

---

## 2026-07-03 — Admin On-Behalf Ordering Blueprint Update

### Change

- Clarify that `admin` and `executive` users may create orders on behalf of `ACTIVE` labs when `ordering_mode` is `hq_managed`, `hybrid`, or `self_service`.
- Block admin-on-behalf order creation when `labs.status = INACTIVE` or `ordering_mode = suspended`.
- Require reuse of the existing `LabOrderingPage` catalog/cart/checkout flow in explicit `adminOnBehalf` mode.
- Prohibit lab-user impersonation: the selected lab remains the customer and the authenticated HQ user remains the actor.
- Require order/audit metadata to identify `source = admin_on_behalf`, originating screen, selected customer lab, authenticated HQ actor, lifecycle status, and ordering mode at submit time.
- Preserve existing pricing, catalog, credit, inventory, finance, delivery, AR, shipment, and commission behavior.

### Not changed

- Documentation only. No app code, SQL, RLS policy, order lifecycle logic, finance, AR, invoice, payment, inventory, shipment, commission, delivery behavior, commit, or push changed.

### Implementation gate

- GO for implementation planning after review.
- NO-GO for implementation until the on-behalf UI/API audit path, verification extension, and UAT checklist are reviewed against this Blueprint update.

---

## 2026-07-03 — Sprint 9 Phase 2A Lab Lifecycle Backend

### Change

- Implement backend/domain API `updateLabLifecycleStatusWrite` for approved lab lifecycle transitions.
- Enforce admin/executive-only authorization, confirmation, mandatory reason for inactivation/reactivation, and allowed transition validation.
- Force `ordering_mode = suspended` only on `ACTIVE -> INACTIVE`; `INACTIVE -> ACTIVE` does not restore Ordering Mode.
- Record lifecycle audit events using the existing operational audit pattern (`user_provisioning_events` with `event_type = updated` and action `lab_lifecycle_status_changed`).
- Refresh `proj_lab_profile_v1` after lifecycle and ordering-mode writes so `read_labs_list_v1` reflects lifecycle status and ordering mode.
- Add `verify-lab-lifecycle-status-flow.mjs` with read-only/static default mode and guarded reversible QA mutation mode via `--apply` or `CONFIRM_MUTATION=true`.

### Not changed

- No UI/browser component, SQL migration, RLS policy, feature flag, finance, AR, invoice, payment, payment allocation, order, shipment, logistics, inventory, commission, delivery rule, or `proj_lab_receivable_v1` behavior changed.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `CONFIRM_MUTATION=true node scripts/verify-lab-lifecycle-status-flow.mjs`
- `node scripts/verify-labs-projection-parity.mjs`
- `node scripts/verify-projection-staleness.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`

---

## 2026-07-03 — Phase 1.2 Projection Registry Documentation Cleanup

### Change

- Remove stale references to missing `docs/Architecture/Projection_Registry.md`.
- Document `src/projectionOps/projectionOpsCatalog.json` as the canonical runtime / ops registry.
- Document `docs/Certification_Framework/08_Read_Model_Certification_Matrix.md` as the human certification view for registry IDs, SLAs, adapter RPCs, status, and gates.
- Replace stale references to missing `docs/Architecture/Projection_Ops_Center.md` with the Projection Operations Center section in `18_Domain_Projection_Architecture.md` and generated `docs/QA/Projection_Ops_Report.*` artifacts.
- Remove stale reference to missing `docs/Architecture/Technical_Debt_Register.md` from projection architecture related-docs.

### Not changed

- No app code, SQL, RLS policy, projection behavior, projection schema, feature flag, finance, AR, invoice, payment, allocation, order, shipment, inventory, commission, or operational write behavior changed.
- No commit or push performed.

### Phase 2 gate

- Phase 2 Lab Lifecycle implementation may proceed after review of this documentation cleanup, subject to the normal Blueprint-first implementation gate.

---

## 2026-07-03 — Sprint 9 Phase 1 Lab Lifecycle Blueprint

### Change

- Define approved Lab Lifecycle Status states: `PROSPECT`, `ACTIVE`, and `INACTIVE`.
- Document admin/executive-only lifecycle transitions, confirmation requirements, mandatory reason requirements, and audit expectations.
- Establish the `INACTIVE` invariant: lifecycle state must never hide or alter AR, invoices, payments, allocations, orders, shipments, Track Order, audit history, reporting, or authorized HQ visibility.
- Define Ordering Mode interaction: `ACTIVE -> INACTIVE` forces `ordering_mode = suspended`; `INACTIVE -> ACTIVE` does not restore previous ordering mode.
- Expand Labs KPI definitions to `Total Labs`, `Prospect Labs`, `Active Labs`, `Inactive Labs`, `Order-Eligible Labs`, and `Ordering Suspended`.
- Document inactive Lab Portal behavior: login allowed when provisioned, checkout/reorder blocked, invoices/payments/Track Order/history available.
- Record projection expectations: `proj_lab_profile_v1` reflects `status` and `ordering_mode`; `proj_lab_receivable_v1` remains unchanged and finance-owned.

### Not changed

- No app code, SQL, RLS policy, projection schema, feature flag, finance, AR, invoice, payment, allocation, order, shipment, inventory, commission, or operational write behavior changed.
- No commit or push performed.

### Verification gates

- Planned `verify-lab-lifecycle-status-flow.mjs`
- `node scripts/verify-labs-admin-flow.mjs`
- `node scripts/verify-lab-ordering-flow.mjs`
- `node scripts/verify-labs-projection-parity.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- Browser smoke covering admin lifecycle controls and inactive Lab Portal read-only history access.

---

## 2026-07-03 — Sprint 8B Labs KPI Definition

### Change

- Define `Active Labs` as lifecycle-active labs (`labs.status == ACTIVE`) and explicitly state that it is unaffected by `ordering_mode`.
- Define `Order-Eligible Labs` as lifecycle-active labs with `ordering_mode != suspended` and `ordering_eligible == true`.
- Define `Ordering Suspended` as labs where `ordering_mode == suspended`; checkout is intentionally blocked while invoices, payments, Track Order, finance, logistics, and history remain available.
- Update Labs certification references so `verify-labs-admin-flow.mjs` validates the three KPI definitions.

### Not changed

- No SQL, schema, RLS policy, projection table, projection flag, finance, AR, payment, invoice, order lifecycle, inventory, logistics, commission, or ordering behavior changes.
- `Active Labs` semantics are preserved and not silently redefined.

### Verification gates

- `npm run build`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- Manual Labs Portfolio Summary UAT: suspend/re-enable ordering and confirm only Order-Eligible / Ordering Suspended counts move.

---

## 2026-07-03 — Sprint 8A.1 Labs Projection Hardening

### Change

- Harden `readLabsListV1` so stale/unavailable/empty/failed projection reads fall back to the existing `getLabsCredit` / `v_labs_credit` path with `degraded: true` and `source: "fallback"`.
- Make `verify-labs-projection-parity.mjs` read-only by default; Labs projection rebuilds move to `repair-labs-projection.mjs --apply`.
- Extend Labs projection certification for deterministic `read_labs_list_v1` ordering/limit windows and SECURITY DEFINER adapter visibility vs projection table RLS.

### Not changed

- No finance, AR, payments, invoices, orders, inventory, logistics, commissions, delivery charge rules, business logic ownership, RLS policy, SQL semantics, or production flag changes.
- `VITE_READ_ADAPTER_LABS_V1` remains disabled by default.

### Verification gates

- `npm run build`
- `node scripts/verify-scripts-readonly.mjs`
- `node scripts/verify-labs-projection-parity.mjs`
- Full Sprint 8A regression bundle before QA flag review.

---

## 2026-07-03 — Sprint 8A Labs Projection QA Shadow

### Change

- Add the approved Laboratory domain projection `proj_lab_profile_v1` at `(tenant_id, lab_id)` grain for lab identity/profile/ownership/qualification/ordering display fields.
- Add `read_labs_list_v1` as a read adapter that composes `proj_lab_profile_v1` with the finance-owned `proj_lab_receivable_v1` to preserve the existing `v_labs_credit` UI contract without duplicating receivable ownership.
- Register `PRJ-LAB-PROFILE-v1` in projection registry, staleness, Projection Ops, and Labs parity certification.
- Add `VITE_READ_ADAPTER_LABS_V1` as a disabled-by-default shadow flag.
- Optimize `read_labs_list_v1` with an explicit adapter visibility predicate: admin uses the equivalent own-tenant fast path; all other roles continue through `distributor_lab_record_visible`.

### Not changed

- No finance, AR, payments, allocations, invoices, orders, inventory, logistics, commissions, delivery charge rules, or business logic ownership changes.
- No production flag enablement.
- No `proj_lab_credit_v1`; receivable data remains owned by `proj_lab_receivable_v1`.

### Verification gates

- `npm run build`
- `node scripts/verify-labs-projection-parity.mjs`
- `node scripts/verify-projection-staleness.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`

---

## 2026-07-03 — Sprint 7B Data Path Optimization & Progressive Loading

### Change

- Split Executive Financial Intelligence initial load from deep analytics: core summary renders first; portfolio/payments/shipments/catalog/commission analytics load after idle.
- Removed default EFI order-line fallback from initial analytics; EFI uses `orders.total_amount` as the merchandise SoT and leaves line fallback opt-in for deep diagnostics.
- Removed founder snapshot RPC from the default Operations Command Center load path; Operations initial and extended panels no longer block on founder analytics.
- Reused the Sprint 7A shared read broker in the distributor/founder portfolio loader for shared labs, orders, and collections reads.

### Not changed

- No SQL, schema, RLS, projection architecture, projection adapters, projection flags, finance, AR, invoice, payment, inventory, logistics lifecycle, delivery charge, ordering, pricing, or commission business logic changed.
- Existing verification scripts were not modified for Sprint 7B.
- No production deployment.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/verify-hq-rls-reads.mjs`

---

## 2026-07-03 — Sprint 7A Client-Side Read Orchestration

### Change

- Add a client-only shared read broker for high-reuse reads with in-flight dedupe, TTL cache reuse, scoped cache keys, and standardized read health envelopes.
- Add route prefetch measurement for role-route alignment and a duplicate-read broker measurement probe.
- Keep existing Supabase/RLS/API contracts as the source of truth; broker reads wrap existing read APIs only.

### Not changed

- No SQL, schema, RLS, projection flags, write APIs, finance, AR, invoice, payment, inventory, logistics, ordering, pricing, or commission business logic changed.
- No production deployment.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/measure-route-prefetch.mjs`
- `node scripts/measure-data-broker-duplicates.mjs`

---

## 2026-07-03 — Sprint 6A.1 Read-Only Verification Safety Gate

### Change

- `verify-ar-reconcile.mjs` is now read-only and runs only the collection inconsistency audit.
- AR reconciliation mutation moved to `repair-ar-reconcile.mjs`, dry-run by default and requiring `--apply` or `CONFIRM_MUTATION=true` for the `reconcile_ar_from_payments` RPC.
- `verify-scripts-readonly.mjs` added to audit `verify-*`, `check-*`, `measure-*`, and `run-*-certification.mjs` scripts for obvious mutation patterns.
- `verify-production-readiness.mjs` now runs the read-only guard before nested readiness checks.
- Legacy mutation-capable verification probes now require an explicit apply confirmation for default safety.

### Not changed

- No finance, AR, payment, invoice, allocation, Orders adapter, RLS, schema, projection, inventory, or logistics business logic changed.
- No production deployment.

### Verification gates

- `node scripts/verify-scripts-readonly.mjs`
- Sprint 6A read-only certification bundle before commit recommendation.

---

## 2026-07-03 — Sprint 6A Orders Projection Adapter (QA enablement)

### Change

- `VITE_READ_ADAPTER_ORDERS_V1=true` enabled on QA (`.env.local`) — HQ Orders list now reads from `proj_order_v1` via `read_orders_list_v1`.
- Other read adapters remain **OFF** (`VITE_READ_ADAPTER_RECEIVABLES_V1`, `VITE_READ_ADAPTER_DASHBOARD_V1`, `VITE_READ_ADAPTER_EXECUTIVE_V1`).
- `OrdersPage.jsx`: skips `enrichOrdersListWithItemCounts` (transactional `order_lines`/`order_items` fan-out) when the list is projection-sourced — projection rows already carry `item_count`.
- `getOrdersRead` (`primecareSupabaseApi.js`): projection path now shares the same in-flight coalesce + 45 s TTL cache as the transactional path, so sidebar summary + Orders page + Operations Center coalesce to one RPC per TTL.
- Detail drawer path (`getOrderDetailsRead`) unchanged — transactional SoT reads permitted for a single order.

### Not changed

- No SoT writes, no lifecycle changes, no RLS changes, no finance/AR/inventory/logistics logic, no projection schemas.
- Production deployment untouched. QA-only.

### Verification gates (Sprint 6A)

- `verify-projection-parity.mjs`, `verify-projection-staleness.mjs`
- `verify-hq-list-detail-parity.mjs` (list `itemCount` vs detail drawer)
- `verify-admin-dashboard-no-transactional-lines.mjs`, `verify-financial-reconciliation.mjs`, `verify-delivery-charge-policy.mjs`, `verify-production-readiness.mjs`, `verify-runtime-import-safety.mjs`
- `run-browser-smoke-all-roles.mjs`, `measure-all-role-page-performance.mjs`

### References

- `18_Domain_Projection_Architecture.md` (adapter flags, staleness SLA)
- `05_Order_Lifecycle.md`, `06_Finance_Rules.md`, `15_Do_Not_Break_Rules.md`

---

## 2026-07-02 — Sprint 3A Production Safety Hardening

### Implemented (approved P0 fixes only)

| ID | Fix | Artifact |
|----|-----|----------|
| TD-025 / SEC-01 | Tenant auth on all `refresh_proj_*` SECURITY DEFINER RPCs | `20260702170000_sprint3a_production_safety_hardening.sql` |
| TD-032 | Least-privilege EXECUTE grants on refresh RPCs | Same migration |
| TD-027 / SEC-03 | Cross-tenant guard on `reset-platform-user-password` | Edge function |
| TD-026 / SEC-04 | Tenant-scoped `todayCollections` in `read_lab_receivables_list_v1` | Same migration |
| TD-028 / REL-01 | Dashboard `readFailed` — no silent zero KPIs | `primecareSupabaseApi.js` |
| TD-031 / REL-03 | `ReadHealthBanner` on Dashboard, Ops, Executive, Projection Ops | UI + `readHealth.js` |
| WS3 | Migration inventory + manifest + remediation plan | `Sprint3A_Migration_*` |
| WS4 | Observability abstraction + health endpoint + correlation IDs | `src/observability/` |
| WS5 | Backup/restore/rollback checklists + production runbook | `docs/operations/Sprint3A_*` |

### Verification scripts added

- `verify-security-hardening.mjs`
- `verify-migration-integrity.mjs`
- `verify-production-readiness.mjs`
- `verify-observability.mjs`

### Out of scope (unchanged)

- No `VITE_READ_ADAPTER_*` flag flips
- No projection architecture / read adapter logic changes
- No finance / logistics / inventory business rules

---

## 2026-07-02 — Projection Operations Center (ops monitoring)

### Added (design + implementation)
- Blueprint 18 Projection Operations Center section (10 modules)
- Projection Operations Center spec now lives in `18_Domain_Projection_Architecture.md`; generated ops artifacts live under `docs/QA/Projection_Ops_Report.*`
- Cert matrix 08 ops gates
- TD-022, TD-023, TD-024 registered
- TD-021 mitigated (Phase 2 deployed QA)

### Scope
- Read-only monitoring via `hq_projection_meta_v1` + catalog
- No projection/adapter/flag changes
- Executive UI + CLI verification scripts

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-024 | ops | Refresh timeline limited to meta + local rebuild history (no append-only event log yet) | OPEN |
| GAP-BP-025 | ops | Parity dashboard requires cert script run for full field compare | OPEN |

---

## 2026-07-02 — Sprint 2 Phase 2 Dashboard & Executive (design)

### Added (design only — no schema yet)
- Blueprint 18 Sprint 2 Phase 2 section — domain metrics + thin dashboard/executive composites
- Registry entries: PRJ-ORD-METRICS-v1, PRJ-COL-METRICS-v1, PRJ-DSH-METRICS-v1, PRJ-EXE-METRICS-v1
- Cert matrix 08 Phase 2 gates + verification scripts planned
- TD-019, TD-020, TD-021 registered

### Design decisions
- Incremental refresh from `proj_order_v1` / `proj_lab_receivable_v1` only — no SoT at adapter read
- Replaces `getAdminDashboardRead` and `get_founder_snapshot` hot paths
- Flags `VITE_READ_ADAPTER_DASHBOARD_V1`, `VITE_READ_ADAPTER_EXECUTIVE_V1` default OFF
- 14-day shadow for composites before flag flip

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-022 | architecture | Phase 2 migration not deployed | OPEN |
| GAP-BP-023 | cert | Dashboard/executive parity scripts not yet implemented | OPEN |

---

## 2026-07-02 — Sprint 2 Phase 1 Domain Projections

### Added
- Migration `20260705120000_sprint2_domain_projections_phase1.sql` (+ fix migrations 001, 002)
- Client adapters, feature flags, parity/staleness certification scripts
- Cert matrix `08_Read_Model_Certification_Matrix.md`
- ADR-001 committed

### Updated
- Projection Registry status: `shadow`
- TD-001 mitigated (Orders + Collections); TD-003 closed

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-019 | architecture | Screen-oriented names | **CLOSED** — `proj_*` / `read_*` deployed |
| GAP-BP-020 | architecture | Event queue / worker | OPEN — Phase 1 uses row refresh + rebuild |
| GAP-BP-021 | cert | Flag flip after 7-day shadow | OPEN |

---

## 2026-07-02 — Domain Projection Architecture v2

### Added
- Blueprint `18_Domain_Projection_Architecture.md` — domain-driven read layer (replaces screen-oriented read model naming)
- Projection registry contract; current canonical runtime registry is `src/projectionOps/projectionOpsCatalog.json`

### Updated
- `README.md` — doc 18 in index; link to Projection Registry
- Sprint 2 implementation plan — **must rename** before schema:
  - `hq_orders_summary_v1` → `proj_order_v1`
  - `hq_collections_summary_v1` → `proj_lab_receivable_v1`
  - `get_*_summary_v1` → `read_*_v1` (read adapters, not projections)

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-017 | gap | ADR-001 not committed; superseded by domain naming in doc 18 | OPEN |
| GAP-BP-018 | gap | Blueprint 17 (`HQ_Read_Model`) never created — superseded by doc 18 | CLOSED |
| GAP-BP-019 | architecture | Screen-oriented read model names in Sprint 2 draft | OPEN — rename required |
| GAP-BP-020 | architecture | No projection event queue / worker yet — Phase 1 uses row refresh + sweep | OPEN |

### Migration impact
**None** — documentation only until approved schema change.

---

## 2026-07-02 — Phase 2 Certification Framework

### Added
- Blueprint `16_Certification_Framework.md` — framework index and workflow
- `docs/Certification_Framework/` — 7 artifacts (object catalog, screen catalog, dependency graph, browser golden path, browser regression, release scorecard, performance matrix)
- `docs/Certification_Framework/browser-regression-manifest.json` — suite definitions
- `scripts/run-browser-certification.mjs` — API prereq orchestrator + manual checklist printer

### Updated
- `README.md` — doc 16 in index
- `13_Verification_Matrix.md` — framework cross-reference
- `14_Release_Gates.md` — cert framework + browser orchestrator gates

### Migration impact
**None** — documentation and non-mutating orchestration only.

---

## 2026-06-30 — AI Architect Mode + doc restructure

### Added
- Cursor rule: `.cursor/rules/primecare-ai-architect.mdc`
- Blueprint numbering 00–15 + templates/
- Legacy docs `01_schema_catalog.md` … `12_verification_matrix.md` superseded by 00–15 (retained for reference)

### Conflicts / gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-001 | Schema drift | `supabase/migrations/` (13) vs `supabase/sql/` (52) — unclear single apply order | OPEN |
| GAP-BP-002 | Dual model | `order_items` + `order_lines` coexist | OPEN — detail reads try both |
| GAP-BP-003 | Type drift | `tenant_id` uuid vs text in legacy rows | OPEN |
| GAP-BP-004 | Migration | Phase 3A delivery columns may be missing on QA while client deployed | OPEN — shipment insert PGRST204 |
| GAP-BP-005 | RLS | `event_log` enabled without policies | OPEN |
| GAP-BP-006 | Product | No DB enum for lab ordering mode (HQ Managed / Hybrid / Self-Service) | MITIGATED — `labs.ordering_mode` Phase 4 |
| GAP-BP-007 | Audit | No single `audit` table — scattered audit tables | DOCUMENTED |
| GAP-BP-008 | Legacy | Apps Script fallback can show misleading errors if unguarded | MITIGATED in lab track path |
| GAP-BP-009 | Architecture | Catalog create seeds inventory (GAP-001 / DA-001) | DEFERRED |
| GAP-BP-010 | Roles | `read_only_auditor`, distributor roles not in pilot launch | BY DESIGN |

### Resolved (reference)

| ID | Resolution |
|----|------------|
| GAP-BP-011 | Lab Track Order — `getLabOrderDetailsRead` + cache handoff (code fix 2026-06-30) |
| GAP-BP-012 | Lab delivery snapshot PATCH 406 — `persist_order_delivery_snapshot` SECURITY DEFINER RPC (2026-07-01) |
| GAP-BP-013 | Lab ordering governance — `labs.ordering_mode` + initiation gates (2026-07-03) |
| GAP-BP-014 | Logistics Phase 4 route planning — `delivery_routes` + stop sequencing (2026-07-04) |
| GAP-BP-015 | Lab checkout false-success — persistence read-back gate before success banner (2026-07-02) |
| GAP-BP-015b | Lab checkout hardening — RPC order-row required, retry confirmation, structured diagnostics + build stamp, pending-track UX (2026-06-28) |
| GAP-BP-016 | Track Order stale-drawer fix + HQ Orders item count from order_lines/order_items quantities (2026-06-28) |

### Open (reference)

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-012 | conflict | Lab checkout called client PATCH on `orders` for delivery snapshot; `orders_update_by_role` blocks lab UPDATE → PGRST116/406 | MITIGATED — RPC path |

---

## How to add entries

```markdown
## YYYY-MM-DD — Short title

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-0NN | conflict / gap / resolved | ... | OPEN / MITIGATED / CLOSED |
```

**Type:** `conflict` = blueprint vs code; `gap` = missing feature/schema; `resolved` = fixed.

---

## Sync with docs/QA

Mirror closed gaps to `docs/QA/QA_Gap_Register.md` when certified.
