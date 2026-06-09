# PrimeCare HQ Finalization Report

**Date:** 2026-05-28  
**Role:** Principal Architect + QA Lead  
**Scope:** HQ platform modules only — **excludes** Distributor OS, Doctor OS, Patient App, NABL OS, Insurance, and roadmap modules  
**Branch:** `qa` (commit `f28ca92` + prior hardening)

---

## A. HQ Module Matrix

| # | Module | Purpose | Data sources | Implementation | Missing | Broken calcs | RLS risks | Integrity risks | QA readiness | Score |
|---|--------|---------|--------------|----------------|---------|--------------|-----------|-----------------|--------------|-------|
| 1 | **Executive Dashboard** | HQ command view: KPIs, interventions, tasks, intelligence | `orders`, `payments`, `ar_credit_control`, `inventory`, `labs`, `agent_visits`, `purchase_orders`, `v_stock_dashboard`, `v_reorder_candidates` via `loadOperationsCommandCenterData()` + `getAdminDashboardRead()` | `ExecutiveControlTower.jsx` (exec), `AdminDashboard.jsx` (admin), ops models | Durable intervention/task store; real-time refresh after writes | Hybrid Apps Script merge can zero Supabase KPIs; 45s ops cache stale | Orders count RLS vs API mismatch (Predator flagged) | Client-side intervention state lost on refresh | Partial — Admin Dashboard validator only | **72%** |
| 2 | **Operations Center** | Unified attention queue, lab health, operational feed | Same ops loader bundle; `operationsCommandCenterModel.js` | `OperationsCommandCenter.jsx` — functional | Direct Orders/Collections nav for exec without sidebar entries | Silent empty on qual/reorder load failure | Inherits all table RLS gaps | 45s cache; qual/reorder errors swallowed | Ops Center validator + batch | **74%** |
| 3 | **Master Catalog** | HQ-owned product list with pricing for distributor assignment | `v_lab_catalog` (preferred), fallback `inventory`; `masterCatalogData.js` | `MasterCatalogPage.jsx` — **read-only** table | No HQ edit UI; no pricing maintenance workflow in portal | Margin display depends on configured cost/transfer fields | `products`/`inventory` RLS (catalog migration) | View missing → degraded fallback | **No Predator validator**; not in QA coverage | **66%** |
| 4 | **Inventory** | Stock levels, ledger, health economics | `v_stock_dashboard`, `inventory`, `inventory_ledger`; `inventoryEconomicsEngine.js` | `StockPage.jsx`, `InventoryLedgerPage.jsx`, `InventoryHealthPage.jsx` | No direct stock adjustment UI; writes via PO receive / order fulfill | Economics bundle separate from stock tab loads | View inherits base table RLS | Debug `console.log` in prod path | Inventory Economics validator only (not Stock page) | **70%** |
| 5 | **Purchase Orders** | Procurement: forecast → draft PO → receive → inventory | `v_reorder_candidates`, `purchase_orders`, `purchase_order_items`; Apps Script fallback | `PurchaseOrdersPage.jsx`, `ReorderForecastPage.jsx` | Real auto-trigger engine; `hasOpenPo` hardcoded false | Placeholder triggers from forecast only | `purchase_orders.tenant_id` text legacy; migration apply required | Receive updates inventory outside DB transaction | Indirect via Admin Dashboard + Ops Center | **64%** |
| 6 | **Orders** | HQ order list, status updates, fulfillment side effects | `orders`, `order_lines`/`order_items`, `labs`; fulfillment touches `inventory`, `ar_credit_control` | `OrdersPage.jsx` — functional for HQ tenant | Not in Executive/Admin sidebar; unfiltered read | `getOrdersRead` returns `success: true` with `[]` on error | `executive_distributor_ops_rls_migration.sql` must be applied | Status column retries mask schema drift | PrimeCare OS isolation only; no Orders validator | **68%** |
| 7 | **Collections / AR** | Receivables, payment recording, collection workflow | `ar_credit_control`, `payments`, `v_labs_credit`, `labs` | `CollectionsPage.jsx` (~1900 lines) — core workflow works | Statement download, support contact, task completion — placeholders | Receivable metrics correct when data loads | Payment + AR update not atomic in DB | Agent scoping needs `agent_id` backfill | `collectionsValidator.js` — strong layer checks | **73%** |
| 8 | **Revenue Funnel** | Portfolio commercial path: qual → contract → order → pay | `revenueFunnelEngine.js` via `loadFounderFinancialIntelligenceData()` | `RevenueFunnelPage.jsx` — functional | Per-lab inventory gate (distributor-wide stock) | Portfolio "Orders" = row count vs stage "Ordered" = lab count; Paid column = lab count | Indirect — all underlying tables | `pathComplete` requires payments > 0 not AR alone | `revenueFunnelValidator.js`; **not in QA_COVERAGE_AREAS** | **71%** |
| 9 | **Pilot Readiness** | 9-gate distributor pilot scorecard | `pilotReadinessEngine.js` + FI data + Predator store + QA defects | `PilotReadinessPage.jsx` — functional | Historical trend tracking | Portfolio ops/quality gates duplicated; collections recovery % shared | Composite — propagates underlying RLS gaps | Predator reports in-memory only | `pilotReadinessValidator.js` | **69%** |
| 10 | **Predator** | RLS/API/UI validation layer for QA sign-off | Validators read Supabase directly; ops payload priming | `PredatorDebugConsole.jsx`, `runPredatorValidation.js`, 30+ validators | Dedicated validators for Master Catalog, PO, Orders page | N/A (detector, not calculator) | Primary detection surface for RLS issues | Reports lost on refresh; off in prod without flag | Core QA infrastructure | **76%** |
| 11 | **QA Command Center** | Release readiness score from Predator + defects | `predatorStore`, `qaDefectRegistry.js` (local) | `QACommandCenterPage.jsx` — functional | Team-visible defect DB; Revenue Funnel / Master Catalog coverage | Coverage % can show false green if modules not visited | Depends on Predator auth context | Defect registry client-local only | `qaReadinessValidator.js`; executive-only | **67%** |

