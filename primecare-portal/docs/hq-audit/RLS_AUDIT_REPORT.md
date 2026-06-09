# RLS Audit Report — PrimeCare HQ Stabilization Sprint

**Date:** 2026-05-28  
**Scope:** `lab_qualifications`, `lab_contracts`, `orders`, `payments`, `inventory`, `purchase_orders`, `labs`, `tenants` (+ related `products`, `ar_credit_control`, `order_items`)  
**Sources:** `supabase/sql/*.sql`, `primecare_public_schema.sql`, `tenantIsolationManifest.js`

---

## Executive Summary

Effective RLS assumes migrations are applied in order, especially `production_auth_rls_pilot_migration.sql`. The snapshot in `primecare_public_schema.sql` still shows **open anon policies** — if pilot migration is not applied, orders/payments/inventory are fully exposed.

**Critical finding:** Executive cross-tenant access is **inconsistent**. Labs (insert), products/inventory (catalog RLS), and lab_contracts allow HQ executive cross-tenant ops. **Qualifications, orders, payments, and purchase_orders do not** — blocking Distributor OS HQ-operated workflows unless profile tenant matches distributor or legacy anon policies remain.

| Severity | Count | Examples |
|----------|-------|----------|
| Critical | 2 | Unapplied pilot migration; anon temp policies active |
| High | 3 | Admin reads all tenants; admin reads all contracts; executive cannot read distributor orders/quals |
| Medium | 4 | No payment UPDATE; no order DELETE; executive lab UPDATE blocked cross-tenant; inventory_ledger anon |

---

## Migration Dependency Order

1. `production_auth_rls_pilot_migration.sql` — core helpers + base RLS
2. `executive_distributor_lab_create_migration.sql` — executive lab insert
3. `executive_distributor_catalog_inventory_rls.sql` — **required for catalog mirror**
4. `durable_distributor_tenants_migration.sql` — tenants
5. `lab_qualifications_migration.sql` (+ pipeline columns migration)
6. `lab_contracts_migration.sql`

Legacy temp migrations (`order_write`, `payment_write`, `inventory_ledger`) add anon policies that pilot migration **drops** — safe only after pilot runs.

---

## Shared Helper Functions

| Function | Purpose |
|----------|---------|
| `current_profile()` | Active profile for `auth.uid()` |
| `current_tenant_id()` | Profile `tenant_id` |
| `current_user_role()` | Lowercased role |
| `is_admin_or_executive()` | Admin or executive |
| `tenant_id_matches(uuid)` | Row tenant = profile tenant |
| `can_write_ops_for_tenant(uuid)` | Tenant match + admin/executive |
| `can_insert_lab_for_tenant(uuid)` | Executive any tenant; admin own |
| `can_manage_catalog_inventory_for_tenant(uuid)` | Executive any tenant; admin own |
| `can_manage_lab_contract_for_distributor(uuid)` | Executive any distributor; admin own |
| `lab_record_is_visible_to_current_user()` | Tenant + role/lab/agent visibility |

All helpers are `SECURITY DEFINER` and require active profile.

---

## Per-Table Policy Matrix

### `public.tenants`

| Op | Policy | Condition |
|----|--------|-----------|
| SELECT | `tenants_executive_select` | `is_admin_or_executive()` |
| INSERT | `tenants_executive_insert` | `is_admin_or_executive()` |
| UPDATE | `tenants_executive_update` | `is_admin_or_executive()` |
| DELETE | **Missing** | — |

| Role | Access |
|------|--------|
| Executive | R/W all tenants |
| Admin | R/W **all tenants** (no tenant scope) ⚠️ |
| Agent/Lab | None |

**Risks:** Admin cross-tenant metadata leakage. No DELETE policy.

---

### `public.labs`

| Op | Policy |
|----|--------|
| SELECT | `labs_select_by_role` + `labs_executive_select_distributor` |
| INSERT | `labs_insert_distributor_by_role` |
| UPDATE/DELETE | `labs_admin_write` (`FOR ALL`, own tenant) |

| Role | Access |
|------|--------|
| Executive | SELECT all; INSERT all; UPDATE/DELETE **own profile tenant only** |
| Admin | Own-tenant CRUD |
| Agent | SELECT assigned labs |
| Lab | SELECT own lab |

**Risks:** Executive cannot UPDATE/DELETE distributor labs created cross-tenant.

---

### `public.lab_qualifications`

| Op | Policy |
|----|--------|
| SELECT | `lab_qualifications_select_by_role` |
| INSERT | `lab_qualifications_insert_by_role` |
| UPDATE | `lab_qualifications_update_by_role` |
| DELETE | `lab_qualifications_delete_by_role` |

| Role | Access |
|------|--------|
| Executive/Admin | CRUD **own profile tenant only** |
| Agent | R/I/U assigned labs; no DELETE |
| Lab | SELECT own; no write |

**Risks:** **No executive cross-tenant policy.** HQ executive operating Guntur via Distributor OS may fail writes when `profile.tenant_id` = HQ UUID.

**Missing:** Executive cross-tenant read/write for distributor-scoped qualification management.

---

### `public.lab_contracts`

