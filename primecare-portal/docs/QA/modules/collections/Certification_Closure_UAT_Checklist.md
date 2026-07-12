# Collections Certification Closure — Manual UAT

| Field | Value |
|-------|-------|
| Environment | QA |
| Roles | Executive/Admin, Agent |

## P0 — COL-CERT-011 Discoverability

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Login as Admin → Credit & Risk | Within 5s: “Start here” / High-Risk Interventions visible near top | ☐ |
| A2 | Intervention row | Primary CTA is **Record Payment** | ☐ |
| A3 | Click Record Payment | Payment drawer opens for that lab | ☐ |

## P0 — COL-CERT-003 Context awareness

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Agent Collections | Context strip shows workspace (Agent collections) | ☐ |
| B2 | Open payment drawer | Strip shows selected lab | ☐ |
| B3 | HQ Credit & Risk + attention filter | Strip shows active filter | ☐ |

## P0 — COL-CERT-004 Continuity

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Agent → Schedule Follow-Up | Visits opens with Back to Collections | ☐ |
| C2 | Complete or cancel visit → Back to Collections | Returns to Collections work queue | ☐ |
| C3 | Agent → Open Lab | Labs shows Back to Collections | ☐ |
| C4 | Click Back to Collections | Returns to Collections; search/selection preserved if previously set | ☐ |

## P1 — Regression

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | Payment save success/failure | Sprint 1A feedback unchanged | ☐ |
| D2 | Agent search debounce / selection | Sprint 1B unchanged | ☐ |
| D3 | Workspace shells | Sprint 1C unchanged | ☐ |

## Sign-off

| Tester | Role | Verdict |
|--------|------|---------|
| | | ☐ GO ☐ NO-GO |
