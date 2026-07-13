# Sprint 1C — Purchase Workspace Simplification (Functional Parity Report)

| Field | Value |
|-------|-------|
| Date | 2026-07-12 |
| Gate | UI/UX only — **parity preserved** |

## Confirmation

| Check | Result |
|-------|--------|
| No feature removal | **PASS** — Create / Receive / History / Forecast / Critical / Smart / Edit / Cancel / Bulk remain |
| No permission / RLS changes | **PASS** |
| No PURCHASE_IN / ledger / ORDER_OUT changes | **PASS** |
| No reorder calculation / receiving eligibility changes | **PASS** |
| No Sprint 1A mutation pattern changes | **PASS** — ActionErrorSummary, mapper, inflight unchanged |
| No Sprint 1B return / Start Here / strip changes | **PASS** — return key, strip, Start Here retained |
| No schema / API / RPC changes | **PASS** |
| No Approvals / supplier master / explainability invented | **PASS** |

## Presentation changes (visual only)

| Surface | Disposition |
|---------|-------------|
| Peer Replenishment / Receiving / Admin groups | **MERGE** → single Purchase Queue hierarchy |
| Reorder + Smart peer chrome | **MERGE** under Forecast Drafts sub-nav |
| Forecast / Smart / portfolio KPIs | **COLLAPSE** |
| Advanced PO / audit details | **COLLAPSE** |
| Suppliers fake KPI dashboard | **REMOVE** (visual) → honesty copy |
| Expected action on selected PO | **ADD** (copy only; existing status/qty) |

## Certification impact

| ID | Impact |
|----|--------|
| **PUR-CERT-009** | **Addressed** — Critical → Forecast Drafts → Pending Receipts → History |
| **PUR-CERT-007** | **Addressed** — Suppliers honesty surface; no empty interactive controls |
| PUR-CERT-006 | Partial (page budget / discoverability) |
| PUR-CERT-005 / 012 | Unchanged — Certification Closure |
| PUR-CERT-015 / 001 | Unchanged — Future / RC2 |

## Known blocker (unchanged)

`verify-procurement-inventory-flow.mjs` fails under plain Node due to `@/` imports — documented; not fixed in Sprint 1C.
