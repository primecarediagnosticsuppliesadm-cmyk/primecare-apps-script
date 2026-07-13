# Sprint 1B — Purchase Context & Continuity (Manual UAT Checklist)

**Roles:** Admin / Executive  
**Sprint 1A mutation UAT still applies.**

| # | Scenario | Expected | Pass |
|---|----------|----------|------|
| P1B-01 | Open Purchase | Primary question visible; Context Strip; **action-oriented** Start Here (not stats-only) | ☐ |
| P1B-02 | Start Here → Receive Pending | Switches to Receive tab | ☐ |
| P1B-03 | Start Here → Create | Switches to Create tab | ☐ |
| P1B-04 | Start Here → Review Critical (when Critical exists) | Switches to Forecast Suggestions | ☐ |
| P1B-05 | Start Here → Investigate Blocked (when blocked exists) | Switches to Forecast Suggestions | ☐ |
| P1B-06 | Context strip | Shows view · selected PO · supplier · search · status · sort · freeze when active | ☐ |
| P1B-07 | History select PO | Row `aria-selected` + ring; Selected Purchase Order panel | ☐ |
| P1B-08 | Selection + filter hide | Outside-filter banner; Clear Filters / Return to Purchase; selection not silently cleared | ☐ |
| P1B-09 | Open Inventory / Orders from Purchase | Back to Purchase on destination; restore tab/search/filters/selection | ☐ |
| P1B-10 | Back to Inventory still works when arrived from Inventory | Restores Inventory context | ☐ |
| P1B-11 | History empty / search empty / filter empty | Differentiated copy + one recovery action | ☐ |
| P1B-12 | Receive with no pending | No pending receipts empty + recovery | ☐ |
| P1B-13 | KPI summary | Collapsed under operational work (not above Start Here) | ☐ |
| P1B-14 | Create failure still ActionErrorSummary | Sprint 1A unchanged | ☐ |
| P1B-15 | No Approvals / explainability / queue redesign | Out-of-scope absent | ☐ |

**Known blocker (not this sprint):** `verify-procurement-inventory-flow.mjs` `@/` Node import failure.

**Sign-off:** _________________ Date: _______
