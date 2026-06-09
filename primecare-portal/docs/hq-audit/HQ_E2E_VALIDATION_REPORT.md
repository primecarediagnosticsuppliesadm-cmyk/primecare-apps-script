# HQ End-to-End Validation Report — PrimeCare HQ Stabilization Sprint

**Date:** 2026-05-28  
**Workflow:** Lab → Qualification → Contract → Inventory → Order → Fulfillment → Invoice → Collection → Payment → Revenue Funnel → Pilot Readiness → Predator  
**Method:** Static code-path audit + RLS policy cross-check (no live Supabase session in this sprint)

---

## Workflow Status Matrix

| Step | UI | API | Supabase write | RLS permits | Metrics update | Dashboard update | Overall |
|------|----|-----|----------------|-------------|----------------|------------------|---------|
| 1. Lab | ✅ | ✅ | ✅ | ⚠️ Exec UPDATE cross-tenant blocked | ✅ | ✅ Distributor OS | **PARTIAL** |
| 2. Qualification | ✅ Distributor OS | ✅ | ⚠️ | ❌ Exec cross-tenant blocked | ✅ | ✅ RF + Pilot | **PARTIAL** |
| 3. Contract | ✅ | ✅ | ✅ | ✅ Exec cross-tenant | ✅ | ✅ RF + Pilot + Predator | **PASS*** |
| 4. Inventory | ✅ | ✅ | ⚠️ | ⚠️ Requires catalog RLS migration | ✅ | ✅ RF mirror | **PARTIAL** |
| 5. Order | ✅ | ✅ | ✅ | ❌ Exec cross-tenant read/write | ✅ | ✅ Ops + RF | **PARTIAL** |
| 6. Fulfillment | ✅ | ✅ | ✅ UPDATE orders | Same as orders | ✅ | ✅ Ops signals | **PARTIAL** |
| 7. Invoice | ❌ Placeholder | ❌ | ❌ No table | N/A | ❌ | ❌ | **FAIL** |
| 8. Collection | ✅ | ✅ | ✅ AR upsert | ⚠️ Exec cross-tenant | ✅ | ✅ RF + Collections | **PARTIAL** |
| 9. Payment | ✅ | ✅ INSERT only | ⚠️ No UPDATE RLS | ⚠️ Exec cross-tenant | ✅ | ✅ RF | **PARTIAL** |
| 10. Revenue Funnel | ✅ | ✅ | N/A read | ⚠️ Scoped reads | ⚠️ Semantics | ✅ | **PARTIAL** |
| 11. Pilot Readiness | ✅ | ✅ | N/A read | Same | ⚠️ Portfolio gates | ✅ | **PARTIAL** |
| 12. Predator | ✅ | ✅ | Some probes write | Role-gated | ✅ | ✅ QA Center | **PARTIAL** |

\*Contract activation requires qualification gate (pipeline qualified/won). Legacy ACTIVE contracts may exist without qual rows.

---

## Step-by-Step Trace

### 1. Lab

| Layer | Path | Notes |
|-------|------|-------|
| UI | Distributor OS → Labs → Registry | `DistributorOsPage.jsx`, lab create forms |
| API | `primecareSupabaseApi.js` → `labs` | Insert via `can_insert_lab_for_tenant` |
| RLS | Executive INSERT any tenant ✅; UPDATE own tenant only | Cannot edit Guntur lab from HQ profile |
| Metrics | `v_labs_credit`, Distributor OS metrics | Lab count drives RF + Pilot gates |

**Blocker:** HQ executive operating distributor tenants cannot UPDATE lab records cross-tenant.

---

### 2. Qualification

| Layer | Path | Notes |
|-------|------|-------|
| UI | Distributor OS → Labs → **Qualification** tab | `DistributorQualificationPanel.jsx` |
| HQ analytics | Qualification Analytics (read-only) | `QualificationReviewPage.jsx` |
| API | `lab_qualifications` CRUD | Tenant-scoped to profile |
| Gate | `isQualificationPipelineReady()` | Stages: `qualified`, `won` |
| RLS | No executive cross-tenant policy | **Writes fail** when profile.tenant_id = HQ |

**Remediation path (Guntur):** Use distributor-scoped admin profile OR add executive cross-tenant RLS.

---

### 3. Contract

| Layer | Path | Notes |
|-------|------|-------|
| UI | Lab Contract Management | `LabContractManagementPage.jsx` |
| Gate | `evaluateContractActivationQualification()` | Blocks activation without qual |
| API | `labContractsSupabaseApi.js` | Executive cross-tenant ✅ |
| Predator | `contract_activation_requires_qualification` | FAIL on misalignment |

