# Sprint 1C — Employee Directory Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1C |
| Module | People Operations → Employees |
| Environment | QA |
| Roles | HR, Executive |

## P0 — Selection & bulk bar

| # | Step | Expected | Result |
|---|------|----------|--------|
| S1 | Select one row | Strong highlight + bulk bar with "1 selected" | ☐ PASS ☐ FAIL |
| S2 | Deselect row | Bulk bar disappears | ☐ PASS ☐ FAIL |
| S3 | Bulk Assign (1 row) | "Opening…" briefly; routes to assignments | ☐ PASS ☐ FAIL |

## P0 — Search & filters

| # | Step | Expected | Result |
|---|------|----------|--------|
| F1 | Type in search | Debounced filter (~300ms); result count updates | ☐ PASS ☐ FAIL |
| F2 | No matches | Empty state shows search term in title | ☐ PASS ☐ FAIL |
| F3 | Refresh directory | Search/filters preserved; scroll position preserved | ☐ PASS ☐ FAIL |
| F4 | Refresh failure | Inline error in directory (not page banner) | ☐ PASS ☐ FAIL |

## P0 — Quick View

| # | Step | Expected | Result |
|---|------|----------|--------|
| Q1 | Open Quick View | Loading skeleton while fetching | ☐ PASS ☐ FAIL |
| Q2 | Press ESC | Drawer closes | ☐ PASS ☐ FAIL |
| Q3 | After close | Focus returns to originating row | ☐ PASS ☐ FAIL |
| Q4 | Load error | Retry button works in drawer | ☐ PASS ☐ FAIL |

## P0 — Workspace

| # | Step | Expected | Result |
|---|------|----------|--------|
| W1 | Open workspace from row | Immediate loading state on workspace | ☐ PASS ☐ FAIL |
| W2 | Back to directory | Filters and search unchanged | ☐ PASS ☐ FAIL |

## P0 — Export

| # | Step | Expected | Result |
|---|------|----------|--------|
| E1 | Select rows → Export | "Exporting…" then success toast | ☐ PASS ☐ FAIL |

## P1 — Regression

| # | Step | Expected | Result |
|---|------|----------|--------|
| R1 | Compensation Assignments | Sprint 1A unaffected | ☐ PASS ☐ FAIL |
| R2 | Payroll workflow | Sprint 1B unaffected | ☐ PASS ☐ FAIL |

## Sign-off

| Tester | Role | Date | Verdict |
|--------|------|------|---------|
| | HR | | ☐ GO ☐ NO-GO |
