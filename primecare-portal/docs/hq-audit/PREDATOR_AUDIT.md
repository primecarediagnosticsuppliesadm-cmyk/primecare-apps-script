# Predator Audit — PrimeCare HQ Stabilization Sprint

**Date:** 2026-05-28  
**Orchestrator:** `src/predator/runPredatorValidation.js`  
**Validators:** 29 files in `src/predator/validators/`

---

## Executive Summary

Predator provides module-level validation for HQ production readiness. The batch runner (`runAllPredatorValidations`) covers **24 modules** for executive/admin roles but **excludes Distributor OS and PrimeCare OS** from the default QA Command Center batch. Several validators rely on **UI snapshots** rather than independent Supabase reads. Commission Engine validation **mutates** commission state during probes.

| Risk class | Count |
|------------|-------|
| Batch coverage gap | 2 modules |
| Snapshot-only validation | 4+ modules |
| Mutating probe | 1 module |
| Name/store mismatch | 1 module |
| Env-gated isolation | 1 module |

---

## Batch vs On-Demand Modules

### Included in `runAllPredatorValidations` (executive/admin)

| Module | Validator file |
|--------|----------------|
| Admin Dashboard | `adminDashboardValidator.js` |
| Collections | `collectionsValidator.js` |
| Lab Portal | `labPortalValidator.js` |
| Qualification Analytics | `qualificationValidator.js` |
| Agent Visits | `agentVisitsValidator.js` |
| Tenant + Role Isolation | `tenantRoleIsolationValidator.js` |
| Notifications | `notificationsFoundationValidator.js` |
| Operational Evidence | `operationalEvidenceValidator.js` |
| Operations Center | `operationsCommandCenterValidator.js` |
| Executive Intervention | `executiveInterventionValidator.js` |
| Operational Tasks | `operationalTaskValidator.js` |
| Operational Event Ledger | `operationalEventLedgerValidator.js` |
| Executive Intelligence | `executiveIntelligenceValidator.js` |
| Pilot Readiness | `pilotReadinessValidator.js` |
| Founder Navigation | `founderNavigationValidator.js` |
| Founder Strategy | `founderStrategyValidator.js` |
| Founder Financial Intelligence | `founderFinancialIntelligenceValidator.js` |
| Tenant Foundation | `tenantFoundationValidator.js` |
| Distributor Workspace | `distributorWorkspaceValidator.js` |
| Distributor Provisioning | `distributorProvisioningValidator.js` |
| Commission Engine | `commissionEngineValidator.js` |
| Lab Contract Engine | `labContractEngineValidator.js` |
| Distributor Billing | `distributorBillingValidator.js` |
| Inventory Economics | `inventoryEconomicsValidator.js` |
| Distributor Profitability | `distributorProfitabilityValidator.js` |
| QA Readiness | `qaReadinessValidator.js` |
| Revenue Funnel | `revenueFunnelValidator.js` |

### On-demand only (`runPredatorModuleValidation`)

| Module | Validator | Gap |
|--------|-----------|-----|
| **Distributor OS** | `distributorOsValidator.js` | Not in batch — must visit page first |
| **PrimeCare OS** | `primecareOsValidator.js` | Not in batch — snapshot-only |

---

## Critical Validator Deep-Dive

### Lab Contract Engine (`labContractEngineValidator.js`)

| Step | Trigger | Data source | FP risk | FN risk |
|------|---------|-------------|---------|---------|
| `bundle.load` | Load failure | `loadLabContractEngineBundle` | — | High if RLS blocks |
| `contract_activation_requires_qualification` | Active contract without pipeline qualified/won | `lab_contracts` + `lab_qualifications` | Low post-migration | **High** for legacy ACTIVE contracts predating gate |
| `legacyFounderReview` | Founder review fields present | qual rows | WARN only | Does not block |
| `contract_dates` | Invalid date ranges | contract engine | Low | Medium |
| `renewal_intelligence` | Expiry windows | renewal engine | Low | Medium |
| `migration_status` | Supabase migration not applied | `readLabContractMigrationStatus` | Low | High if SQL not run |

