# Sprint 1A — Inventory Action Feedback Browser UAT Checklist

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1A |
| Module | Master Catalog + Purchase Receive |
| Environment | QA |
| Roles | Executive, Admin |

## Prerequisites

- [ ] Log in as Admin or Executive
- [ ] Supabase configured
- [ ] Catalog / procurement freeze off for happy-path writes
- [ ] At least one receivable purchase order (Ordered / Partially Received)

---

## P0 — Create SKU

| # | Step | Expected | Result |
|---|------|----------|--------|
| A1 | Master Catalog → Add Product | Modal opens | ☐ PASS ☐ FAIL |
| A2 | Submit valid SKU with opening stock > 0 | Button shows **Saving Opening Stock…**; `aria-busy`; fields disabled | ☐ PASS ☐ FAIL |
| A3 | Wait for success | Toast; modal closes; search/sort preserved; SKU appears | ☐ PASS ☐ FAIL |
| A4 | Retry duplicate SKU | Modal stays open; `ActionErrorSummary` **SKU already exists**; values preserved | ☐ PASS ☐ FAIL |

## P0 — Enable / Disable SKU

| # | Step | Expected | Result |
|---|------|----------|--------|
| B1 | Disable an active SKU | Button shows **Disabling SKU…**; toast on success; search preserved | ☐ PASS ☐ FAIL |
| B2 | Enable an inactive SKU | Button shows **Enabling SKU…**; toast on success | ☐ PASS ☐ FAIL |
| B3 | Force a failure if possible | `ActionErrorSummary` near table actions — not confused with load error | ☐ PASS ☐ FAIL |

## P0 — Receive Stock

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Purchase → Receive → select eligible PO | Form prefills | ☐ PASS ☐ FAIL |
| C2 | Submit receive | Button shows **Receiving Stock…**; `aria-busy` | ☐ PASS ☐ FAIL |
| C3 | Success | Toast; form clears; PO list refresh; tab/search filters preserved | ☐ PASS ☐ FAIL |
| C4 | Receive already-received / invalid qty | Form stays filled; inline `ActionErrorSummary` (not page-top red banner for this failure) | ☐ PASS ☐ FAIL |
| C5 | Double-click Receive | Only one write; button stays disabled until complete | ☐ PASS ☐ FAIL |

## P1 — Freeze / permissions

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | Catalog freeze on | Add/Edit/Enable/Disable disabled + freeze banner | ☐ PASS ☐ FAIL |
| D2 | Procurement freeze on | Receive disabled + freeze banner | ☐ PASS ☐ FAIL |

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Admin / Executive tester | | | ☐ PASS ☐ FAIL |
| Engineering | | | ☐ PASS ☐ FAIL |
