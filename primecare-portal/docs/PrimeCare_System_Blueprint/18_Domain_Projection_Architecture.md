# 18 — Domain Projection Architecture

**Enterprise read layer for PrimeCare ERP — domain-driven, not screen-driven.**

Blueprint refs: [00_System_Architecture.md](./00_System_Architecture.md), [06_Finance_Rules.md](./06_Finance_Rules.md), [12_Executive_Analytics_Rules.md](./12_Executive_Analytics_Rules.md), [15_Do_Not_Break_Rules.md](./15_Do_Not_Break_Rules.md)

Registry: [Projection_Registry.md](../../../docs/Architecture/Projection_Registry.md)

---

## Purpose

Replace transactional fan-out reads with **reusable domain projections** that:

1. Are owned by **business domains**, not UI screens
2. Have a **single grain** per projection (order, lab, SKU, shipment, tenant-day, …)
3. Are refreshed by **domain events** through a projection pipeline
4. Are consumed by **read adapters** (RPC/API) that shape data for screens — projections are never screen-specific tables
5. Version explicitly (`v1`, `v2`) for 10+ year evolution

**Hard rule:** Transactional tables remain write SoT. Projections are read-only derivatives.

---

## Problem with screen-oriented read models

Sprint 2 draft used names tied to consumers:

| Screen-oriented name | Anti-pattern |
|---------------------|--------------|
| `hq_orders_summary_v1` | Implies HQ Orders page ownership; duplicates would appear for Dashboard, EFI, Ops |
| `hq_collections_summary_v1` | Implies Collections page only; EFI/Credit & Risk would re-fetch |
| `get_orders_summary_v1()` | RPC name couples storage to one screen contract |

**Correct pattern:** One **Orders domain** projection at order grain → many **read adapters** for HQ Orders, Dashboard KPIs, EFI, Ops, Agent, Reporting, AI.

---

## Architecture layers

```
┌─────────────────────────────────────────────────────────────────┐
│ WRITE LAYER (SoT) — unchanged                                    │
│ orders │ payments │ ar_credit_control │ inventory │ shipments …  │
└────────────────────────────┬────────────────────────────────────┘
                             │ domain events (append-only)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PROJECTION PIPELINE                                              │
│ Event → Refresh Queue → Worker → Domain Projection Tables        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ PROJECTION REGISTRY (domain tables)                              │
│ proj_order_v1 │ proj_lab_receivable_v1 │ proj_sku_stock_v1 …   │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        Read Adapters   Derived KPI    Reporting Views
        (RPC per        projections     (rpt_*)
         contract)      (metrics)
              │
              ▼
           UI / BI / AI
```

---

## Naming convention

| Artifact | Pattern | Example |
|----------|---------|---------|
| Domain projection table | `proj_<entity>_v<N>` | `proj_order_v1` |
| Derived KPI projection | `proj_<scope>_<metric>_v<N>` | `proj_tenant_order_metrics_v1` |
| Read adapter RPC | `read_<contract>_v<N>` | `read_orders_list_v1` |
| Reporting view | `rpt_<report>_v<N>` | `rpt_orders_pipeline_v1` |
| Registry entry ID | `PRJ-<DOMAIN>-<GRAIN>-vN` | `PRJ-ORD-ORDER-v1` |

**Sprint 2 rename (required before schema):**

| Sprint 2 draft | Domain projection |
|----------------|-------------------|
| `hq_orders_summary_v1` | **`proj_order_v1`** |
| `hq_collections_summary_v1` | **`proj_lab_receivable_v1`** |
| `get_orders_summary_v1()` | **`read_orders_list_v1()`** (adapter) |
| `get_collections_summary_v1()` | **`read_lab_receivables_list_v1()`** (adapter) |

---

## Domain ownership

