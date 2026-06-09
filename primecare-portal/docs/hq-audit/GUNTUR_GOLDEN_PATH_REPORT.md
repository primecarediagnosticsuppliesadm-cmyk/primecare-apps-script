# Guntur Golden Path Report — PrimeCare HQ Remediation Sprint

**Date:** 2026-05-28  
**Distributor:** Guntur Distributor  
**Tenant ID:** `787999b9-72f5-4163-a860-551c12ce3414`  
**HQ Tenant:** `f168b98f-47a6-42c3-b788-24c00436fac2`  
**Method:** Code-path validation + remediation prerequisites (live Supabase execution requires manual QA run)

---

## Workflow Checklist

| Step | Action | UI Path | API/Table | Status |
|------|--------|---------|-----------|--------|
| 1 | Qualification | Distributor OS → Guntur → Labs → Qualification | `lab_qualifications` | **Ready** (RLS fixed) |
| 2 | Contract | Lab Contract Management or Distributor OS Contracts | `lab_contracts` | **Ready** |
| 3 | Inventory | Distributor OS → Catalog → Sync mirror | `products`, `inventory` | **Blocked until catalog RLS applied** |
| 4 | Order | Distributor OS → Orders or Lab Ordering | `orders` | **Ready** (RLS fixed) |
| 5 | Fulfillment | Orders → update status | `orders.status` | **Ready** |
| 6 | AR | Collections → create/update AR | `ar_credit_control` | **Ready** |
| 7 | Payment | Collections → record payment | `payments` | **Ready** (UPDATE now permitted) |

---

## Step-by-Step Execution Guide

### 1. Apply migrations (one-time)

```sql
-- Run in Supabase SQL editor, in order:
-- 1. production_auth_rls_pilot_migration.sql
-- 2. executive_distributor_lab_create_migration.sql
-- 3. lab_qualifications_migration.sql (+ pipeline columns)
-- 4. lab_contracts_migration.sql
-- 5. executive_distributor_catalog_inventory_rls.sql
-- 6. executive_distributor_ops_rls_migration.sql  ← NEW
```

### 2. Qualification

1. Login as executive (`qa.executive@primecare.test` or production exec)
2. Distributor OS → select **Guntur**
3. Labs tab → **Qualification** sub-tab
4. Create qualification for target lab (or select existing)
5. Set `pipeline_stage` → **qualified** (or **won**)
6. **Verify:** Row visible in Qualification Analytics (read-only HQ view)

**Predator:** `contract_activation_requires_qualification` prerequisite satisfied.

### 3. Contract

1. Lab Contract Management (or Distributor OS Contracts)
2. Open draft contract for same lab
3. Activate → gate checks pipeline qualified/won
4. **Verify:** Status = Active; RF `contractedCount` +1

**Predator:** Lab Contract Engine → `contract_activation_requires_qualification` PASS.

### 4. Inventory

1. Distributor OS → Guntur → Catalog
2. Confirm catalog assigned (metadata)
3. **Sync inventory mirror** → products + inventory rows
4. **Verify:** RF Products > 0, Inventory Rows > 0, `readyToOrder` gate opens

**Predator:** Distributor OS → catalog mirror health PASS; Inventory Economics PASS.

### 5. Order

1. Lab Ordering (as lab user) OR Orders page (as executive)
2. Place order for contracted lab
3. **Verify:** Order row `tenant_id` = Guntur UUID

**Revenue Funnel:** `orderedLabCount` +1, portfolio Orders +1.

### 6. Fulfillment

1. Orders → update status to `fulfilled` or `delivered`
2. **Verify:** RF `fulfilledLabCount` +1

### 7. AR (Collection)

1. Collections → ensure AR row for lab (auto or manual)
2. **Verify:** `arOutstanding` > 0 in RF

### 8. Payment

1. Collections → Record payment
2. **Verify:** `payments` row; RF `paymentsReceived` > 0; `paidLabs` +1

---

## Metrics Verification Matrix

| Metric | Engine field | Expected after golden path |
|--------|--------------|----------------------------|
| Qualified labs | `qualifiedCount` | ≥ 1 |
| Contracted labs | `contractedCount` | ≥ 1 |
| Qual integrity | `qualificationContractGapCount` | 0 |
| Products | `productsCount` | ≥ 1 (after mirror) |
| Inventory | `inventoryRowCount` | ≥ 1 |
| Ready to order | `readyToOrderCount` | ≥ 1 |
| Ordered | `orderedLabCount` | ≥ 1 |
| Fulfilled | `fulfilledLabCount` | ≥ 1 |
| AR | `arOutstanding` | > 0 |
| Payments | `paymentsReceived` | > 0 |
| Path complete | `pathComplete` | **true** (all gates) |

### Pilot Readiness gates (Guntur row)

| Gate | Expected |
|------|----------|
| Foundation | PASS |
| Catalog | PASS (after mirror) |
| Labs | PASS (`qualified_lab`) |
| Contracts | PASS (`active_contract`) |
| Billing | PASS (if configured) |
| Collections | PASS (`healthy`) |
| Financial | PASS/WARN (data dependent) |
| Operations | PASS (portfolio) |
| Quality | PASS (after Predator batch) |

### Predator batch (post golden path)

| Module | Expected |
|--------|----------|
| Qualification Analytics | PASS |
| Lab Contract Engine | PASS |
| Inventory Economics | PASS |
| Revenue Funnel | PASS |
| Pilot Readiness | PASS |
| Collections | PASS |
| Distributor OS | PASS (visit page first or use stored snapshot) |

---

## Known Blockers (Pre-Execution)

| Blocker | Resolution |
|---------|------------|
| Catalog RLS not applied | Run `executive_distributor_catalog_inventory_rls.sql` |
| Ops RLS not applied | Run `executive_distributor_ops_rls_migration.sql` |
| Legacy ACTIVE contract without qual | Create qual row OR terminate and re-activate |
| No lab user for ordering | Seed lab profile for Guntur lab or order as executive |

---

## Golden Path Verdict

| Criterion | Status |
|-----------|--------|
| Code paths complete | ✅ |
| RLS permits HQ-operated Guntur workflow | ✅ (after migration apply) |
| Metrics engines wired | ✅ |
| Live execution verified | ⏳ **Pending manual QA** |

**Recommendation:** Execute golden path in staging immediately after applying both RLS migrations. Re-run Predator batch from QA Command Center with Distributor OS page visited first (Guntur scoped).
