# Sprint 1C — Purchase Workspace Simplification (Pre-Implementation)

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1C |
| Module | Purchase / Reorder |
| Date | 2026-07-12 |
| Gate | **ALLOWED** (UI/UX only) |
| Depends on | Sprint 1A + 1B (unchanged) |

## Defects addressed

| ID | Issue |
|----|-------|
| PUR-CERT-009 | Overlapping buy queues without hierarchy |
| PUR-CERT-007 | Suppliers dead / dishonest surface |

---

## 1. Feature Inventory

| Feature | Disposition | Notes |
|---------|-------------|-------|
| Start Here / Context Strip / Selection / Return | **KEEP** | Sprint 1B intact |
| Create / Receive / History / Forecast / Reorder / Smart | **KEEP** | Same tabs & writes |
| Mutation Action Pattern | **KEEP** | Sprint 1A intact |
| Workspace groups (3 peer sections) | **MERGE →** single Purchase Queue hierarchy | Visual only |
| Forecast KPI strip | **COLLAPSE** | Secondary details |
| Purchase summary KPIs | **COLLAPSE** | Already secondary; keep once |
| ActiveStepSummary + workflow guide | **MERGE** | Into queue purpose line |
| Suppliers fake dashboard | **REMOVE** (visual) | Honesty copy; no invented controls |
| Smart + Reorder peer tabs | **MERGE** | Under Forecast Drafts presentation |

---

## 2. Current Page Budget (before)

| Surface | Count / note |
|---------|----------------|
| Header | 1 |
| Start Here | 1 |
| Context Strip | 1 |
| Workspace groups | 3 sections × many tabs |
| Queue/tab bodies | 7 |
| KPI cards (header summary) | 4 (collapsed) |
| Forecast attention KPIs | up to 5 |
| Smart summary KPIs | up to 4 |
| Supplier KPI cards | 4 (empty) |
| Selected PO panel | 1 |
| Charts | 0 |

---

## 3. KEEP / MOVE / MERGE / COLLAPSE / REMOVE

| Item | Action |
|------|--------|
| Purchase Queue content | KEEP |
| Receive / History / Create / Forecast drafts / Critical | KEEP |
| Context Strip / Start Here / Selection | KEEP |
| KPI / portfolio / technical metadata | COLLAPSE |
| Replenishment + Receiving + Admin groups | MERGE → one queue hierarchy |
| Reorder + Smart peer chrome | MERGE under Forecast Drafts |
| Supplier interactive empty UI | REMOVE (visual honesty) |
| Workflow guide + step summary | MERGE into queue header |

**Remove = visual only. No capability removal.**

---

## 4–7. Parity / Files / Verify / UAT

See companion Sprint 1C docs after implementation.

**Not touched:** APIs, schema, PURCHASE_IN, Sprint 1A/1B return context, reorder math.
