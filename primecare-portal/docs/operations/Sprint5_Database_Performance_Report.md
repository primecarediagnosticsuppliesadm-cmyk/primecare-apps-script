# Sprint 5 — Supabase Database Performance & Query Optimization Report

**Date:** 2026-07-03  
**Tenant profiled:** QA HQ `f168b98f-47a6-42c3-b788-24c00436fac2`  
**Scope:** Analysis and recommendations only — no migrations applied, no adapter flags, no business-logic changes.

---

## Executive summary

The dominant database performance issue on QA is **cross-tenant table pollution**: the shared Supabase project contains a **perf-scale tenant with ~100,180 orders and ~100,056 payments**, while HQ QA has only **179 orders / 55 payments**. Any query that omits an explicit `tenant_id` predicate forces PostgreSQL to evaluate **RLS over the full table** and hits the **~8s statement timeout**.

**Smallest high-impact fix set (ranked):**

1. **Deploy** `20260705120002_fix_read_receivables_timeout.sql` (if not already on QA).
2. **Rewrite `get_founder_snapshot`** to use `proj_tenant_executive_metrics_v1` or fix `tenant_id::text` casts + consolidate scans.
3. **Add explicit `tenant_id` filters** to all PostgREST bounded reads (app layer — zero SQL risk).
4. **Add `p_tenant_id` parameter** to projection read RPCs for planner pushdown before RLS.
5. **Isolate or purge perf-scale tenant data** from the QA project (ops, not schema).

**Estimated combined gain:** eliminate 8s timeouts on payments/orders/founder/receivables RPCs; Orders list **2.4s → ~0.6s** via existing `read_orders_list_v1`; Dashboard **2.2s → ~0.1s** via `read_tenant_dashboard_v1` when adapters are enabled (flags remain OFF per sprint policy).

---

## Environment facts (service-role counts)

| Table | HQ QA rows | All-tenant rows |
|-------|------------|-----------------|
| orders | 179 | **100,180** |
| payments | 55 | **100,056** |
| order_items | 200 | — |
| order_lines | 3 | — |
| ar_credit_control | 30 | — |
| labs | 26 | — |
| proj_order_v1 | 179 | 179 |
| proj_lab_receivable_v1 | 30 | 30 |

---

## Phase 1 — Live QA profiling (PostgREST + RPC)

Profiler: `node scripts/profile-sprint5-database.mjs`

### Top 20 slowest probes (ranked)

| Rank | Probe | ms | Rows | Payload | OK |
|------|-------|-----|------|---------|-----|
| 1 | `efi.loadExecutiveFinancialIntelligenceData` | **19,733** | — | 552 KB | yes |
| 2 | `rpc.get_founder_snapshot` | **8,226** | — | 0 | **TIMEOUT** |
| 3 | `ops.loadOperationsCommandCenterData` | **8,161** | — | 163 KB | yes |
| 4 | `fanout.payments 366d` | **8,152** | — | 0 | **TIMEOUT** |
| 5 | `rpc.read_lab_receivables_list_v1` | **8,142** | — | 0 | **TIMEOUT** |
| 6 | `api.getOrdersRead` (with lines) | 2,414 | 100 | 64 KB | yes |
| 7 | `api.getAdminDashboardRead` | 2,237 | — | 4 KB | yes |
| 8 | `api.getCollectionsRead` | 1,634 | 4 | 2 KB | yes |
| 9 | `api.getLabsCredit` / `view.v_labs_credit` | ~1,400 | 26 | 9–15 KB | yes |
| 10 | `fanout.order_lines+items` (100 orders) | 910 | 200 | 0 | yes |
| 11 | `rpc.read_orders_list_v1` | **615** | 100 | 53 KB | yes |
| 12 | `table.orders` (dashboard bounded) | 379 | 179 | 105 KB | yes |
| 13 | `table.agent_visits` | 356 | 10 | 2 KB | yes |
| 14 | `api.getOrdersRead` (skipLineCounts) | 326 | 100 | 64 KB | yes |
| 15 | `table.ar_credit_control` | 195 | 30 | 6 KB | yes |
| 16 | `table.payments` (recent, txn path) | 170 | 55 | 16 KB | yes |
| 17 | `fanout.order_lines bounded` | 143 | 3 | 0 | yes |
| 18 | `view.v_stock_dashboard` | 116 | 7 | 2 KB | yes |
| 19 | `rpc.read_tenant_executive_v1` | **113** | 1 | 0 | yes |
| 20 | `table.inventory` | 102 | 4 | 1 KB | yes |

