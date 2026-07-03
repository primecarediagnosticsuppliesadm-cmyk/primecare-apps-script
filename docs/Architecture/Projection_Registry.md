# PrimeCare Projection Registry

**Authoritative catalog of domain projections — not screen-specific read models.**

Architecture: [18_Domain_Projection_Architecture.md](../primecare-portal/docs/PrimeCare_System_Blueprint/18_Domain_Projection_Architecture.md)

**Legend**

| Field | Meaning |
|-------|---------|
| **Status** | `planned` \| `shadow` \| `active` \| `deprecated` |
| **Staleness SLA** | Max acceptable lag before UI badge / agent fallback |

---

## Registry index

| Registry ID | Projection Name | Domain | Status |
|-------------|-----------------|--------|--------|
| PRJ-ORD-ORDER-v1 | `proj_order_v1` | Orders | shadow |
| PRJ-COL-LAB-v1 | `proj_lab_receivable_v1` | Collections | shadow |
| PRJ-ORD-METRICS-v1 | `proj_tenant_order_metrics_v1` | Orders | planned |
| PRJ-COL-METRICS-v1 | `proj_tenant_receivable_metrics_v1` | Collections | planned |
| PRJ-INV-SKU-v1 | `proj_sku_stock_v1` | Inventory | planned |
| PRJ-LOG-SHIP-v1 | `proj_shipment_v1` | Logistics | planned |
| PRJ-LAB-PROFILE-v1 | `proj_lab_profile_v1` | Laboratory | shadow |
| PRJ-DIST-PORT-v1 | `proj_distributor_portfolio_v1` | Distributor | planned |
| PRJ-DSH-METRICS-v1 | `proj_tenant_dashboard_metrics_v1` | Executive KPI | planned |
| PRJ-EXE-METRICS-v1 | `proj_tenant_executive_metrics_v1` | Executive KPI | planned |
| PRJ-OPS-METRICS-v1 | `proj_tenant_ops_metrics_v1` | Operations KPI | planned |
| PRJ-NTF-INBOX-v1 | `proj_notification_inbox_v1` | Notifications | planned |
| PRJ-CTR-CONTRACT-v1 | `proj_lab_contract_v1` | Contracts | planned |
| PRJ-COM-SUMMARY-v1 | `proj_commission_summary_v1` | Commissions | planned |

---

## Phase 1 — Sprint 2 (active planning)

### PRJ-ORD-ORDER-v1 — `proj_order_v1`

| Attribute | Value |
|-----------|-------|
| **Business domain** | Orders |
| **Source-of-truth objects** | `orders`, `order_items`, `order_lines`, `labs` (name), `invoices` (status embed) |
| **Projection grain** | One row per `(tenant_id, order_id)` |
| **Primary keys** | PK: `id` (uuid); Business: `(tenant_id, order_id)`; FK: `order_uuid` → `orders.id` |
| **Refresh trigger** | `OrderPlaced`, `OrderFulfilled`, `OrderCancelled`, `PaymentAllocated` (invoice badge), `InvoiceGenerated` |
| **Consumers** | HQ Orders, Dashboard (via metrics), Ops Center, EFI (via metrics), Revenue Funnel, Agent (scoped), Reporting, AI export |
| **Read adapter** | `read_orders_list_v1` |
| **Performance target** | ≤350 ms cold (QA/PERF) |
| **Version** | v1 |
| **Owner** | Orders domain |
| **Certification script** | `verify-projection-parity.mjs` (orders slice); extends `verify-hq-list-detail-parity.mjs` |
| **Staleness SLA** | 60 s (HQ); detail drawer uses SoT |

**Replaces (deprecated name):** `hq_orders_summary_v1`

---

### PRJ-COL-LAB-v1 — `proj_lab_receivable_v1`

