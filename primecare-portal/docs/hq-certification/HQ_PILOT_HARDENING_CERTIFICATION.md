# HQ Pilot Hardening Certification

**Generated:** 2026-06-24T19:36:03.729Z
**Tenant:** f168b98f-47a6-42c3-b788-24c00436fac2
**Actor:** qa.executive@primecare.test

## Result: FAIL

**Aggregate status:** WARN

### Checks

| ID | Label | Status | Detail |
|----|-------|--------|--------|
| labs_created | Labs created | PASS | 1000 lab(s) |
| labs_owned | Labs owned (primary) | PASS | 51 durable · 999 legacy · 0 unassigned |
| agents_provisioned | Agents provisioned | PASS | 19 active agent(s) |
| contracts_active | Contracts active | PASS | 2 active contract(s) |
| qualification_complete | Qualification complete | PASS | 2 qualified/won lab(s) |
| inventory_available | Inventory available | PASS | 5 SKU(s) with stock > 0 |
| rls_active | RLS active (no temp anon) | WARN | Run pilot_hardening_validation_queries.sql in Supabase |
| ownership_active | Ownership table active | PASS | 51 ACTIVE ownership row(s) |

### Summary

- Labs: 1000
- Unassigned: 0
- Agents: 19
- Active contracts: 2
- Qualified labs: 2
- SKUs in stock: 5
- temp_anon policies: unknown

### Critical warnings

- **rls_active**: Run pilot_hardening_validation_queries.sql in Supabase
