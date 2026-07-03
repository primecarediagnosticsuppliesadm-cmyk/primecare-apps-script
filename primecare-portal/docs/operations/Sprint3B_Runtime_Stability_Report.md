# Sprint 3B — Runtime Stability & Performance Hardening Report

**Date:** 2026-07-02  
**Gate:** Implementation allowed — finance, AR, payments, inventory logic, logistics lifecycle, projection SQL, RLS, and feature flags **unchanged**.

---

## Executive summary

| Metric | Before sprint | After sprint |
|--------|---------------|--------------|
| Known React hook crashes | 2 (Projection Ops, App reset-password path) | **0** (audited 163 files) |
| `npm run build` | PASS | **PASS** |
| Browser smoke (all roles) | GO | **GO** (12/12) |
| Production readiness | CONDITIONAL GO | **CONDITIONAL GO** |
| Index bundle | ~64 KB | **64 KB** |
| Sprint 3B latency targets (<1s pages) | Not met | **Not met** (requires projection adapter cert; flags remain OFF) |

**Overall: CONDITIONAL GO** — runtime stability P0 closed; performance targets remain blocked on projection ops rebuild + adapter certification.

---

## Runtime bugs fixed

### 1. Projection Operations Center — React #310

**Root cause:** `useMemo` hooks (`projectionReadHealth`, `monitoringSnapshot`) declared **after** early `return <PageSkeleton />` when `loading && !metrics`.

**Fix:** All hooks moved above conditional return.  
**File:** `src/pages/ProjectionOperationsCenterPage.jsx`

### 2. App shell — React hook order violation

**Root cause:** `isResetPasswordRoute` early return **before** `useState` / `useEffect` / `useCallback` / `useMemo`. Navigating to/from `/reset-password` changed hook count.

**Fix:** Reset-password gate moved **after** all hooks.  
**File:** `src/App.jsx`

---

## Phase 1 — React runtime audit

| Check | Result |
|-------|--------|
| `scripts/audit-react-hook-order.mjs` (163 files: pages, components, projectionOps, App, PrimeCareWebPortal) | **PASS** |
| `verify-runtime-import-safety.mjs` (symbol imports + hook order on critical files) | **PASS** |
| Missing import gate (`cn`, `consumeHqNavContext`, etc.) | **PASS** |
| Conditional hooks in default exports | **0 found** |

**New tooling:** `scripts/audit-react-hook-order.mjs` — wired into `verify-production-readiness.mjs`.

---

## Phase 2 — API audit (critical pages)

| Page | Primary API | Calls (cold) | Duplicate? | Cache | Defer | Parallel | Notes |
|------|-------------|--------------|------------|-------|-------|----------|-------|
| Dashboard | `getAdminDashboardRead` | 1 | No | 45s TTL | Secondary widgets deferred | Bounded parallel sources | ~2.5s QA |
| Orders | `getOrdersRead` | 1 | No | Module cache | Invoice prefetch deferred 200ms | Labs name map ∥ line counts | **~3.7s** — `order_items` fan-out |
| Collections | `getCollectionsRead` | 1 | No | Module cache | — | AR + payments + labs | ~1.4s PASS |
| Labs | `getLabsCredit` | 1 | No | Module + page UI cache | — | Single `v_labs_credit` | ~1.4s |
| Inventory | `getStockDashboard` | 1 | No | Module cache | — | Single view | **~117ms** PASS |
| Purchase Orders | `getPurchaseOrdersRead` | 1 | No | — | — | Forecast ∥ health ∥ PO list | **~253ms** PASS |
| Logistics | `getLogisticsShipmentsRead` | 1 | No | — | — | Single bounded read | **~121ms** PASS |
| Executive FI | `loadExecutiveFinancialIntelligenceData` | 1 | No | EFI page cache | — | Many sequential internal reads | **~12s** |
| Projection Ops | `loadProjectionMetrics` | 1 | No | — | — | Meta + health registry | Fixed crash |
| Agent Dashboard | `getAgentWorkspaceRead` | 1 | No | Per-user cache | — | **Parallel** ownership + collections + labs + visits | ~2.4–2.8s |
| Lab Ordering | `getLabCatalogRead` | 1 | No | — | — | Catalog bounded | **~114ms** PASS |
| Sidebar shell | `getSidebarSummary` | 1 (idle-deferred) | No | — | `requestIdleCallback` 3s | Lightweight batch, `skipLineCounts` | ~1.7s |