### Root-cause proof: missing `tenant_id` predicate

| Query | Without `tenant_id` | With `tenant_id` |
|-------|--------------------:|-----------------:|
| `payments` 366d, limit 5000 | **8,192 ms TIMEOUT** | **326 ms** (55 rows) |
| `orders` 90d, limit 2000 | **8,301 ms TIMEOUT** | **568 ms** (179 rows) |
| `proj_lab_receivable_v1` direct select | — | **208 ms** |

**Conclusion:** Timeouts are not projection-table size problems; they are **full-table RLS scans** on perf-polluted `payments` / `orders`.

---

## Phase 2 — EXPLAIN ANALYZE (static + targeted live)

Direct `EXPLAIN ANALYZE` via `psql` was not available (no linked Supabase CLI in this environment). Analysis below is from **SQL source review** + **live A/B tenant filter tests** + **row counts**.

### `get_founder_snapshot(p_tenant_id)`

**Source:** `20260624130002_sprint1_founder_snapshot_rpc.sql`

| Issue | Detail |
|-------|--------|
| **8 sequential scans** | Separate `SELECT` into `orders`, `payments`, `ar_credit_control`, `inventory`, `profiles` |
| **Index defeat** | `tenant_id::text = p_tenant_id::text` prevents use of `(tenant_id, …)` btree indexes |
| **Status filter** | `lower(btrim(status)) IN (...)` on orders — no composite `(tenant_id, status, order_date)` index |
| **RLS at scale** | Each scan touches ~100k rows before tenant filter under RLS |

**Recommended rewrite (migration):** Single read from `proj_tenant_executive_metrics_v1` (already **113 ms** live) with fallback to consolidated CTE using `tenant_id = p_tenant_id` (uuid, no cast).

**Est. gain:** **8,200 ms → 100–150 ms** (−98%).

---

### `read_lab_receivables_list_v1`

**Deployed version risk:** Original body (`20260705120000`) includes:

```sql
SELECT COALESCE(SUM(p.amount_received), 0)
FROM public.payments p
WHERE p.payment_date = v_today;  -- NO tenant_id filter
```

That scans **100k payments** under RLS → **statement timeout**.

**Fix exists:** `20260705120002_fix_read_receivables_timeout.sql` removes payments scan.

**Live evidence:** Direct `proj_lab_receivable_v1` select = **208 ms**; RPC = **8,142 ms** → strongly suggests **old RPC body still deployed on QA**.

**Est. gain after deploy:** **8,100 ms → 200–400 ms** (−95%).

---

### `read_orders_list_v1`

| Aspect | Finding |
|--------|---------|
| Plan shape | `proj_order_v1` index `idx_proj_order_v1_tenant_date` + `LIMIT` |
| Missing filter | No explicit `tenant_id = …` in SQL; relies on RLS `distributor_lab_record_visible` |
| Live timing | **615 ms** vs transactional **2,414 ms** |

**Recommendation:** Add `AND p.tenant_id = current_tenant()` or `p_tenant_id` parameter for earlier filter pushdown.

**Est. gain:** **615 ms → 150–250 ms** at HQ scale; larger at multi-tenant scale.

---

### `v_labs_credit`

**Definition:** `labs LEFT JOIN ar_credit_control ON tenant_id + lab_id` (`security_invoker = true`).

