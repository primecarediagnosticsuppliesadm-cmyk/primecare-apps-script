# Sprint 1C — Collections Workspace Separation Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1C |
| Module | Collections — workspace separation |
| Environment | QA |

## Prerequisites

- [ ] Agent, Admin/Executive, Lab, and Auditor accounts available
- [ ] Collections data present for agent + HQ views

---

## P0 — Agent workspace

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Log in as Agent → Collections | Workspace header shows collection work queue + primary question | ☐ PASS ☐ FAIL |
| A2 | Verify sections | Summary KPIs, search, and accounts-due queue are visually separated | ☐ PASS ☐ FAIL |
| A3 | Record payment | Drawer still opens; payment still records | ☐ PASS ☐ FAIL |

## P0 — HQ Credit & Risk workspace

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Log in as Admin/Executive → Credit & Risk | Workspace frames command center with credit-intervention question | ☐ PASS ☐ FAIL |
| B2 | Filter labs + record payment | Search + command center + drawer unchanged functionally | ☐ PASS ☐ FAIL |

## P0 — HQ Receivables workspace

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Log in as read_only_auditor → Collections | Receivables workspace with portfolio question | ☐ PASS ☐ FAIL |
| C2 | Expand lab row | Payment panel still in expandable row | ☐ PASS ☐ FAIL |

## P0 — Lab account workspace

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | Log in as Lab → Payments & Account | Lab account workspace with health question | ☐ PASS ☐ FAIL |
| D2 | View timeline / invoices | Account timeline and invoice actions still work | ☐ PASS ☐ FAIL |

## P1 — Regression

| # | Step | Expected | Result |
|---|------|----------|--------|
| E1 | Agent Sprint 1B behaviors | Search debounce, selection highlight, refresh toast | ☐ PASS ☐ FAIL |
| E2 | Sprint 1A payment errors | Drawer inline errors on failure | ☐ PASS ☐ FAIL |
| E3 | Distributor OS collections tab | Scoped credit workspace still loads | ☐ PASS ☐ FAIL |

## Sign-off

| Tester | Role | Date | Verdict |
|--------|------|------|---------|
| | QA | | ☐ GO ☐ NO-GO |
