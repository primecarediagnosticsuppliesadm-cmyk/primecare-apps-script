# 13 — Verification Matrix

Verification scripts in `primecare-portal/scripts/` are **read-only by default**. **Exit 1 on FAIL** (WARN alone usually passes).

**Phase 2 framework:** Object ↔ script mapping in [16_Certification_Framework.md](./16_Certification_Framework.md) and `docs/Certification_Framework/01_Object_Source_of_Truth_Catalog.md`. Browser checklist orchestrator: `scripts/run-browser-certification.mjs`.

---

## By module

### Finance & invoices

| Script | Checks | When |
|--------|--------|------|
| verify-financial-reconciliation.mjs | Payments vs allocations; GP golden; Guntur untouched; compensation | Payment/AR changes |
| verify-partial-payment-sync.mjs | Strict finalize→pay→allocate | Payment lifecycle |
| verify-order-payment-sync.mjs | Finalize wiring, freeze guards | Payment drawer |
| verify-invoice-account-status.mjs | Status derivation | Invoice UI labels |
| verify-lab-account-fallback.mjs | Lab ledger fallback math | Lab account |
| verify-invoice-phase1.mjs | Schema, no payments.invoice_id | Invoice foundation |
| verify-invoice-phase2.mjs | Auto-invoice on fulfill | Invoice create |
| verify-invoice-phase3.mjs | PDF immutable lines | PDF |
| verify-invoice-phase4.mjs | Invoice Center bounded reads | Invoice UI |
| verify-invoice-phase5.mjs | Allocation RPC, partially_paid | Allocations |
| verify-invoice-lifecycle.mjs | Read-only bundle for invoice phase/lifecycle checks | Invoice regression |
| verify-primecare-production-golden-path.mjs | Full E2E golden | Pre-release |
| verify-ar-reconcile.mjs | Read-only AR inconsistency audit; repair lives in `repair-ar-reconcile.mjs --apply` | AR drift |
| verify-collection-inconsistencies.mjs | Golden lab cleanliness | Collections hygiene |

### Orders & lab

| Script | Checks | When |
|--------|--------|------|
| verify-orders-admin-flow.mjs | KPI, fulfill ledger, freeze | Orders page |
| verify-orders-action-feedback.mjs | Sprint 1A Status Actions inline errors, loading labels, toast success, busy/aria guards | Orders UX |
| verify-orders-navigation-context.mjs | Sprint 1B Start Here, context strip, selection, return path, empty/focus recovery | Orders UX |
| verify-orders-workspace-simplification.mjs | Sprint 1C page budget, collapsed portfolio, operational-first detail, no module split | Orders UX |
| verify-lab-ordering-flow.mjs | Track order_id; RPC smoke; admin-on-behalf implementation must extend this gate for `adminOnBehalf` source/audit metadata and eligibility blocks | Lab portal / admin on-behalf ordering |
| verify-transaction-integrity-rpcs.mjs | Sprint 1 RPC symbols | Order/payment RPC |
| verify-bounded-reads.mjs | No unbounded payment/PO select | Read paths |

### Logistics

| Script | Checks | When |
|--------|--------|------|
| verify-logistics-dispatch-flow.mjs | Shipment hook, finance isolation | Logistics |
| verify-delivery-charge-policy.mjs | Phase 3A engine | Delivery charge |

### Labs & credit