| Aspect | Finding |
|--------|---------|
| Join keys | Aligned with `idx_labs_tenant_lab` + `idx_ar_credit_tenant_lab` |
| Live timing | **1,385 ms** for 26 rows — high vs row count |
| Cause | RLS function evaluation per row + PostgREST `select('*')` over-fetch |

**Recommendations:**
- PostgREST: use column list (already defined as `HQ_V_LABS_CREDIT_LIST_COLUMNS` in app).
- At scale: per-tenant materialized snapshot table (high-risk; defer).

**Est. gain (column trim only):** **−20–30%** payload/latency.

---

### Dashboard bounded reads (`fetchAdminDashboardBoundedSourceRows`)

Parallel batch (5 queries):

| Table / view | ms (component) | Issue |
|--------------|----------------|-------|
| orders | 379 | No `tenant_id` in query — works today only because RLS + date filter finishes under timeout at 179 rows |
| ar_credit_control | 195 | `limit(5000)` without tenant — OK at 30 rows |
| agent_visits | 356 | Bounded |
| inventory | 102 | Bounded |
| labs | (in dashboard) | Separate from view |
| payments (dashboard) | in parallel | Recent window — OK when tenant-small |
| proj_order_v1 line metrics | in `getAdminDashboardRead` | Replaces order_items fan-out |

**Est. gain with `tenant_id` on orders/payments:** Dashboard API **2,237 ms → 800–1,200 ms**; prevents future timeouts as HQ data grows.

---

### Orders transactional path

| Step | ms | Issue |
|------|-----|-------|
| orders list | 326 | OK with `skipLineCounts` |
| order_lines + order_items fan-out (100 ids, chunk 20) | **910** | 5–10 round trips; `.in(order_id, chunk)` |

**Indexes present:** `idx_order_lines_tenant_order`, `idx_order_items_tenant_order`.

**Recommendation:** Keep chunking; consider single RPC `get_order_unit_counts_v1(tenant_id, order_ids[])` to collapse round trips (RPC migration).

**Est. gain:** **910 ms → 100–200 ms** (1 round trip).

---

### Collections transactional path (`getCollectionsRead`)

3 parallel reads: `ar_credit_control`, `payments`, `v_labs_credit` — **1,634 ms** total.

Payments leg uses recent date + limit; **add `tenant_id`** for safety.

**Est. gain:** **−10–20%** today; **prevents timeout** under perf pollution.

---

### Executive FI composite

**19,733 ms** = ops center bundle + portfolio + payments(366d) timeout path + order_lines + multi-tenant shipments.

| Component | ms | Fix lever |
|-----------|-----|-----------|
| payments 366d | 8,152 (timeout) | `tenant_id` filter |
| ops center | 8,161 | Dedup reads + tenant filters |
| order_lines | 143 | OK |
| founder RPC | timeout | projection metrics |

**Est. gain:** **~20s → 4–6s** with tenant filters only; **→ 2s** with founder + receivables RPC fixes.

---

## Phase 3 — Index audit

### Existing high-value indexes (from migrations)

| Index | Table | Purpose |
|-------|-------|---------|
| `idx_orders_tenant_order_date` | orders | Dashboard / list date ordering |
| `idx_payments_tenant_payment_date` | payments | Recent payments window |
| `idx_orders_tenant_lab` | orders | Lab-scoped reads |
| `idx_ar_credit_tenant_lab` | ar_credit_control | Collections / view join |
| `idx_order_lines_tenant_order` | order_lines | Line fan-out |
| `idx_order_items_tenant_order` | order_items | Line fan-out fallback |
| `idx_proj_order_v1_tenant_date` | proj_order_v1 | Projection orders adapter |
| `idx_proj_lab_recv_v1_tenant_outstanding` | proj_lab_receivable_v1 | Receivables adapter |

### Missing indexes (recommendations — do not apply yet)