| Domain | Owns projections | Write SoT |
|--------|------------------|-----------|
| **Orders** | `proj_order_v1`, order metrics | `orders`, `order_items`, `order_lines` |
| **Collections** | `proj_lab_receivable_v1`, receivable metrics | `ar_credit_control`, `payments`, allocations |
| **Finance** | Invoice status embeds on order projection; invoice detail stays transactional | `invoices`, `invoice_line_items` |
| **Inventory** | `proj_sku_stock_v1`, stock metrics | `inventory`, `inventory_ledger` |
| **Logistics** | `proj_shipment_v1`, dispatch metrics | `order_shipments`, routes |
| **Laboratory** | `proj_lab_profile_v1` | `labs`, qualifications |
| **Distributor** | `proj_distributor_portfolio_v1` | `tenants`, distributor billing |
| **Executive KPI** | Derived only — never duplicates order rows | Aggregates over domain projections |
| **Operations KPI** | Derived only | Aggregates + ops counts |
| **Contracts** | `proj_lab_contract_v1` | `lab_contracts` |
| **Commissions** | `proj_commission_summary_v1` | `commission_entries` |
| **Notifications** | `proj_notification_inbox_v1` | `notification_events` |

---

## Event flow

### Target pipeline (logical — phased implementation)

```
Business Command succeeds (SoT write)
    → append domain_event (idempotent)
        → enqueue projection_refresh_job (event_id, projection_ids[], tenant_id)
            → projection worker (SECURITY DEFINER upsert)
                → proj_* tables updated
                    → read adapter RPC serves UI
```

### Event → projection map (Sprint 2 subset)

| Domain event | Projections refreshed |
|--------------|----------------------|
| `OrderPlaced` | `proj_order_v1`, `proj_tenant_order_metrics_v1` |
| `OrderFulfilled` | `proj_order_v1`, order metrics, `proj_shipment_v1` (hook) |
| `OrderCancelled` | `proj_order_v1`, order metrics |
| `PaymentRecorded` | `proj_lab_receivable_v1`, receivable metrics |
| `PaymentAllocated` | `proj_lab_receivable_v1`, order invoice embed |
| `CreditStatusChanged` | `proj_lab_receivable_v1` |

### Refresh strategy

| Mode | When | Use |
|------|------|-----|
| **Incremental (row)** | After each domain event | Primary — upsert one grain row |
| **Invalidation signal** | Client post-write | Bust read-adapter cache only |
| **Scheduled sweep** | Every 5 min per tenant | Missed event recovery |
| **Full rebuild** | Deploy, parity fail, manual | `rebuild_projection_v1(tenant, projection_id)` |
| **On-demand read** | Detail drawer only | Transactional SoT — never list/dashboard |

### Retry strategy

| Setting | Value |
|---------|-------|
| Delivery | At-least-once |
| Idempotency key | `{tenant_id}:{event_type}:{entity_id}:{event_version}` |
| Max retries | 5 exponential backoff |
| Dead letter | `projection_refresh_dlq` (future table) + alert |
| Ordering | Per entity grain (order_id, lab_id) — serial per key |

### Failure recovery

1. Worker fails → job requeued with backoff
2. After max retries → DLQ + `hq_projection_meta_v1.last_error`
3. Scheduled sweep rebuilds stale projections
4. Parity script fails → flag OFF + optional auto-rebuild
5. **Never** fall back to mixing projection + transactional KPIs without `degraded: true` flag

### Versioning

- New grain or breaking field → new table `proj_*_v2` parallel run
- Shadow parity 14 days minimum
- Read adapters accept `p_version` default `1`
- Retire v1 after cert + 30-day parallel

---

## Shared projections (no per-screen tables)

### Order projection — single source for all order list KPIs

**`proj_order_v1`** (grain: one row per order)

| Consumer | Access pattern |
|----------|----------------|
| HQ OrdersPage | `read_orders_list_v1` |
| Admin Dashboard pending count | `read_tenant_order_metrics_v1` (derived) |
| Operations Center | metrics adapter |
| Executive / EFI | metrics + top-N adapters |
| Revenue Funnel | same projection, different filter |
| Agent portal | scoped adapter (RLS + agent filter) |
| Reporting | `rpt_orders_pipeline_v1` |
| AI / Analytics | batch export of projection |

