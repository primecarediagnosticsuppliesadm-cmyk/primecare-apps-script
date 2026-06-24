# HQ RLS Read Verification Report

Generated: 2026-06-23T03:58:29.644Z
Environment: https://zipuzmfkwwucbchlphcj.supabase.co

## Summary

| Role | Auth | Profile role | Tenant | Modules OK |
|------|------|--------------|--------|------------|
| admin | PASS | admin | f168b98f-47a6-42c3-b788-24c00436fac2 | 5/5 |
| executive | PASS | executive | f168b98f-47a6-42c3-b788-24c00436fac2 | 5/5 |
| agent | FAIL | — | — | — |
| lab | PASS | lab | f168b98f-47a6-42c3-b788-24c00436fac2 | 5/5 |

## Module matrix

| Role | Module | Table | Rows | Status | Error |
|------|--------|-------|------|--------|-------|
| admin | Orders | orders | 15 | PASS | — |
| admin | Labs | v_labs_credit | 3 | PASS | — |
| admin | Collections | ar_credit_control | 3 | PASS | — |
| admin | Inventory | v_stock_dashboard | 7 | PASS | — |
| admin | Users | profiles | 14 | PASS | — |
| executive | Orders | orders | 15 | PASS | — |
| executive | Labs | v_labs_credit | 5 | PASS | — |
| executive | Collections | ar_credit_control | 5 | PASS | — |
| executive | Inventory | v_stock_dashboard | 7 | PASS | — |
| executive | Users | profiles | 14 | PASS | — |
| agent | — | — | — | AUTH_FAIL | Invalid login credentials |
| lab | Orders | orders | 13 | PASS | — |
| lab | Labs | v_labs_credit | 1 | PASS | — |
| lab | Collections | ar_credit_control | 1 | PASS | — |
| lab | Inventory | v_stock_dashboard | 7 | PASS | — |
| lab | Users | profiles | 1 | PASS | — |

## Expectations (QA seed)

- **Admin / Executive**: broad read on orders, labs, collections, inventory, tenant users.
- **Agent**: scoped reads (assigned labs/orders); zero rows is OK when RLS restricts.
- **Lab**: own-lab scope on orders/collections; inventory/users may be empty or denied.

## Result: PARTIAL PASS — Admin, Executive, Lab reads OK; Agent auth blocked (QA credential)

**Agent note:** `qa.agent@primecare.test` / `1234` returned `Invalid login credentials` in live Supabase. Re-seed agent auth user or update script credentials before Agent RLS sign-off.
