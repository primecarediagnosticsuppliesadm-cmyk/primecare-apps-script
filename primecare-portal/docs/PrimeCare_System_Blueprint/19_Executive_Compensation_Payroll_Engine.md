# 19 — Executive Compensation & Payroll Engine

HQ-owned compensation and payroll architecture for PrimeCare Year-1 field teams.

---

## Purpose

The Executive Compensation & Payroll Engine calculates, reviews, approves, locks, and exports compensation for PrimeCare HQ only.

Distributor OS must not own payroll, payout approval, payout authorization, or accounting. Distributor-facing access may be added later only as read-only audit snapshots.

---

## Source-of-truth boundaries

| Concern | Source of truth | Compensation use | Must not do |
|---------|-----------------|------------------|-------------|
| Cash collected | `payments.amount_received` after successful payment/AR write | Commission input | Mutate payment rows or infer from invoice/order value |
| Payment allocation | `invoice_payment_allocations` | Finance reconciliation only | Drive commission amount from allocation totals |
| Receivables/outstanding | `ar_credit_control`, invoice open balance | Eligibility and promotion checks | Treat outstanding as commissionable cash |
| Agent assignment | `payments.agent_id` when populated; otherwise `lab_ownership` snapshot at payment date | Attribution | Use current ownership without snapshot audit |
| Orders / invoices | `orders`, `invoices`, line snapshots | Context only | Pay commission from order value, invoice value, fulfilled revenue, projected revenue, or outstanding receivables |
| Payroll output | HQ compensation/payroll tables | Derived ledger and export | Create accounting entries unless a future finance phase explicitly approves it |

The existing distributor/revenue-based Commission Engine is not the payroll source of truth. It may remain as a legacy growth/analytics surface until replaced, but payroll calculations must use the HQ compensation engine and cash-collected rules only.

---

## Roles

| Role | Access |
|------|--------|
| `executive` | Full visibility; calculator; payroll preview; approve/reject; lock runs; authorize payouts; manual adjustments; history; export |
| `hr` | HQ payroll support role; maintains salary/payroll data; generates payroll previews; cannot approve payouts, commission changes, run locks, or exports without Executive approval |
| `admin` | View and recommend only; cannot approve, lock, export, or authorize payouts |
| `agent` | View own compensation history only; no edits |
| Distributor OS roles | No payroll ownership, no payout approval, no payout authorization; future read-only audit snapshots only |

`hr` is a new proposed HQ role. Phase 2 implementation planning must add it to `profiles.role`, `rolePermissionMatrix.js`, provisioning rules, menus, and RLS only after explicit security review.

---

## Domain model

### `compensation_plans`

Plan version and rule definition.

| Field | Meaning |
|-------|---------|
| `id` | UUID primary key |
| `plan_code` | Stable code, e.g. `AGENT_YEAR1_BASELINE` |
| `version` | Rule version |
| `effective_from`, `effective_to` | Date validity |
| `role_scope` | Agent / future role family |
| `base_salary`, `fuel_allowance`, `mobile_allowance` | Fixed monthly components |
| `commission_rate_bps` | Commission rate in basis points |
| `promotion_salary`, `promotion_commission_rate_bps` | Promoted terms |
| `promotion_collection_threshold` | Cumulative attributable collections threshold |
| `promotion_min_efficiency_pct` | Minimum collection efficiency |
| `promotion_max_overdue_days` | Overdue blocker threshold |
| `rules_json` | Structured bonus/incentive policy |
| `status` | draft / active / retired |
| `created_by`, `created_at`, `updated_at` | Audit columns |

### `compensation_plan_assignments`

Agent-to-plan history.

| Field | Meaning |
|-------|---------|
| `id` | UUID primary key |
| `tenant_id` | HQ/distributor scope for the assigned agent |
| `agent_id`, `profile_user_id` | Agent identity |
| `plan_id` | Compensation plan |
| `assignment_status` | active / ended / suspended |
| `start_date`, `end_date` | Effective date window |
| `assigned_by`, `assigned_at` | Audit |

