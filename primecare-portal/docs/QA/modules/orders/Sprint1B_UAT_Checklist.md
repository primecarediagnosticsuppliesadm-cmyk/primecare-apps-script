# Sprint 1B — HQ Orders Context & Continuity Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1B |
| Module | HQ Orders |
| Roles | Admin / Executive; Read-only auditor |

## Admin / Executive

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1 | Open Orders | Start Here visible within ~5 seconds | ☐ |
| 2 | Click Review Next Order | Awaiting queue active; next order selected | ☐ |
| 3 | Apply status/payment/lab/date/search filters | List filters; strip updates | ☐ |
| 4 | Select an order | Strong selected row; ID in detail header + strip | ☐ |
| 5 | Navigate to Collections (Record Payment) | Collections opens with lab focus | ☐ |
| 6 | Click Back to Orders | Orders restores selection + queue/search/filters | ☐ |
| 7 | Repeat with Labs | Back to Orders restores context | ☐ |
| 8 | Repeat with Logistics (fulfilled order) | Back to Orders restores context | ☐ |
| 9 | Open Orders from deep-linked order | Correct order selected or outside-filter recovery | ☐ |
| 10 | Use frozen QA / freeze state | Strip shows Status writes frozen | ☐ |
| 11 | Trigger status action failure | Error stays inside Status Actions (Sprint 1A) | ☐ |

## Read-only auditor

| # | Step | Expected | Result |
|---|------|----------|--------|
| R1 | Open Orders | Context + selection visible | ☐ |
| R2 | Confirm no new write actions | Status writes remain frozen/disabled as before | ☐ |
| R3 | Cross-module return if available | Back to Orders works without permission expansion | ☐ |

## Sign-off

| Role | Result | Date |
|------|--------|------|
| Tester | ☐ PASS ☐ FAIL | |