**Do not create:** `hq_orders_summary`, `dashboard_orders`, `efi_orders`, `ops_orders`.

### Lab receivable projection — single source for collections

**`proj_lab_receivable_v1`** (grain: one row per lab)

| Consumer | Access pattern |
|----------|----------------|
| CollectionsPage | `read_lab_receivables_list_v1` |
| Credit & Risk | same adapter, risk filter |
| EFI collections section | metrics adapter |
| Admin Dashboard receivables KPI | `read_tenant_receivable_metrics_v1` |
| Agent collections | scoped adapter (0 staleness SLA) |
| Reporting | `rpt_collections_aging_v1` |

---

## Projection dependency diagram

```mermaid
flowchart TB
  subgraph SoT["Write SoT"]
    O[orders]
    OL[order_lines / order_items]
    AR[ar_credit_control]
    PAY[payments]
    INV[inventory]
    SHP[order_shipments]
    LAB[labs]
  end

  subgraph Events["Domain Events"]
    E1[OrderPlaced]
    E2[OrderFulfilled]
    E3[PaymentRecorded]
    E4[InventoryAdjusted]
    E5[ShipmentStatusChanged]
  end

  subgraph Core["Core Domain Projections v1"]
    PO[proj_order_v1]
    PLR[proj_lab_receivable_v1]
    PSS[proj_sku_stock_v1]
    PSH[proj_shipment_v1]
    PLP[proj_lab_profile_v1]
  end

  subgraph Derived["Derived KPI Projections"]
    POM[proj_tenant_order_metrics_v1]
    PRM[proj_tenant_receivable_metrics_v1]
    PDM[proj_tenant_dashboard_metrics_v1]
    PEM[proj_tenant_executive_metrics_v1]
  end

  subgraph Adapters["Read Adapters"]
    R1[read_orders_list_v1]
    R2[read_lab_receivables_list_v1]
    R3[read_tenant_dashboard_v1]
    R4[read_tenant_executive_v1]
  end

  O --> E1
  OL --> E1
  O --> E2
  AR --> E3
  PAY --> E3
  INV --> E4
  SHP --> E5

  E1 --> PO
  E2 --> PO
  E3 --> PLR
  E4 --> PSS
  E5 --> PSH
  LAB --> PLP

  PO --> POM
  PLR --> PRM
  POM --> PDM
  PRM --> PDM
  PSS --> PDM
  PSH --> PDM
  PDM --> PEM
  POM --> PEM
  PRM --> PEM

  PO --> R1
  PLR --> R2
  PDM --> R3
  PEM --> R4
```

**Dependency rules**

1. Derived projections **never** read SoT directly at query time — only core projections or events
2. UI **never** reads SoT for list/dashboard initial load when projection flag ON
3. Detail drawers may read SoT (single entity)
4. Acyclic: Derived → Core → Events → SoT

---

## Staleness & certification

| Projection class | Default SLA | Agent exception |
|------------------|-------------|-----------------|
| Core domain (order, lab receivable) | 60 s | Agent receivables: **0 s** (transactional adapter or sync refresh) |
| Tenant metrics | 90 s | — |
| Executive metrics | 180 s | — |

Certification: [Projection_Registry.md](../../../docs/Architecture/Projection_Registry.md), `verify-projection-parity.mjs` (planned), `08_Read_Model_Certification_Matrix.md` (planned).

---

## Feature flags (read adapters, not projections)

