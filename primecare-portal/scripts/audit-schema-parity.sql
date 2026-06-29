-- Schema parity introspection for QA vs Production comparison.
-- Run: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/audit-schema-parity.sql -t -A -F '|'

\echo '__TABLES__'
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'labs','ar_credit_control','inventory','inventory_ledger','purchase_orders',
    'orders','products','payments','profiles','lab_ownership'
  )
ORDER BY c.relname;

\echo '__COLUMNS__'
SELECT table_name, column_name, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'labs','ar_credit_control','inventory','inventory_ledger','purchase_orders',
    'orders','products','payments','profiles','lab_ownership'
  )
ORDER BY table_name, ordinal_position;

\echo '__INDEXES__'
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'labs','ar_credit_control','inventory','inventory_ledger','purchase_orders',
    'orders','products','payments','profiles','lab_ownership'
  )
ORDER BY tablename, indexname;

\echo '__CONSTRAINTS__'
SELECT tc.table_name,
       tc.constraint_name,
       tc.constraint_type,
       pg_get_constraintdef(pgc.oid) AS definition
FROM information_schema.table_constraints tc
JOIN pg_constraint pgc
  ON pgc.conname = tc.constraint_name
 AND pgc.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
WHERE tc.table_schema = 'public'
  AND tc.table_name IN (
    'labs','ar_credit_control','inventory','inventory_ledger','purchase_orders',
    'orders','products','payments','profiles','lab_ownership'
  )
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

\echo '__POLICIES__'
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'labs','ar_credit_control','inventory','inventory_ledger','purchase_orders',
    'orders','products','payments','profiles','lab_ownership'
  )
ORDER BY tablename, policyname;

\echo '__FUNCTIONS__'
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS args,
       md5(pg_get_functiondef(p.oid)) AS def_hash
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (
    p.proname IN (
      'current_profile','current_tenant_id','current_user_role','tenant_id_matches',
      'can_insert_lab_for_tenant','can_insert_ar_for_lab','private_labs_row_exists',
      'can_manage_distributor_ops_for_tenant','distributor_lab_record_visible',
      'lab_record_is_visible_to_current_user','lab_is_visible_to_current_user',
      'lab_is_visible_to_executive_distributor','can_write_ops_for_tenant',
      'create_lab_with_ar_credit','primecare_normalize_lab_id'
    )
    OR p.proname LIKE '%lab%'
    OR p.proname LIKE '%inventory%'
    OR p.proname LIKE '%purchase%'
    OR p.proname LIKE '%ar_%'
  )
ORDER BY p.proname, args;

\echo '__GRANTS_TABLE__'
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('authenticated', 'anon', 'service_role')
  AND table_name IN (
    'labs','ar_credit_control','inventory','inventory_ledger','purchase_orders',
    'orders','products','payments','profiles','lab_ownership'
  )
ORDER BY table_name, grantee, privilege_type;

\echo '__GRANTS_FUNCTION__'
SELECT grantee,
       routine_name,
       privilege_type
FROM information_schema.role_routine_grants
WHERE routine_schema = 'public'
  AND grantee IN ('authenticated', 'anon', 'service_role')
  AND routine_name IN (
    'current_profile','current_tenant_id','current_user_role','tenant_id_matches',
    'can_insert_lab_for_tenant','can_insert_ar_for_lab','private_labs_row_exists',
    'can_manage_distributor_ops_for_tenant','distributor_lab_record_visible',
    'lab_record_is_visible_to_current_user','lab_is_visible_to_current_user',
    'lab_is_visible_to_executive_distributor','can_write_ops_for_tenant',
    'create_lab_with_ar_credit','primecare_normalize_lab_id'
  )
ORDER BY routine_name, grantee, privilege_type;