**Weighted HQ readiness (11 modules): 71%** — below 85% QA sign-off threshold.

---

## B. Critical Blockers (P0)

| ID | Module | Blocker | Impact | Remediation |
|----|--------|---------|--------|-------------|
| P0-01 | All data modules | **RLS migrations not confirmed applied** in staging/prod (`production_auth_rls_pilot_migration.sql`, `executive_distributor_ops_rls_migration.sql`, `executive_distributor_catalog_inventory_rls.sql`) | Silent empty data, security exposure if anon policies remain | Apply migrations; run anon policy audit (expect 0 rows) |
| P0-02 | Orders | **`getOrdersRead` masks errors as empty success** (`primecareSupabaseApi.js:4203`) | False-green UI — dashboard shows 0 orders when RLS/query fails | Return `success: false` on error; surface error in UI |
| P0-03 | Executive Dashboard | **Hybrid Admin Dashboard Apps Script merge** can overwrite Supabase KPIs with zeros | Executive sees incorrect metrics post-migration | Disable Apps Script merge when Supabase configured; QA verify KPI source |
| P0-04 | Predator | **Predator disabled in production** unless `VITE_PREDATOR_DEBUG=true` | QA cannot validate RLS in prod-like env without explicit flag | Enable in staging; document prod flag for sign-off runs only |
| P0-05 | QA Command Center | **Defect registry is client-local** (`qaDefectRegistry.js`) | Defects not shared across testers; lost on browser clear | Export defect snapshot before handoff; or accept local-only for pilot |
| P0-06 | Collections / AR | **Payment + AR writes not DB-transactional** | Partial failure → payments recorded but AR not updated (or reverse) | QA test failure paths; document rollback procedure |
| P0-07 | Purchase Orders | **Placeholder auto-triggers** (`buildPlaceholderAutoTriggersFromForecast`) | Misleading procurement signals | Label UI as "forecast suggestions"; do not present as live triggers |
| P0-08 | Orders + Collections | **Not in Executive/Admin HQ sidebar** but permission allows route access | Testers cannot find Orders/Collections without direct URL | Add `orders` to `ADMIN_HQ_MENU_KEYS`; add `risk` (Credit & Risk) to both HQ menus OR document URL paths in test plan |

---

## C. Important Issues (P1)