### Qualification (`qualificationValidator.js`)

| Step | Trigger | Data source | Risk |
|------|---------|-------------|------|
| `rendered.snapshot` | No UI visit | predatorStore snapshot | **FN** if page never opened |
| `rowCount` | Zero rows | snapshot | Expected for new distributors |
| Store name | `setModuleReport("Qualification Review")` vs menu **Qualification Analytics** | naming | Confusing QA reports |

### Revenue Funnel (`revenueFunnelValidator.js`)

| Step | Trigger | Data source | Risk |
|------|---------|-------------|------|
| Model load | Engine failure | `buildRevenueFunnelModel` | FN on data errors |
| Integrity | Broken qual-contract | same as RF engine | Aligned post-migration |
| Path complete | Strict path | portfolio metrics | **FP** if payments=0 but AR collected |

### Tenant + Role Isolation (`tenantRoleIsolationValidator.js`)

| Step | Trigger | Data source | Risk |
|------|---------|-------------|------|
| Layer probes | `VITE_QA_ISOLATION_VALIDATION` not true | env flag | **Skipped in prod** — FN for leakage |
| DB vs API vs UI counts | Mismatch | snapshots + API | FP on timing/cache |

### Commission Engine (`commissionEngineValidator.js`)

| Step | Trigger | Data source | Risk |
|------|---------|-------------|------|
| Write probe | Commission calculation test | **Supabase write** | **Mutates data** during validation |
| Registry filter | Distributor scope | `distributorOsEngine` | FN if registry stale |

### Distributor OS (`distributorOsValidator.js`) — on-demand

| Step | Trigger | Data source | Risk |
|------|---------|-------------|------|
| `scopeValid` | Missing distributor scope | rendered snapshot | **Snapshot-only** — no DB |
| `portfolioMode` | V2 portfolio tab | UI state | WARN not FAIL |

### PrimeCare OS (`primecareOsValidator.js`) — on-demand

| Step | Trigger | Data source | Risk |
|------|---------|-------------|------|
| HQ page render | Snapshot present | UI only | No independent verification |

---

## Coverage Gaps (Missing Validators)

| Workflow step | Covered by | Gap |
|---------------|------------|-----|
| Lab create (executive cross-tenant) | Tenant Foundation, Distributor Provisioning | No dedicated lab RLS probe |
| Order fulfillment | Operations Center signals | No order status validator |
| Invoice | — | **No invoice module** (not implemented) |
| Payment UPDATE | Collections | INSERT only in RLS; no correction validator |
| Purchase orders | Inventory Economics | Partial |
| Catalog mirror sync | Inventory Economics, Pilot Readiness | No dedicated mirror resync validator |

---

## False Positive / False Negative Summary

| Validator | False positive risk | False negative risk |
|-----------|--------------------|--------------------|
| Revenue Funnel pathComplete | Payments required when AR sufficient | — |
| Pilot Readiness | Portfolio ops gates PASS for all distributors | Per-distributor FAIL hidden |
| Lab Contract legacy ACTIVE | — | Pre-gate contracts not flagged as FAIL |
| Qualification snapshot | PASS with stale empty snapshot | FAIL if page not visited |
| Isolation | Count timing mismatch | **Skipped without env flag** |
| Distributor OS | WARN on portfolio mode | No DB validation |
| Commission Engine | — | Side effects mask real failures |

---

## Recommendations

1. Add **Distributor OS** and **PrimeCare OS** to `runAllPredatorValidations` or document mandatory pre-visit in QA sign-off.
2. Fix store key: `Qualification Review` → `Qualification Analytics` in `runPredatorValidation.js`.
3. Make isolation validation runnable in staging without prod-risk (separate read-only probe).
4. Replace commission mutating probe with dry-run or rollback wrapper.
5. Add `contract_legacy_active_without_qual` FAIL for grandfathered ACTIVE contracts.
6. Add order/fulfillment validator tied to `orders.status` and collections coupling.
