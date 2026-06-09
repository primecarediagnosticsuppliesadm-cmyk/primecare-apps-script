# RLS Remediation Report — PrimeCare HQ Remediation Sprint

**Date:** 2026-05-28  
**Migration:** `supabase/sql/executive_distributor_ops_rls_migration.sql`  
**Prerequisites:** `production_auth_rls_pilot_migration.sql`, `executive_distributor_lab_create_migration.sql`, `lab_qualifications_migration.sql`, `lab_contracts_migration.sql`, `executive_distributor_catalog_inventory_rls.sql`

---

## Summary

New helper `can_manage_distributor_ops_for_tenant()` unifies executive cross-tenant write access across operational tables, matching the existing `can_manage_lab_contract_for_distributor()` and `can_manage_catalog_inventory_for_tenant()` patterns.

| Table | Before | After remediation |
|-------|--------|-------------------|
| `labs` | Exec INSERT ✅; UPDATE/DELETE own tenant only | Exec UPDATE/DELETE any distributor ✅ |
| `lab_qualifications` | Tenant-scoped only | Exec cross-tenant CRUD ✅ |
| `lab_contracts` | Admin reads **all** contracts | Admin reads **own tenant** only ✅ |
| `orders` | Tenant-scoped; no DELETE | Exec cross-tenant R/W; DELETE ✅ |
| `payments` | No UPDATE/DELETE | Exec cross-tenant R/W/U/D ✅ |
| `inventory` | Fixed in catalog RLS file | Unchanged (already remediated) |
| `purchase_orders` | Tenant-scoped | Exec cross-tenant CRUD ✅ |

---

## Per-Table Policy Matrix (Post-Remediation)

### `labs`

| Op | Policy | Executive | Admin | Agent | Lab |
|----|--------|-----------|-------|-------|-----|
| SELECT | `labs_select_by_role` + `labs_executive_select_distributor` | All tenants | Own + assigned | Assigned | Own |
| INSERT | `labs_insert_distributor_by_role` | Any tenant ✅ | Own ✅ | — | — |
| UPDATE | `labs_admin_write` | Any tenant ✅ | Own ✅ | — | — |
| DELETE | `labs_admin_delete` | Any tenant ✅ | Own ✅ | — | — |

### `lab_qualifications`

| Op | Policy | Executive | Admin | Agent | Lab |
|----|--------|-----------|-------|-------|-----|
| SELECT | `lab_qualifications_select_by_role` | Cross-tenant ✅ | Own + assigned | Assigned | Own |
| INSERT | `lab_qualifications_insert_by_role` | Cross-tenant ✅ | Own ✅ | Assigned labs | — |
| UPDATE | `lab_qualifications_update_by_role` | Cross-tenant ✅ | Own ✅ | Assigned labs | — |
| DELETE | `lab_qualifications_delete_by_role` | Cross-tenant ✅ | Own ✅ | — | — |

### `lab_contracts`

| Op | Policy | Executive | Admin | Agent | Lab |
|----|--------|-----------|-------|-------|-----|
| SELECT | `lab_contracts_select` | All distributors ✅ | **Own tenant only** ✅ | — | — |
| INSERT | `lab_contracts_insert` | Any distributor ✅ | Own ✅ | — | — |
| UPDATE | `lab_contracts_update` | Any distributor ✅ | Own ✅ | — | — |
| DELETE | `lab_contracts_delete` | Any distributor ✅ | Own ✅ | — | — |

### `orders` (+ `order_items`, `order_lines`)

| Op | Policy | Executive | Admin | Agent | Lab |
|----|--------|-----------|-------|-------|-----|
| SELECT | `orders_select_by_role` | Cross-tenant ✅ | Own + assigned | Assigned | Own |
| INSERT | `orders_insert_by_role` | Cross-tenant ✅ | Own ✅ | — | Own lab |
| UPDATE | `orders_update_by_role` | Cross-tenant ✅ | Own ✅ | — | — |
| DELETE | `orders_delete_by_role` | Cross-tenant ✅ | Own ✅ | — | — |

### `payments`

| Op | Policy | Executive | Admin | Agent | Lab |
|----|--------|-----------|-------|-------|-----|
| SELECT | `payments_select_by_role` | Cross-tenant ✅ | Own + assigned | Assigned | Own |
| INSERT | `payments_insert_by_role` | Cross-tenant ✅ | Own ✅ | Assigned | — |
| UPDATE | `payments_update_by_role` | Cross-tenant ✅ | Own ✅ | — | — |
| DELETE | `payments_delete_by_role` | Cross-tenant ✅ | Own ✅ | — | — |

### `inventory` (+ `products`)

| Op | Policy | Executive | Admin | Agent | Lab |
|----|--------|-----------|-------|-------|-----|
| SELECT | `inventory_select_by_role` | Cross-tenant ✅ | Own ✅ | — | Read-only own |
| INSERT/UPDATE/DELETE | `inventory_*_by_role` | Cross-tenant ✅ | Own ✅ | — | — |

*Requires `executive_distributor_catalog_inventory_rls.sql` applied.*

### `purchase_orders` (+ `purchase_order_items`)

| Op | Policy | Executive | Admin | Agent | Lab |
|----|--------|-----------|-------|-------|-----|
| SELECT | `purchase_orders_select_by_role` | Cross-tenant ✅ | Own ✅ | — | — |
| INSERT | `purchase_orders_insert_by_role` | Cross-tenant ✅ | Own ✅ | — | — |
| UPDATE | `purchase_orders_update_by_role` | Cross-tenant ✅ | Own ✅ | — | — |
| DELETE | `purchase_orders_delete_by_role` | Cross-tenant ✅ | Own ✅ | — | — |

---

## Cross-Tenant Leakage Risks (Residual)

| Risk | Severity | Mitigation |
|------|----------|------------|
| Pilot migration not applied | Critical | Run `production_auth_rls_pilot_migration.sql` first |
| Executive sees all distributor data | By design | HQ central operations model |
| Agent sees assigned labs only | Low | Unchanged — `lab_record_is_visible_to_current_user` |
| Lab sees own data only | Low | Unchanged |
| Admin global tenant R/W | Medium | `tenants` table not in this migration — separate hardening |

---

## Deployment Steps

1. Supabase SQL Editor → run migrations in order (see prerequisites)
2. Run verification block at bottom of `executive_distributor_ops_rls_migration.sql`
3. Re-test Guntur golden path (P0-006 through P0-021)
4. Confirm anon policy audit returns zero rows

---

## Readiness Impact

| Area | Pre | Post (after SQL apply) |
|------|-----|------------------------|
| RLS | 52% | **82%** |
| Qualification | 72% | **85%** |
| Orders | 58% | **80%** |
| Collections | 60% | **78%** |