| Priority | Index | Rationale | Est. gain |
|----------|-------|-----------|-----------|
| P0 | `(tenant_id, status, order_date)` on `orders` | `get_founder_snapshot` status COUNT queries | Founder RPC −60% if not using projection table |
| P0 | `(tenant_id, payment_date)` on `payments` | **Exists** as `idx_payments_tenant_payment_date` — ensure queries use `tenant_id` | Timeouts → 300 ms |
| P1 | `(tenant_id, order_date, status)` partial on open orders | `orders_waiting` / `orders_delayed` counts | −40% on founder scans |
| P1 | `(tenant_id, visit_date DESC)` on `agent_visits` | Dashboard visits | −20% |
| P2 | `(tenant_id, created_at DESC)` on `inventory_ledger` | Health panel (83 rows today) | Future scale |

### Duplicate / overlapping indexes

| Table | Indexes | Recommendation |
|-------|---------|----------------|
| orders | `idx_orders_lab_id`, `idx_orders_tenant_lab`, `idx_orders_lab_id_norm` | Keep `idx_orders_tenant_lab`; evaluate dropping standalone `lab_id` if planner uses composite |
| payments | `idx_payments_lab_id`, `idx_payments_payment_date`, `idx_payments_tenant_payment_date`, `idx_payments_tenant_lab` | Keep tenant composites; **audit via `pg_stat_user_indexes`** before drop |
| purchase_orders | Duplicated in `primecare_public_schema.sql` and migrations | Consolidate in one migration after usage audit |

### Unused indexes

**Action required:** Run on staging (not executed here):

```sql
SELECT schemaname, relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;
```

---

## Phase 4 — View optimization

| View | Cost driver | Recommendation | Risk |
|------|-------------|----------------|------|
| `v_labs_credit` | Join + RLS invoker + `select('*')` | Trim columns; consider caching in `proj_lab_receivable_v1` for collections | Low / Med |
| `v_stock_dashboard` | products ⋈ inventory | OK at current scale (116 ms) | Low |
| `v_reorder_candidates` | Filter on `v_stock_dashboard` | OK | Low |
| `v_lab_catalog` | Used by lab ordering | Bounded limit 2000 | Low |

**No view redefinition required for HQ QA row counts** — primary issue is **base-table scan + RLS**, not view join complexity.

---

## Phase 5 — RPC optimization summary

### Top 20 slowest RPCs (live + static)

| Rank | RPC | Live ms | Root cause | Fix |
|------|-----|--------|------------|-----|
| 1 | `get_founder_snapshot` | 8,226 (timeout) | 8× seq scan, `::text` cast, no projection | Read `proj_tenant_executive_metrics_v1` |
| 2 | `read_lab_receivables_list_v1` | 8,142 (timeout) | `payments` scan w/o tenant (old body) | Deploy `20260705120002` |
| 3 | `read_orders_list_v1` | 615 | RLS on projection; no tenant in SQL | Add `p_tenant_id` filter |
| 4 | `read_tenant_executive_v1` | 113 | Single-row projection | ✅ optimal |
| 5 | `read_tenant_dashboard_v1` | ~100 (prior cert) | Single-row projection | ✅ optimal |
| 6 | `rebuild_projection_v1` | rebuild-bound | Per-row `refresh_proj_*` loops | Batch refresh (high-risk) |
| 7 | `refresh_proj_order_row_v1` | per order | `_proj_order_item_count_v1` hits lines+items | OK for rebuild |
| 8 | `post_collection_payment` | write path | Out of read scope | — |
| 9 | `create_lab_order` | write path | — | — |
| 10 | `get_founder_snapshot` (8 queries) | see above | Consolidate | — |

---

## Phase 6 — PostgREST optimization

