# Sprint 1B — Payroll Workflow Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1B |
| Module | People Operations → Payroll |
| Environment | QA |
| Roles | HR, Executive |

## Prerequisites

- [ ] Log in as HR (submit) or Executive (approve/lock/export/paid)
- [ ] Navigate: People Operations → Payroll → Pay Periods
- [ ] At least one draft payroll period with assigned employees

---

## P0 — Generate Preview

| # | Step | Expected | Result |
|---|------|----------|--------|
| G1 | Click **Generate Preview** | Button shows "Generating payroll preview…" | ☐ PASS ☐ FAIL |
| G2 | On success | Success toast; navigates to Run Review; period/run preserved | ☐ PASS ☐ FAIL |
| G3 | On failure | Error in toolbar (not page banner); button re-enabled | ☐ PASS ☐ FAIL |

## P0 — Submit / Approve / Lock / Export (confirm modals)

| # | Step | Expected | Result |
|---|------|----------|--------|
| W1 | Click **Submit Preview** | Confirm modal opens (not window.confirm) | ☐ PASS ☐ FAIL |
| W2 | Cancel modal | Modal closes; no status change | ☐ PASS ☐ FAIL |
| W3 | Confirm submit | Loading label; modal stays open until success | ☐ PASS ☐ FAIL |
| W4 | Executive: Approve | Modal confirm + "Approving payroll…" | ☐ PASS ☐ FAIL |
| W5 | Executive: Lock | Modal confirm + "Locking payroll…" | ☐ PASS ☐ FAIL |
| W6 | Executive: Export | Modal confirm + "Exporting payroll…" | ☐ PASS ☐ FAIL |
| W7 | On workflow failure | Error inside modal; modal stays open | ☐ PASS ☐ FAIL |

## P0 — Reject

| # | Step | Expected | Result |
|---|------|----------|--------|
| R1 | Submitted run → **Reject** | Modal with reason field | ☐ PASS ☐ FAIL |
| R2 | Submit without reason | Confirm disabled | ☐ PASS ☐ FAIL |
| R3 | Reject with reason | "Rejecting payroll…"; modal closes only on success | ☐ PASS ☐ FAIL |

## P0 — Mark Paid

| # | Step | Expected | Result |
|---|------|----------|--------|
| P1 | Exported run → **Mark Paid Evidence** | Form modal opens | ☐ PASS ☐ FAIL |
| P2 | Confirm with reference | "Marking payroll paid…"; success toast on complete | ☐ PASS ☐ FAIL |
| P3 | On failure | Error inside modal | ☐ PASS ☐ FAIL |

## P1 — Context preservation

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Set period filter / reporting context | Unchanged after successful workflow action | ☐ PASS ☐ FAIL |
| C2 | Compensation Assignments tab | Unaffected (Sprint 1A) | ☐ PASS ☐ FAIL |

## Sign-off

| Tester | Role | Date | Verdict |
|--------|------|------|---------|
| | HR | | ☐ GO ☐ NO-GO |
| | Executive | | ☐ GO ☐ NO-GO |