| Script | Checks | When |
|--------|--------|------|
| verify-labs-admin-flow.mjs | Tenant scope, ownership, Labs KPI definitions (`Total Labs`, `Prospect Labs`, `Active Labs`, `Inactive Labs`, `Order-Eligible Labs`, `Ordering Suspended`) | Labs |
| verify-lab-lifecycle-status-flow.mjs | Lifecycle transition contract: admin/executive-only writes, confirmation/reason requirements, `ACTIVE -> INACTIVE` forces `ordering_mode = suspended`, `INACTIVE -> ACTIVE` does not restore ordering mode, financial/history domains unchanged | Lab lifecycle |
| verify-labs-projection-parity.mjs | Read-only `v_labs_credit` vs `read_labs_list_v1` parity, lifecycle status + ordering mode parity, deterministic ordering/limit window, role scope, freshness, SECURITY DEFINER vs table-RLS visibility | Labs projection |
| verify-credit-risk-admin-flow.mjs | AR KPI, aging | Credit & Risk |
| verify-collections-payment-action-feedback.mjs | Sprint 1A payment drawer inline errors, loading labels, lifecycle | Collections UX |
| verify-agent-collections-interaction-feedback.mjs | Sprint 1B agent queue debounce, selection, refresh, evidence | Collections UX |
| verify-collections-workspace-separation.mjs | Sprint 1C persona workspace shells, primary-question framing | Collections UX |
| verify-collections-certification-closure.mjs | COL-CERT-011/003/004 discoverability, context, continuity | Collections UX |
| verify-agent-collections-ownership-filter.mjs | Ownership scoping | Agent collections |
| verify-agent-visit-product-intelligence.mjs | Visit Products & Purchasing; follow-up; runtime import safety; notification_events + visibility helper + notification_delivery_log QA contracts; authenticated grants | Agent visits / notifications |
| verify-agent-rc1-closure.mjs | Agent visit save wiring + mobile shell | Agent visits |
| verify-create-lab-ar-rls.mjs | Lab+AR insert RLS | Add lab |

### Operations

| Script | Checks | When |
|--------|--------|------|
| verify-operations-center-admin-flow.mjs | Provisioning, freeze | Ops center |
| verify-operations-user-directory-integrity.mjs | Probe classification | User directory |
| verify-provisioning-role-guard.mjs | No admin→executive | Provisioning |
| verify-hq-rls-reads.mjs | Cross-role reads | **Any RLS change** |
| verify-hq-freeze-policy.mjs | Freeze wiring | Freeze policy |
| verify-hq-search-runtime.mjs | Global search bounded | Search |

### Inventory

| Script | Checks | When |
|--------|--------|------|
| verify-inventory-dashboard-kpi.mjs | Valuation KPIs | Inventory dashboard |
| verify-inventory-reconciliation.mjs | No negative stock | Inventory writes |
| verify-inventory-ledger-integrity.mjs | Alias → reconciliation (Sprint 1A naming) | Inventory writes |
| verify-inventory-action-feedback.mjs | Sprint 1A catalog inline errors; receive feedback owned by Purchase mapper | Inventory UX |
| verify-purchase-action-feedback.mjs | Purchase Sprint 1A create/edit/cancel/bulk/receive Action Pattern | Purchase UX |
| verify-purchase-navigation-context.mjs | Purchase Sprint 1B Start Here, context strip, selection, return path, empty states | Purchase UX |
| verify-purchase-workspace-simplification.mjs | Purchase Sprint 1C page budget, queue hierarchy, collapsed KPIs, Suppliers honesty, no module split | Purchase UX |
| verify-purchase-certification-closure.mjs | Purchase Closure PUR-CERT-005 evidence docs + PUR-CERT-012 packaging; Sprint 1A–1C regression markers | Purchase UX |
| verify-inventory-navigation-context.mjs | Sprint 1B Start Here, context strip, selection, return path, empty/focus recovery | Inventory UX |
| verify-inventory-workspace-simplification.mjs | Sprint 1C page budget, collapsed valuation, operational-first detail, no module split | Inventory UX |
| verify-inventory-certification-closure.mjs | Closure INV-CERT-005 evidence docs, INV-CERT-007 labels, INV-CERT-001 Purchase grouping | Inventory UX |
| verify-inventory-admin-flow.mjs | Catalog/receive write-path parity (no workflow redesign) | Inventory UX |
| verify-order-inventory-sync.mjs | ORDER_OUT remain on Orders; Inventory UX does not mutate fulfill path | Inventory / Orders |
| verify-procurement-inventory-flow.mjs | PO receive → stock | Procurement |