| Pattern | Occurrences | Impact | Recommendation |
|---------|-------------|--------|----------------|
| `select('*')` on views | Labs profiler, collections | Larger payload | Use `HQ_*_COLUMNS` constants everywhere |
| Missing `tenant_id` | payments, orders, EFI | **TIMEOUT** | **Add `.eq('tenant_id', …)`** to all bounded reads |
| Large `IN()` chunks | order_lines fan-out, chunk=20 | 5–10 round trips | Single RPC or smaller payload columns |
| `limit(5000)` on AR | collections | 30 rows returned | OK; tenant filter still needed |
| Duplicate reads | ops loader vs dashboard | 8s+ combined | Client cache (Sprint 4); DB: projection tables |

### Payload hotspots

| Endpoint | Payload | Note |
|----------|---------|------|
| EFI loader | 552 KB | Portfolio + ops bundle |
| Dashboard orders bounded | 105 KB | 179 rows × wide `HQ_ORDER_LIST_COLUMNS` |
| `read_orders_list_v1` | 53 KB | 100 rows |

**Recommendation:** Trim rarely displayed order columns from list projections (migration + app contract).

---

## Phase 7 — Connection / waterfall audit

| Surface | Pattern | Parallelism | Issue |
|---------|---------|-------------|-------|
| Dashboard | 5× `Promise.all` | Good | Missing tenant predicates |
| Collections | 3× parallel | Good | Agent `force:true` bypasses cache (app) |
| Orders | Sequential list → fan-out | Bad | 2.4s; use projection adapter or RPC batch |
| EFI | ops → portfolio → commission | Partial | payments timeout blocks |
| Ops center | 10+ parallel reads | Good | Redundant with dashboard cache |
| Sidebar | 3 parallel | Good | `skipLineCounts` on orders |

**Serialization bottleneck:** `get_founder_snapshot` runs 8 queries **sequentially inside PL/pgSQL** — parallelize via single SQL or projection row.

---

## Phase 8 — Query heatmap (Top 50 by cost score)

**Cost score** = `latency_ms × frequency_weight` (frequency: H=high daily, M=medium, L=low)

| # | Query / RPC | Avg ms | P95 est. | Freq | Rows scanned (effective) | Rows returned | Cost |
|---|-------------|--------|----------|------|--------------------------|---------------|------|
| 1 | payments w/o tenant_id | 8192 | 8192 | H | **100,056** | 0 (timeout) | **CRITICAL** |
| 2 | get_founder_snapshot | 8226 | 8226 | M | **100k×8** | 0 | **CRITICAL** |
| 3 | read_lab_receivables_list_v1 (old) | 8142 | 8142 | M | **100k** | 0 | **CRITICAL** |
| 4 | efi.loadExecutiveFinancialIntelligenceData | 19733 | 20000 | L | composite | — | **CRITICAL** |
| 5 | ops.loadOperationsCommandCenterData | 8161 | 9000 | M | multi | — | HIGH |
| 6 | getOrdersRead + line fan-out | 2414 | 3000 | H | 100 + chunks | 100 | HIGH |
| 7 | getAdminDashboardRead | 2237 | 2600 | H | ~100k orders scan risk | KPIs | HIGH |
| 8 | getCollectionsRead | 1634 | 1800 | H | 3 tables | 4 | MED |
| 9 | v_labs_credit | 1385 | 1500 | H | 26 | 26 | MED |
| 10 | order_lines fan-out | 910 | 1200 | H | 100 orders | 200 | MED |
| 11 | read_orders_list_v1 | 615 | 700 | H | 179 proj | 100 | LOW-MED |
| 12 | orders bounded + tenant | 379 | 400 | H | 179 | 179 | LOW |
| 13 | read_tenant_executive_v1 | 113 | 150 | M | 1 | 1 | LOW |
| 14 | v_stock_dashboard | 116 | 150 | M | 7 | 7 | LOW |
| 15–50 | inventory, visits, AR, PO, logistics | <400 | — | M-L | bounded | small | LOW |

*(Rows 15–50: agent_visits, ar_credit_control, inventory, inventory_ledger, purchase_orders, order_shipments, profiles, lab_qualifications, notification_events — all <400 ms with current bounds.)*