| Flag | Controls |
|------|----------|
| `VITE_READ_ADAPTER_ORDERS_V1` | `read_orders_list_v1` vs `getOrdersRead` |
| `VITE_READ_ADAPTER_RECEIVABLES_V1` | `read_lab_receivables_list_v1` vs `getCollectionsRead` |
| `VITE_READ_ADAPTER_DASHBOARD_V1` | `read_tenant_dashboard_v1` vs `getAdminDashboardRead` |
| `VITE_READ_ADAPTER_EXECUTIVE_V1` | `read_tenant_executive_v1` vs `getFounderSnapshotRead` |

Projection tables may exist while flags OFF (shadow mode).

---

## 5-year projection roadmap

### Phase 1 — Core domain projections (Year 1 Q3)

- `proj_order_v1`, `proj_lab_receivable_v1`
- Event pipeline v0 (client-triggered refresh + scheduled sweep)
- Parity certification

### Phase 2 — Domain metrics + Dashboard & Executive (Year 1 Q4) **← Sprint 2 Phase 2**

- `proj_tenant_order_metrics_v1`, `proj_tenant_receivable_metrics_v1` (rollup from Phase 1 core only)
- `proj_tenant_dashboard_metrics_v1`, `proj_tenant_executive_metrics_v1` (thin composites — copy only)
- Adapters: `read_tenant_dashboard_v1`, `read_tenant_executive_v1`
- **Replaces:** `getAdminDashboardRead` hot path, `get_founder_snapshot` RPC
- Shadow mode; flags default OFF

### Phase 2b — Inventory & Logistics core (Year 1 Q4–Q1 Y2)

- `proj_sku_stock_v1`, `proj_shipment_v1`
- Feed inventory/logistics buckets into dashboard composite refresh (not adapter read time)

### Phase 3 — Ops & EFI decomposition (Year 2 H1)

- `proj_tenant_ops_metrics_v1`; EFI reads executive composite only
- Deprecate Ops/EFI mega-loaders (TD-006)

### Phase 4 — Reporting, Forecasting, AI (Year 2–3)

- `rpt_*` views on projections only
- `proj_analytics_signals_v1` (batch)
- Reorder/demand forecast projections

### Phase 5 — Data warehouse & analytics (Year 3–5)

- CDC / ETL from projection tables to warehouse
- Multi-distributor consolidation projections
- White-label tenant analytics partition

---

## Sprint 2 Phase 1 — complete

1. Schema: `proj_order_v1`, `proj_lab_receivable_v1`, `hq_projection_meta_v1`
2. Adapters: `read_orders_list_v1`, `read_lab_receivables_list_v1`
3. Workers: `refresh_proj_order_row_v1`, `refresh_proj_lab_receivable_row_v1`, `rebuild_projection_v1`
4. Shadow mode; flags OFF; parity PASS on QA

---

## Sprint 2 Phase 2 — Dashboard & Executive (design approved)

**Goal:** Zero transactional scans on Admin Dashboard and Founder/Executive hot paths. Target ≤350 ms dashboard, ≤400 ms executive adapter read.

### Layering (mandatory — no monolithic KPI table)

| Layer | Table | Reads SoT at refresh? | Reads SoT at adapter? | Owns KPIs? |
|-------|-------|----------------------|----------------------|------------|
| Core | `proj_order_v1`, `proj_lab_receivable_v1` | Yes (workers) | No | No |
| Domain metrics | `proj_tenant_order_metrics_v1`, `proj_tenant_receivable_metrics_v1` | **Core only** | No | **Yes** |
| Composite | `proj_tenant_dashboard_metrics_v1` | Metrics + refresh-worker supplements | No | **No — copy only** |
| Executive | `proj_tenant_executive_metrics_v1` | Dashboard metrics + ops counts | No | **No — copy only** |

### Incremental refresh cascade

```
refresh_proj_order_row_v1
  → refresh_proj_tenant_order_metrics_v1(tenant)     [debounce 5s]
      → refresh_proj_tenant_dashboard_metrics_v1(tenant)   [debounce 10s]
          → refresh_proj_tenant_executive_metrics_v1(tenant) [debounce 15s]

refresh_proj_lab_receivable_row_v1
  → refresh_proj_tenant_receivable_metrics_v1(tenant)
      → refresh_proj_tenant_dashboard_metrics_v1(tenant)
          → refresh_proj_tenant_executive_metrics_v1(tenant)
```

