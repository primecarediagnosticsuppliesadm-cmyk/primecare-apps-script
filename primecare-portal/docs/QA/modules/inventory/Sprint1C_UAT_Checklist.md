# Sprint 1C — Inventory Workspace Simplification Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1C |
| Module | Inventory |
| Environment | QA |
| Roles | Executive, Admin |

## Prerequisites

- [ ] Log in as Admin or Executive
- [ ] Inventory has selectable SKUs with Critical/Reorder/Healthy mix when possible

---

## P0 — First viewport budget

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Open Inventory → Stock | Header asks “What inventory work should I do now?” | ☐ PASS ☐ FAIL |
| A2 | Scan first viewport | Order: Header → Context strip → Start Here → Filters → List (valuation not open by default) | ☐ PASS ☐ FAIL |
| A3 | Confirm no stacked dashboards | KPI/valuation only under collapsed “Stock summary & valuation” | ☐ PASS ☐ FAIL |

## P0 — Selected SKU hierarchy

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Select a Critical SKU | Selected panel below list; Expected action + reason visible | ☐ PASS ☐ FAIL |
| B2 | Check operational fields | Current / Min / Reorder / Health expanded | ☐ PASS ☐ FAIL |
| B3 | Expand SKU details / Audit | Secondary metadata collapsed until opened | ☐ PASS ☐ FAIL |
| B4 | Use Receive Stock / Open Ledger / Catalog | Existing handoffs still work | ☐ PASS ☐ FAIL |

## P0 — Continuity & Sprint 1A

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Start Here → Purchase → Back to Inventory | Search/filters/selection restored (1B) | ☐ PASS ☐ FAIL |
| C2 | Catalog / Receive failure | Sprint 1A `ActionErrorSummary` still local | ☐ PASS ☐ FAIL |

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Admin / Executive tester | | | ☐ PASS ☐ FAIL |
| Engineering | | | ☐ PASS ☐ FAIL |
