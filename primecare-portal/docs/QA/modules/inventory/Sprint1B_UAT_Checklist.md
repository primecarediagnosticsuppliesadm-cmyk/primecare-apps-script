# Sprint 1B — Inventory Context Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1B |
| Module | Inventory |
| Environment | QA |
| Roles | Executive, Admin |

## Prerequisites

- [ ] Log in as Admin or Executive
- [ ] Inventory has mixed Critical / Reorder / Healthy SKUs when possible
- [ ] At least one receivable PO for Receive handoff

---

## P0 — Start Here

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Open Inventory | Header asks what work needs attention; Start Here visible before summary | ☐ PASS ☐ FAIL |
| A2 | Critical SKUs exist | Start Here / secondary includes **Review Critical Stock** | ☐ PASS ☐ FAIL |
| A3 | Click Review Critical Stock | List filters to Critical; strip shows Filter: Critical | ☐ PASS ☐ FAIL |
| A4 | Click Receive Purchase Order | Purchase opens on Receive; **Back to Inventory** visible | ☐ PASS ☐ FAIL |
| A5 | Click Create Purchase Order | Purchase opens on Create; Back to Inventory works | ☐ PASS ☐ FAIL |
| A6 | Empty inventory | Start Here offers **Set Opening Stock** → Master Catalog | ☐ PASS ☐ FAIL |

## P0 — Context strip & selection

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Select a SKU | Row `aria-selected`; Selected SKU panel shows ID/category/stock | ☐ PASS ☐ FAIL |
| B2 | Search so selected SKU disappears | Focused SKU outside filters message; Clear Filters / Return to Inventory — filters not silently cleared | ☐ PASS ☐ FAIL |
| B3 | Clear Filters | SKU visible again; selection retained | ☐ PASS ☐ FAIL |

## P0 — Return continuity

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | From Inventory Start Here → Purchase | Set search/filter/selection first | ☐ PASS ☐ FAIL |
| C2 | Click Back to Inventory | Search, filters, selection restored | ☐ PASS ☐ FAIL |
| C3 | Repeat via Master Catalog | Same restore behavior | ☐ PASS ☐ FAIL |

## P0 — Empty states

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | Search with no matches | “No inventory matches search” + Clear Search | ☐ PASS ☐ FAIL |
| D2 | Critical filter with none | “No critical stock” + Clear Critical Filter | ☐ PASS ☐ FAIL |

## P1 — Page budget / Sprint 1A

| # | Step | Expected | Result |
|---|------|----------|--------|
| E1 | First viewport | Header, strip, Start Here, filters, list, selected SKU — summary collapsed | ☐ PASS ☐ FAIL |
| E2 | Catalog/Receive failure | Sprint 1A `ActionErrorSummary` still local | ☐ PASS ☐ FAIL |

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Admin / Executive tester | | | ☐ PASS ☐ FAIL |
| Engineering | | | ☐ PASS ☐ FAIL |
