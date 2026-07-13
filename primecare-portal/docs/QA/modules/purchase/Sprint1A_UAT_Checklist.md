# Sprint 1A — Purchase Action Feedback (Manual UAT Checklist)

**Roles:** Admin / Executive  
**Out of scope for this UAT:** Start Here, queue hierarchy, Suppliers honesty, explainability cards

| # | Scenario | Expected | Pass |
|---|----------|----------|------|
| P1A-01 | Create PO success | Toast; form clears; list refreshes; search/filters unchanged if set | ☐ |
| P1A-02 | Create PO failure (invalid product / qty) | ActionErrorSummary on Create form; values preserved; no page-top mutation banner | ☐ |
| P1A-03 | Create while procurement frozen | ActionErrorSummary title **Purchase Order frozen**; no write | ☐ |
| P1A-04 | Forecast Create Draft success | Toast; busy label; silent refresh | ☐ |
| P1A-05 | Forecast Create Draft when Open PO exists | ActionErrorSummary **Purchase Order already exists** | ☐ |
| P1A-06 | Bulk Critical drafts | Busy **Creating Critical Purchase Orders...**; toast summary; ActionErrorSummary if all fail | ☐ |
| P1A-07 | Edit PO success | Toast; dialog closes; silent refresh | ☐ |
| P1A-08 | Edit PO failure | ActionErrorSummary **inside dialog**; dialog remains open; values preserved | ☐ |
| P1A-09 | Cancel PO success | Toast; PO status Cancelled | ☐ |
| P1A-10 | Cancel PO failure | ActionErrorSummary on History tab | ☐ |
| P1A-11 | Receive eligible PO | Busy **Receiving Purchase Order...**; toast; stock ↑; PURCHASE_IN in Movements | ☐ |
| P1A-12 | Receive ineligible / over-qty | ActionErrorSummary at Receive form; form values preserved | ☐ |
| P1A-13 | Double-click Create / Receive / Cancel | No duplicate submission (inflight / disabled) | ☐ |
| P1A-14 | Mutation error messages | No raw PostgreSQL / PGRST text as primary message | ☐ |
| P1A-15 | Regression | Forecast / Reorder / Smart / Create / Receive / History tabs still present; no Start Here | ☐ |

**Sign-off:** _________________ Date: _______
