# Sprint 1A — HQ Order Action Feedback Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1A |
| Module | Orders → Order Details |
| Environment | QA |
| Roles | Executive, Admin (HQ Orders) |

## Prerequisites

- [ ] Log in as Admin or Executive with Orders access
- [ ] Supabase configured (pilot path)
- [ ] At least one Placed/Processing order available for safe status tests
- [ ] Confirm freeze policy: if HQ status write is frozen, expect disabled buttons + freeze banner

---

## P0 — Mark Processing (happy path)

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Orders → select a Placed order | Order Details opens; Status Actions visible | ☐ PASS ☐ FAIL |
| A2 | Optionally enter a note; click **Mark Processing** | Button shows **Marking Processing…**; all status buttons disabled; `aria-busy` | ☐ PASS ☐ FAIL |
| A3 | Wait for completion | Success toast; detail refreshes to Processing; selected order + filters/search preserved | ☐ PASS ☐ FAIL |
| A4 | Confirm scroll / list position | List does not jump to top; same order remains selected | ☐ PASS ☐ FAIL |

## P0 — Mark Fulfilled (happy path)

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Select eligible Processing (or Placed) order with stock | Status Actions enabled | ☐ PASS ☐ FAIL |
| B2 | Click **Mark Fulfilled** | Button shows **Fulfilling Order…**; other actions disabled | ☐ PASS ☐ FAIL |
| B3 | Wait for completion | Success toast; status Fulfilled; invoice panel may update; selection/filters preserved | ☐ PASS ☐ FAIL |

## P0 — Failure → inline error (not page top)

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Trigger a known failure (e.g. fulfill with insufficient inventory, or cancel already-terminal via API if reproducible) | Action fails | ☐ PASS ☐ FAIL |
| C2 | Observe error placement | Red **ActionErrorSummary** inside **Status Actions** — not page-top `DataFetchError` | ☐ PASS ☐ FAIL |
| C3 | Confirm note preservation | Optional note still present after failure | ☐ PASS ☐ FAIL |
| C4 | Dismiss or retry | Error clears on new attempt; selection/filters unchanged | ☐ PASS ☐ FAIL |

## P0 — Cancel Order / Reset to Placed

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | Cancel an eligible order | Loading **Cancelling Order…**; success toast; Cancelled banner in details | ☐ PASS ☐ FAIL |
| D2 | Reset an eligible order to Placed | Loading **Resetting Order…**; success toast; status Placed | ☐ PASS ☐ FAIL |

## P0 — Duplicate submission

| # | Step | Expected | Result |
|---|------|----------|--------|
| E1 | Double-click a status action quickly | Only one write; buttons stay disabled until complete | ☐ PASS ☐ FAIL |

## P1 — Freeze / terminal states

| # | Step | Expected | Result |
|---|------|----------|--------|
| F1 | Open fulfilled or cancelled order | Status action buttons disabled | ☐ PASS ☐ FAIL |
| F2 | If freeze enabled | Banner shown; buttons disabled; no write | ☐ PASS ☐ FAIL |

## Out of scope checks (must remain unchanged)

| # | Step | Expected | Result |
|---|------|----------|--------|
| G1 | Lab Ordering / checkout | Untouched | ☐ PASS ☐ FAIL |
| G2 | Orders layout / routing | No workspace split or action relocation | ☐ PASS ☐ FAIL |

---

## Sign-off

| Role | Result | Date |
|------|--------|------|
| Tester | ☐ PASS ☐ FAIL | |
| Notes | | |
