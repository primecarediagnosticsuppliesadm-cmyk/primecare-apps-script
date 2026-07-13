# Inventory Certification Closure — Consolidated Browser UAT

| Field | Value |
|-------|-------|
| Module | Inventory |
| Environment | QA |
| Roles | Admin, Executive |
| Gate | INV-CERT-005 |

Execute Sprint checklists first, then Closure-specific rows.

---

## Sprint packs (execute in full)

| Pack | Path | Result |
|------|------|--------|
| Sprint 1A | `Sprint1A_UAT_Checklist.md` | ☐ PASS ☐ FAIL |
| Sprint 1B | `Sprint1B_UAT_Checklist.md` | ☐ PASS ☐ FAIL |
| Sprint 1C | `Sprint1C_UAT_Checklist.md` | ☐ PASS ☐ FAIL |

---

## P0 — INV-CERT-007 Adjustment label honesty

| # | Step | Expected | Result |
|---|------|----------|--------|
| C1 | Inventory → Movements | Non-opening `IN` rows labeled **Historical Inventory Movement** (not “Adjustment” as an action) | ☐ PASS ☐ FAIL |
| C2 | Opening stock rows | Still labeled **Opening Stock** | ☐ PASS ☐ FAIL |
| C3 | Confirm | No Adjust Stock button or workflow appeared | ☐ PASS ☐ FAIL |

## P0 — INV-CERT-001 Purchase visual framing

| # | Step | Expected | Result |
|---|------|----------|--------|
| D1 | Open Purchase | See groups: Replenishment · Receiving · Purchase administration | ☐ PASS ☐ FAIL |
| D2 | Switch tabs within a group | Same write workflows; no route/API change | ☐ PASS ☐ FAIL |
| D3 | Back to Inventory (if arrived from Inventory) | Return restore still works (Sprint 1B) | ☐ PASS ☐ FAIL |

## P0 — Discoverability regression

| # | Step | Expected | Result |
|---|------|----------|--------|
| E1 | Inventory first viewport | Start Here + operational list; valuation collapsed | ☐ PASS ☐ FAIL |
| E2 | Catalog / Receive failure | Sprint 1A `ActionErrorSummary` still local | ☐ PASS ☐ FAIL |

## Sign-off

Complete `Certification_Signoff_Template.md` after all rows PASS.
