# Sprint 4 — Performance & Stability Report

**Date:** 2026-07-03  
**Scope:** Client-side performance + stability only. No features, SQL, RLS, finance, projection flags, or business-rule changes.  
**Status:** Complete (uncommitted per sprint policy)

---

## Executive summary

Sprint 4 focused on **deduplicating reads**, **deferring non-critical work**, and **parallelizing safe API paths**. Measured wins on the highest-traffic HQ surfaces; aspirational sub-1s targets remain blocked by **transactional `order_items`/`order_lines` fan-out** on Orders and Executive FI (requires projection adapter enablement — out of scope).

| Surface | Before (ms) | After (ms) | Δ | Sprint 4 target |
|---------|------------:|-----------:|--:|----------------:|
| HQ Admin dashboard | 2605 | **1438** | −45% | 1000 |
| HQ Admin orders (UI path, `skipLineCounts`) | 3157 | **~361** | −89% | 1000 |
| HQ Admin orders (full API probe) | 3157 | 2319 | −27% | 1000 |
| HQ Admin collections | 1354 | 1325 | −2% | 800 |
| HQ Admin logistics | 108 | 105 | — | 500 ✓ |
| HQ Admin labs | 1307 | 1278 | −2% | 500 |
| HQ Executive FI | 12856 | **11045** | −14% | 2000 |
| Agent dashboard | 2395 | 2743* | variance | — |
| Login index bundle | 64 KB | 64 KB | — | minimal ✓ |

\*Agent dashboard varies run-to-run (2180–2825 ms); duplicate workspace/collections reads reduced but collections AR batch remains dominant.

**Runtime:** `verify-runtime-import-safety` GO · `audit-react-hook-order` PASS (163 files) · build PASS

---

## Phase 1 — Full performance audit

### Root causes (by page)

| Page | Bottleneck | Est. fix without flags |
|------|------------|------------------------|
| **Dashboard** | Bounded multi-table `getAdminDashboardRead` + Today's Work overlap | Cache reuse, defer strip (−45% achieved) |
| **Orders** | `order_items`/`order_lines` fan-out after orders query | Critical-path `skipLineCounts` + idle enrich (−89% first paint) |
| **Collections** | 3-table parallel AR/payments/labs | Agent `force:true` removed; in-flight dedup |
| **Labs** | Double `getLabsCredit` on mount (`labs.length` dep) | Fixed ref gate |
| **Executive FI** | Ops center bundle + order lines + multi-tenant shipments | Parallel commission load; ops cache peek |
| **Sidebar badges** | Deferred poll only; no invalidate hook | Event-driven refresh on dashboard invalidate |
| **Logistics** | Already fast (`order_shipments` bounded) | No change needed |

### Bundle (unchanged structure — already well split)

- **index:** 64 KB (login shell)
- **predator-tools:** ~1.24 MB lazy (QA/diagnostics)
- **CollectionsPage / OpsCenter:** ~103 KB each (route lazy)

---

## Phase 2 — Duplicate reads removed

| Change | File(s) |
|--------|---------|
| Labs mount double-fetch | `LabsPage.jsx` — `hasLoadedLabsRef`, stable `loadLabs` deps |
| Agent visit duplicate collections | `primecareSupabaseApi.js` — reuse `workspace.pendingCollections` |
| Agent collections always `force:true` | `CollectionsPage.jsx` — force only on explicit refresh (`silent`) |
| Agent workspace always `force:true` collections | `getAgentWorkspaceRead` — respects `options.force` |
| Ops center redundant cache misses | `operationsCommandCenterLoader.js` — peek collections/orders/stock |
| Today's Work collections card | `hqCommandCenterData.js` — `peekCollectionsReadCache` |
| Sidebar badges stale after writes | `App.jsx` — listen `ADMIN_DASHBOARD_INVALIDATE_EVENT` |

### In-flight deduplication added

