-- Lab Ordering 1F QA grant/policy inspect. READ ONLY.
-- Execute only against zipuzmfkwwucbchlphcj.

SELECT json_build_object(
  'expected_project_ref', 'zipuzmfkwwucbchlphcj',
  'rls', (
    SELECT json_agg(json_build_object(
      'table_name', c.relname,
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity
    ) ORDER BY c.relname)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('orders', 'order_items', 'order_lines')
  ),
  'policies', (
    SELECT coalesce(json_agg(json_build_object(
      'tablename', tablename,
      'policyname', policyname,
      'roles', roles::text,
      'cmd', cmd,
      'qual', qual,
      'with_check', with_check
    ) ORDER BY tablename, policyname), '[]'::json)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('orders', 'order_items', 'order_lines')
  ),
  'anon_policies', (
    SELECT coalesce(json_agg(json_build_object(
      'tablename', tablename,
      'policyname', policyname,
      'roles', roles::text,
      'cmd', cmd
    ) ORDER BY tablename, policyname), '[]'::json)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('orders', 'order_items', 'order_lines')
      AND 'anon' = ANY (roles)
  ),
  'grants', (
    SELECT coalesce(json_agg(json_build_object(
      'grantee', grantee,
      'table_name', table_name,
      'privilege_type', privilege_type
    ) ORDER BY table_name, grantee, privilege_type), '[]'::json)
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('orders', 'order_items', 'order_lines')
      AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
  ),
  'priv_anon', (
    SELECT json_agg(json_build_object(
      'table_name', t.tbl,
      'select', has_table_privilege('anon', format('public.%I', t.tbl), 'SELECT'),
      'insert', has_table_privilege('anon', format('public.%I', t.tbl), 'INSERT'),
      'update', has_table_privilege('anon', format('public.%I', t.tbl), 'UPDATE'),
      'delete', has_table_privilege('anon', format('public.%I', t.tbl), 'DELETE'),
      'truncate', has_table_privilege('anon', format('public.%I', t.tbl), 'TRUNCATE'),
      'trigger', has_table_privilege('anon', format('public.%I', t.tbl), 'TRIGGER'),
      'references', has_table_privilege('anon', format('public.%I', t.tbl), 'REFERENCES')
    ) ORDER BY t.tbl)
    FROM (VALUES ('order_items'), ('order_lines'), ('orders')) AS t(tbl)
  ),
  'priv_authenticated', (
    SELECT json_agg(json_build_object(
      'table_name', t.tbl,
      'select', has_table_privilege('authenticated', format('public.%I', t.tbl), 'SELECT'),
      'insert', has_table_privilege('authenticated', format('public.%I', t.tbl), 'INSERT'),
      'update', has_table_privilege('authenticated', format('public.%I', t.tbl), 'UPDATE'),
      'delete', has_table_privilege('authenticated', format('public.%I', t.tbl), 'DELETE')
    ) ORDER BY t.tbl)
    FROM (VALUES ('order_items'), ('order_lines'), ('orders')) AS t(tbl)
  ),
  'priv_service_role', (
    SELECT json_agg(json_build_object(
      'table_name', t.tbl,
      'select', has_table_privilege('service_role', format('public.%I', t.tbl), 'SELECT'),
      'insert', has_table_privilege('service_role', format('public.%I', t.tbl), 'INSERT'),
      'update', has_table_privilege('service_role', format('public.%I', t.tbl), 'UPDATE'),
      'delete', has_table_privilege('service_role', format('public.%I', t.tbl), 'DELETE')
    ) ORDER BY t.tbl)
    FROM (VALUES ('order_items'), ('order_lines'), ('orders')) AS t(tbl)
  ),
  'schema_migrations', (
    SELECT coalesce(json_agg(json_build_object('version', version) ORDER BY version), '[]'::json)
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('20260905120000', '20260905130000', '20260905140000')
  ),
  'create_lab_order', (
    SELECT json_agg(json_build_object(
      'identity', pg_get_function_identity_arguments(p.oid),
      'md5', md5(pg_get_functiondef(p.oid)),
      'mentions_client_unit_price', pg_get_functiondef(p.oid) ILIKE '%unit_price%',
      'mentions_selling_price', pg_get_functiondef(p.oid) ILIKE '%selling_price%'
    ))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_lab_order'
  ),
  'v_lab_catalog', (
    SELECT json_build_object(
      'md5', md5(pg_get_viewdef('public.v_lab_catalog'::regclass, true)),
      'tenant_join', pg_get_viewdef('public.v_lab_catalog'::regclass, true) ILIKE '%p.tenant_id = i.tenant_id%'
    )
  )
) AS inspect;