| Attribute | Value |
|-----------|-------|
| **Business domain** | Collections |
| **Source-of-truth objects** | `ar_credit_control`, `payments`, `v_labs_credit`, `lab_ownership` (agent) |
| **Projection grain** | One row per `(tenant_id, lab_id)` |
| **Primary keys** | PK: `id`; Business: `(tenant_id, lab_id)` |
| **Refresh trigger** | `PaymentRecorded`, `PaymentAllocated`, `OrderFulfilled` (AR bump), `CreditStatusChanged`, `LabOnboarded` |
| **Consumers** | CollectionsPage, Credit & Risk, EFI collections, Dashboard receivables KPI, Agent collections, Reporting |
| **Read adapter** | `read_lab_receivables_list_v1` |
| **Performance target** | ≤300 ms cold |
| **Version** | v1 |
| **Owner** | Collections / Finance domain |
| **Certification script** | `verify-projection-parity.mjs` (receivables slice); `verify-financial-reconciliation.mjs` (outstanding exact) |
| **Staleness SLA** | 60 s HQ; **0 s agent** (transactional fallback or sync refresh) |

**Replaces (deprecated name):** `hq_collections_summary_v1`

---

## Phase 2 — Sprint 2 Dashboard & Executive (design — Sprint 2 Phase 2)

### PRJ-ORD-METRICS-v1 — `proj_tenant_order_metrics_v1`

| Attribute | Value |
|-----------|-------|
| **Business domain** | Orders |
| **Source-of-truth objects** | **Derived from** `proj_order_v1` only |
| **Projection grain** | One row per `tenant_id` |
| **Primary keys** | `(tenant_id)` |
| **Refresh trigger** | Any `proj_order_v1` refresh; debounced rollup; 5 min sweep |
| **Worker** | `refresh_proj_tenant_order_metrics_v1` |
| **Consumers** | Dashboard composite, Executive composite, Ops (future) |
| **Read adapter** | Embedded in composites — no standalone list adapter |
| **Performance target** | ≤50 ms rollup refresh; ≤30 ms single-row read |
| **Version** | v1 |
| **Owner** | Orders domain |
| **Certification script** | `verify-dashboard-projection-parity.mjs` (order metrics slice) |
| **Staleness SLA** | 90 s |

---

### PRJ-COL-METRICS-v1 — `proj_tenant_receivable_metrics_v1`

| Attribute | Value |
|-----------|-------|
| **Business domain** | Collections |
| **Source-of-truth objects** | **Derived from** `proj_lab_receivable_v1` |
| **Projection grain** | One row per `tenant_id` |
| **Primary keys** | `(tenant_id)` |
| **Refresh trigger** | Any `proj_lab_receivable_v1` refresh; debounced rollup |
| **Worker** | `refresh_proj_tenant_receivable_metrics_v1` |
| **Consumers** | Dashboard composite, Executive composite |
| **Performance target** | ≤50 ms |
| **Owner** | Collections domain |
| **Certification script** | `verify-dashboard-projection-parity.mjs` (receivable slice); outstanding exact |
| **Staleness SLA** | 90 s |

---

### PRJ-DSH-METRICS-v1 — `proj_tenant_dashboard_metrics_v1`

| Attribute | Value |
|-----------|-------|
| **Business domain** | Executive KPI (composite — **owns no canonical KPIs**) |
| **Source-of-truth objects** | `proj_tenant_order_metrics_v1`, `proj_tenant_receivable_metrics_v1`; inventory/visit supplements at **refresh worker only** |
| **Projection grain** | One row per `tenant_id` |
| **Primary keys** | `(tenant_id)` |
| **Refresh trigger** | Upstream metrics refresh; debounced 10 s |
| **Worker** | `refresh_proj_tenant_dashboard_metrics_v1` |
| **Consumers** | Admin Dashboard only |
| **Read adapter** | `read_tenant_dashboard_v1` |
| **Replaces** | `getAdminDashboardRead` / `fetchAdminDashboardBoundedSourceRows` hot path |
| **Performance target** | ≤350 ms cold adapter (QA) |
| **Feature flag** | `VITE_READ_ADAPTER_DASHBOARD_V1` (default OFF) |
| **Certification script** | `verify-dashboard-projection-parity.mjs`, `measure-dashboard-projection-reads.mjs` |
| **Staleness SLA** | 90 s |
| **Status** | design |

---

### PRJ-EXE-METRICS-v1 — `proj_tenant_executive_metrics_v1`