### Executive

| Script | Checks | When |
|--------|--------|------|
| verify-founder-snapshot.mjs | Founder RPC | Founder |
| verify-executive-financial-intelligence.mjs | EFI read-only | EFI module |

### Compensation & payroll (Phase 3A foundation + future)

| Script | Checks | When |
|--------|--------|------|
| verify-compensation-schema.mjs | Phase 3A tables, constraints, indexes, RLS policy presence, no accidental finance/O2C mutation | Compensation schema |
| verify-compensation-rls.mjs | Executive/HR/Admin/Agent visibility contract and Distributor exclusion in compensation RLS helpers/policies | Phase 3A RLS/security |
| verify-payroll-period-lifecycle.mjs | draft → previewed → submitted → approved → locked → exported lifecycle constraints only; no engine functions | Phase 3A lifecycle foundation |
| verify-compensation-audit.mjs | Append-only audit/approval event infrastructure and adjustment reason/type constraints | Phase 3A audit foundation |
| verify-compensation-role-access.mjs | `hr` role metadata, provisioning guard, and placeholder navigation only | Phase 3A role foundation |
| verify-compensation-calculation.mjs | Pure Phase 3B preview engine functions, draft-only outputs, placeholder components, and no approval/export logic | Phase 3B calculation preview |
| verify-cash-only-commission.mjs | Commission uses `payments.amount_received` only and rejects order/invoice/revenue/outstanding/allocation inputs | Phase 3B cash-only |
| verify-promotion-eligibility.mjs | Year-1 promotion threshold, collection efficiency, overdue blocker, and first-3-month baseline rules | Phase 3B promotion |
| verify-attribution-snapshots.mjs | `payments.agent_id` priority, fallback to `compensation_attribution_snapshots`, no current ownership fallback | Phase 3B attribution |
| verify-payroll-preview.mjs | Draft-only preview persistence to payroll/commission tables; no approval, lock, export, payout, or UI | Phase 3B preview persistence |
| verify-plan-versioning.mjs | `plan_id`, `plan_version`, `rule_version`, and `calculated_at` stored on calculated rows | Phase 3B versioning |
| verify-payroll-locking.mjs | Executive-only lock transition, locked status propagation, and no HR/Admin/Agent lock authority | Phase 3C locking |
| verify-payroll-immutability.mjs | Locked/exported/paid detail rows cannot be updated/deleted; reopen creates new draft version | Phase 3C immutability |
| verify-payroll-rbac.mjs | Executive/HR/Admin/Agent action matrix for preview, submit, approve, reject, lock, export, pay, reopen, adjustments | Phase 3C RBAC |
| verify-payroll-audit.mjs | Audit events for preview, submit, approve, reject, lock, export, pay, reopen and no Finance/O2C audit side effects | Phase 3C audit |
| verify-payroll-export.mjs | CSV, Excel, and accounting-ready export structures from locked payroll only; no bank/GL writes | Phase 3C export model |
| verify-payroll-lifecycle.mjs | draft → previewed → submitted → approved → locked → exported → paid and reject/reopen paths | Phase 3C lifecycle |
| verify-payroll-adjustments.mjs | Positive, negative, recovery, advance, correction adjustment validation and approval rules | Phase 3C adjustments |
| verify-payroll-versioning.mjs | Run versioning and reopen-as-new-draft-version semantics | Phase 3C versioning |
| verify-compensation-no-finance-mutation.mjs | Compensation/payroll APIs and migrations do not write Finance/O2C/source-domain tables | Phase 3C boundary |
| verify-compensation-cash-only.mjs | Commission uses `payments.amount_received` cash collected only; rejects order/invoice/revenue/receivable inputs | Commission calculation |
| verify-compensation-attribution.mjs | `payments.agent_id` priority, `lab_ownership` payment-date snapshot fallback, persisted attribution evidence | Attribution |
| verify-payroll-run-lifecycle.mjs | open → previewed → submitted → approved → locked → exported, immutability after lock | Payroll run lifecycle |
| verify-compensation-approval-workflow.mjs | HR preview/submit, Executive approve/lock/export, Admin recommend-only, Agent read-only | Approval |
| verify-payroll-export.mjs | Export only from locked run, checksum/storage metadata, no accounting entry | Export |
| verify-compensation-no-finance-mutation.mjs | Orders, invoices, payments, allocations, AR, inventory, logistics unchanged by payroll actions | Regression |
| verify-compensation-plan-management.mjs | Compensation Plans tab columns, admin APIs, no delete, no finance writes | Phase 5A plan admin |
| verify-compensation-plan-action-feedback.mjs | Drawer create flow, local mutation errors, duplicate constraint mapping, page budget, no inline wizard, no raw PG copy | Compensation Plans UX |
| verify-compensation-assignment-action-feedback.mjs | Assignment drawer/dialog local errors, end confirmation, loading labels, no global banner for assign/change/end | Compensation Assignments UX (Sprint 1A) |
| verify-payroll-workflow-action-feedback.mjs | Payroll toolbar/modal local errors, confirm modals, loading labels, modal closes on success only, no global banner | Payroll Workflow UX (Sprint 1B) |
| verify-employee-directory-interaction-feedback.mjs | Directory debounced search, selection styling, bulk/export/refresh feedback, quick view retry/focus return | Employee Directory UX (Sprint 1C) |
| verify-compensation-plan-versioning.mjs | Active plan edit creates new version; draft in-place edit; assignment preservation | Phase 5A versioning |
| verify-compensation-plan-assignment.mjs | Plan Assignments tab, change/end assignment, history preserved, no delete | Phase 5A assignments |
| verify-compensation-simulator.mjs | Preview-only simulator outputs; no persistence | Phase 5A simulator |
| verify-compensation-role-security.mjs | Executive/HR/Admin/Agent admin RBAC contract | Phase 5A security |
| verify-agent-compensation-profile.mjs | Agent Compensation 360 overview sections and loader wiring | Phase 5B profile |
| verify-agent-payroll-history.mjs | Agent payroll history grid and bounded line reads | Phase 5B payroll history |
| verify-agent-commission-history.mjs | Agent commission history grid; no O2C writes | Phase 5B commission history |
| verify-agent-plan-history.mjs | Plan assignment history and change-plan reuse | Phase 5B plan history |
| verify-agent-compensation-security.mjs | 360 RBAC contract; Lab/Distributor blocked | Phase 5B security |
| verify-payroll-approval-ui.mjs | Payroll workflow toolbar on periods/preview tabs | Phase 6A approval UI |
| verify-payroll-workflow-actions.mjs | Status-gated actions wired to domain APIs | Phase 6A workflow actions |
| verify-payroll-export-ui.mjs | Locked-run export metadata UI; no bank/GL | Phase 6A export UI |
| verify-payroll-paid-evidence.mjs | Exported-run paid evidence form; no payment row | Phase 6A paid evidence |
| verify-payroll-no-finance-mutation.mjs | Workflow UI/API do not mutate Finance/O2C | Phase 6A isolation |
| verify-enterprise-compensation-roles.mjs | Role scopes, profile-primary assignment schema | Phase 7.1 enterprise |
| verify-employee-directory.mjs | Employee directory tab + loader | Phase 7.1 enterprise |
| verify-role-based-payroll-preview.mjs | All assigned employees in preview incl. zero commission | Phase 7.1 enterprise |
| verify-agent-commission-isolation.mjs | Commission cash-only; non-agent roles get ₹0 commission | Phase 7.1 enterprise |
| verify-role-plan-validation.mjs | Plan role_scope must match employee role on assign | Phase 7.1 enterprise |
| verify-compensation-ui-actions.mjs | New plan wizard, assign, activate, view assignment | Phase 7.1 enterprise |
| verify-executive-reporting-context.mjs | Canonical reporting context resolution; single-run KPI alignment | Phase 7.2 analytics |
| verify-compensation-ratios.mjs | Payroll % cash collected + payroll % revenue generated (same period) | Phase 7.2 analytics |
| verify-compensation-rankings.mjs | Profile-primary rankings; QA/probe exclusion | Phase 7.2 analytics |
| verify-compensation-forecast.mjs | Forecast baseline from persisted run lines; scenarios preview-only | Phase 7.2 analytics |
| verify-compensation-territories.mjs | Territory rollups from reporting context | Phase 7.2 analytics |
| audit-phase-7-2-certification.mjs | Phase 7.2 certification bundle (context, ratios, no finance mutation) | Phase 7.2 analytics |
| verify-people-operations-shell.mjs | People Operations module nav, screen routing, IA (intelligence on Reports) | Phase 8.1 shell |
| audit-phase-8-1-certification.mjs | Phase 8.1 certification bundle (shell, dashboard, role access, reporting context, no finance mutation, build) | Phase 8.1 shell |
| verify-people-operations-ux.mjs | UI framework, operational dashboard, reports analytics split, filter bar, errors, state preservation | Phase 8.1A UX |
| verify-people-operations-productivity.mjs | Quick actions, approval inbox, notifications, search, favorites, workflow progress, session state | Phase 8.1B productivity |
| audit-phase-8-1a-certification.mjs | Phase 8.1A UX certification bundle + regression gates | Phase 8.1A UX |
| audit-phase-8-1b-certification.mjs | Phase 8.1B productivity certification bundle + regression + build | Phase 8.1B productivity |
| verify-people-operations-enterprise-ux.mjs | Enterprise drawer, overflow menus, settings landing, KPI strips | Phase 8.2 enterprise UX |
| verify-people-operations-navigation.mjs | Breadcrumbs, sticky module navigation | Phase 8.2 enterprise UX |
| verify-people-operations-navigation-context.mjs | Clickable breadcrumbs, reporting context persistence, context strip, active states | Sprint 1D navigation & context |
| verify-people-operations-dashboard.mjs | Reporting-context KPI derivation, dashboard/report separation | Phase 8.2 enterprise UX |
| verify-people-operations-payroll-layout.mjs | Payroll summary strip, workflow progress on run review | Phase 8.2 enterprise UX |
| verify-people-operations-table-standardization.mjs | EnterpriseDataTable + PeopleOpsTableShell adoption | Phase 8.2 enterprise UX |
| audit-phase-8-2-certification.mjs | Phase 8.2 enterprise UX certification bundle + regression + build | Phase 8.2 enterprise UX |
| verify-workforce-budgeting.mjs | Budgeting module nav, planning workspace, no mutations | Phase 8.3 workforce planning |
| verify-headcount-planning.mjs | Headcount table, session positions, projection-only | Phase 8.3 workforce planning |
| verify-budget-scenarios.mjs | Scenario calculations, forecast reuse, preview-only | Phase 8.3 workforce planning |
| verify-budget-dashboard.mjs | Budget overview KPIs/charts from reporting context | Phase 8.3 workforce planning |
| audit-phase-8-3-certification.mjs | Phase 8.3 workforce planning certification bundle + regression + build | Phase 8.3 workforce planning |
| verify-business-ownership.mjs | Ownership module nav, canonical lab_ownership reuse, no mutations | Phase 8.4 business ownership |
| verify-ownership-tree.mjs | Sales org tree Executive → Admin → Agent → Lab + KPIs | Phase 8.4 business ownership |
| verify-ownership-hierarchy.mjs | Alias checks for hierarchy tree builders | Phase 8.4 business ownership |
| verify-territory-ownership.mjs | Territory dashboard from lab areas | Phase 8.4 business ownership |
| verify-territory-dashboard.mjs | Territory dashboard UI (legacy name kept) | Phase 8.4 business ownership |
| verify-lab-ownership.mjs | Lab Ownership drawer, timeline, orders/payments read-only | Phase 8.4 business ownership |
| verify-employee-ownership.mjs | Employee 360 business ownership section | Phase 8.4 business ownership |
| verify-compensation-preview-readonly.mjs | Future Hierarchical Compensation preview; no engine writes | Phase 8.4 business ownership |
| verify-read-model-only.mjs | Single canonical SoT; no parallel ownership table; no writes | Phase 8.4 business ownership |
| audit-phase-8-4-certification.mjs | Phase 8.4 business ownership certification bundle + regression + build | Phase 8.4 business ownership |
| verify-commercial-dashboard.mjs | Commercial KPIs compose layer | Phase 9.0 commercial CRM |
| verify-commercial-pipeline.mjs | Pipeline stages map to lab_qualifications | Phase 9.0 commercial CRM |
| verify-commercial-lab360.mjs | Commercial Lab 360 drawer + deep-links | Phase 9.0 commercial CRM |
| verify-commercial-forecast.mjs | Forecast preview-only; payroll labeled read-only | Phase 9.0 commercial CRM |
| verify-commercial-activities.mjs | Visits + follow-ups unified read | Phase 9.0 commercial CRM |
| verify-commercial-reuse.mjs | No duplicate CRM schema; reuse existing SoTs | Phase 9.0 commercial CRM |
| audit-phase-9-certification.mjs | Phase 9.0 commercial CRM certification bundle + regression + build | Phase 9.0 commercial CRM |
| verify-navigation-consolidation.mjs | One workspace home per domain; deep-link keys hidden from sidebar | Phase 9.1 consolidation |
| verify-dashboard-ownership.mjs | KPI primary dashboard registry; no duplicate primary surfaces | Phase 9.1 consolidation |
| verify-report-consolidation.mjs | Report module ownership; no duplicate report nav | Phase 9.1 consolidation |
| verify-performance-readiness.mjs | Bounded reads, god-page audit, lazy routes | Phase 9.1 consolidation |
| verify-production-readiness-dashboard.mjs | Architecture Readiness page wired; not Founder OS | Phase 9.1 consolidation |
| audit-phase-9-1-certification.mjs | Phase 9.1 consolidation bundle + finance/payroll boundary + build | Phase 9.1 consolidation |
| verify-founder-workspace.mjs | Founder OS read compose + section model | Phase 9.2 Founder OS |
| verify-founder-decision-queue.mjs | Decision queue from existing engines; deep-links | Phase 9.2 Founder OS |
| verify-founder-priorities.mjs | Top 5 rule-based priorities | Phase 9.2 Founder OS |
| verify-founder-insights.mjs | Rule insights; no AI/ML | Phase 9.2 Founder OS |
| verify-founder-approvals.mjs | Approval inbox reuse | Phase 9.2 Founder OS |
| verify-founder-navigation.mjs | Founder OS menu + routing | Phase 9.2 Founder OS |
| audit-phase-9-2-certification.mjs | Phase 9.2 Founder OS bundle + boundaries + build | Phase 9.2 Founder OS |
| verify-collection-compensation.mjs | Collection compensation dashboard from payroll preview reads | Phase 9.3 collection compensation |
| verify-hierarchical-compensation.mjs | Ownership hierarchy compensation display (no engine rewrite) | Phase 9.3 collection compensation |
| verify-executive-performance.mjs | Executive KPIs + rankings compose layer | Phase 9.3 collection compensation |
| verify-founder-performance-cards.mjs | Founder OS rule-based performance decision cards | Phase 9.3 collection compensation |
| verify-lab-performance-contribution.mjs | Lab 360 performance contribution read compose | Phase 9.3 collection compensation |
| verify-employee360-business-profile.mjs | Employee Workspace business profile sections | Phase 9.3 collection compensation |
| verify-employee360-workspace.mjs | Employee Workspace IA, Today budget, operational status, quick actions, HR gate, routing | Employee Workspace |
| verify-no-payroll-mutation.mjs | Phase 9.3 models do not mutate payroll | Phase 9.3 collection compensation |
| verify-no-finance-mutation.mjs | Phase 9.3 models do not mutate finance | Phase 9.3 collection compensation |
| audit-phase-9-3-certification.mjs | Phase 9.3 bundle + boundaries + build | Phase 9.3 collection compensation |
| verify-enterprise-ui-consistency.mjs | RC2 design tokens + shared UX components | RC2 enterprise UX |
| verify-people-ux.mjs | People Ops compact dashboard, directory, Employee 360 | RC2 enterprise UX |
| verify-founder-ui.mjs | Founder Command Center layout | RC2 enterprise UX |
| verify-commercial-ui.mjs | Lab 360 section navigation | RC2 enterprise UX |
| verify-payroll-ui.mjs | Payroll dashboard UX (presentation only) | RC2 enterprise UX |
| verify-dashboard-layout.mjs | Executive Command Center dashboard | RC2 enterprise UX |
| verify-empty-states.mjs | Shared empty state components | RC2 enterprise UX |
| verify-loading-states.mjs | Skeleton loading components | RC2 enterprise UX |
| verify-responsive-layouts.mjs | Responsive grid tokens | RC2 enterprise UX |
| audit-rc2-ui-certification.mjs | RC2 UX bundle + no logic mutation + build | RC2 enterprise UX |
| verify-rc3-people-ops-ui.mjs | RC3 work inbox, context widget, data quality, dense KPIs, keyboard nav | RC3 enterprise UX |
| audit-rc3-ui-certification.mjs | RC3 UX bundle + RC2/Phase 9.3 regression + build | RC3 enterprise UX |
| verify-rc4-enterprise-polish.mjs | RC4 density, universal context, reports summary-first, table UX | RC4 enterprise polish |
| audit-rc4-ui-certification.mjs | RC4 bundle + RC3 regression + build | RC4 enterprise polish |
| verify-rc5-business-language.mjs | RC5 founder business language, blockers, help, onboarding, empty states | RC5 founder UX |
| audit-rc5-founder-certification.mjs | RC5 verify + RC4 regression + finance mutation guards + build | RC5 founder UX |
| verify-rc6-founder-language.mjs | RC6 payroll cycle copy, activity mapping, day board, no internal events | RC6 founder dashboard |
| audit-rc6-founder-certification.mjs | RC6 verify + RC5/dashboard/productivity + finance guards + build | RC6 founder dashboard |

