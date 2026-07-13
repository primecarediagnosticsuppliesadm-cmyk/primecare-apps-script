# Sprint 1A — Compensation Assignments Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1A |
| Module | People Operations → Compensation → Assignments |
| Environment | QA |
| Roles | HR, Executive |

## Prerequisites

- [ ] Log in as HR or Executive with assign/change/end permissions
- [ ] Navigate: People Operations → Compensation → Assignments
- [ ] At least one active compensation plan exists
- [ ] At least one unassigned employee exists

---

## P0 — Assign plan (happy path)

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Click **Assign Employee** | Assign drawer opens | ☐ PASS ☐ FAIL |
| A2 | Select employee + plan + effective date | Fields accept input | ☐ PASS ☐ FAIL |
| A3 | Click **Assign Plan** | Button shows "Assigning plan…" while processing | ☐ PASS ☐ FAIL |
| A4 | Wait for completion | Success toast; drawer closes; table refreshes with new assignment | ☐ PASS ☐ FAIL |

## P0 — Assign plan (failure — inline error)

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Open assign drawer for employee who already has active plan | Drawer opens | ☐ PASS ☐ FAIL |
| B2 | Submit assign again | **Error appears inside drawer** (not page banner); drawer stays open; entered values preserved | ☐ PASS ☐ FAIL |
| B3 | Error title mentions active plan | Business copy, not raw Postgres text | ☐ PASS ☐ FAIL |

## P0 — Change plan

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | On active row, click **Change Plan** | Change drawer opens with employee locked | ☐ PASS ☐ FAIL |
| C2 | Select different plan + date, submit | Button shows "Saving change…" | ☐ PASS ☐ FAIL |
| C3 | On success | Toast; drawer closes; prior assignment in History | ☐ PASS ☐ FAIL |
| C4 | Force failure (role mismatch plan if possible) | Inline drawer error; no page banner | ☐ PASS ☐ FAIL |

## P0 — End assignment (confirmation + feedback)

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | Click **End Assignment** on active row | Confirmation dialog opens (not immediate end) | ☐ PASS ☐ FAIL |
| D2 | Click **Cancel** | Dialog closes; assignment still active | ☐ PASS ☐ FAIL |
| D3 | Click **End Assignment** again → confirm | Button shows "Ending assignment…" | ☐ PASS ☐ FAIL |
| D4 | On success | Toast; dialog closes; row moves to History/ended | ☐ PASS ☐ FAIL |
| D5 | On failure (if reproducible) | Error inside dialog; dialog stays open | ☐ PASS ☐ FAIL |

## P1 — Regression

| # | Step | Expected | Result |
|---|------|----------|--------|
| E1 | Segment tabs (All/Active/Unassigned/History) | Still filter correctly | ☐ PASS ☐ FAIL |
| E2 | Search + role filter | Still work | ☐ PASS ☐ FAIL |
| E3 | View row → Employee 360 | Still opens | ☐ PASS ☐ FAIL |
| E4 | Compensation Plans tab | Unaffected; plan create errors still in plan drawer | ☐ PASS ☐ FAIL |
| E5 | Payroll tab | Unaffected | ☐ PASS ☐ FAIL |

## Sign-off

| Tester | Role | Date | Verdict |
|--------|------|------|---------|
| | HR | | ☐ GO ☐ NO-GO |
| | Executive | | ☐ GO ☐ NO-GO |