| Op | Policy |
|----|--------|
| SELECT | `lab_contracts_select` |
| INSERT/UPDATE/DELETE | `can_manage_lab_contract_for_distributor()` |

| Role | Access |
|------|--------|
| Executive | CRUD **any distributor** ✅ |
| Admin | **SELECT all contracts** ⚠️; write own tenant |
| Agent/Lab | None |

**Risks:** Admin reads all distributor contracts globally.

---

### `public.orders` (+ `order_items`)

| Op | Policy |
|----|--------|
| SELECT | `orders_select_by_role` |
| INSERT | `orders_insert_by_role` |
| UPDATE | `orders_update_by_role` |
| DELETE | **Missing** |

| Role | Access |
|------|--------|
| Executive/Admin | R/W own profile tenant |
| Lab | SELECT + INSERT own lab |
| Agent | SELECT assigned labs |

**Risks:** Executive cannot read distributor orders cross-tenant. Temp anon policies if pilot not applied.

**Missing:** Executive cross-tenant SELECT; DELETE.

---

### `public.payments`

| Op | Policy |
|----|--------|
| SELECT | `payments_select_by_role` |
| INSERT | `payments_insert_by_role` |
| UPDATE | **Missing** |
| DELETE | **Missing** |

| Role | Access |
|------|--------|
| Executive/Admin | SELECT + INSERT own tenant |
| Agent | SELECT + INSERT assigned labs |
| Lab | SELECT own |

**Risks:** No payment correction path via RLS. Executive cross-tenant gap.

---

### `public.inventory` (+ `products`)

| Op | Policy (effective after catalog RLS migration) |
|----|---------------------------------------------|
| SELECT | `inventory_select_by_role` |
| INSERT/UPDATE/DELETE | `can_manage_catalog_inventory_for_tenant()` |

| Role | Access |
|------|--------|
| Executive | R/W **any distributor tenant** ✅ |
| Admin | Own-tenant R/W |
| Lab | Read-only own tenant |

**Risks:** Migration must be applied; otherwise base `tenant_id_matches` blocks HQ mirror.

---

### `public.purchase_orders`

| Op | Policy |
|----|--------|
| SELECT | `purchase_orders_select_by_role` |
| INSERT/UPDATE/DELETE | `purchase_orders_admin_write` |

| Role | Access |
|------|--------|
| Executive/Admin | Own profile tenant only |
| Agent/Lab | None |

**Risks:** No executive cross-tenant for distributor procurement visibility.

---

### `public.ar_credit_control` (collections)

| Op | Policy |
|----|--------|
| SELECT | Via `lab_record_is_visible_to_current_user` |
| UPDATE | `can_write_ops_for_tenant` |

**Risks:** Same executive cross-tenant gap as orders. Temp anon in legacy migrations.

---

## Cross-Tenant Leakage Risk Matrix

| Risk | Severity | Tables |
|------|----------|--------|
| Unapplied `production_auth_rls_pilot_migration.sql` | **Critical** | orders, payments, inventory, purchase_orders |
| Admin reads all `tenants` | High | tenants |
| Admin reads all `lab_contracts` | High | lab_contracts |
| Executive HQ cannot read distributor ops data | Medium (functional) | orders, payments, lab_qualifications, purchase_orders |
| Executive can insert but not update distributor labs | Medium | labs |
| Temp anon policies still active | Critical (if present) | orders, payments, inventory_ledger |
| Inactive/missing profile blocks all ops | Mitigated | all |

---

## Role Risk Summary

| Role | Primary risks |
|------|---------------|
| **Executive** | Cross-tenant write blocked on qualifications/orders/payments; relies on catalog RLS + lab_contracts migrations |
| **Admin** | Global read on tenants and lab_contracts; otherwise tenant-scoped |
| **Agent** | Scoped to assigned labs; no distributor-wide visibility |
| **Lab** | Own-lab scope only; no contract/qualification write |

---

## Recommended Remediation (No code in this sprint)

1. **Verify applied migrations** in Supabase SQL editor (especially pilot + catalog RLS).
2. Add executive cross-tenant policies for `lab_qualifications`, `orders`, `payments` mirroring `can_manage_lab_contract_for_distributor` pattern.
3. Scope admin SELECT on `lab_contracts` and `tenants` to own tenant or explicit distributor list.
4. Add `payments` UPDATE policy for admin/executive corrections.
5. Confirm all temp anon policies are dropped in production.
6. Run `qa_role_seed_and_rls_validation.sql` probes after migration apply.

---

## File Index

| File | Tables |
|------|--------|
| `supabase/sql/production_auth_rls_pilot_migration.sql` | Core helpers, labs, orders, payments, inventory, POs |
| `supabase/sql/executive_distributor_lab_create_migration.sql` | labs, ar_credit_control |
| `supabase/sql/executive_distributor_catalog_inventory_rls.sql` | products, inventory |
| `supabase/sql/lab_qualifications_migration.sql` | lab_qualifications |
| `supabase/sql/lab_contracts_migration.sql` | lab_contracts |
| `supabase/sql/durable_distributor_tenants_migration.sql` | tenants |
| `primecare_public_schema.sql` | Legacy anon snapshot (pre-migration) |