| API | Mechanism |
|-----|-----------|
| `getStockDashboard` | `stockDashboardReadInFlight` |
| `getAgentWorkspaceRead` | `agentWorkspaceReadInFlight` |
| `getCollectionsRead({ force:true })` | `collectionsReadForceInFlight` |

---

## Phase 3 — API optimization

| Change | Impact |
|--------|--------|
| `getOperationsLabAssignmentsRead` — `Promise.all` labs + distributors | Minor latency |
| `loadFounderFinancialIntelligenceData` — parallel commission + inventory economics | EFI −14% |
| `enrichOrdersListWithItemCounts` — line fan-out only (no orders re-query) | Orders UI background enrich |
| Orders list critical path `skipLineCounts: true` | **361 ms** vs 2507 ms |

---

## Phase 4–7 — React, bundle, tables, background loading

- **Orders:** list paints immediately; item counts fill via `requestIdleCallback` (Phase 7).
- **Bundle:** no structural change — existing lazy routes retained (Predator, Ops, Executive already split).
- **Tables:** no virtualization added (large tables already paginated/bounded; virtualization deferred to avoid UX risk).

---

## Phase 8 — Runtime errors

- Hook order audit: **PASS** (Projection Ops, App, PrimeCareWebPortal).
- Import safety: **GO**.
- No new hook violations introduced.

---

## Files changed

```
src/api/primecareSupabaseApi.js
src/App.jsx
src/founder/founderFinancialIntelligenceData.js
src/operations/hqCommandCenterData.js
src/operations/operationsCommandCenterLoader.js
src/pages/CollectionsPage.jsx
src/pages/LabsPage.jsx
src/pages/OrdersPage.jsx
docs/operations/Sprint4_Performance_Report.md
```

---

## Verification commands

```bash
cd primecare-portal
npm run build
node scripts/verify-runtime-import-safety.mjs
node scripts/audit-react-hook-order.mjs
node scripts/measure-all-role-page-performance.mjs
node scripts/run-browser-smoke-all-roles.mjs
```

---

## Remaining bottlenecks

| Priority | Bottleneck | Why Sprint 4 couldn't hit target |
|----------|------------|----------------------------------|
| P0 | Orders `order_items`/`order_lines` fan-out | Requires `VITE_READ_ADAPTER_ORDERS_V1` or SQL (out of scope) |
| P0 | Executive FI order lines + ops bundle | Same; founder snapshot adapter doesn't cover EFI loader |
| P1 | Collections AR 3-table read (~1.3s) | Receivables projection RPC timeout on QA |
| P1 | Labs `v_labs_credit` (~1.3s) | Single bounded view; no client-only path to 500 ms |
| P2 | Agent dashboard collections batch | Network + AR inconsistency scan overhead |
| P2 | Dashboard cold `getAdminDashboardRead` (~1.4s) | Multi-table bounded read; dashboard adapter needs `tenantId` wiring |

---

## Estimated next gains (no business-logic change)

| Action | Est. gain | Notes |
|--------|-----------|-------|
| Enable `VITE_READ_ADAPTER_ORDERS_V1` on QA | Orders **~0.5s** | Parity PASS; staleness rebuild required |
| Wire `tenantId` + enable dashboard adapter | Dashboard **~0.1s** | Parity PASS |
| Fix receivables projection RPC timeout | Collections **~0.5–0.8s** | SQL/ops — separate sprint |
| EFI progressive load (core KPIs first, lines idle) | EFI perceived **−3–5s** | Client-only; similar to Orders pattern |
| Virtualize Collections grid (500+ rows) | Render **−200ms** | When row count grows |
| Warm navigation cache on login | Login→first page **−300ms** | Prefetch dashboard peek after auth |

---

## Constraints honored

- No new features, architecture, projection tables, SQL, RLS, finance, inventory, or logistics workflow changes
- No `VITE_READ_ADAPTER_*` flags enabled
- No git commit or push
