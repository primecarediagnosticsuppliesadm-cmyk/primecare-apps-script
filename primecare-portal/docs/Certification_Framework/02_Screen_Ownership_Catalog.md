# 02 — Screen Ownership Catalog

**Every cert-relevant screen: reads, writes, users, APIs, verification, and performance targets.**

Routing: `src/config/pageRouting.js` · Permissions: `src/config/rolePermissionMatrix.js`

**Performance targets** are cold API-layer budgets (admin JWT, QA tenant). See [07_Performance_Certification_Matrix.md](./07_Performance_Certification_Matrix.md).

---

## O2C critical screens

### LabOrderingPage

| Field | Value |
|-------|-------|
| **Path** | `/lab-orders` |
| **Component** | `src/pages/LabOrderingPage.jsx` |
| **Users** | `lab` |
| **Reads** | `getLabOrderingContextRead`, `getLabCatalogRead`, `getLabRecentOrdersRead`, `getLabOrderDetailsRead` |
| **Writes** | `createOrderWrite` (checkout), repeat order |
| **Verification** | `verify-lab-ordering-flow.mjs`; browser steps `BGP-L01`–`BGP-L08` |
| **Perf target** | **≤ 300 ms** catalog + context (warm cache ≤ 50 ms) |

---

### OrdersPage

| Field | Value |
|-------|-------|
| **Path** | `/orders` |
| **Component** | `src/pages/OrdersPage.jsx` |
| **Users** | `admin`, `executive` |
| **Reads** | `getOrdersRead`, `getOrderDetailsRead`, order line metrics, logistics panel |
| **Writes** | `updateOrderStatusWrite` (fulfill/cancel), `createPaymentWrite`, invoice actions |
| **Verification** | `verify-orders-admin-flow.mjs`, `verify-order-payment-sync.mjs`; browser `BGP-A03`–`BGP-A06` |
| **Perf target** | **≤ 350 ms** list (bounded 100); search debounced 300 ms |

---

### LogisticsDeliveryPage

| Field | Value |
|-------|-------|
| **Path** | `/logistics-delivery` |
| **Component** | `src/pages/LogisticsDeliveryPage.jsx` |
| **Users** | `admin`, `executive` |
| **Reads** | `logisticsSupabaseApi` shipments, couriers, routes, KPIs |
| **Writes** | Shipment transitions, route create/assign/complete |
| **Verification** | `verify-logistics-dispatch-flow.mjs`; browser `BGP-A07`–`BGP-A09` |
| **Perf target** | **≤ 400 ms** dashboard cold load |

---

### CollectionsPage

| Field | Value |
|-------|-------|
| **Path** | `/collections` (alias: payments) |
| **Component** | `src/pages/CollectionsPage.jsx` |
| **Users** | `admin`, `executive`, `agent` (scoped) |
| **Reads** | `getCollectionsRead`, `getCollectionDetailRead`, `getCollectionHistoryRead` |
| **Writes** | `createPaymentWrite`, `updateCollectionNotesWrite`, allocation UI |
| **Verification** | `verify-financial-reconciliation.mjs`, `verify-credit-risk-admin-flow.mjs`; browser `BGP-A10`–`BGP-A12` |
| **Perf target** | **≤ 200 ms** bounded collections read |

---

### LabInvoiceCenterPage

| Field | Value |
|-------|-------|
| **Path** | `/lab-invoices` |
| **Component** | `src/pages/LabInvoiceCenterPage.jsx` |
| **Users** | `lab` |
| **Reads** | Lab-scoped invoice list, PDF download |
| **Writes** | None (read-only portal) |
| **Verification** | `verify-invoice-phase4.mjs`, `verify-lab-account-fallback.mjs`; browser `BGP-L09` |
| **Perf target** | **≤ 250 ms** invoice list |

---

### ExecutiveFinancialIntelligencePage

| Field | Value |
|-------|-------|
| **Path** | `/executive-financial-intelligence` |
| **Component** | `src/pages/ExecutiveFinancialIntelligencePage.jsx` |
| **Users** | `executive` |
| **Reads** | EFI engine aggregates (read-only) |
| **Writes** | None |
| **Verification** | `verify-executive-financial-intelligence.mjs`; browser `BGP-E03` |
| **Perf target** | **≤ 400 ms** initial model build |

---

## HQ operations screens

### DashboardPage (Admin)

| Field | Value |
|-------|-------|
| **Path** | `/dashboard` |
| **Users** | `admin`, `executive`, `lab`, `agent` |
| **Reads** | `getAdminDashboardRead` (role-filtered) |
| **Writes** | None |
| **Verification** | `verify-sprint1-health.mjs`; browser `BGP-*-01` |
| **Perf target** | **≤ 350 ms** admin dashboard cold |

---

### LabsPage

| Field | Value |
|-------|-------|
| **Path** | `/labs` |
| **Users** | `admin` |
| **Reads** | `getLabsCredit`; shadow adapter `read_labs_list_v1` remains flag OFF until parity/RLS review; lab detail drawers |
| **Writes** | `createLabWrite`, ordering mode, delivery day |
| **Verification** | `verify-labs-admin-flow.mjs` (Active Labs, Order-Eligible Labs, Ordering Suspended KPIs), `verify-create-lab-ar-rls.mjs`, `verify-labs-projection-parity.mjs` |
| **Perf target** | **≤ 300 ms** list |

---

### OperationsCenterAdminPage