### `payroll_periods`

Month-level payroll window.

| Field | Meaning |
|-------|---------|
| `id` | UUID primary key |
| `period_ym` | `YYYY-MM` |
| `period_start`, `period_end`, `pay_date` | Calendar boundaries |
| `status` | draft / previewed / submitted / approved / locked / exported / paid / void |
| `locked_at`, `locked_by` | Lock audit |
| `metadata` | Notes and certification state |

### `commission_entries` or `compensation_commission_entries`

Cash-only commission ledger. If the existing `commission_entries` table is reused, Phase 2 must migrate its contract to HQ payroll semantics; otherwise create a successor table.

| Field | Meaning |
|-------|---------|
| `id` | UUID/text primary key |
| `period_id` | Payroll period |
| `agent_id`, `agent_name` | Agent identity snapshot |
| `attribution_method` | `payment_agent_id` or `lab_ownership_snapshot` |
| `attribution_snapshot_id` | Link to snapshot/audit data |
| `attributable_cash_collected` | Cash basis input |
| `commission_rate_bps` | Applied rate |
| `commission_amount` | Calculated amount |
| `eligibility_status` | eligible / blocked / manual_review |
| `blocked_reason` | Promotion or commission blocker |
| `source_payment_refs` | Payment IDs or hashed source list |
| `rule_version` | Compensation rule version |
| `status` | draft / previewed / submitted / approved / locked / exported / paid / void |

### `payroll_runs`

Run header for a period.

| Field | Meaning |
|-------|---------|
| `id` | UUID primary key |
| `period_id` | Payroll period |
| `run_number` | Sequential run version |
| `status` | draft / previewed / submitted / approved / locked / exported / paid / void |
| `generated_by`, `generated_at` | HR/Executive preview audit |
| `approved_by`, `approved_at` | Executive approval |
| `locked_by`, `locked_at` | Executive lock |
| `exported_by`, `exported_at` | Export audit |
| `totals_json` | Gross, deductions, net totals |

### `payroll_run_lines`

Agent-level payroll result.

| Field | Meaning |
|-------|---------|
| `id` | UUID primary key |
| `payroll_run_id`, `period_id` | Run and period |
| `agent_id`, `agent_name` | Agent snapshot |
| `plan_assignment_id` | Plan basis |
| `salary_amount`, `fuel_allowance`, `mobile_allowance` | Fixed components |
| `commission_amount` | Cash-collected commission |
| `collection_incentive`, `delivery_incentive`, `qualification_incentive`, `attendance_incentive` | Incentives |
| `quarterly_bonus`, `annual_bonus` | Bonus components |
| `manual_adjustments_total`, `penalties_total`, `recoveries_total` | Adjustments |
| `gross_pay`, `deductions_total`, `net_payable` | Payroll totals |
| `line_status` | draft / previewed / submitted / approved / locked / exported / paid / void |
| `calculation_snapshot` | Full calculation inputs and rule version |

### `compensation_adjustments`

Manual additions, penalties, and recoveries.

| Field | Meaning |
|-------|---------|
| `id` | UUID primary key |
| `period_id`, `agent_id` | Target |
| `adjustment_type` | positive / negative / recovery / advance / correction |
| `component` | Salary, commission, bonus, attendance, delivery, qualification, collection |
| `amount` | Positive or negative amount |
| `reason`, `notes` | Mandatory explanation |
| `requested_by`, `approved_by` | HR/Admin request and Executive approval |
| `status` | draft / submitted / approved / rejected / void |

### `compensation_audit_events`

Append-only audit for every payroll-domain action.