---

## Deliverables checklist

### 1. Top 20 slowest SQL — see Phase 1 table

### 2. Top 20 slowest RPCs — see Phase 5 table

### 3. Missing indexes — see Phase 3 P0/P1

### 4. Unused indexes — run `pg_stat_user_indexes` (script in Phase 3)

### 5. Views needing redesign — see Phase 4 (`v_labs_credit` only candidate)

### 6. Queries needing rewrite

| Query | Rewrite |
|-------|---------|
| `get_founder_snapshot` | Read projection metrics row |
| `read_lab_receivables_list_v1` | Deploy timeout fix; add `tenant_id` |
| `payments` EFI 366d | Add `tenant_id` in app/SQL |
| `orders` dashboard | Add `tenant_id` in bounded read |
| Order line fan-out | Batch RPC |

### 7. Estimated improvement (cumulative)

| Change | Dashboard | Orders | Collections | EFI | Founder RPC |
|--------|-----------|--------|-------------|-----|-------------|
| Tenant filters on PostgREST | 2.2s→1.0s | 2.4s→1.5s | 1.6s→1.2s | 20s→6s | — |
| Deploy receivables RPC fix | — | — | adapter 8s→0.3s | — | — |
| Founder → projection metrics | — | — | — | −8s | 8s→0.1s |
| Orders adapter (when enabled) | — | 2.4s→0.6s | — | — | — |
| Dashboard adapter (when enabled) | 2.2s→0.1s | — | — | — | — |

### 8. Safe migration plan (ordered)

| Step | Migration | Risk | Rollback |
|------|-----------|------|----------|
| 1 | Verify/deploy `20260705120002_fix_read_receivables_timeout.sql` | **Zero** | Restore prior function body |
| 2 | `get_founder_snapshot` → read `proj_tenant_executive_metrics_v1` | **Low** | Restore Sprint 1 function |
| 3 | Add `p_tenant_id uuid` to read adapter RPCs + `WHERE tenant_id = p_tenant_id` | **Low** | Drop param (default current tenant) |
| 4 | `CREATE INDEX CONCURRENTLY idx_orders_tenant_status_date` | **Low** | `DROP INDEX CONCURRENTLY` |
| 5 | Batch order unit count RPC | **Medium** | Keep chunk fan-out |
| 6 | Perf tenant data isolation | **Ops** | N/A |

### 9. Zero-risk optimizations (no SQL required)

1. Add `.eq('tenant_id', tenantId)` to `fetchPaymentsBoundedRows`, dashboard orders query, EFI payment reads.
2. Use column projections instead of `select('*')` on `v_labs_credit`.
3. Ensure `20260705120002` is applied on QA Supabase.
4. Purge or isolate perf-scale tenant from QA project.
5. Re-run projection rebuild after SQL deploys (ops).

### 10. High-risk optimizations (defer)

1. Materialized `v_labs_credit` per tenant
2. Partitioning `orders` / `payments` by `tenant_id`
3. RLS policy changes for planner pushdown
4. Batch `rebuild_projection_v1` without per-row loops
5. Dropping legacy indexes without `pg_stat` proof

---

## Verification commands

```bash
cd primecare-portal

# Live latency ranking
node scripts/profile-sprint5-database.mjs

# Tenant filter A/B (manual)
# See Sprint 5 report — payments/orders with vs without tenant_id

# After migrations (staging)
node scripts/verify-projection-parity.mjs
node scripts/verify-executive-projection-parity.mjs
node scripts/measure-projection-reads.mjs
```

---

## Constraints honored

- No business features, finance, allocation, logistics, inventory behavior, or RLS changes
- No projection architecture changes
- No `VITE_READ_ADAPTER_*` flags enabled
- No SQL migrations applied
- No git commit or push

---

## Appendix — profiler artifact

Added for repeatability: `scripts/profile-sprint5-database.mjs` (not committed per sprint policy; run locally as needed).
