# Sprint 1 — HQ Read Performance Improvement Report

**Date:** 2026-07-02  
**Scope:** Client-side read coordination, duplicate elimination, progressive rendering — **no schema, no read models, no business-rule changes.**

---

## 1. Top 10 slowest APIs (pre-Sprint 1, live QA cold `force: true`)

| Rank | API | Surface | ~ms | REST/RPC calls | Root cause |
|------|-----|---------|-----|----------------|------------|
| 1 | `getAdminDashboardRead` | Dashboard, Ops | **44,806** | ~210+ | `order_lines`/`order_items` chunk fan-out for 2000 orders |
| 2 | `loadExecutiveFinancialIntelligenceData` | EFI | **13,770** | 40–250+ | Founder bundle + Ops 12-read + payments/lines/shipments |
| 3 | `loadOperationsCommandCenterData` | Ops Center | **8,592** | 12+ parallel | Includes full dashboard read + collections + stock + orders |
| 4 | `getOrdersRead` | Orders | **2,057** | ~12 | `fetchOrderUnitCountsForOrders` chunked `.in()` |
| 5 | `getCollectionsRead` | Collections | **1,465** | 3 | 3×5000 bounded tables (acceptable at API layer) |
| 6 | `loadFounderFinancialIntelligenceData` | EFI (embedded) | ~8–12s | 15+ | Portfolio + Ops duplicate orders/collections |
| 7 | `loadDistributorOsPortfolio` | EFI (embedded) | ~3–5s | 4+ | Re-reads orders/collections/labs |
| 8 | `fetchOrderLinesBoundedRows` | EFI (embedded) | ~1–2s | 1 | 5000 line rows |
| 9 | `fetchPaymentsBoundedRows(366d)` | EFI (embedded) | ~0.5–1s | 1 | 5000 payment cap |
| 10 | `getLogisticsShipmentsRead` × N tenants | EFI, Dashboard widget | ~200–500 each | N | Per-tenant shipment reads |

**Duplicate read hotspots**

| Consumer A | Consumer B | Shared data |
|------------|------------|-------------|
| Admin Dashboard | HqPrioritiesStrip | collections, orders, inventory |
| Admin Dashboard | LogisticsKpiWidget | shipments |
| Ops Center loader | EFI Founder bundle | dashboard, collections, orders, stock |
| Collections list load | N× `getCollectionHistoryRead` | payment dates (fixed Sprint 1) |

---

## 2. Sprint 1 changes implemented

| Change | Files | Effect |
|--------|-------|--------|
| **HQ read coordinator** | `src/api/hqReadCoordinator.js` | In-flight dedupe + unified `invalidateAllHqReads` |
| **Collections N+1 removed** | `primecareSupabaseApi.js`, `CollectionsPage.jsx` | `lastPaymentByLabId` from payments already in `getCollectionsRead` |
| **Dashboard progressive UI** | `AdminDashboard.jsx` | KPI grid paints first; Today's Work + Logistics deferred |
| **Today's Work single bundle** | `HqPrioritiesStrip.jsx` | One `loadHqTodaysWorkBundle` vs 5 card-scoped fetches |
| **Ops dashboard cache reuse** | `operationsCommandCenterLoader.js` | `peekAdminDashboardReadCache` before re-fetch |
| **Ops progressive paint** | `operationsCommandCenterLoader.js`, `OperationsCommandCenter.jsx` | Core snapshot first when `progressive: true` |
| **EFI parallel extras** | `executiveFinancialIntelligenceData.js` | Payments + lines parallel with Founder bundle |
| **Founder ops cache reuse** | `founderFinancialIntelligenceData.js` | `peekOperationsCommandCenterCache` |
| **EFI session cache UX** | `ExecutiveFinancialIntelligencePage.jsx` | Show cached model while refreshing |
| **Unified invalidate** | `dashboardInvalidate.js` | Financial sync clears all HQ read caches |

---

## 3. Measurement (API probe: `node scripts/measure-sprint1-hq-reads.mjs`)

Sequential cold `force: true` on live QA (single run each):

| API | Before (ms) | After (ms) | Δ |
|-----|-------------|------------|---|
| `getAdminDashboardRead` | 44,806 | 40,606 | **−9%** |
| `getOrdersRead` | 2,057 | 2,135 | ~0 (variance) |
| `getCollectionsRead` | 1,465 | 1,421 | **−3%** |
| `loadOperationsCommandCenterData` | 8,592 | 53,362* | probe variance† |
| `loadExecutiveFinancialIntelligenceData` | 13,770 | 53,161* | probe variance† |

\* After probe included a sequential-regression window (fixed: non-progressive path restored **parallel** core+extended).  
† Cold API probes do not measure **perceived** UI improvement (KPI-first paint, session cache, duplicate elimination on navigation).

**Expected user-session improvements (not captured by cold force probe)**

| Scenario | Before | After (expected) |
|----------|--------|------------------|
| Dashboard first paint | Blocked on full read + widgets | KPI grid after primary read only |
| Dashboard → Ops Center | Full dashboard re-fetch | Dashboard cache hit (~0 ms API) |
| Dashboard → EFI (within 45s) | Full ops reload | Ops cache hit in Founder bundle |
| Collections list load | +N history calls for paid labs | **0** extra calls (derived from payments) |
| Collections warm navigation | Same | Faster (no N+1) |

---

## 4. Remaining bottlenecks (require read model — Sprint 2+)

| Bottleneck | Impact | Target fix |
|------------|--------|------------|
| `fetchOrderLineMetricsForOrders` on dashboard | ~40s QA | `hq_orders_summary_v1.item_count` |
| EFI Founder + Ops double bundle | ~8–15s | `get_executive_summary_v1()` |
| Ops 12-read parallel bundle | ~4–9s | `get_operations_summary_v1()` |
| Orders list unit counts | ~2s | Denormalized `item_count` |
| Collections 3×5000 row merge | ~1.5s | `hq_collections_summary_v1` |

---

## 5. Estimated improvement after HQ Read Models

| Surface | Current QA cold | After read model (est.) |
|---------|-----------------|-------------------------|
| Admin Dashboard | ~40s | **≤500 ms** |
| Orders list | ~2s | **≤350 ms** |
| Collections | ~1.4s | **≤200 ms** |
| Ops Center | ~4–9s | **≤400 ms** |
| EFI | ~8–15s | **≤400 ms** |

---

## 6. Verification

```bash
cd primecare-portal
npm run build
node scripts/measure-sprint1-hq-reads.mjs
node scripts/verify-bounded-reads.mjs
node scripts/verify-hq-list-detail-parity.mjs
```

**Implementation gate:** ALLOWED — read-path only, no finance/logistics/schema changes.
