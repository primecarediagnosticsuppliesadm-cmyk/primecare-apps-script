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
| **Users** | `lab`; `admin` / `executive` only in explicit `adminOnBehalf` mode |
| **Reads** | `getLabOrderingContextRead`, `getLabCatalogRead`, `getLabRecentOrdersRead`, `getLabOrderDetailsRead` |
| **Writes** | `createOrderWrite` (checkout), repeat order; admin-on-behalf order creation for eligible `ACTIVE` labs |
| **Verification** | `verify-lab-ordering-flow.mjs`; browser steps `BGP-L01`–`BGP-L08`; inactive lab portal read-only history UAT; admin-on-behalf order UAT |
| **Perf target** | **≤ 300 ms** catalog + context (warm cache ≤ 50 ms) |

Inactive labs may log in when provisioned, but checkout/reorder must be blocked because lifecycle transition forces `ordering_mode = suspended`. Track Order, invoices, payments, previous orders, and history remain available.

Admin-on-behalf mode must reuse this page and cart flow without duplicating the ordering UI or impersonating the lab user. The selected lab remains the customer, the authenticated HQ user remains the actor, and order/audit metadata must include `source = admin_on_behalf`.

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

Inactive lab lifecycle status must not hide receivables, payments, allocations, collection history, or authorized scoped reads.

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
| **Writes** | `createLabWrite`, ordering mode, delivery day, lifecycle status transitions via `updateLabLifecycleStatusWrite`; admin-on-behalf order launch for eligible labs |
| **Verification** | `verify-labs-admin-flow.mjs` (Total, Prospect, Active, Inactive, Order-Eligible, Ordering Suspended KPIs), `verify-lab-lifecycle-status-flow.mjs`, `verify-lab-ordering-flow.mjs`, `verify-create-lab-ar-rls.mjs`, `verify-labs-projection-parity.mjs` |
| **Perf target** | **≤ 300 ms** list |

Lifecycle controls must require confirmation and reason for inactivation/reactivation. `ACTIVE -> INACTIVE` must force `ordering_mode = suspended`; `INACTIVE -> ACTIVE` must not restore previous Ordering Mode.

Admin-on-behalf order actions from Labs Admin / `OperationalLabDrawer` must be enabled only for `ACTIVE` labs with `ordering_mode` in `hq_managed`, `hybrid`, or `self_service`, and blocked for `INACTIVE` or `suspended` labs.

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

Inactive labs remain visible in Credit & Risk when they have AR/credit history; lifecycle status is display/filter context only, not a receivable state.

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
| CommissionEnginePage | executive | golden path GP-45; legacy analytics only, not payroll SoT | ≤ 300 ms |
| LabContractManagementPage | executive | golden path GP-11 | ≤ 300 ms |
| FounderFinancialIntelligencePage | executive | EFI read-only | ≤ 400 ms |

---

## Compensation / payroll screens (planned)

### ExecutiveCompensationDashboard

| Field | Value |
|-------|-------|
| **Path** | planned `/executive-compensation` |
| **Users** | `executive`; `hr` support view after role/RLS implementation |
| **Reads** | Payroll liability, periods, approval queue, cash-only commission summaries |
| **Writes** | Executive approval/lock/export only; HR preview/submit only |
| **Verification** | `verify-compensation-approval-workflow.mjs`, `verify-compensation-rls.mjs`, `verify-compensation-no-finance-mutation.mjs` |
| **Perf target** | planned ≤ 350 ms bounded dashboard read |

### PayrollRunPreview

| Field | Value |
|-------|-------|
| **Path** | planned `/payroll-runs/:period` |
| **Users** | `executive`, `hr`; `admin` view/recommend only |
| **Reads** | Payroll period, run lines, compensation plans, attribution snapshots, adjustments |
| **Writes** | HR generate/submit preview; Executive approve/reject/lock/export |
| **Verification** | `verify-payroll-run-lifecycle.mjs`, `verify-compensation-cash-only.mjs`, `verify-compensation-attribution.mjs` |
| **Perf target** | planned ≤ 400 ms bounded run read |

### AgentCompensationHistory

| Field | Value |
|-------|-------|
| **Path** | planned `/agent-compensation` |
| **Users** | `agent` own locked/exported history only; Executive/HR/Admin according to payroll role matrix |
| **Reads** | Own payroll lines and approved adjustment summaries |
| **Writes** | None for agent |
| **Verification** | `verify-compensation-rls.mjs`, browser UAT for own-history isolation |
| **Perf target** | planned ≤ 250 ms own-history read |

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
| ExecutiveCompensationDashboard (planned) | planned BGP-COMP-E01 |
| PayrollRunPreview (planned) | planned BGP-COMP-HR01 / BGP-COMP-E02 |
| AgentCompensationHistory (planned) | planned BGP-COMP-A01 |
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
| Compensation / payroll (Phase 3A foundation + future) | `verify-compensation-schema`, `verify-compensation-rls`, `verify-payroll-period-lifecycle`, `verify-compensation-audit`, `verify-compensation-role-access`; future `verify-compensation-cash-only`, `verify-compensation-attribution`, `verify-payroll-run-lifecycle`, `verify-compensation-approval-workflow`, `verify-payroll-export`, `verify-compensation-no-finance-mutation` |
| Any RLS touch | `verify-hq-rls-reads` |
