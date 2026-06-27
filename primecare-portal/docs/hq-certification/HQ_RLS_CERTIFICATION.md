# HQ RLS Certification

**Date:** 2026-06-24T05:30:00Z  
**Environment:** `https://zipuzmfkwwucbchlphcj.supabase.co`  
**Script:** `scripts/verify-hq-rls-reads.mjs`  
**HQ Tenant:** `f168b98f-47a6-42c3-b788-24c00436fac2`

## Runtime results

| Role | Auth | Modules | Result |
|------|------|---------|--------|
| Admin | PASS | 5/5 | **PASS** |
| Executive | PASS | 5/5 | **PASS** |
| Agent | PASS | 5/5 | **PASS** |
| Lab | PASS | 5/5 | **PASS** |

### Agent auth (canonical)

- `qa.test.agent1@primecare.test` / `115f4ce25fa0Aa1!` — browser certification password
- Script `verify-hq-rls-reads.mjs` uses canonical password; auto-repair via admin reset only if login fails

## SQL remediation (requires apply in Supabase)

| Migration | Purpose | Applied in this sprint |
|-----------|---------|------------------------|
| `supabase/sql/hq_profiles_rls_tenant_scope_migration.sql` | Admin tenant-scoped profiles; Executive global read | **Pending DB apply** |
| `supabase/sql/hq_orders_date_index_migration.sql` | Order/payment date indexes | **Pending DB apply** |

## Code remediation (this sprint)

- `validateActorRoleAssignment` + `updateOperationsPlatformUserWrite` actor guard
- `filterPlatformRoleOptionsForActor` in User Provisioning UI
- `scripts/verify-provisioning-role-guard.mjs` — **PASS**

## Overall RLS certification

**PARTIAL PASS** — Admin, Executive, Lab verified. **Agent blocked on auth seed.**