---

### 4. Inventory / Catalog

| Layer | Path | Notes |
|-------|------|-------|
| UI | Distributor OS catalog + inventory panels | Metadata + mirror |
| API | `products`, `inventory` upsert | Requires `executive_distributor_catalog_inventory_rls.sql` |
| Mirror | `buildPortfolioCatalogMirrorSummary()` | localStorage + Supabase probe |
| RF gate | `inventory.ready` distributor-wide | One SKU enables all contracted labs |

**Blocker:** If catalog RLS migration not applied, mirror shows Products=0, Inventory=0 despite assignment.

---

### 5. Order

| Layer | Path | Notes |
|-------|------|-------|
| UI | Orders page, Lab Ordering | `OrdersPage.jsx`, `LabOrderingPage.jsx` |
| API | `orders`, `order_items` | Tenant-scoped |
| RLS | Executive/admin own tenant only | HQ cannot see Guntur orders |

---

### 6. Fulfillment

| Layer | Path | Notes |
|-------|------|-------|
| UI | Order tracking drawer, ops center | Status updates |
| API | `orders` UPDATE | `fulfilled` / `delivered` substring match in RF |
| Metrics | `fulfilledLabCount`, ops signals | Coupled to order status text |

---

### 7. Invoice — NOT IMPLEMENTED

| Finding | Detail |
|---------|--------|
| Table | No `invoices` table in schema |
| UI | Invoice references are placeholders in order tracking / collections copy |
| Workflow gap | Collection/payment driven by AR + payments, not invoice entity |

**Impact:** E2E path skips formal invoice step; AR rows substitute for billing document.

---

### 8. Collection

| Layer | Path | Notes |
|-------|------|-------|
| UI | Collections page | `CollectionsPage.jsx` |
| API | `ar_credit_control` | Visibility via `lab_record_is_visible_to_current_user` |
| Metrics | `arOutstanding`, recovery % | Portfolio recovery shared across distributors |

---

### 9. Payment

| Layer | Path | Notes |
|-------|------|-------|
| UI | Collections → record payment | INSERT path |
| API | `payments` INSERT | No UPDATE policy |
| RF | `paymentsReceived`, `paidLabs` | Currency vs lab-count mismatch |

---

### 10. Revenue Funnel

| Layer | Path | Notes |
|-------|------|-------|
| UI | Revenue Funnel page | Per-distributor table + portfolio tiles |
| Engine | `revenueFunnelEngine.js` | See `REVENUE_FUNNEL_AUDIT.md` |
| Update trigger | Reload on navigation / data refresh | No realtime subscription |

---

### 11. Pilot Readiness

| Layer | Path | Notes |
|-------|------|-------|
| UI | Pilot Readiness page | 9 gates per distributor |
| Engine | `pilotReadinessEngine.js` | See `PILOT_READINESS_AUDIT.md` |
| Coupling | Uses same FI/ops payload as RF | Portfolio gates duplicated |

---

### 12. Predator

| Layer | Path | Notes |
|-------|------|-------|
| UI | QA Command Center, Predator Debug | `QACommandCenterPage.jsx` |
| Batch | `runAllPredatorValidations` | 24 modules; Distributor OS / PrimeCare OS excluded |
| Store | Module snapshots from page visits | Stale snapshot FN risk |

---

## Guntur Distributor Remediation Checklist

Tenant: `787999b9-72f5-4163-a860-551c12ce3414`

1. Apply `executive_distributor_catalog_inventory_rls.sql` in Supabase
2. Distributor OS → Guntur → Labs → Qualification → create row → Mark **qualified**
3. Contracts → Activate (gate should PASS)
4. Re-sync catalog mirror (products + inventory)
5. Place test order → fulfill → record collection → record payment
6. Verify Revenue Funnel path + Pilot Readiness gates
7. Run Predator batch + on-demand Distributor OS validator

---

## E2E Readiness Verdict

**Workflow completeness: 83%** (10/12 steps functional; invoice absent; RLS blocks HQ-operated distributor path)

**Production sign-off blockers (P0):**

1. Confirm `production_auth_rls_pilot_migration.sql` applied (no anon policies)
2. Apply catalog inventory RLS migration
3. Resolve executive cross-tenant gap for qualifications/orders/payments OR document profile-switch requirement
4. Document invoice as out-of-scope / AR-substitute for pilot
