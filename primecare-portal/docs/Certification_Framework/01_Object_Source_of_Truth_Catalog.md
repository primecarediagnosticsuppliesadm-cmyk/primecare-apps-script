# 01 — Object Source-of-Truth Catalog

**Every Year-1 O2C object with SoT, lifecycle, APIs, screens, verify scripts, dependencies, and known gaps.**

Blueprint refs: [01_Database_Schema.md](../PrimeCare_System_Blueprint/01_Database_Schema.md), [00_System_Architecture.md](../PrimeCare_System_Blueprint/00_System_Architecture.md)

---

## Catalog index

| Object | Module | Primary table |
|--------|--------|---------------|
| [Tenant](#tenant) | Operations | `tenants` |
| [Profile](#profile) | Operations | `profiles` |
| [Lab](#lab) | Labs | `labs` |
| [Lab ownership](#lab-ownership) | Operations | `lab_ownership` |
| [Order](#order) | Orders | `orders` |
| [Order lines](#order-lines) | Orders | `order_items` / `order_lines` |
| [Invoice](#invoice) | Finance | `invoices` |
| [Invoice line items](#invoice-line-items) | Finance | `invoice_line_items` |
| [Payment](#payment) | Finance | `payments` |
| [Payment allocation](#payment-allocation) | Finance | `invoice_payment_allocations` |
| [AR credit control](#ar-credit-control) | Finance | `ar_credit_control` |
| [Shipment](#shipment) | Logistics | `order_shipments` |
| [Delivery route](#delivery-route) | Logistics | `delivery_routes` |
| [Courier](#courier) | Logistics | `logistics_couriers` |
| [Inventory](#inventory) | Inventory | `inventory` |
| [Inventory ledger](#inventory-ledger) | Inventory | `inventory_ledger` |
| [Product](#product) | Catalog | `products` |
| [Purchase order](#purchase-order) | Procurement | `purchase_orders` |
| [Qualification](#qualification) | Growth | `lab_qualifications` |
| [Lab contract](#lab-contract) | Growth | `lab_contracts` |
| [Commission entry](#commission-entry) | Growth | `commission_entries` |

---

## Tenant

| Field | Value |
|-------|-------|
| **Source of truth** | `public.tenants` — PK `id`, business key `tenant_code` |
| **Lifecycle** | `active` → `suspended` / `archived` (ops-managed) |
| **APIs** | `getOperationsDistributorsRead` (read); executive provisioning writes |
| **Screens** | TenantManagementPage, DistributorOsPage, OperationsCenterAdminPage |
| **Verify scripts** | `verify-hq-rls-reads.mjs`, `verify-operations-center-admin-flow.mjs` |
| **Dependencies** | None (root entity) |
| **Known gaps** | GAP-BP-003: legacy `tenant_id` text vs uuid in some rows |

---

## Profile

| Field | Value |
|-------|-------|
| **Source of truth** | `public.profiles` — PK `user_id` → `auth.users` |
| **Lifecycle** | provisioned → `active` / `inactive`; role + tenant + optional lab/agent scope |
| **APIs** | `getOperationsPlatformUsersRead`, `createOperationsPlatformUserWrite`, `updateOperationsPlatformUserWrite` |
| **Screens** | OperationsCenterAdminPage, AccessAuditPage, LoginPage |
| **Verify scripts** | `verify-operations-center-admin-flow.mjs`, `verify-provisioning-role-guard.mjs`, `verify-operations-user-directory-integrity.mjs` |
| **Dependencies** | Tenant |
| **Known gaps** | Legacy `users` table backfill only — not SoT |

---

## Lab

| Field | Value |
|-------|-------|
| **Source of truth** | `public.labs` — business key `(tenant_id, lab_id)` |
| **Lifecycle** | `active` / `suspended` / `credit_hold`; **ordering_mode**: `hq_managed`, `hybrid`, `self_service` |
| **APIs** | `createLabWrite`, `getLabsCredit`, `updateLabOrderingModeWrite`, `getLabOrderingContextRead` |
| **Screens** | LabsPage, LabOrderingPage, CollectionsPage, OperationalLabDrawer |
| **Verify scripts** | `verify-labs-admin-flow.mjs`, `verify-lab-ordering-flow.mjs`, `verify-create-lab-ar-rls.mjs`, `verify-credit-risk-admin-flow.mjs` |
| **Dependencies** | Tenant, Profile (agent assignment), AR row on create |
| **Known gaps** | GAP-BP-006 mitigated — `ordering_mode` column; preferred delivery day Phase 4 |

---

## Lab ownership

| Field | Value |
|-------|-------|
| **Source of truth** | `public.lab_ownership` — one ACTIVE per `(tenant_id, lab_id)` |
| **APIs** | `getOperationsLabAssignmentsRead`, `updateLabAgentAssignmentWrite` |
| **Screens** | OperationsCenterAdminPage, LabsPage drawer |
| **Verify scripts** | `verify-operations-center-admin-flow.mjs`, `verify-agent-collections-ownership-filter.mjs` |
| **Dependencies** | Lab, Agent profile |
| **Known gaps** | Agent scoped reads may return zero rows when unassigned (by design) |

---

## Order

| Field | Value |
|-------|-------|
| **Source of truth** | `public.orders` — **financial SoT**; business key `order_id`; UNIQUE `(tenant_id, order_id)` |
| **Lifecycle** | `Placed` → `Processing` → `Fulfilled` \| `Cancelled` (terminal) |
| **APIs** | `createOrderWrite` (RPC `create_lab_order`), `updateOrderStatusWrite`, `getOrdersRead`, `getLabOrderDetailsRead`, `getLabRecentOrdersRead` |
| **Screens** | OrdersPage, LabOrderingPage, LogisticsDeliveryPage (read-only link) |
| **Verify scripts** | `verify-orders-admin-flow.mjs`, `verify-lab-ordering-flow.mjs`, `verify-lab-orders-sync-stabilization.mjs`, `verify-transaction-integrity-rpcs.mjs`, `verify-delivery-charge-policy.mjs`, `verify-primecare-production-golden-path.mjs` |
| **Dependencies** | Lab, Product/catalog lines, ordering mode gate, credit eligibility |
| **Known gaps** | GAP-BP-002 dual `order_items`/`order_lines`; GAP-BP-015/016 idempotency client window 90s; server RPC has no TTL; GAP-BP-004 delivery columns env drift |

**Fulfill side effects (idempotent flags):** inventory ORDER_OUT → AR bump → invoice RPC → shipment create.

---

## Order lines

| Field | Value |
|-------|-------|
| **Source of truth** | `order_items` (portal) and/or `order_lines` (legacy) — detail reads merge both |
| **Lifecycle** | Created with order; immutable after fulfill (pilot) |
| **APIs** | Embedded in `getOrderDetailsRead`, `getLabOrderDetailsRead`, `fetchOrderUnitCountsForOrders` |
| **Screens** | OrdersPage, LabOrderingPage track drawer |
| **Verify scripts** | `verify-orders-admin-flow.mjs` (reconcile.header_lines), `verify-lab-ordering-flow.mjs` (hq_item_count) |
| **Dependencies** | Order, Product/SKU |
| **Known gaps** | GAP-BP-002 — HQ item count must use business ID + UUID lookup keys |

---

## Invoice

| Field | Value |
|-------|-------|
| **Source of truth** | `public.invoices` + `invoice_line_items` (PDF uses frozen lines only) |
| **Lifecycle** | `draft` → finalize (PDF) → `sent` → `partially_paid` → `paid` \| `cancelled` |
| **APIs** | `createInvoiceForFulfilledOrderWrite` (RPC), `finalizeInvoiceForOrderPayment`, `generateInvoicePdf` |
| **Screens** | CollectionsPage, LabInvoiceCenterPage, OrdersPage payment drawer |
| **Verify scripts** | `verify-invoice-phase1.mjs` … `verify-invoice-phase5.mjs`, `verify-invoice-account-status.mjs`, `verify-financial-reconciliation.mjs`, `verify-primecare-production-golden-path.mjs` |
| **Dependencies** | Fulfilled order |
| **Known gaps** | Draft not allocatable; delivery charge excluded from subtotal (Phase 3A) |

---

## Invoice line items

| Field | Value |
|-------|-------|
| **Source of truth** | `public.invoice_line_items` |
| **Lifecycle** | Created with invoice; immutable after PDF |
| **APIs** | Invoice RPC + PDF generation |
| **Screens** | LabInvoiceCenterPage, CollectionsPage |
| **Verify scripts** | `verify-invoice-phase3.mjs` |
| **Dependencies** | Invoice, order line snapshot |
| **Known gaps** | None critical |

---

## Payment

| Field | Value |
|-------|-------|
| **Source of truth** | `public.payments` — **no** `invoice_id` column (junction only) |
| **Lifecycle** | recorded → allocated (partial or full) → AR reduced |
| **APIs** | `createPaymentWrite` (RPC `post_collection_payment`) |
| **Screens** | CollectionsPage, OrdersPage, LabAccount views |
| **Verify scripts** | `verify-financial-reconciliation.mjs`, `verify-partial-payment-sync.mjs`, `verify-payment-allocation-flow.mjs`, `verify-order-payment-sync.mjs`, `verify-bounded-reads.mjs` |
| **Dependencies** | Lab, optional order/invoice linkage |
| **Known gaps** | Compensation rollback on allocation failure; legacy unallocated payments on non-golden labs |

---

## Payment allocation

| Field | Value |
|-------|-------|
| **Source of truth** | `public.invoice_payment_allocations` |
| **Lifecycle** | created per allocate RPC; drives invoice open balance |
| **APIs** | `allocatePaymentToInvoiceWrite` (RPC), auto via `createPaymentWrite` |
| **Screens** | CollectionsPage, OrdersPage |
| **Verify scripts** | `verify-invoice-phase5.mjs`, `verify-payment-allocation-flow.mjs`, `verify-partial-payment-sync.mjs` |
| **Dependencies** | Payment, finalized invoice |
| **Known gaps** | Over-alloc guards in RPC — do not bypass from UI |

---

## AR credit control

| Field | Value |
|-------|-------|
| **Source of truth** | `public.ar_credit_control.outstanding` |
| **Lifecycle** | bumped on fulfill; reduced on payment; collections SoT |
| **APIs** | `getCollectionsRead`, AR RPCs inside payment/fulfill |
| **Screens** | CollectionsPage, Credit & Risk (risk), ExecutiveFinancialIntelligencePage |
| **Verify scripts** | `verify-financial-reconciliation.mjs`, `verify-collection-inconsistencies.mjs`, `verify-ar-reconcile.mjs`, `verify-credit-risk-admin-flow.mjs` |
| **Dependencies** | Lab |
| **Known gaps** | 26 legacy `ar_row_no_activity` on non-golden labs — accept for pilot |

---

## Shipment

| Field | Value |
|-------|-------|
| **Source of truth** | `public.order_shipments` — **operational** (not financial order status) |
| **Lifecycle** | `ready` → `assigned` → `out_for_delivery` → `delivered` \| `cancelled` |
| **APIs** | `logisticsSupabaseApi` — create/read/transition; fulfill hook |
| **Screens** | LogisticsDeliveryPage, OrdersPage logistics panel |
| **Verify scripts** | `verify-logistics-dispatch-flow.mjs`, `verify-delivery-charge-policy.mjs` |
| **Dependencies** | Fulfilled order; delivery snapshot on order |
| **Known gaps** | GAP-BP-004 PGRST204 if delivery columns missing; DC-40 no fulfilled shipments with charge>0 in QA |

---

## Delivery route

| Field | Value |
|-------|-------|
| **Source of truth** | `public.delivery_routes` + route stops |
| **Lifecycle** | planned → in_progress → `completed` |
| **APIs** | `logisticsRouteEngine` + `logisticsSupabaseApi` |
| **Screens** | LogisticsDeliveryPage (Route Planning tab) |
| **Verify scripts** | `verify-logistics-dispatch-flow.mjs` (Phase 4 live) |
| **Dependencies** | Shipment, Courier, Warehouse |
| **Known gaps** | GAP-BP-014 — Phase 4 additive only |

---

## Courier

| Field | Value |
|-------|-------|
| **Source of truth** | `public.logistics_couriers` |
| **Lifecycle** | active / inactive |
| **APIs** | `logisticsSupabaseApi` courier CRUD |
| **Screens** | LogisticsDeliveryPage |
| **Verify scripts** | `verify-logistics-dispatch-flow.mjs` |
| **Dependencies** | Tenant |
| **Known gaps** | None critical |

---

## Inventory

| Field | Value |
|-------|-------|
| **Source of truth** | `public.inventory.current_stock` |
| **Lifecycle** | adjusted via ledger writes; fulfill decrements ORDER_OUT |
| **APIs** | `getStockDashboard`, `getInventoryHealthRead`, `createInventoryLedgerWrite` |
| **Screens** | StockPage, MasterCatalogPage, InventoryHealthPage |
| **Verify scripts** | `verify-inventory-dashboard-kpi.mjs`, `verify-inventory-reconciliation.mjs`, `verify-procurement-inventory-flow.mjs`, `verify-orders-admin-flow.mjs` (fulfill.ledger) |
| **Dependencies** | Product, Tenant |
| **Known gaps** | GAP-BP-009 catalog create seeds inventory — deferred |

---

## Inventory ledger

| Field | Value |
|-------|-------|
| **Source of truth** | `public.inventory_ledger` |
| **Lifecycle** | append-only movement rows (ORDER_OUT, RECEIVE, ADJUST, …) |
| **APIs** | `getInventoryLedgerRead`, `createInventoryLedgerWrite` |
| **Screens** | InventoryLedgerPage, StockPage movements |
| **Verify scripts** | `verify-inventory-reconciliation.mjs`, `verify-orders-admin-flow.mjs` |
| **Dependencies** | Inventory, Order (for ORDER_OUT) |
| **Known gaps** | None critical |

---

## Product

| Field | Value |
|-------|-------|
| **Source of truth** | `public.products` — `cost_price`, `selling_price` authoritative for HQ |
| **Lifecycle** | created → active/inactive |
| **APIs** | `createHqProductWrite`, `updateHqProductWrite`, `getTenantActiveProductsRead` |
| **Screens** | MasterCatalogPage, LabOrderingPage (via `v_lab_catalog` + enrichment) |
| **Verify scripts** | `verify-inventory-dashboard-kpi.mjs`, `verify-procurement-inventory-flow.mjs` |
| **Dependencies** | Tenant |
| **Known gaps** | GAP-015/016 Master Catalog mixed-source pricing — mitigated via `resolveMasterCatalogPricing` |

---

## Purchase order

| Field | Value |
|-------|-------|
| **Source of truth** | `public.purchase_orders` + `purchase_order_items` |
| **Lifecycle** | draft → submitted → received (partial/full) |
| **APIs** | `getPurchaseOrdersRead`, `createPurchaseOrderWrite`, `receivePurchaseOrderWrite` |
| **Screens** | PurchaseOrdersPage |
| **Verify scripts** | `verify-procurement-inventory-flow.mjs`, `verify-bounded-reads.mjs` |
| **Dependencies** | Product, Inventory |
| **Known gaps** | Supplier master deferred (GAP-013) — free-text supplier |

---

## Qualification

| Field | Value |
|-------|-------|
| **Source of truth** | `public.lab_qualifications` |
| **Lifecycle** | pipeline stages → `won` / `lost` |
| **APIs** | `getLabQualificationRead`, `getQualificationReviewRead`, pipeline writes |
| **Screens** | QualificationReviewPage, AgentVisitPage |
| **Verify scripts** | `verify-primecare-production-golden-path.mjs` (GP-10) |
| **Dependencies** | Lab |
| **Known gaps** | None blocking O2C |

---

## Lab contract

| Field | Value |
|-------|-------|
| **Source of truth** | `public.lab_contracts` |
| **Lifecycle** | draft → Active → expired |
| **APIs** | Lab contract engine APIs |
| **Screens** | LabContractManagementPage |
| **Verify scripts** | `verify-primecare-production-golden-path.mjs` (GP-11) |
| **Dependencies** | Lab, Qualification (won) |
| **Known gaps** | None blocking O2C |

---

## Commission entry

| Field | Value |
|-------|-------|
| **Source of truth** | `public.commission_entries` |
| **Lifecycle** | pending → approved → paid (payroll separate from lab payments) |
| **APIs** | Commission engine reads |
| **Screens** | CommissionEnginePage |
| **Verify scripts** | `verify-primecare-production-golden-path.mjs` (GP-45) |
| **Dependencies** | Payment, Agent |
| **Known gaps** | Must not alter payment allocation logic (Blueprint §06) |

---

## Object → verify script quick map

| Object | Primary verify scripts |
|--------|------------------------|
| Order | `verify-lab-ordering-flow`, `verify-orders-admin-flow`, `verify-transaction-integrity-rpcs` |
| Invoice | `verify-invoice-phase5`, `verify-financial-reconciliation` |
| Payment | `verify-payment-allocation-flow`, `verify-partial-payment-sync` |
| Shipment | `verify-logistics-dispatch-flow`, `verify-delivery-charge-policy` |
| Inventory | `verify-inventory-reconciliation`, `verify-procurement-inventory-flow` |
| Lab | `verify-labs-admin-flow`, `verify-lab-ordering-flow` |
| AR | `verify-collection-inconsistencies`, `verify-credit-risk-admin-flow` |
| Full O2C | `verify-primecare-production-golden-path` |
