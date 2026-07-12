# Sprint 1A — Collections Payment Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1A |
| Module | Collections / Credit & Risk → Payment interaction |
| Environment | QA |
| Roles | Agent, Executive, Admin |

## Prerequisites

- [ ] Log in as Agent with at least one owned lab in collections
- [ ] Log in as Executive or Admin for Credit & Risk view
- [ ] At least one lab with outstanding balance > 0
- [ ] Supabase configured (pilot path)

---

## P0 — Record payment (happy path — agent drawer)

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Agent Collections → open lab → **Record payment** | Payment drawer opens | ☐ PASS ☐ FAIL |
| A2 | Enter amount + payment mode | Fields accept input | ☐ PASS ☐ FAIL |
| A3 | Click **Save collection update** | Button shows **Recording payment…** while processing | ☐ PASS ☐ FAIL |
| A4 | Wait for completion | Success toast; drawer **closes**; list refreshes with reduced outstanding | ☐ PASS ☐ FAIL |

## P0 — Record payment (failure — inline error)

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Open payment drawer; enter invalid scenario (e.g. amount 0 with no notes, or reproducible API failure) | Drawer stays open | ☐ PASS ☐ FAIL |
| B2 | Submit | **Error appears inside drawer** via red summary — not toast-only | ☐ PASS ☐ FAIL |
| B3 | Verify preserved values | Amount, mode, notes still populated | ☐ PASS ☐ FAIL |
| B4 | Dismiss error or edit and retry | Error clears on retry; no page-level error banner | ☐ PASS ☐ FAIL |

## P0 — Credit & Risk payment drawer

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Credit & Risk → open lab payment drawer | Drawer opens | ☐ PASS ☐ FAIL |
| C2 | Record payment successfully | Toast + drawer closes | ☐ PASS ☐ FAIL |
| C3 | Force failure if possible | Inline drawer error; drawer stays open | ☐ PASS ☐ FAIL |

## P0 — Follow-up only (zero amount)

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | Open follow-up tab or form; leave amount empty; enter follow-up date + note | Fields accept input | ☐ PASS ☐ FAIL |
| D2 | Submit | Button shows **Saving follow-up…** | ☐ PASS ☐ FAIL |
| D3 | On success | Success toast; drawer closes (agent/C&R) or panel refreshes | ☐ PASS ☐ FAIL |
| D4 | On failure | Inline error in panel; values preserved | ☐ PASS ☐ FAIL |

## P1 — HQ expanded row (non-drawer)

| # | Step | Expected | Result |
|---|------|----------|--------|
| E1 | HQ Collections → expand lab row → record payment | Inline `ActionErrorSummary` on failure | ☐ PASS ☐ FAIL |
| E2 | Success path | Toast; row refreshes; panel stays open with updated data | ☐ PASS ☐ FAIL |

## P1 — Regression (unchanged surfaces)

| # | Step | Expected | Result |
|---|------|----------|--------|
| F1 | Credit & Risk Command Center KPIs | Unchanged totals | ☐ PASS ☐ FAIL |
| F2 | Agent work queue / navigation | Unchanged | ☐ PASS ☐ FAIL |
| F3 | Invoice allocation after payment | Still allocates per existing rules | ☐ PASS ☐ FAIL |
| F4 | Proof upload after successful payment | Warning toast only if proof fails; payment retained | ☐ PASS ☐ FAIL |

## Sign-off

| Tester | Role | Date | Verdict |
|--------|------|------|---------|
| | Agent | | ☐ GO ☐ NO-GO |
| | Executive | | ☐ GO ☐ NO-GO |