| Attribute | Value |
|-----------|-------|
| **Business domain** | Executive KPI (composite — **owns no canonical KPIs**) |
| **Source-of-truth objects** | `proj_tenant_dashboard_metrics_v1` + bounded ops counts at refresh |
| **Projection grain** | One row per `tenant_id` |
| **Primary keys** | `(tenant_id)` |
| **Refresh trigger** | Dashboard metrics refresh; debounced 15 s |
| **Worker** | `refresh_proj_tenant_executive_metrics_v1` |
| **Consumers** | Executive Control Tower, Ops founder panel, EFI sidebar |
| **Read adapter** | `read_tenant_executive_v1` |
| **Replaces** | `get_founder_snapshot` RPC (QA timeout root cause) |
| **Performance target** | ≤400 ms cold adapter (QA) |
| **Feature flag** | `VITE_READ_ADAPTER_EXECUTIVE_V1` (default OFF) |
| **Certification script** | `verify-executive-projection-parity.mjs`, `measure-dashboard-projection-reads.mjs` |
| **Staleness SLA** | 180 s |
| **Status** | design |

---

## Phase 2b — Inventory & Logistics (planned)

### PRJ-INV-SKU-v1 — `proj_sku_stock_v1`

| Attribute | Value |
|-----------|-------|
| **Domain** | Inventory |
| **SoT** | `inventory`, `inventory_ledger`, `products` |
| **Grain** | `(tenant_id, product_id)` [future: + `warehouse_id`] |
| **PK** | `(tenant_id, product_id)` |
| **Refresh trigger** | `InventoryAdjusted`, `OrderFulfilled`, PO receive |
| **Consumers** | StockPage, Dashboard inventory, EFI, reorder forecast input |
| **Performance target** | ≤300 ms list page |
| **Owner** | Inventory |
| **Cert script** | `verify-inventory-dashboard-kpi.mjs` |
| **Staleness SLA** | 120 s |

### PRJ-LOG-SHIP-v1 — `proj_shipment_v1`

| Attribute | Value |
|-----------|-------|
| **Domain** | Logistics |
| **SoT** | `order_shipments` |
| **Grain** | `(tenant_id, shipment_id)` |
| **PK** | `(tenant_id, shipment_id)` |
| **Refresh trigger** | `ShipmentCreated`, `ShipmentDelivered`, `RouteCompleted` |
| **Consumers** | Logistics page, Dashboard widget, EFI logistics |
| **Performance target** | ≤400 ms |
| **Owner** | Logistics |
| **Cert script** | `verify-logistics-dispatch-flow.mjs` |
| **Staleness SLA** | 60 s |

---

## Phase 3 — Ops KPI (planned)

### PRJ-DSH-METRICS-v1 — moved to Phase 2 above

### PRJ-EXE-METRICS-v1 — moved to Phase 2 above

### PRJ-OPS-METRICS-v1 — `proj_tenant_ops_metrics_v1`

| Domain | Operations KPI |
| SoT | Derived + ops tables (counts only) |
| Consumers | Operations Center |
| Target | ≤400 ms |
| Staleness | 60 s |

---

## Phase 4+ — Growth & platform (planned)

### PRJ-LAB-PROFILE-v1 — `proj_lab_profile_v1`

| Attribute | Value |
|-----------|-------|
| **Business domain** | Laboratory |
| **Source-of-truth objects** | `labs`, `lab_ownership`, `lab_qualifications`, tenant/profile display fields |
| **Projection grain** | One row per `(tenant_id, lab_id)` |
| **Primary keys** | PK: `id`; Business: `(tenant_id, lab_id)` |
| **Refresh trigger** | `LabOnboarded`, lab profile update, ordering mode update, ownership assignment, qualification update; scheduled sweep |
| **Consumers** | LabsPage, Operations lab directory, Agent lab list, Qualification review, global search, Distributor OS lab list |
| **Read adapter** | `read_labs_list_v1` |
| **Adapter composition** | `proj_lab_profile_v1` + `proj_lab_receivable_v1` for current `v_labs_credit` UI contract |
| **Performance target** | ≤300 ms cold adapter |
| **Version** | v1 |
| **Owner** | Laboratory domain |
| **Certification script** | `verify-labs-projection-parity.mjs`; `verify-hq-rls-reads.mjs` projection slice |
| **Staleness SLA** | 60 s |

`proj_lab_profile_v1` must not store invoices, payments, receivables, allocations, commissions, order status, or finance calculations. Receivable fields remain owned by `proj_lab_receivable_v1`.

### PRJ-DIST-PORT-v1 — `proj_distributor_portfolio_v1`

Distributor domain — cross-tenant rollup for Distributor OS (executive scope).

