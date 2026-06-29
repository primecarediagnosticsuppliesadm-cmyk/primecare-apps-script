-- Run in Production Supabase SQL editor AFTER production_rls_parity_lab_ar_insert_patch.sql
-- Expect: ar_credit_insert_by_role present; no anon write policies; helpers match QA.

-- 1) RLS enabled on focus tables
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'labs', 'ar_credit_control', 'profiles', 'lab_ownership', 'orders',
    'order_items', 'inventory', 'inventory_ledger', 'products',
    'purchase_orders', 'payments'
  )
ORDER BY c.relname;

-- 2) INSERT policies on labs + ar_credit_control (prod must have both)
SELECT tablename, policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('labs', 'ar_credit_control')
  AND cmd IN ('INSERT', 'ALL')
ORDER BY tablename, policyname;

-- 3) No anon write policies on pilot-critical tables
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY (roles)
  AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  AND tablename IN (
    'labs', 'ar_credit_control', 'profiles', 'lab_ownership', 'orders',
    'order_items', 'inventory', 'inventory_ledger', 'products',
    'purchase_orders', 'payments'
  )
ORDER BY tablename, policyname;
-- Expected: 0 rows

-- 4) Helper functions present
SELECT p.proname AS function_name
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'current_profile', 'current_tenant_id', 'current_user_role', 'tenant_id_matches',
    'can_insert_lab_for_tenant', 'can_insert_ar_for_lab',
    'can_manage_distributor_ops_for_tenant', 'distributor_lab_record_visible',
    'lab_record_is_visible_to_current_user', 'lab_is_visible_to_current_user',
    'lab_is_visible_to_executive_distributor'
  )
ORDER BY p.proname;

-- 5) Table grants for authenticated (INSERT on ar_credit_control required)
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('authenticated', 'anon', 'service_role')
  AND table_name IN (
    'labs', 'ar_credit_control', 'profiles', 'lab_ownership', 'orders',
    'order_items', 'inventory', 'inventory_ledger', 'products',
    'purchase_orders', 'payments'
  )
  AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
ORDER BY table_name, grantee, privilege_type;

-- 6) Smoke: admin session RPC (run while logged in as prod admin in SQL editor is N/A;
--    use browser Network tab or scripts/audit-rls-parity-fast.mjs with prod creds)
--    can_insert_ar_for_lab(<tenant_uuid>, '<lab_id>') must return true immediately after labs insert.