| Field | Meaning |
|-------|---------|
| `id` | UUID primary key |
| `event_type` | preview / submit / approve / reject / lock / export / pay / reopen / adjustment_requested / adjustment_approved / adjustment_rejected |
| `entity_type`, `entity_id` | Affected domain object |
| `actor_user_id`, `actor_role` | Authenticated actor |
| `before_json`, `after_json` | Snapshot diff where applicable |
| `reason`, `created_at` | Mandatory reason for adjustments, approvals, locks, voids |

### `compensation_approval_events`

Approval workflow evidence.

| Field | Meaning |
|-------|---------|
| `id` | UUID primary key |
| `payroll_run_id`, `line_id` | Run or line |
| `action` | submit / approve / reject / request_changes / lock / export / pay / reopen |
| `actor_user_id`, `actor_role` | Actor |
| `reason`, `notes` | Approval context |
| `created_at` | Timestamp |

### `payroll_exports`

Export metadata only.

| Field | Meaning |
|-------|---------|
| `id` | UUID primary key |
| `payroll_run_id`, `period_id` | Export target |
| `export_format` | csv / excel / accounting_ready |
| `storage_path` | File reference |
| `checksum` | Integrity hash |
| `generated_by`, `generated_at` | Export audit |
| `status` | generated / downloaded / void |

---

## Payroll period model

Payroll periods are monthly. A period must close operationally before final approval.

Allowed period states:

```
draft -> previewed -> submitted -> approved -> locked -> exported -> paid
                         |             |
                         v             v
                       draft          void
```

Rules:

1. HR may generate `previewed` runs.
2. HR may submit for review.
3. Only Executive may approve.
4. Only Executive may lock.
5. Export is allowed only after lock.
6. Paid is a payroll-domain evidence state only; it does not create a `payments` row, bank payout, GL posting, accounting entry, disbursement record, or AR mutation.
7. Locked runs are immutable. Reopen creates a new draft run version and never edits the locked/exported/paid source run.
8. No accounting entry is created in this phase.

---

## Calculation rules

Phase 3B implements calculation preview only. The engine may calculate draft preview rows and draft audit evidence, but it must not approve, submit, lock, export, pay, create accounting records, create bank files, or expose UI.

### Cash-only commission

```
commission = attributable_cash_collected * applicable_commission_rate
```

Allowed input:

- Cash actually collected from `payments` after successful payment write and AR reduction.

Forbidden inputs:

- Order value
- Invoice value
- Fulfilled revenue
- Projected revenue
- Outstanding receivables
- Allocation totals as commission amount

Implementation:

- `calculateCommissionEntries()` reads period `payments.amount_received` only for commissionable cash.
- Cumulative payment reads may be used for promotion eligibility, but commission amount for the current preview remains period cash × plan rate.
- Orders, invoices, fulfilled revenue, projected revenue, outstanding receivables, allocation totals, and legacy `commission_entries` are forbidden inputs.

### Year-1 agent baseline

| Stage | Salary | Fuel | Mobile | Commission |
|-------|--------|------|--------|------------|
| First 3 months | ₹20,000 | ₹5,000 | ₹500 | 3% of attributable collected cash |
| Promoted | ₹25,000 | Policy-defined | Policy-defined | 3.5% of attributable collected cash |

Promotion requires all conditions:

1. Cumulative attributable collections >= ₹5,00,000.
2. Collection efficiency >= 80%.
3. No assigned account overdue more than 90 days.

Bonuses:

- Quarterly bonus: ₹5,000-₹15,000.
- Annual bonus: ₹15,000-₹75,000.
- Bonus eligibility must be rule-versioned and approved by Executive.

---

## Agent attribution

Attribution must be snapshot-based and auditable.

Priority:

1. Use `payments.agent_id` when populated and certified.
2. Otherwise use active `lab_ownership` at the payment date.

The calculated entry must persist the attribution method, agent identity snapshot, source payment references or source hash, and rule version. Recomputing current ownership after the fact is not allowed for locked payroll.

Phase 3B preview attribution rule:

1. Use `payments.agent_id` when populated.
2. Otherwise use existing `compensation_attribution_snapshots`.
3. Do not read current `lab_ownership` directly during calculation preview. Missing snapshots must produce a warning/manual-review outcome rather than silently using current ownership.

---

## Phase 3B preview calculation engine

Approved pure service functions:

- `calculateCompensationPreview()`
- `calculateCommissionEntries()`
- `calculatePayrollPreview()`
- `calculatePromotionEligibility()`
- `calculateCollectionEfficiency()`
- `calculateAgentCompensation()`

Preview persistence rules:

1. Persist only `draft` rows in `payroll_runs`, `payroll_run_lines`, and `compensation_commission_entries`.
2. Record `calculation_start` and `calculation_finish` in `compensation_audit_events`.
3. Do not write `compensation_approval_events`.
4. Do not write `payroll_exports`.
5. Do not update or delete Finance/O2C records.
6. Every calculated row must carry `plan_id`, `plan_version`, `rule_version`, and `calculated_at` in metadata or calculation snapshots.

---

## Approval workflow

1. HR or Executive generates payroll preview.
2. Engine reads payments, ownership snapshots, plans, adjustments, and eligibility blockers.
3. Payroll run lines are calculated in draft/preview state.
4. HR may submit preview to Executive.
5. Admin may add recommendations only; recommendations do not change payable amounts until approved.
6. Executive reviews exceptions, adjustments, bonuses, penalties, and recoveries.
7. Executive approves or rejects.
8. Executive locks approved run.
9. Export is generated from locked run only.
10. Executive may mark exported payroll as paid using payroll-domain evidence only; no Finance/O2C record is mutated.

---

## Phase 3C payroll domain completion

Phase 3C completes backend/domain workflow before UI. It introduces lifecycle services, immutable locking guards, adjustment domain rules, export data shaping, payroll-domain paid evidence, RBAC checks, and verification.

Workflow state diagram:

```
draft
  -> previewed       (HR or Executive)
  -> submitted       (HR or Executive)
  -> approved        (Executive)
  -> locked          (Executive; immutable payroll details)
  -> exported        (Executive; csv/excel/accounting_ready metadata only)
  -> paid            (Executive; payroll-domain evidence only)

submitted -> draft   (Executive reject)
locked/exported/paid -> new draft run version (Executive reopen; original remains immutable)
```

RBAC:

| Action | Executive | HR | Admin | Agent |
|--------|-----------|----|-------|-------|
| Preview | yes | yes | view only | no |
| Submit | yes | yes | view only | no |
| Approve / reject | yes | no | no | no |
| Lock | yes | no | no | no |
| Export | yes | no | no | no |
| Pay evidence | yes | no | no | no |
| Reopen as new draft version | yes | no | no | no |
| Adjustment create | yes | yes | recommend only | no |
| Adjustment approve/reject | yes | no | no | no |
| Own locked/exported/paid read | n/a | n/a | n/a | yes |

Immutable after lock:

1. `payroll_run_lines`, `compensation_commission_entries`, and approved adjustments tied to a locked/exported/paid run cannot be updated or deleted.
2. `payroll_runs` may progress only `locked -> exported -> paid` after lock.
3. Reopen never mutates the locked/exported/paid run; it creates a new draft run version linked by metadata.
4. Export/pay evidence must write audit events and workflow evidence only.

---

## Manual adjustments, penalties, and recoveries

Manual changes are separate records. They must never overwrite computed salary or commission source rows.

Required fields:

- Agent
- Period
- Component
- Amount
- Type
- Reason
- Requested by
- Executive approval
- Audit event

Penalties and recoveries reduce net payable but do not reduce cash collected or mutate finance records.

---

## Bonus and incentive model

Supported components:

- Salary
- Commission
- Collection incentive
- Delivery incentive
- Qualification incentive
- Attendance incentive
- Quarterly bonus
- Annual bonus
- Manual adjustments
- Penalties
- Recoveries

Each component must be independently visible in `payroll_run_lines` and independently auditable.