### Infrastructure

| Script | Checks | When |
|--------|--------|------|
| verify-pilot-migrations.mjs | Migration manifest | New migration |
| verify-pilot-hardening-sql.mjs | No temp_anon RLS | Post-hardening |
| verify-sprint1-health.mjs | Sprint 1 bundle | Sprint changes |
| verify-perf-scale-counts.mjs | PERF tenant scale | Perf testing |
| verify-production-monitoring.mjs | RC-2 orchestrator | Release monitoring |
| verify-operational-readiness-pack.mjs | v1.0 ops pack: first-customer gate, recovery SOP, linked RC1/HQ runbooks | Pre–first customer |
| verify-scripts-readonly.mjs | Guard verify/check/measure/cert scripts against unconfirmed mutations | **Every release / production readiness** |
| run-hq-performance-certification.mjs | PERF tenant benchmarks | Performance cert |
| run-browser-certification.mjs | API prereq gate + browser checklist | O2C / release browser cert |
| measure-hq-navigation-perf.mjs | QA navigation probe | Ad-hoc perf |
| measure-route-prefetch.mjs | Static route prefetch drift check against role routing map | Client-side performance changes |
| measure-data-broker-duplicates.mjs | Shared broker in-flight/TTL duplicate-read regression probe | Client-side performance changes |