**Duplicate APIs removed this sprint:** None required — Admin Dashboard already skips redundant `getLabsCredit` / `getStockDashboard` when `getAdminDashboardRead` succeeds.

---

## Phase 3 — Performance measurements (QA cold API path)

| Role | Page | Before (approx) | After (ms) | Target | Status |
|------|------|-----------------|------------|--------|--------|
| HQ Admin | dashboard | ~2900 | **2531** | 3000 / 1000* | PASS / miss 1s* |
| HQ Admin | orders | ~3750 | **3702** | 2000 / 1000* | FAIL |
| HQ Admin | collections | ~1245 | **1413** | 2000 / 1000* | PASS |
| HQ Admin | labs | unmeasured | **1428** | 1000* | FAIL |
| HQ Admin | inventory | unmeasured | **117** | 1000* | PASS |
| HQ Admin | purchaseOrders | unmeasured | **253** | 2000 / 1000* | PASS |
| HQ Admin | logistics | ~113 | **121** | 2000 | PASS |
| HQ Admin | sidebar | ~8309→1529 | **1725** | 4000 | PASS |
| HQ Executive | dashboard | ~804 | **1148** | 3000 | PASS |
| HQ Executive | executiveFi | ~11–12s | **12088** | 3000 / 2000* | FAIL |
| Agent | dashboard | ~4865→2433 | **2768** | 2500 | WARN |
| Agent | collections | ~2041 | **2215** | 2500 | PASS |
| Lab | ordering | ~124 | **114** | 2000 | PASS |
| Lab | invoices | ~517 | **437** | 2000 | PASS |

\*Sprint 3B aspirational targets; not achievable on transactional reads without certified projection adapters (flags OFF).

**Render ms:** Not instrumented in API harness (shown as `—`).

---

## Phase 4–5 — Component render & bundle

| Item | Status |
|------|--------|
| Initial `index` chunk | **64 KB** (predator-tools ~1237 KB lazy) |
| Heavy admin tools | Lazy: Ops Center, EFI, Collections, predator-tools, projection-ops |
| `React.memo` sweep | **Deferred** — no profiler evidence of harmful re-renders on hot paths |
| Unused route purge | **Deferred** — routes already lazy in `PrimeCareWebPortal.jsx` |

---

## Phase 6 — Database read audit (no SQL changes)

| Pattern | Status |
|---------|--------|
| Dashboard `order_items` fan-out | **Removed** (projection-only line metrics) |
| Orders list line-count fan-out | **Still present** (~10 `order_items`/`order_lines` chunk calls) |
| Unbounded `select *` on hot paths | Bounded via `hqReadBounds.js` on HQ reads |
| Projection flags | **OFF** — no adapter flip |

---

## Phase 7 — Console audit

| Change | File |
|--------|------|
| `[inventoryValuation]` default off; `hqDebugLog` when `logQa: true` | `resolveInventoryUnitCost.js` |
| Reconciliation log → `hqDebugLog` | `inventoryValueAnalyticsEngine.js` |
| Purchase reorder/trigger logs → `IS_DEV \|\| IS_QA` | `PurchaseOrdersPage.jsx` |
| `logAppsScriptPrimarySource` / `logPartialMigrationWarning` → DEV only | `migrationTrace.js` |
| `SUPABASE FEATURE SOURCE` | Already DEV-only |

**Production build:** No unconditional `console.log` on hot inventory/valuation paths.

---

## Phase 8 — Memory leak spot check

