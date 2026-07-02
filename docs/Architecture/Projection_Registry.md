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
| PRJ-LAB-PROFILE-v1 | `proj_lab_profile_v1` | Laboratory | planned |
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

### PRJ-ORD-METRICS-v1 — `proj_tenant_order_metrics_v1`

| Attribute | Value |
|-----------|-------|
| **Business domain** | Orders |
| **Source-of-truth objects** | **Derived from** `proj_order_v1` only |
| **Projection grain** | One row per `tenant_id` (+ optional `as_of` window) |
| **Primary keys** | `(tenant_id, metric_window)` |
| **Refresh trigger** | Any `proj_order_v1` refresh; scheduled rollup |
| **Consumers** | Dashboard, Ops snapshot, EFI orders section |
| **Read adapter** | Embedded in `read_tenant_dashboard_v1` (Phase 3) |
| **Performance target** | ≤50 ms (single row) |
| **Version** | v1 |
| **Owner** | Orders domain |
| **Certification script** | `verify-projection-parity.mjs` (metrics vs transactional sample) |
| **Staleness SLA** | 90 s |

**Sprint 2:** Not implemented — compute from `proj_order_v1` in adapter if needed.

---

### PRJ-COL-METRICS-v1 — `proj_tenant_receivable_metrics_v1`

| Attribute | Value |
|-----------|-------|
| **Business domain** | Collections |
| **Source-of-truth objects** | **Derived from** `proj_lab_receivable_v1` |
| **Projection grain** | One row per `tenant_id` |
| **Primary keys** | `(tenant_id)` |
| **Refresh trigger** | Any `proj_lab_receivable_v1` refresh |
| **Consumers** | Dashboard, EFI, Ops financial panel |
| **Read adapter** | Phase 3 dashboard adapter |
| **Performance target** | ≤50 ms |
| **Version** | v1 |
| **Owner** | Collections domain |
| **Certification script** | `verify-projection-parity.mjs`; outstanding must match AR SoT exactly |
| **Staleness SLA** | 90 s |

---

## Phase 2 — Inventory & Logistics (planned)

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

## Phase 3 — KPI projections (planned)

### PRJ-DSH-METRICS-v1 — `proj_tenant_dashboard_metrics_v1`

| Domain | Executive KPI (derived) |
| SoT | `proj_order_v1`, `proj_lab_receivable_v1`, `proj_sku_stock_v1`, `proj_shipment_v1` |
| Grain | One row per `tenant_id` |
| Refresh | Any upstream projection refresh + 5 min sweep |
| Consumers | Admin Dashboard only (via `read_tenant_dashboard_v1`) |
| Target | ≤350 ms |
| Cert | `verify-projection-parity.mjs` + perf cert |
| Staleness | 90 s |

### PRJ-EXE-METRICS-v1 — `proj_tenant_executive_metrics_v1`

| Domain | Executive KPI |
| SoT | All Phase 1–3 core + metric projections |
| Grain | One row per `tenant_id` |
| Consumers | EFI, Founder, Executive Control Tower |
| Target | ≤400 ms |
| Cert | `verify-executive-financial-intelligence.mjs` |
| Staleness | 180 s |

### PRJ-OPS-METRICS-v1 — `proj_tenant_ops_metrics_v1`

| Domain | Operations KPI |
| SoT | Derived + ops tables (counts only) |
| Consumers | Operations Center |
| Target | ≤400 ms |
| Staleness | 60 s |

---

## Phase 4+ — Growth & platform (planned)

### PRJ-LAB-PROFILE-v1 — `proj_lab_profile_v1`

Laboratory domain — lab master + credit embed for catalog/ordering context.

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
| `read_tenant_dashboard_v1` | dashboard + metric projections | `getAdminDashboardRead` |
| `read_tenant_executive_v1` | executive metrics | EFI mega-loader |
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

---

## Shared projection matrix

| Need | Use | Do not create |
|------|-----|---------------|
| Order list | `proj_order_v1` | per-screen order tables |
| Order KPIs | `proj_tenant_order_metrics_v1` | re-scan `orders` |
| Lab AR grid | `proj_lab_receivable_v1` | `hq_collections_summary` |
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
| 2026-07-02 | Initial registry — domain-driven v2; rename Sprint 2 screen-oriented names |