---

## Required bundles

**HQ Admin cert:**
```
npm run build
verify-scripts-readonly.mjs
verify-inventory-dashboard-kpi.mjs
verify-procurement-inventory-flow.mjs
verify-orders-admin-flow.mjs
verify-credit-risk-admin-flow.mjs
verify-labs-admin-flow.mjs
verify-operations-center-admin-flow.mjs
verify-financial-reconciliation.mjs
verify-hq-rls-reads.mjs
```

**Lab portal change:** `verify-lab-ordering-flow.mjs` + `verify-hq-rls-reads.mjs`

**Admin on-behalf ordering change:** `verify-lab-ordering-flow.mjs` + `verify-orders-admin-flow.mjs` + `verify-labs-admin-flow.mjs` + `verify-lab-lifecycle-status-flow.mjs` + `verify-financial-reconciliation.mjs` + `verify-delivery-charge-policy.mjs` + `verify-hq-rls-reads.mjs` + `run-browser-smoke-all-roles.mjs`

**Lab lifecycle change:** `verify-lab-lifecycle-status-flow.mjs` + `verify-labs-admin-flow.mjs` + `verify-lab-ordering-flow.mjs` + `verify-labs-projection-parity.mjs` + `verify-financial-reconciliation.mjs` + `verify-hq-rls-reads.mjs`