| Location | Cleanup |
|----------|---------|
| `App.jsx` nav badges | `cancelIdleCallback` / `clearTimeout` / `clearInterval` on unmount |
| `App.jsx` popstate / custom events | `removeEventListener` in effect cleanup |
| Orders invoice prefetch | `clearTimeout` + cancelled flag |
| Projection Ops refresh | Standard effect lifecycle |

No new leak patterns introduced.

---

## Phase 9 — Loading UX

| Page | Skeleton | Partial render | Retry |
|------|----------|----------------|-------|
| Projection Ops | `PageSkeleton` | ReadHealthBanner for stale projections | Refresh button |
| Dashboard | KPI skeleton | Secondary panels deferred | `DataFetchError` + retry |
| Orders | List skeleton | Filters work while list refreshes | `onRetry` |
| Labs | Page cache warm path | — | `DataFetchError` |

---

## Files changed (Sprint 3B session, uncommitted)

| File | Change |
|------|--------|
| `src/App.jsx` | Hook order fix (reset-password gate after hooks) |
| `src/pages/ProjectionOperationsCenterPage.jsx` | Hook order fix |
| `src/inventory/resolveInventoryUnitCost.js` | Quiet valuation logs |
| `src/inventory/inventoryValueAnalyticsEngine.js` | Quiet reconciliation logs |
| `src/pages/PurchaseOrdersPage.jsx` | Gate debug logs |
| `src/utils/migrationTrace.js` | DEV-only migration warnings |
| `scripts/audit-react-hook-order.mjs` | **New** — full hook-order audit |
| `scripts/verify-runtime-import-safety.mjs` | App.jsx + PrimeCareWebPortal hook checks |
| `scripts/verify-projection-ops-center.mjs` | UI hook + page wiring checks |
| `scripts/verify-production-readiness.mjs` | Wire hook audit |
| `scripts/measure-all-role-page-performance.mjs` | Labs, inventory, purchase orders probes |

---

## Verification results

| Script | Result |
|--------|--------|
| `npm run build` | **PASS** |
| `verify-production-readiness.mjs` | **CONDITIONAL GO** |
| `verify-runtime-import-safety.mjs` | **GO** |
| `audit-react-hook-order.mjs` | **PASS** (163 files) |
| `verify-projection-ops-center.mjs` | **PASS** |
| `run-browser-smoke-all-roles.mjs` | **GO** (12/12) |
| `measure-all-role-page-performance.mjs` | **NO-GO** (orders, labs, EFI vs aspirational targets) |

---

## Remaining bottlenecks

1. **Orders list** (~3.7s) — `fetchOrderUnitCountsForOrders` transactional fan-out; fix path: certified `VITE_READ_ADAPTER_ORDERS_V1` (QA only, not flipped).
2. **Executive FI** (~12s) — full ops data path + line tables; fix path: bounded EFI read + executive projection adapter when certified.
3. **Labs list** (~1.4s) — single large `v_labs_credit` read; may need pagination or projection at scale.
4. **Projection staleness** (~5h on ORD/COL meta) — environmental; run rebuild before adapter cert.
5. **Sprint 3B <1s targets** — **not achievable** without projection flags + rebuild; explicitly out of scope for this sprint per rules.

---

## Expected QA behavior

- Executive → Projection Operations Center: loads without React error boundary.
- `/reset-password` route: no hook crash when navigating to/from main app.
- Smoke paths: all roles authenticate and critical API reads succeed.
- Console on production build: no inventory valuation spam; DEV-only migration traces.

---

## GO / NO-GO

| Gate | Verdict |
|------|---------|
| Runtime crashes (P0) | **GO** |
| Hook audit / import safety | **GO** |
| Browser smoke | **GO** |
| Production readiness (code) | **CONDITIONAL GO** |
| Sprint 3B latency targets (<1s) | **NO-GO** |
| Projection adapter flip | **NO-GO** (staleness + rules) |

**Sprint 3B overall: CONDITIONAL GO** — ship runtime fixes; continue performance work under projection ops rebuild + adapter certification sprint.

**Not committed or pushed** per instruction.