| ID | Module | Issue |
|----|--------|-------|
| P1-01 | Operations Center | 45s ops payload cache (`OPS_CACHE_MS`) — stale attention queue after writes |
| P1-02 | Operations Center | `getQualificationReviewRead()` / `getReorderForecastRead()` failures silently caught → empty arrays |
| P1-03 | Master Catalog | Read-only — no in-portal pricing edit; gaps only visible via Distributor Provisioning Predator |
| P1-04 | Master Catalog | No dedicated Predator validator |
| P1-05 | Inventory | `console.log("SUPABASE STOCK:")` and debug logs in production paths |
| P1-06 | Inventory | Stock / Health / Ledger tabs load independently — no coordinated refresh |
| P1-07 | Purchase Orders | Apps Script write fallback when `ALLOW_LEGACY_APPS_SCRIPT` — partial migration risk |
| P1-08 | Purchase Orders | `purchase_orders.tenant_id` may be text — requires text overload in ops RLS migration |
| P1-09 | Orders | Client-side tenant filter second line after RLS — HQ rows could leak if RLS misconfigured |
| P1-10 | Orders | Debug `console.log` for raw Supabase orders in API layer |
| P1-11 | Collections | Placeholders: statement download, contact support, task completion, online payments |
| P1-12 | Collections | Executive role lacks `collections` permission — AR only via Ops Center / Dashboard |
| P1-13 | Revenue Funnel | Metric label collisions (Orders vs Ordered, Paid column semantics) |
| P1-14 | Revenue Funnel | Not listed in `QA_COVERAGE_AREAS` — QA Command Center may show incomplete coverage |
| P1-15 | Pilot Readiness | `trendPlaceholder` — historical trend not implemented |
| P1-16 | Pilot Readiness | Operations + Quality gates portfolio-level on every distributor row |
| P1-17 | Pilot Readiness | Depends on in-memory Predator reports — must run Predator before meaningful score |
| P1-18 | Predator | No validators for Master Catalog, Purchase Orders, Orders (beyond PrimeCare OS isolation) |
| P1-19 | Predator | Module reports lost on page refresh |
| P1-20 | QA Command Center | `QA_COVERAGE_AREAS` includes Distributor OS modules — skews HQ-only assessment |
| P1-21 | Executive Dashboard | Intervention/tasks/event ledger stored client-side — not durable |
| P1-22 | Admin Dashboard | Predator `orders_count` layer mismatch class — RLS vs API vs UI divergence |

---

## D. Nice-to-have (P2)

| ID | Module | Issue |
|----|--------|-------|
| P2-01 | Executive Dashboard | Real-time KPI refresh without 45s cache |
| P2-02 | Master Catalog | Export CSV from read-only view |
| P2-03 | Inventory | Unified tab refresh after PO receive or order fulfill |
| P2-04 | Purchase Orders | Bulk draft PO from forecast (Supabase-native) |
| P2-05 | Orders | Server-side status filter instead of client-only |
| P2-06 | Collections | Online payment integration (currently "coming soon") |
| P2-07 | Revenue Funnel | Rename columns for semantic clarity |
| P2-08 | Pilot Readiness | Per-distributor operations gate instead of portfolio shared |
| P2-09 | Predator | Persistent report storage (Supabase or export) |
| P2-10 | QA Command Center | HQ-only coverage map separate from full platform map |
| P2-11 | All | Remove debug `console.log` statements from API layer |
| P2-12 | Operations Center | Invalidate ops cache on write operations |

---

## E. Exact Remediation Plan

### Phase 0 — Infrastructure (Day 0, blocking)

| Step | Action | Owner | Verify |
|------|--------|-------|--------|
| 0.1 | Apply `production_auth_rls_pilot_migration.sql` | DevOps | Anon policy audit = 0 rows |
| 0.2 | Apply `executive_distributor_catalog_inventory_rls.sql` | DevOps | Executive reads HQ `products`/`inventory` |
| 0.3 | Apply `executive_distributor_ops_rls_migration.sql` | DevOps | Executive reads HQ `orders`/`payments`/`ar_credit_control` |
| 0.4 | Confirm `VITE_SUPABASE_URL` + anon key in staging build | DevOps | Login + any Supabase read succeeds |
| 0.5 | Set `VITE_PREDATOR_DEBUG=true` in staging | DevOps | Predator Debug menu visible |

