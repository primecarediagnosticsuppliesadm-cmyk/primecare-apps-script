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
| verify-agent-collections-ownership-filter.mjs | Ownership scoping | Agent collections |
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

### Infrastructure

| Script | Checks | When |
|--------|--------|------|
| verify-pilot-migrations.mjs | Migration manifest | New migration |
| verify-pilot-hardening-sql.mjs | No temp_anon RLS | Post-hardening |
| verify-sprint1-health.mjs | Sprint 1 bundle | Sprint changes |
| verify-perf-scale-counts.mjs | PERF tenant scale | Perf testing |
| verify-production-monitoring.mjs | RC-2 orchestrator | Release monitoring |
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