**Logistics change:** `verify-logistics-dispatch-flow.mjs` + `verify-delivery-charge-policy.mjs`

**Compensation / payroll change:** planned compensation verify bundle + `verify-financial-reconciliation.mjs` + `verify-payment-allocation-flow.mjs` + `verify-hq-rls-reads.mjs` + `verify-ar-reconcile.mjs` + `verify-agent-collections-ownership-filter.mjs` + `run-browser-smoke-all-roles.mjs`

---

## Manual UAT (per module)

Use [templates/UAT_Checklist_Template.md](./templates/UAT_Checklist_Template.md).

| Module | Minimum UAT |
|--------|-------------|
| Lab | Checkout → Track Order → Previous Orders |
| Admin on-behalf ordering | From `OperationalLabDrawer` / Labs Admin, launch `LabOrderingPage` in `adminOnBehalf` mode; confirm `admin` and `executive` can order for `ACTIVE` labs in `hq_managed`, `hybrid`, and `self_service`; confirm `INACTIVE` and `suspended` are blocked; confirm selected lab is customer, authenticated HQ user is actor, `source = admin_on_behalf` is present in order/audit metadata, and pricing/catalog/credit/inventory/finance/delivery/AR/shipment/commission behavior is unchanged |
| Lab lifecycle | `PROSPECT -> ACTIVE`, `ACTIVE -> INACTIVE`, `INACTIVE -> ACTIVE`; confirm reason/audit capture, inactive checkout/reorder blocked, ordering remains suspended after reactivation, and invoices/payments/Track Order/history remain visible |
| Orders | Fulfill → invoice → shipment |
| Finance | Pay → allocate → open balance |
| Compensation / payroll | HR generates preview; commission uses collected cash only; Executive approves/locks/exports; Admin can recommend only; Agent sees own locked/exported history only; existing finance/O2C records unchanged |
| Logistics | Status transitions → delivered_at |
| Ops | Provision lab user; ownership |
| Inventory | PO receive → stock increase |

---

## PASS / FAIL / WARN

| Status | Action |
|--------|--------|
| PASS | Continue |
| WARN | Review; may ship if documented |
| FAIL | Block merge |

---

## Read-only verification safety

- `verify-*`, `check-*`, `measure-*`, and `run-*-certification.mjs` scripts must not mutate QA by default.
- Mutation-capable probes must be explicitly gated behind `--apply` or `CONFIRM_MUTATION=true`, and repair/backfill entry points must be named `repair-*` or `backfill-*`.
- `verify-ar-reconcile.mjs` is read-only; AR reconciliation mutations belong only in `repair-ar-reconcile.mjs --apply`.
- `verify-labs-projection-parity.mjs` is read-only; Labs projection rebuilds belong only in `repair-labs-projection.mjs --apply`.
- `verify-scripts-readonly.mjs` is a release gate and is wired into `verify-production-readiness.mjs`.
