# Sprint 1B — Agent Collections Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1B |
| Module | Collections → Agent work queue |
| Environment | QA |
| Role | Agent |

## Prerequisites

- [ ] Log in as Agent with owned labs in collections
- [ ] Navigate to Collections (agent view)
- [ ] At least 2 labs with outstanding balances in queue

---

## P0 — Selected lab visibility

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Click **Record Payment** on a queue card | Payment drawer opens | ☐ PASS ☐ FAIL |
| A2 | Observe queue | Selected card has visible highlight (ring/border) | ☐ PASS ☐ FAIL |
| A3 | Context strip | Shows which lab is active for recording | ☐ PASS ☐ FAIL |
| A4 | Close drawer | Highlight clears | ☐ PASS ☐ FAIL |

## P0 — Search (debounced)

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Type quickly in search box | Filter does not flicker on every keystroke (~300ms delay) | ☐ PASS ☐ FAIL |
| B2 | Search for non-matching lab | Empty state shows query in message | ☐ PASS ☐ FAIL |
| B3 | Clear search | Full queue returns | ☐ PASS ☐ FAIL |

## P0 — Refresh preserves context

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Enter search term; open payment drawer for a lab | Search + drawer open | ☐ PASS ☐ FAIL |
| C2 | Click **Refresh** | "Work queue updated" (or equivalent) feedback; search term preserved | ☐ PASS ☐ FAIL |
| C3 | With drawer open, refresh | Drawer re-hydrates; selected lab still highlighted | ☐ PASS ☐ FAIL |

## P0 — Record payment + evidence

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | Record payment with proof attached | Button shows **Recording payment…** then **Uploading proof…** | ☐ PASS ☐ FAIL |
| D2 | Successful proof upload | Field shows success; success toast; drawer closes | ☐ PASS ☐ FAIL |
| D3 | Proof upload failure (if reproducible) | Warning toast; field shows failed status; drawer stays open for retry | ☐ PASS ☐ FAIL |
| D4 | Double-click save rapidly | Only one payment submitted | ☐ PASS ☐ FAIL |

## P0 — Payment failure (Sprint 1A regression)

| # | Step | Expected | Result |
|---|------|----------|--------|
| E1 | Force payment failure | Inline `ActionErrorSummary` in drawer; values preserved | ☐ PASS ☐ FAIL |

## P1 — Regression

| # | Step | Expected | Result |
|---|------|----------|--------|
| F1 | Route stop badges / queue order | Unchanged Daily OS ordering | ☐ PASS ☐ FAIL |
| F2 | Only owned labs visible | Ownership filter unchanged | ☐ PASS ☐ FAIL |
| F3 | Schedule follow-up / Open lab actions | Still work | ☐ PASS ☐ FAIL |
| F4 | HQ Credit & Risk (different role) | Unaffected | ☐ PASS ☐ FAIL |

## Sign-off

| Tester | Role | Date | Verdict |
|--------|------|------|---------|
| | Agent | | ☐ GO ☐ NO-GO |
