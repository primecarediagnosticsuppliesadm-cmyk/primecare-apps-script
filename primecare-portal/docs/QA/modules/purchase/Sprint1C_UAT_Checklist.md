# Sprint 1C — Purchase Workspace Simplification (Manual UAT Checklist)

**Roles:** Admin / Executive  
**Sprint 1A mutation UAT and Sprint 1B context UAT still apply.**

| # | Scenario | Expected | Pass |
|---|----------|----------|------|
| P1C-01 | Open Purchase | Primary question: “What purchasing work should I do now?”; Context Strip; Start Here; then Purchase Queue | ☐ |
| P1C-02 | Purchase Queue order | Critical Reorders → Forecast Drafts → Pending Receipts → Purchase History (single hierarchy, not three peer groups) | ☐ |
| P1C-03 | Critical Reorders chip | Opens Forecast Suggestions (triggers); purpose line visible | ☐ |
| P1C-04 | Forecast Drafts | Sub-nav Min-stock / Smart; KPI strips collapsed by default | ☐ |
| P1C-05 | Pending Receipts | Opens Receive; same receive workflow as before | ☐ |
| P1C-06 | Purchase History | Opens History; select PO → Selected panel + expected action line | ☐ |
| P1C-07 | Selected PO discoverability | Within ~5s: which PO, expected action, why (status/remaining) | ☐ |
| P1C-08 | Create PO / Suppliers | Secondary chips; Create still works | ☐ |
| P1C-09 | Suppliers | Honesty copy only (“planned for a future release” / reference only); no fake KPI cards or empty interactive controls | ☐ |
| P1C-10 | Portfolio / advanced details | Collapsed under operational work; expandable | ☐ |
| P1C-11 | Start Here still routes | Receive / Create / Critical / Blocked behave as Sprint 1B | ☐ |
| P1C-12 | Back to Purchase / return | Sprint 1B return context still restores | ☐ |
| P1C-13 | Create/Receive failure | ActionErrorSummary at action site (Sprint 1A unchanged) | ☐ |
| P1C-14 | No module split | Still one Purchase workspace (no separate modules) | ☐ |

**Known blocker (not this sprint):** `verify-procurement-inventory-flow.mjs` `@/` Node import failure.

**Sign-off:** _________________ Date: _______
