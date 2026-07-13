# 22 — Platform Consolidation (Phase 9.1)

Years 1–3 platform consolidation before Founder Command Center.

**PrimeCare is one enterprise platform** — not a collection of excellent modules with duplicate navigation.

---

## Scope

| In scope | Out of scope |
|----------|----------------|
| Navigation consolidation | Founder OS (Phase 9.2) |
| Dashboard KPI ownership registry | New business modules |
| Report routing (navigation only) | Finance / payroll / commission engine changes |
| Architecture Readiness dashboard | Schema / API mutations |
| Performance audit + safe UI opts | Reporting engine rewrite |

---

## Workspace homes (canonical sidebar entry)

| Domain | Home page key | Label |
|--------|---------------|-------|
| Commercial | `commercialCrm` | Commercial |
| People | `compensationPayroll` | People Operations |
| Operations | `operationsCenter` | Operations Center |
| Executive strategic | `dashboard` + `executiveFinancialIntelligence` | Control Tower + EFI |
| Finance collections | `risk` | Credit & Risk |
| Inventory | `inventory` | Inventory |
| Procurement | `purchase` | Purchase / Reorder |

---

## Deep-link only (sidebar hidden)

Routes remain permissioned; pages deep-link from workspace homes.

| Key | Reason | Primary home |
|-----|--------|--------------|
| `qualificationReview` | Pipeline analytics in Commercial | `commercialCrm` |
| `founderNavigation` | Legacy alias → Founder OS | `founderOperatingSystem` |
| `founderStrategy` | Founder OS deferred | `dashboard` |
| `founderFinancialIntelligence` | EFI is canonical FI | `executiveFinancialIntelligence` |
| `commissionEngine` | Growth analytics ≠ payroll SoT | `compensationPayroll` Reports |
| `labContractEngine` | Contracts tab in Commercial | `commercialCrm` |
| `pilotReadiness` | Superseded by Architecture Readiness for devs | `productionReadiness` |

Registry: `src/platform/platformConsolidationModel.js` → `NAV_DEEP_LINK_ONLY_KEYS`.

---

## Executive menu (Phase 9.1)

```
HOME        → dashboard (Control Tower)
EXECUTIVE   → executiveFinancialIntelligence, revenueFunnel
OPERATIONS  → operationsCenter, orders, logisticsDelivery, risk
INVENTORY   → masterCatalog, inventory, purchase
PEOPLE      → compensationPayroll, accessAudit
GROWTH      → commercialCrm
PLATFORM    → productionReadiness, qaCommandCenter, projectionOpsCenter
```

Founder section **restored** in Phase 9.2 — `founderOperatingSystem` (Founder OS) is the canonical founder home.

---

## Dashboard KPI ownership

Each KPI has **one primary dashboard**. Registry: `DASHBOARD_KPI_OWNERSHIP` in `platformConsolidationModel.js`.

| KPI family | Primary dashboard | Calculation SoT |
|------------|-------------------|-----------------|
| Pipeline / prospect | Commercial | `commercialWorkspaceModel` |
| Revenue funnel integrity | Revenue Funnel | `revenueFunnelEngine` |
| Cash / AR (executive) | EFI | `executiveFinancialIntelligenceEngine` |
| Invoice aging | Credit & Risk | `collectionsCockpitMetrics` |
| Payroll / commission | People Operations | `executiveCompensationModel` + payroll domain |
| Stock value | Inventory | `inventoryValueAnalyticsEngine` |
| PO open count | Purchase | `purchase_orders` bounded read |
| Ops queue | Operations Center | `executiveActionQueueEngine` |
| Interventions | Control Tower | `executiveInterventionModel` |

---

## Financial intelligence SoT

Registry: `FINANCIAL_KPI_SOURCES` in `platformConsolidationModel.js`.

| Metric | SoT | Not SoT |
|--------|-----|---------|
| Revenue | EFI engine + invoices | Commission Engine, Revenue Funnel lab counts |
| Collections | payments + allocations + AR | Commission collected proxy |
| Payroll | payroll domain + cash-only engine | Commission Engine |
| Inventory | inventoryValueAnalyticsEngine | Catalog without inventory join |
| Compensation | compensationCalculationEngine | Commission Engine revenue attribution |

---

## Report ownership

Registry: `REPORT_OWNERSHIP`. Navigation only — no new reporting engine.

| Report | Module | Screen |
|--------|--------|--------|
| Commercial pipeline | `commercialCrm` | reports/analytics |
| People analytics | `compensationPayroll` | reports/analytics |
| EFI sections | `executiveFinancialIntelligence` | all |
| Revenue funnel | `revenueFunnel` | main |
| Collections AR | `risk` | collections |
| Inventory valuation | `inventory` | dashboard |

---

## Notifications grouping (audit)

No backend changes in 9.1. Registry: `NOTIFICATION_GROUPS`.

| Group | Event types |
|-------|-------------|
| Critical | credit_hold_triggered, low_stock |
| Warning | collection_due |
| Information | order_created, payment_received, visits, qualification_updated |
| Tasks | purchase_order_* |
| Approvals | (future) |
| Future automation | email/whatsapp/sms placeholders |

---

## Architecture Readiness dashboard

Page key: `productionReadiness`  
Component: `ProductionReadinessDashboardPage.jsx`  
Model: `productionReadinessModel.js`

**Not** Founder Command Center. For developers and HQ admins.

Sections: Build, Verification, RLS, Performance, Coverage, Open Risks, Production Gates, Projection Readiness, Manual UAT.

Gated: `isProductionReadinessDashboardEnabled(role)` — QA/dev default; prod requires `VITE_PRODUCTION_READINESS_DASHBOARD=true`.

---

## Verification

| Script | Checks |
|--------|--------|
| `verify-navigation-consolidation.mjs` | One home per workspace; deep-link keys hidden |
| `verify-dashboard-ownership.mjs` | KPI primary dashboard registry |
| `verify-report-consolidation.mjs` | Report module ownership |
| `verify-performance-readiness.mjs` | Bounded reads, god-page audit |
| `verify-production-readiness-dashboard.mjs` | Readiness page wired |
| `audit-phase-9-1-certification.mjs` | Full bundle + build |

---

## Not changed

Orders, invoices, payments, AR, payroll workflow, compensation calculations, Commercial compose logic, RLS, schema.