### Phase 1 — P0 code fixes (Day 1, no new features)

| Step | Action | File | Acceptance |
|------|--------|------|------------|
| 1.1 | Return `success: false` when `getOrdersRead` errors | `primecareSupabaseApi.js` | Orders page shows error banner, not empty list |
| 1.2 | Surface orders read error in `OrdersPage.jsx` | `OrdersPage.jsx` | Error state visible to tester |
| 1.3 | Label PO auto-triggers as "Forecast suggestions" | `PurchaseOrdersPage.jsx` | UI does not imply live automation |
| 1.4 | Add `orders` to `ADMIN_HQ_MENU_KEYS` | `menuConfig.js` | Admin sidebar shows Orders |
| 1.5 | Add `risk` to `EXECUTIVE_HQ_MENU_KEYS` and `ADMIN_HQ_MENU_KEYS` | `menuConfig.js` | Credit & Risk visible in sidebar |
| 1.6 | Disable Apps Script KPI merge when Supabase configured | `adminDashboardState.js` / merge path | Dashboard KPIs match Supabase ground truth |

### Phase 2 — QA execution (Day 1–3)

| Step | Action | Reference |
|------|--------|-----------|
| 2.1 | Execute HQ Launch Checklist (below) | `HQ_LAUNCH_CHECKLIST.md` |
| 2.2 | Run P0 tests from `HQ_QA_TEST_PLAN.md` | 40 cases |
| 2.3 | Visit each module → run Predator batch | QA Command Center |
| 2.4 | Record defects in QA Command Center + export snapshot | Before handoff |
| 2.5 | Verify Pilot Readiness ≥ 75 CONDITIONAL for HQ tenant | `PilotReadinessPage` |

### Phase 3 — Sign-off criteria (Day 3)

| Gate | Threshold |
|------|-----------|
| P0 blockers | 0 open |
| P0 QA tests | 40/40 PASS |
| Predator batch (HQ modules) | PASS or WARN-only (no FAIL) |
| HQ weighted readiness | ≥ 85% |
| RLS migrations | Confirmed applied |

### Phase 4 — Deferred (post-pilot, P1/P2 backlog)

- Remove debug console.log from API layer
- Add HQ-only `QA_COVERAGE_AREAS` filter in QA Command Center
- Ops cache invalidation on writes
- Revenue Funnel column renames (documentation)
- Collections placeholder removal or permanent "N/A" labels

---

## Module File Index

| Module | Primary files |
|--------|---------------|
| Executive Dashboard | `ExecutiveControlTower.jsx`, `AdminDashboard.jsx`, `operationsCommandCenterLoader.js` |
| Operations Center | `OperationsCommandCenter.jsx`, `operationsCommandCenterModel.js` |
| Master Catalog | `MasterCatalogPage.jsx`, `masterCatalogData.js`, `masterCatalogEngine.js` |
| Inventory | `StockPage.jsx`, `InventoryLedgerPage.jsx`, `InventoryHealthPage.jsx`, `inventoryEconomicsEngine.js` |
| Purchase Orders | `PurchaseOrdersPage.jsx`, `ReorderForecastPage.jsx` |
| Orders | `OrdersPage.jsx`, `getOrdersRead`, `updateOrderStatusWrite` |
| Collections / AR | `CollectionsPage.jsx`, `computeReceivableMetrics.js` |
| Revenue Funnel | `RevenueFunnelPage.jsx`, `revenueFunnelEngine.js` |
| Pilot Readiness | `PilotReadinessPage.jsx`, `pilotReadinessEngine.js` |
| Predator | `PredatorDebugConsole.jsx`, `runPredatorValidation.js` |
| QA Command Center | `QACommandCenterPage.jsx`, `qaReadinessEngine.js` |

---

## Verdict

PrimeCare HQ core modules are **functionally implemented** but **not production-ready at 71%**. The path to 85%+ requires:

1. Confirmed RLS migration apply (blocking)
2. Six targeted P0 fixes (error surfacing, menu visibility, hybrid merge disable, PO label)
3. Full QA Launch Checklist execution with Predator enabled in staging

No new features are required for HQ pilot sign-off.
