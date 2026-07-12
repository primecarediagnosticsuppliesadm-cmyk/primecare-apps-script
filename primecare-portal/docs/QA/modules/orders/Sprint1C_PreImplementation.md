# Sprint 1C — HQ Orders Workspace Simplification (Pre-Implementation)

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1C |
| Module | HQ Orders — presentation simplification |
| Date | 2026-07-11 |
| Gate | **ALLOWED** (UI/UX only) |
| Depends on | Sprint 1A + 1B (do not change semantics) |

**Constraint:** Do **not** split the module into persona workspaces. Simplify presentation only.

---

## 1. Feature Inventory

| Feature | Surface today | Classification |
|---------|---------------|----------------|
| Page header | `PageHeader` | **KEEP** (copy → operational question) |
| Context strip | `OrdersContextStrip` | **KEEP** |
| Focus / restore warnings | Amber banners | **KEEP** |
| Freeze banner | Full-width when frozen | **KEEP** (conditional) |
| Read error | `DataFetchError` | **KEEP** |
| Success banner | Legacy emerald (toast is primary) | **COLLAPSE** rare |
| KPI portfolio (7 cards) | First viewport | **COLLAPSE** → secondary `<details>` |
| Start Here | `HqOrdersOperationsQueue` | **KEEP** |
| Queue buckets (4) | Same component | **KEEP** |
| Search / filters / sort | Inside list card | **KEEP** (clarify hierarchy) |
| Order list table/cards | Left column | **KEEP** |
| Order details panel | Right column | **KEEP** |
| Status Actions + Sprint 1A errors | Detail panel (low) | **KEEP** + **MOVE** up (operational-first) |
| Items / invoice / payment / logistics | Detail | **KEEP** expanded |
| Order summary contact/phone | Detail | **COLLAPSE** |
| Activity / notes / timestamps | Detail | **COLLAPSE** |
| Empty-detail mini KPI grid | `OrdersDetailEmptyState` | **MERGE/COLLAPSE** into suggestions |
| Invoice drawer | Modal | **KEEP** |
| Queue calculations | `buildOrdersOperationsQueue` | **KEEP** (untouched) |

---

## 2. Current Page Budget

| Type | Count (approx.) |
|------|-----------------|
| Headers | 1 page + 2 card titles |
| KPI cards | 7 (+ 5 in empty-detail mini grid) |
| Workflow strips | Context + Start Here + freeze |
| Filters | Search + sort + 3 selects + date range |
| Tables | List + line items |
| Secondary panels | Invoice/payment, logistics, cancelled banner |
| Charts | 0 |
| Expandable sections | 0 (before Sprint 1C) |

**First viewport problem:** KPI strip competes with Start Here for “what needs attention?”

---

## 3. KEEP / MOVE / MERGE / REMOVE

| Item | Decision | Notes |
|------|----------|-------|
| KPI portfolio | **COLLAPSE** | Same metrics under “Order portfolio summary” |
| Empty-detail KPI tiles | **MERGE** | Drop duplicate tiles; keep suggested actions |
| Status Actions | **RELOCATE** | Immediately under selected-order header |
| Contact / phone / audit timestamps | **COLLAPSE** | `<details>` secondary |
| Activity / notes | **COLLAPSE** | Expand when needed |
| Analytics / reports | N/A | None on page |
| Features | **REMOVE** | None — no capability removal |

---

## 4–7. Parity / Files / Verify / UAT

See companion Sprint 1C docs after implementation.

## Impact analysis

| Area | Impact |
|------|--------|
| Modules | Orders presentation only |
| Tables / APIs / RLS / routing | None |
| Queue math / Sprint 1A–1B semantics | Unchanged |
| Implementation gate | **ALLOWED** |