---

## RLS and security model

Phase 2 implementation must define RLS before migration.

Minimum policy contract:

| Table family | Executive | HR | Admin | Agent | Distributor OS |
|--------------|-----------|----|-------|-------|----------------|
| Plans | SELECT/INSERT/UPDATE subject to lock rules | SELECT/INSERT/UPDATE draft fields | SELECT | none | none |
| Periods/runs | Full workflow | preview/submit only | SELECT/recommend | own read after lock/export | none |
| Run lines | Full | preview/submit fields | SELECT/recommend | own lines only | none |
| Adjustments | Create/approve/reject | create/submit | recommend only | own read after approval if included in line | none |
| Audit/approval events | SELECT all | SELECT relevant | SELECT relevant | own relevant | future snapshot only |
| Exports | Generate/download after lock | no export without Executive approval | no | no | no |

Hard rules:

1. Agents can read only their own locked/exported compensation history.
2. HR cannot approve payouts, commission changes, run locks, or exports.
3. Admin cannot approve payouts or change payable amounts.
4. Executive approval is required for payout authorization.
5. Distributor OS has no payroll ownership.
6. RLS must not expose cross-agent or cross-tenant payroll data.

---

## Executive dashboard

Phase 4A delivers the **Executive Compensation Center** (`compensationPayroll` route) as a read-only Executive-only UI.

| Surface | Phase 4A status |
|---------|-----------------|
| Executive Compensation Center | Implemented — read-only dashboard, periods, preview, agent detail, history |
| Approval / lock / export / pay actions | Deferred to Phase 4B |
| HR / Admin / Agent access | Hidden in Phase 4A |
| Data source | Bounded reads from payroll/compensation tables only; no finance mutation |

Recommended screens:

- Executive Compensation Dashboard
- Payroll Periods
- Payroll Run Preview
- Approval Queue
- Agent Compensation Detail
- Manual Adjustments
- Bonus/Incentive Review
- Payroll Export History
- Agent Self-View

Recommended KPIs:

- Current payroll liability
- Pending approval amount
- Approved but not locked amount
- Locked/export-ready amount
- Commission payable from collected cash
- Collection efficiency by agent
- Promotion eligible agents
- Promotion blocked agents
- Accounts overdue >90 days by agent
- Adjustment, penalty, and recovery totals
- Export status by period

---

## Verification requirements

New scripts required:

- `verify-compensation-schema.mjs`
- `verify-compensation-rls.mjs`
- `verify-payroll-period-lifecycle.mjs`
- `verify-compensation-audit.mjs`
- `verify-compensation-role-access.mjs`
- `verify-compensation-cash-only.mjs`
- `verify-compensation-attribution.mjs`
- `verify-payroll-run-lifecycle.mjs`
- `verify-compensation-approval-workflow.mjs`
- `verify-payroll-export.mjs`
- `verify-compensation-no-finance-mutation.mjs`

Required regression gates:

- `verify-financial-reconciliation.mjs`
- `verify-payment-allocation-flow.mjs`
- `verify-hq-rls-reads.mjs`
- `verify-ar-reconcile.mjs`
- `verify-agent-collections-ownership-filter.mjs`
- `run-browser-smoke-all-roles.mjs`

---

## UAT plan

Minimum UAT:

1. HR creates a payroll preview for a closed month.
2. Verify commission uses collected cash only.
3. Verify an agent with ₹5,00,000 cumulative collections, >=80% efficiency, and no >90 day overdue account receives promoted terms.
4. Verify promotion is blocked when any condition fails.
5. Add manual adjustment, penalty, and recovery; confirm Executive approval is required.
6. Admin can view/recommend but cannot approve.
7. Agent can view only own locked/exported history.
8. Executive approves, locks, and exports.
9. Confirm locked run cannot be edited.
10. Confirm orders, invoices, payments, allocations, AR, inventory, logistics, and existing commission analytics are not mutated.

---

---