| Field | Value |
|-------|-------|
| **Path** | `/operations-center` |
| **Users** | `admin`, `executive` |
| **Reads** | Platform users, agents, distributors, assignments |
| **Writes** | Provisioning, ownership, freeze-aware guards |
| **Verification** | `verify-operations-center-admin-flow.mjs`, `verify-hq-freeze-policy.mjs` |
| **Perf target** | **≤ 400 ms** loader (largest surface at scale) |

---

### MasterCatalogPage

| Field | Value |
|-------|-------|
| **Path** | `/master-catalog` |
| **Users** | `admin`, `executive` |
| **Reads** | Catalog + `products` enrichment |
| **Writes** | `createHqProductWrite`, `updateHqProductWrite` |
| **Verification** | `verify-procurement-inventory-flow.mjs`, `verify-inventory-dashboard-kpi.mjs` |
| **Perf target** | **≤ 350 ms** catalog load |

---

### StockPage / InventoryHealthPage / InventoryLedgerPage

| Field | Value |
|-------|-------|
| **Path** | `/inventory`, health, movements sub-routes |
| **Users** | `admin`, `executive` |
| **Reads** | `getStockDashboard`, `getInventoryHealthRead`, `getInventoryLedgerRead` |
| **Writes** | `createInventoryLedgerWrite` (adjustments) |
| **Verification** | `verify-inventory-dashboard-kpi.mjs`, `verify-inventory-reconciliation.mjs` |
| **Perf target** | **≤ 300 ms** stock dashboard |

---

### PurchaseOrdersPage

| Field | Value |
|-------|-------|
| **Path** | `/purchase` |
| **Users** | `admin`, `executive` |
| **Reads** | `getPurchaseOrdersRead`, `getReorderForecastRead` |
| **Writes** | `createPurchaseOrderWrite`, `receivePurchaseOrderWrite` |
| **Verification** | `verify-procurement-inventory-flow.mjs` |
| **Perf target** | **≤ 300 ms** PO list |

---

### QualificationReviewPage

| Field | Value |
|-------|-------|
| **Path** | `/qualification-analytics` |
| **Users** | `admin`, `executive` |
| **Reads** | `getQualificationReviewRead` |
| **Writes** | Founder review, pipeline stage |
| **Verification** | Golden path GP-10 |
| **Perf target** | **≤ 200 ms** review list |

---

### Credit & Risk (Collections risk view)

| Field | Value |
|-------|-------|
| **Path** | `/credit-risk` |
| **Page key** | `risk` |
| **Users** | `admin`, `executive` |
| **Reads** | AR aging, `getLabsCredit` |
| **Writes** | None (read-only analytics) |
| **Verification** | `verify-credit-risk-admin-flow.mjs` |
| **Perf target** | **≤ 250 ms** |

---

## Agent / Lab secondary screens

| Screen | Users | Key APIs | Verify | Perf target |
|--------|-------|----------|--------|-------------|
| AgentDashboard | agent | `getAgentWorkspaceRead` | agent ownership filter | ≤ 300 ms |
| AgentVisitPage | agent | `getAgentVisitPageContextRead`, visits | — | ≤ 350 ms |
| Lab account views | lab | `getCollectionsRead` (scoped) | `verify-lab-account-fallback` | ≤ 200 ms |
| LoginPage | all pilot | Supabase auth | `verify-hq-rls-reads` | ≤ 400 ms login |

---

## Executive / growth screens

| Screen | Users | Verification | Perf target |
|--------|-------|--------------|-------------|
| RevenueFunnelPage | executive | `verify-founder-snapshot` | ≤ 300 ms |
| CommissionEnginePage | executive | golden path GP-45 | ≤ 300 ms |
| LabContractManagementPage | executive | golden path GP-11 | ≤ 300 ms |
| FounderFinancialIntelligencePage | executive | EFI read-only | ≤ 400 ms |

---

## QA / internal screens (non-production cert)

| Screen | Users | Notes |
|--------|-------|-------|
| QACommandCenterPage | QA validation layer | Predator / validation only |
| PilotReadinessPage | executive | Internal readiness |
| PredatorDebug | dev/QA | Not in production cert |

---

## Screen → browser golden path map

| Screen | Golden path step IDs |
|--------|---------------------|
| LabOrderingPage | BGP-L01–L08 |
| OrdersPage | BGP-A03–A06 |
| LogisticsDeliveryPage | BGP-A07–A09 |
| CollectionsPage | BGP-A10–A12 |
| LabInvoiceCenterPage | BGP-L09 |
| ExecutiveFinancialIntelligencePage | BGP-E03 |
| DashboardPage | BGP-A01, BGP-L01, BGP-E01 |

Full step definitions: [04_Browser_Golden_Path.md](./04_Browser_Golden_Path.md)

---

## Screen → verify script map

| Screen | Required scripts on change |
|--------|---------------------------|
| LabOrderingPage | `verify-lab-ordering-flow`, `verify-hq-rls-reads` |
| OrdersPage | `verify-orders-admin-flow`, `verify-financial-reconciliation` |
| LogisticsDeliveryPage | `verify-logistics-dispatch-flow`, `verify-delivery-charge-policy` |
| CollectionsPage | `verify-financial-reconciliation`, `verify-payment-allocation-flow` |
| OperationsCenterAdminPage | `verify-operations-center-admin-flow`, `verify-hq-freeze-policy` |
| MasterCatalog + Inventory | `verify-inventory-dashboard-kpi`, `verify-procurement-inventory-flow` |
| Any RLS touch | `verify-hq-rls-reads` |