Scheduled sweep (5 min) rebuilds stale metrics/composites when `hq_projection_meta_v1.as_of` exceeds SLA.

### `proj_tenant_order_metrics_v1`

- **Grain:** one row per `tenant_id`
- **PK:** `(tenant_id)`
- **Source:** `proj_order_v1` only (never `orders`, `order_items`, `order_lines` at read or rollup time)
- **Fields:** `todays_revenue`, `week_revenue`, `month_revenue`, `ytd_revenue`, `todays_orders_count`, `open_orders_count`, `fulfilled_orders_count`, `active_orders_count`, `total_sold_value_90d`, `top_labs_by_revenue` (jsonb top 5), `refreshed_at`
- **Rules:** Revenue = fulfilled orders only (Blueprint `computeRevenueMetrics` parity); amounts from `proj_order_v1.total_amount` + `item_count` embed

### `proj_tenant_receivable_metrics_v1`

- **Grain:** one row per `tenant_id`
- **PK:** `(tenant_id)`
- **Source:** `proj_lab_receivable_v1` only
- **Fields:** `total_outstanding`, `today_collections`, `overdue_amount`, `overdue_count`, `high_risk_count`, `at_risk_labs_count`, `refreshed_at`
- **Rules:** `total_outstanding` must match AR SoT exactly (financial reconciliation cert)

### `proj_tenant_dashboard_metrics_v1`

- **Grain:** one row per `tenant_id`
- **PK:** `(tenant_id)`
- **Source:** COPY from order + receivable metrics rows; inventory/visit supplements from **refresh worker only** (bounded SECURITY DEFINER scan at refresh — not adapter read)
- **Fields (denormalized):** all scalars needed by `normalizeAdminDashboardPayload` executive + summary blocks; `stock_stats` jsonb; `recent_visits_count`; `labs_at_credit_risk`; `refreshed_at`
- **Adapter:** `read_tenant_dashboard_v1` — single SELECT + shape to existing UI contract
- **Non-KPI widgets:** Recent visits list remains bounded secondary fetch (≤10 rows) or Phase 2b defer — **not on KPI hot path**

### `proj_tenant_executive_metrics_v1`

- **Grain:** one row per `tenant_id`
- **PK:** `(tenant_id)`
- **Source:** COPY from dashboard metrics + founder headline fields computed at refresh from core projections / bounded ops counts
- **Fields:** superset of dashboard scalars plus `get_founder_snapshot` contract: `revenue_today`, `cash_collected_today`, `outstanding_ar`, `orders_waiting`, `orders_delayed`, `critical_inventory_skus`, `collections_at_risk`, `inactive_agents_7d`, `labs_needing_attention`, `refreshed_at`
- **Adapter:** `read_tenant_executive_v1` — **replaces** `get_founder_snapshot` RPC on hot path
- **Replaces:** `get_founder_snapshot` transactional 6-table scan (QA timeout root cause)

### Read adapters (hot path — zero SoT)

| Adapter | Reads | Target p95 QA |
|---------|-------|---------------|
| `read_tenant_dashboard_v1` | `proj_tenant_dashboard_metrics_v1` (+ optional visits widget) | ≤350 ms |
| `read_tenant_executive_v1` | `proj_tenant_executive_metrics_v1` | ≤400 ms |

### Feature flags (shadow default OFF)

| Flag | Adapter |
|------|---------|
| `VITE_READ_ADAPTER_DASHBOARD_V1` | `read_tenant_dashboard_v1` |
| `VITE_READ_ADAPTER_EXECUTIVE_V1` | `read_tenant_executive_v1` |

### Certification (Phase 2)

