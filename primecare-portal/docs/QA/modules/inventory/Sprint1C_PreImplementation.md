# Sprint 1C — Inventory Workspace Simplification (Pre-Implementation)

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1C |
| Module | Inventory — presentation simplification |
| Date | 2026-07-12 |
| Gate | **ALLOWED** (UI/UX only) |
| Depends on | Sprint 1A + 1B (do not change semantics) |

**Constraint:** Do **not** split Inventory into persona/module workspaces. Simplify presentation only.

---

## 1. Feature Inventory

| Feature | Surface today | Classification |
|---------|---------------|----------------|
| Page header + Stock/Movements/Health tabs | `PageHeader` | **KEEP** (copy → operational question) |
| Context strip | `InventoryContextStrip` | **KEEP** |
| Start Here | `InventoryStartHere` | **KEEP** |
| Search / tenant / health / sort | Filter row | **KEEP** |
| Inventory list + selection | Table/cards | **KEEP** |
| Selected SKU panel | Above list | **KEEP** + **RELOCATE** below list |
| Expected action on SKU | Missing | **KEEP** (add presentation only) |
| Stock KPI cards (4) | Collapsed summary | **COLLAPSE** / **MOVE** below fold |
| Valuation analytics | Same summary | **MOVE** below fold |
| Portfolio note | Mid-page | **COLLAPSE** into secondary |
| Movements / Health tabs | Header | **KEEP** (ledger access) |
| Sprint 1A catalog/receive errors | Catalog / Purchase | **KEEP** unchanged |
| Sprint 1B return context | Session | **KEEP** unchanged |

---

## 2. Current Page Budget (Stock tab)

| Type | Count |
|------|-------|
| Headers | 1 page + tab cluster |
| KPI cards | 4 (inside details) |
| Workflow strips | Context + Start Here |
| Filters | 3 selects + search |
| Tables | 1 (+ mobile cards) |
| Secondary panels | Selected SKU, portfolio note, valuation |
| Charts | Valuation panels (secondary) |
| Expandable sections | 1 (summary) |

**First viewport problem:** Selected SKU and summary still compete with list order; detail hierarchy is flat.

---

## 3. KEEP / MOVE / MERGE / COLLAPSE / REMOVE

| Item | Decision | Notes |
|------|----------|-------|
| Start Here / strip / list / filters | **KEEP** | First viewport |
| Selected SKU | **RELOCATE** | After list |
| Expected action | **KEEP** (new copy only) | From existing `stockHealth` |
| KPI + valuation | **MOVE** | Bottom collapsed “Stock summary & valuation” |
| Portfolio note | **COLLAPSE** | Inside summary |
| Tenant UUID / rare metadata | **COLLAPSE** | Selected SKU expandable details |
| Ledger / Purchase / Catalog handoffs | **KEEP** | Operational CTAs expanded; history under details |
| Features | **REMOVE** | None — visual hierarchy only |

---

## 4–7. Parity / Files / Verify / UAT

See companion Sprint 1C docs after implementation.

## Impact analysis

| Area | Impact |
|------|--------|
| Modules | Inventory presentation only |
| Tables / APIs / RLS | None |
| Sprint 1A–1B semantics | Unchanged |
| Implementation gate | **ALLOWED** |
