# Purchase Certification Closure — Consolidated Browser UAT

| Field | Value |
|-------|-------|
| Module | Purchase / Reorder |
| Environment | QA |
| Roles | Admin, Executive |
| Gate | PUR-CERT-005 |

Execute Sprint checklists first, then Closure-specific rows. Sign `Certification_Signoff_Template.md` when complete.

---

## Sprint packs (execute in full)

| Pack | Path | Result |
|------|------|--------|
| Sprint 1A | `Sprint1A_UAT_Checklist.md` | ☐ PASS ☐ FAIL |
| Sprint 1B | `Sprint1B_UAT_Checklist.md` | ☐ PASS ☐ FAIL |
| Sprint 1C | `Sprint1C_UAT_Checklist.md` | ☐ PASS ☐ FAIL |

---

## P0 — Workspace & queue (Gold boundary)

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Open Purchase | Primary question “What purchasing work should I do now?”; Context Strip; Start Here; Purchase Queue | ☐ PASS ☐ FAIL |
| C2 | Queue order | Critical Reorders → Forecast Drafts → Pending Receipts → Purchase History | ☐ PASS ☐ FAIL |
| C3 | Pending Receipts → receive | Same receive workflow; ActionErrorSummary on failure (Sprint 1A) | ☐ PASS ☐ FAIL |
| C4 | History select PO | Selected panel + expected action; aria-selected | ☐ PASS ☐ FAIL |
| C5 | Suppliers | Honesty copy only; no fake KPI dashboard | ☐ PASS ☐ FAIL |

## P0 — Trust & navigation regression

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | Create / Edit / Cancel / Bulk failure | ActionErrorSummary at action site; no raw Postgres as primary | ☐ PASS ☐ FAIL |
| D2 | Start Here routes | Create / Receive / Critical / Blocked still route correctly | ☐ PASS ☐ FAIL |
| D3 | Leave to Inventory/Orders | Back to Purchase restores context | ☐ PASS ☐ FAIL |

## P0 — Boundary honesty

| # | Step | Expected | Result |
|---|------|----------|--------|
| E1 | Confirm | No Approvals inbox invented | ☐ PASS ☐ FAIL |
| E2 | Confirm | No Supplier Master CRUD | ☐ PASS ☐ FAIL |
| E3 | Confirm | No explainability Constitution cards required for this Gold | ☐ PASS ☐ FAIL |

## Sign-off

Complete `Certification_Signoff_Template.md` after all rows PASS.