| Script | Gate |
|--------|------|
| `verify-dashboard-projection-parity.mjs` | Dashboard KPIs vs transactional sample |
| `verify-executive-projection-parity.mjs` | Executive vs `get_founder_snapshot` + EFI scalars |
| `verify-projection-staleness.mjs` | Extended for metrics/composite SLAs |
| `measure-dashboard-projection-reads.mjs` | ≤350 ms / ≤400 ms |

See [Projection_Registry.md](../../../docs/Architecture/Projection_Registry.md) for registry IDs.

---

## Projection Operations Center (Sprint 2 Phase 2b — ops monitoring)

**Goal:** Operational visibility for projection health without modifying projections, adapters, or feature flags.

### Ten operational modules

| # | Module | Source | Output |
|---|--------|--------|--------|
| 1 | **Health Registry** | `hq_projection_meta_v1` + `projectionOpsCatalog.json` | Per-projection health record |
| 2 | **Refresh Timeline** | Meta `as_of` / `updated_at` + rebuild console history | Chronological refresh events |
| 3 | **Freshness Dashboard** | Meta age vs SLA | PASS/WARN/FAIL tiles |
| 4 | **Parity Dashboard** | Last cert run + inline deploy probes | Parity status per projection |
| 5 | **Failure Dashboard** | Meta `last_error` | Active failures + counts |
| 6 | **Rebuild Console** | `rebuild_projection_v1` RPC | Trigger cascade; record duration |
| 7 | **Shadow Monitoring** | Registry status + `VITE_READ_ADAPTER_*` | Shadow vs flag state |
| 8 | **Certification Report** | Aggregated cert script results | GO/WARN/NO-GO summary |
| 9 | **Drift Alerts** | Freshness + parity + failure composite | Alert list with severity |
| 10 | **Metrics API** | `projectionMetricsApi.js` | Single read-only aggregate |

### Per-projection health record (contract)

Every deployed projection exposes:

| Field | Source |
|-------|--------|
| `registryId` | Registry / catalog |
| `status` | `Projection_Dependencies.json` node status |
| `rowCount` | `hq_projection_meta_v1.row_count` |
| `freshness` | `now - as_of` (ms + human) |
| `lastRebuild` | `hq_projection_meta_v1.as_of` |
| `refreshDurationMs` | Rebuild console last run |
| `parityStatus` | Last cert / deploy probe |
| `failureCount` | Cumulative from ops storage; 1 if `last_error` set |
| `shadowStatus` | `shadow` + flags OFF = shadow mode |
| `featureFlagStatus` | Adapter flag name + ON/OFF |

### UI surface

- Route: `projectionOpsCenter` (Executive-only)
- Page: `ProjectionOperationsCenterPage.jsx`
- Read-only — no adapter flip, no SoT writes

### Verification scripts

| Script | Gate |
|--------|------|
| `verify-projection-ops-center.mjs` | Catalog completeness + meta readable + health record shape |
| `generate-projection-ops-report.mjs` | JSON/Markdown ops report for CI |
| `run-projection-ops-certification.mjs` | Orchestrates staleness + ops verify + report |

Spec: [Projection_Ops_Center.md](../../../docs/Architecture/Projection_Ops_Center.md)

---

## Do-not-break

- F1, F4: Order and AR SoT unchanged
- D1, D2: RLS on projections mirrors SoT visibility
- Projections are **read-only** for all authenticated roles
- Lab portal list reads remain lab-scoped transactional until Lab domain adapter exists

---

## Related documents

- [Projection_Registry.md](../../../docs/Architecture/Projection_Registry.md)
- [Projection_Ops_Center.md](../../../docs/Architecture/Projection_Ops_Center.md)
- [16_Certification_Framework.md](./16_Certification_Framework.md)
- [Technical_Debt_Register.md](../../../docs/Architecture/Technical_Debt_Register.md)
- Sprint 2 plan (conversation / QA docs) — **must rename** before implementation