## Phase 5A — Compensation Administration

Phase 5A delivers the master-data administration layer for compensation plans and employee assignments inside the Executive Compensation Center.

| Surface | Scope |
|---------|-------|
| Compensation Plans tab | Plan list, view/edit/duplicate/deactivate (no delete) |
| Plan Details | General, fixed/variable compensation, promotion rules, bonuses, incentives, audit, version history |
| Plan Versioning | Active plan edits create a new version; prior version retired; assignments keep old `plan_id` |
| Plan Assignments tab | Employee assignment list, change plan, end assignment (no delete) |
| Compensation Simulator | Preview-only expected commission/payroll/net; never writes data |
| Promotion Eligibility panel | Review-only eligibility recommendations; no automatic promotion |

RBAC (application layer; RLS unchanged in Phase 5A):

| Action | Executive | HR | Admin | Agent |
|--------|-----------|----|-------|-------|
| View plans/assignments | yes | yes | yes | own assignment only |
| Create/edit/version/deactivate plans | yes | no | no | no |
| Assign / change / end assignments | yes | yes | no | no |
| Simulator / promotion review | yes | yes | yes | no |

Forbidden in Phase 5A:

- Finance, AR, payments, orders, invoice, allocation mutation
- Payroll preview calculation changes
- Approval, lock, export, paid workflow changes

---

## Phase 5B — Agent Compensation 360

Phase 5B delivers the single employee compensation profile surface from **Executive Compensation → Agents → click employee**.

| Section | Scope |
|---------|-------|
| Overview | Identity, plan, salary/allowances, commission %, promotion status, collection efficiency, current-month collections/commission |
| Payroll History | All payroll run lines for the agent (period, salary, commission, allowances, adjustments, net pay, status) |
| Commission History | Cash-collected commission entries with source payment evidence and calculation version |
| Compensation Plan | Assigned plan, version, effective dates, history; change plan reuses Phase 5A assignment workflow |
| Adjustments | Read-only bonuses, penalties, recoveries, manual adjustments with reason and approver |
| Promotion | Review-only eligibility recommendation; no automatic promotion |
| Audit Timeline | Unified agent-filtered timeline for plan, payroll, commission, adjustment, and promotion events |

RBAC (application layer; RLS unchanged in Phase 5B):

| Action | Executive | HR | Admin | Agent | Lab | Distributor |
|--------|-----------|----|-------|-------|-----|-------------|
| View Agent Compensation 360 | yes | yes | yes | own profile only (future) | no | no |
| Change plan from 360 | yes | yes | no | no | no | no |
| Review payroll/commission/adjustment history | yes | yes | yes | own only (future) | no | no |

Forbidden in Phase 5B:

- Payroll approval, export, mark paid, accounting, finance mutation, payroll recalculation
- Commission rule editing from 360 (HR assigns plans only)
- Automatic promotion execution

Verification scripts:

- `verify-agent-compensation-profile.mjs`
- `verify-agent-payroll-history.mjs`
- `verify-agent-commission-history.mjs`
- `verify-agent-plan-history.mjs`
- `verify-agent-compensation-security.mjs`

---

## Phase plan

| Phase | Scope |
|-------|-------|
| Phase 1 | Blueprint and Certification docs only |
| Phase 2 | Implementation planning: role/RLS/schema/API/UI impact assessment |
| Phase 3 | Schema + RLS in QA shadow; no accounting entries |
| Phase 4 | Calculator + preview + verification scripts |
| Phase 5 | Executive approval, lock, export, UAT |
| Phase 6 | Agent self-view and future read-only Distributor OS snapshots |

---

## Do-not-break rules

Compensation and payroll must never mutate:

- Orders
- Invoices
- Payments
- AR
- Payment allocations
- Collections source records
- Inventory
- Logistics
- Existing commission source records unless an approved migration explicitly replaces them

No accounting entry, bank payout, GL posting, or payment disbursement record is created in this phase.