### PRJ-NTF-INBOX-v1 — `proj_notification_inbox_v1`

Notifications — user-scoped unread counts.

### PRJ-CTR-CONTRACT-v1 — `proj_lab_contract_v1`

Contracts — active contract terms per lab.

### PRJ-COM-SUMMARY-v1 — `proj_commission_summary_v1`

Commissions — agent/distributor commission rollups.

---

## Read adapters (not projections)

| Adapter | Projection(s) | Replaces |
|---------|---------------|----------|
| `read_orders_list_v1` | `proj_order_v1` | `getOrdersRead` |
| `read_lab_receivables_list_v1` | `proj_lab_receivable_v1` | `getCollectionsRead` |
| `read_labs_list_v1` | `proj_lab_profile_v1` + `proj_lab_receivable_v1` | `getLabsCredit` |
| `read_tenant_dashboard_v1` | `proj_tenant_dashboard_metrics_v1` | `getAdminDashboardRead` |
| `read_tenant_executive_v1` | `proj_tenant_executive_metrics_v1` | `get_founder_snapshot` / `getFounderSnapshotRead` |
| `read_tenant_ops_v1` | ops metrics | Ops 12-read bundle |

Adapters shape JSON for UI contracts; **they do not store data**.

---

## Metadata table (all phases)

**`hq_projection_meta_v1`**

| Column | Purpose |
|--------|---------|
| `tenant_id` | Partition |
| `registry_id` | e.g. `PRJ-ORD-ORDER-v1` |
| `as_of` | Last successful refresh |
| `row_count` | Sanity |
| `model_version` | v1 |
| `last_error` | Ops debug |

**Ops consumer:** Projection Operations Center reads this table via `projectionMetricsApi.js`. See [Projection_Ops_Center.md](./Projection_Ops_Center.md).

---

## Projection Operations Center (monitoring)

| Registry ID | Ops module | Health record |
|-------------|------------|---------------|
| All deployed projections | Health Registry | 10-field contract per row |
| All with `as_of` | Freshness Dashboard | SLA compare |
| Phase 1–2 deployed | Parity Dashboard | Cert script mapping |
| Any `last_error` | Failure Dashboard | Alert + count |
| All rebuildable | Rebuild Console | `rebuild_projection_v1` |
| All shadow/design | Shadow Monitoring | Flag OFF default |
| Full suite | Certification Report | Aggregated GO/WARN/NO-GO |
| Composite signals | Drift Alerts | Freshness + parity + failure |

**UI route:** `projectionOpsCenter` (Executive-only)  
**Scripts:** `verify-projection-ops-center.mjs`, `generate-projection-ops-report.mjs`, `run-projection-ops-certification.mjs`

---

## Shared projection matrix

| Need | Use | Do not create |
|------|-----|---------------|
| Order list | `proj_order_v1` | per-screen order tables |
| Order KPIs | `proj_tenant_order_metrics_v1` | re-scan `orders` |
| Lab AR grid | `proj_lab_receivable_v1` | `hq_collections_summary` |
| Lab directory + profile list | `proj_lab_profile_v1` composed with `proj_lab_receivable_v1` by `read_labs_list_v1` | `proj_lab_credit_v1`, per-screen Labs tables, receivable fields in lab profile |
| Receivable KPIs | `proj_tenant_receivable_metrics_v1` | re-sum AR in UI |
| Dashboard | metric projections | `hq_dashboard_metrics` scanning SoT |
| EFI | `read_tenant_executive_v1` | Founder bundle SoT scan |
| CSV export | `rpt_*` on projections | transactional export |

---

## Certification requirements (all active projections)

Before `active` status:

1. `verify-projection-parity.mjs` PASS (sampled fields per registry entry)
2. `verify-projection-staleness.mjs` PASS
3. `verify-hq-rls-reads.mjs` extended for projection tables
4. Performance matrix target met
5. 7-day shadow mode with feature flag OFF default

---

## Change log (registry)

| Date | Change |
|------|--------|
| 2026-07-02 | Projection Operations Center — ops monitoring modules + health record contract |
| 2026-07-02 | Sprint 2 Phase 2 design — domain metrics + dashboard/executive composites; registry workers/adapters |
| 2026-07-02 | Initial registry — domain-driven v2; rename Sprint 2 screen-oriented names |
