-- PrimeCare QA Role Seed + RLS Validation
-- Purpose: prove Supabase Auth + profiles + RLS isolation for LAB, AGENT, ADMIN, EXECUTIVE.
-- Run only in the QA Supabase project after production_auth_rls_pilot_migration.sql.
--
-- Schema-aligned with imported public tables (uuid tenant_id, no payments.collected_by, etc.).
--
-- IMPORTANT:
-- 1) Create QA users in Supabase Auth first:
--    qa.lab@primecare.test
--    qa.agent@primecare.test
--    qa.admin@primecare.test
--    qa.executive@primecare.test
--    qa.inactive@primecare.test   (required for inactive-profile RLS test)
-- 2) Copy lab/agent/admin/executive Auth UUIDs into params + validation blocks below.
-- 3) Inactive test resolves qa.inactive@primecare.test from auth.users (no fake UUID).
-- 4) Uses public.tenants (tenant_code = 'qa-tenant-001') for uuid tenant_id.
-- 5) Do not run this against Production.
-- 6) Validation blocks use SET LOCAL ROLE authenticated and request.jwt.claims.

-- ---------------------------------------------------------------------------
-- QA seed data (idempotent)
-- ---------------------------------------------------------------------------
WITH ensure_tenant AS (
  INSERT INTO public.tenants (tenant_code, tenant_name, status)
  VALUES ('qa-tenant-001', 'QA Test Tenant', 'ACTIVE')
  ON CONFLICT (tenant_code) DO UPDATE
  SET tenant_name = EXCLUDED.tenant_name,
      status = EXCLUDED.status
  RETURNING id
),
params AS (
  SELECT
    COALESCE(
      (SELECT id FROM ensure_tenant),
      (SELECT id FROM public.tenants WHERE tenant_code = 'qa-tenant-001')
    ) AS tenant_id,
    '2b4daada-03f4-4159-aed7-e7d6e9535d0c'::uuid AS lab_user_id,
    'c8472ffd-6398-47b9-a087-3752a7490ff3'::uuid AS agent_user_id,
    '7b1fa41c-ad14-44d4-a16a-d91073dc91e6'::uuid AS admin_user_id,
    '23377bff-d1c7-4195-8b8e-b87bbc50fb43'::uuid AS executive_user_id
),
seed_profiles AS (
  INSERT INTO public.profiles (
    user_id,
    tenant_id,
    role,
    lab_id,
    agent_id,
    agent_name,
    active
  )
  SELECT lab_user_id, tenant_id, 'lab', 'QA_LAB_001', NULL, NULL, true FROM params
  UNION ALL
  SELECT agent_user_id, tenant_id, 'agent', NULL, 'QA_AGENT_001', 'QA Agent One', true FROM params
  UNION ALL
  SELECT admin_user_id, tenant_id, 'admin', NULL, NULL, NULL, true FROM params
  UNION ALL
  SELECT executive_user_id, tenant_id, 'executive', NULL, NULL, NULL, true FROM params
  ON CONFLICT (user_id) DO UPDATE
  SET
    tenant_id = EXCLUDED.tenant_id,
    role = EXCLUDED.role,
    lab_id = EXCLUDED.lab_id,
    agent_id = EXCLUDED.agent_id,
    agent_name = EXCLUDED.agent_name,
    active = EXCLUDED.active
  RETURNING user_id
),
seed_labs AS (
  INSERT INTO public.labs (
    tenant_id,
    lab_id,
    lab_name,
    assigned_agent_id,
    agent_id,
    agent_name,
    active
  )
  SELECT tenant_id, 'QA_LAB_001', 'QA Alpha Diagnostics', 'QA_AGENT_001', 'QA_AGENT_001', 'QA Agent One', true FROM params
  UNION ALL
  SELECT tenant_id, 'QA_LAB_002', 'QA Beta Labs', 'QA_AGENT_001', 'QA_AGENT_001', 'QA Agent One', true FROM params
  UNION ALL
  SELECT tenant_id, 'QA_LAB_003', 'QA Gamma Unassigned', 'QA_AGENT_999', 'QA_AGENT_999', 'Other QA Agent', true FROM params
  ON CONFLICT (tenant_id, lab_id) DO UPDATE
  SET
    lab_name = EXCLUDED.lab_name,
    assigned_agent_id = EXCLUDED.assigned_agent_id,
    agent_id = EXCLUDED.agent_id,
    agent_name = EXCLUDED.agent_name,
    active = EXCLUDED.active
  RETURNING lab_id
),
seed_products AS (
  INSERT INTO public.products (
    tenant_id,
    product_id,
    product_name,
    category,
    active
  )
  SELECT tenant_id, 'QA_SKU_001', 'QA Test Kit A', 'Consumables', true FROM params
  UNION ALL
  SELECT tenant_id, 'QA_SKU_002', 'QA Test Kit B', 'Consumables', true FROM params
  UNION ALL
  SELECT tenant_id, 'QA_SKU_003', 'QA Test Kit C', 'Consumables', true FROM params
  ON CONFLICT (tenant_id, product_id) DO UPDATE
  SET product_name = EXCLUDED.product_name, active = EXCLUDED.active
  RETURNING product_id
),
seed_orders AS (
  INSERT INTO public.orders (
    tenant_id,
    order_id,
    lab_id,
    order_date,
    status,
    total_amount,
    created_by,
    created_at
  )
  SELECT tenant_id, 'QA_ORD_001', 'QA_LAB_001', (current_date - 2)::timestamptz, 'Placed', 1200, 'qa.lab@primecare.test', now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_ORD_002', 'QA_LAB_002', (current_date - 1)::timestamptz, 'Fulfilled', 2400, 'qa.agent@primecare.test', now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_ORD_003', 'QA_LAB_003', current_date::timestamptz, 'Placed', 3600, 'other.agent@primecare.test', now() FROM params
  ON CONFLICT (tenant_id, order_id) DO UPDATE
  SET
    lab_id = EXCLUDED.lab_id,
    status = EXCLUDED.status,
    total_amount = EXCLUDED.total_amount
  RETURNING order_id
),
seed_order_lines AS (
  INSERT INTO public.order_lines (
    tenant_id,
    order_id,
    product_id,
    product_name,
    quantity,
    unit_selling_price,
    net_line_total,
    created_at
  )
  SELECT tenant_id, 'QA_ORD_001', 'QA_SKU_001', 'QA Test Kit A', 2, 600, 1200, now() FROM params
  WHERE NOT EXISTS (
    SELECT 1 FROM public.order_lines ol
    WHERE ol.tenant_id = (SELECT tenant_id FROM params)
      AND ol.order_id = 'QA_ORD_001'
      AND ol.product_id = 'QA_SKU_001'
  )
  UNION ALL
  SELECT tenant_id, 'QA_ORD_002', 'QA_SKU_002', 'QA Test Kit B', 3, 800, 2400, now() FROM params
  WHERE NOT EXISTS (
    SELECT 1 FROM public.order_lines ol
    WHERE ol.tenant_id = (SELECT tenant_id FROM params)
      AND ol.order_id = 'QA_ORD_002'
      AND ol.product_id = 'QA_SKU_002'
  )
  UNION ALL
  SELECT tenant_id, 'QA_ORD_003', 'QA_SKU_003', 'QA Test Kit C', 4, 900, 3600, now() FROM params
  WHERE NOT EXISTS (
    SELECT 1 FROM public.order_lines ol
    WHERE ol.tenant_id = (SELECT tenant_id FROM params)
      AND ol.order_id = 'QA_ORD_003'
      AND ol.product_id = 'QA_SKU_003'
  )
  RETURNING order_id
),
seed_order_items AS (
  INSERT INTO public.order_items (
    tenant_id,
    order_item_id,
    order_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    total_price,
    created_at
  )
  SELECT tenant_id, 'QA_OI_001', 'QA_ORD_001', 'QA_SKU_001', 'QA Test Kit A', 2, 600, 1200, now() FROM params
  WHERE NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_item_id = 'QA_OI_001')
  UNION ALL
  SELECT tenant_id, 'QA_OI_002', 'QA_ORD_002', 'QA_SKU_002', 'QA Test Kit B', 3, 800, 2400, now() FROM params
  WHERE NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_item_id = 'QA_OI_002')
  UNION ALL
  SELECT tenant_id, 'QA_OI_003', 'QA_ORD_003', 'QA_SKU_003', 'QA Test Kit C', 4, 900, 3600, now() FROM params
  WHERE NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.order_item_id = 'QA_OI_003')
  RETURNING order_item_id
),
seed_payments AS (
  INSERT INTO public.payments (
    tenant_id,
    payment_id,
    order_id,
    lab_id,
    amount_received,
    payment_date,
    mode,
    outstanding_balance,
    created_at
  )
  SELECT tenant_id, 'QA_PAY_001', 'QA_ORD_001', 'QA_LAB_001', 300, now(), 'Cash', 900, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_PAY_002', 'QA_ORD_002', 'QA_LAB_002', 1000, now(), 'UPI', 1400, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_PAY_003', 'QA_ORD_003', 'QA_LAB_003', 500, now(), 'Bank', 3100, now() FROM params
  ON CONFLICT (tenant_id, payment_id) DO UPDATE
  SET
    lab_id = EXCLUDED.lab_id,
    amount_received = EXCLUDED.amount_received,
    outstanding_balance = EXCLUDED.outstanding_balance
  RETURNING payment_id
),
seed_ar AS (
  INSERT INTO public.ar_credit_control (
    tenant_id,
    lab_id,
    lab_name,
    outstanding,
    total_paid,
    updated_at
  )
  SELECT tenant_id, 'QA_LAB_001', 'QA Alpha Diagnostics', 900, 300, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_LAB_002', 'QA Beta Labs', 1400, 1000, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_LAB_003', 'QA Gamma Unassigned', 3100, 500, now() FROM params
  ON CONFLICT (tenant_id, lab_id) DO UPDATE
  SET
    outstanding = EXCLUDED.outstanding,
    total_paid = EXCLUDED.total_paid,
    updated_at = EXCLUDED.updated_at
  RETURNING lab_id
),
seed_visits AS (
  INSERT INTO public.agent_visits (
    tenant_id,
    visit_id,
    lab_id,
    agent_id,
    visit_date,
    visit_type,
    notes,
    created_at
  )
  SELECT tenant_id, 'QA_VIS_001', 'QA_LAB_001', 'QA_AGENT_001', (current_date - 1)::timestamptz, 'Follow-up', 'QA assigned visit', now() FROM params
  WHERE NOT EXISTS (SELECT 1 FROM public.agent_visits v WHERE v.visit_id = 'QA_VIS_001')
  UNION ALL
  SELECT tenant_id, 'QA_VIS_002', 'QA_LAB_002', 'QA_AGENT_001', current_date::timestamptz, 'Collection', 'QA assigned collection visit', now() FROM params
  WHERE NOT EXISTS (SELECT 1 FROM public.agent_visits v WHERE v.visit_id = 'QA_VIS_002')
  UNION ALL
  SELECT tenant_id, 'QA_VIS_003', 'QA_LAB_003', 'QA_AGENT_999', current_date::timestamptz, 'Support', 'QA unassigned visit', now() FROM params
  WHERE NOT EXISTS (SELECT 1 FROM public.agent_visits v WHERE v.visit_id = 'QA_VIS_003')
  RETURNING visit_id
),
seed_inventory AS (
  INSERT INTO public.inventory (
    tenant_id,
    product_id,
    current_stock,
    min_stock,
    reorder_qty,
    updated_at
  )
  SELECT tenant_id, 'QA_SKU_001', 100, 10, 20, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_SKU_002', 50, 10, 20, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_SKU_003', 25, 10, 20, now() FROM params
  ON CONFLICT (tenant_id, product_id) DO UPDATE
  SET current_stock = EXCLUDED.current_stock, updated_at = EXCLUDED.updated_at
  RETURNING product_id
),
seed_inventory_ledger AS (
  INSERT INTO public.inventory_ledger (
    tenant_id,
    movement_type,
    product_id,
    product_name,
    order_id,
    quantity,
    stock_before,
    stock_after,
    created_by,
    created_at
  )
  SELECT tenant_id, 'ORDER_OUT', 'QA_SKU_001', 'QA Test Kit A', 'QA_ORD_001', 2, 102, 100, 'qa.lab@primecare.test', now() FROM params
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_ledger il
    WHERE il.tenant_id = (SELECT tenant_id FROM params)
      AND il.order_id = 'QA_ORD_001'
      AND il.product_id = 'QA_SKU_001'
      AND il.movement_type = 'ORDER_OUT'
  )
  UNION ALL
  SELECT tenant_id, 'ORDER_OUT', 'QA_SKU_002', 'QA Test Kit B', 'QA_ORD_002', 3, 53, 50, 'qa.agent@primecare.test', now() FROM params
  WHERE NOT EXISTS (
    SELECT 1 FROM public.inventory_ledger il
    WHERE il.tenant_id = (SELECT tenant_id FROM params)
      AND il.order_id = 'QA_ORD_002'
      AND il.product_id = 'QA_SKU_002'
      AND il.movement_type = 'ORDER_OUT'
  )
  RETURNING product_id
),
seed_purchase_orders AS (
  INSERT INTO public.purchase_orders (
    tenant_id,
    po_id,
    po_date,
    product_id,
    product_name,
    quantity,
    received_qty,
    unit_cost,
    total_cost,
    supplier,
    status,
    created_at,
    updated_at
  )
  SELECT tenant_id, 'QA_PO_001', current_date, 'QA_SKU_001', 'QA Test Kit A', 20, 0, 100, 2000, 'QA Supplier', 'Draft', now(), now() FROM params
  WHERE NOT EXISTS (SELECT 1 FROM public.purchase_orders po WHERE po.po_id = 'QA_PO_001')
  RETURNING po_id
),
seed_purchase_order_items AS (
  INSERT INTO public.purchase_order_items (
    tenant_id,
    po_id,
    product_id,
    product_name,
    quantity,
    received_qty,
    unit_cost,
    total_cost,
    created_at,
    updated_at
  )
  SELECT tenant_id, 'QA_PO_001', 'QA_SKU_001', 'QA Test Kit A', 20, 0, 100, 2000, now(), now() FROM params
  WHERE NOT EXISTS (
    SELECT 1 FROM public.purchase_order_items poi
    WHERE poi.po_id = 'QA_PO_001' AND poi.product_id = 'QA_SKU_001'
  )
  RETURNING po_id
)
SELECT
  'QA seed complete. Replace placeholder UUIDs with real Supabase Auth user IDs before validation.' AS status,
  (SELECT count(*) FROM seed_profiles) AS profiles_upserted,
  (SELECT count(*) FROM seed_labs) AS labs_upserted,
  (SELECT count(*) FROM seed_orders) AS orders_upserted,
  (SELECT count(*) FROM seed_payments) AS payments_upserted;

-- ---------------------------------------------------------------------------
-- RLS validation helpers
-- ---------------------------------------------------------------------------
-- Replace the UUIDs in each block with the matching QA Auth user IDs.
-- Expected row counts assume the seed data above.

-- LAB user: should see QA_LAB_001 only.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '2b4daada-03f4-4159-aed7-e7d6e9535d0c';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"2b4daada-03f4-4159-aed7-e7d6e9535d0c","role":"authenticated"}';

SELECT 'LAB orders visible' AS test, array_agg(order_id ORDER BY order_id) AS visible_order_ids FROM public.orders;
SELECT 'LAB payments visible' AS test, array_agg(payment_id ORDER BY payment_id) AS visible_payment_ids FROM public.payments;
SELECT 'LAB AR visible' AS test, array_agg(lab_id ORDER BY lab_id) AS visible_ar_lab_ids FROM public.ar_credit_control;
SELECT 'LAB cross-lab blocked' AS test, count(*) AS should_be_zero FROM public.orders WHERE lab_id <> 'QA_LAB_001';
ROLLBACK;

-- AGENT user: should see assigned QA_LAB_001 and QA_LAB_002, not QA_LAB_003.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'c8472ffd-6398-47b9-a087-3752a7490ff3';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"c8472ffd-6398-47b9-a087-3752a7490ff3","role":"authenticated"}';

SELECT 'AGENT labs visible' AS test, array_agg(lab_id ORDER BY lab_id) AS visible_lab_ids FROM public.labs;
SELECT 'AGENT orders visible' AS test, array_agg(order_id ORDER BY order_id) AS visible_order_ids FROM public.orders;
SELECT 'AGENT visits visible' AS test, array_agg(visit_id ORDER BY visit_id) AS visible_visit_ids FROM public.agent_visits;
SELECT 'AGENT unassigned lab blocked' AS test, count(*) AS should_be_zero FROM public.labs WHERE lab_id = 'QA_LAB_003';
ROLLBACK;

-- ADMIN user: should see all QA tenant operational data.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '7b1fa41c-ad14-44d4-a16a-d91073dc91e6';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"7b1fa41c-ad14-44d4-a16a-d91073dc91e6","role":"authenticated"}';

SELECT 'ADMIN labs visible' AS test, count(*) AS expected_at_least_three FROM public.labs;
SELECT 'ADMIN orders visible' AS test, count(*) AS expected_at_least_three FROM public.orders;
SELECT 'ADMIN inventory visible' AS test, count(*) AS expected_at_least_three FROM public.inventory;
SELECT 'ADMIN purchase orders visible' AS test, count(*) AS expected_at_least_one FROM public.purchase_orders;
ROLLBACK;

-- EXECUTIVE user: should see tenant-wide operational/dashboard data.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '23377bff-d1c7-4195-8b8e-b87bbc50fb43';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"23377bff-d1c7-4195-8b8e-b87bbc50fb43","role":"authenticated"}';

SELECT 'EXECUTIVE labs visible' AS test, count(*) AS expected_at_least_three FROM public.labs;
SELECT 'EXECUTIVE orders visible' AS test, count(*) AS expected_at_least_three FROM public.orders;
SELECT 'EXECUTIVE AR visible' AS test, count(*) AS expected_at_least_three FROM public.ar_credit_control;
SELECT 'EXECUTIVE inventory health visible' AS test, count(*) AS expected_at_least_three FROM public.inventory;
ROLLBACK;

-- Missing profile: should see no pilot-critical rows.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000009999';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000009999","role":"authenticated"}';

SELECT 'MISSING PROFILE orders blocked' AS test, count(*) AS should_be_zero FROM public.orders;
SELECT 'MISSING PROFILE labs blocked' AS test, count(*) AS should_be_zero FROM public.labs;
ROLLBACK;

-- Inactive profile (optional): requires real Auth user qa.inactive@primecare.test.
-- profiles.user_id FK references auth.users(id) — never use fake UUIDs here.
WITH inactive_auth AS (
  SELECT u.id AS inactive_user_id
  FROM auth.users u
  WHERE lower(u.email) = lower('qa.inactive@primecare.test')
  LIMIT 1
),
inactive_seed AS (
  INSERT INTO public.profiles (user_id, tenant_id, role, lab_id, active)
  SELECT
    ia.inactive_user_id,
    t.id,
    'lab',
    'QA_LAB_001',
    false
  FROM inactive_auth ia
  CROSS JOIN public.tenants t
  WHERE t.tenant_code = 'qa-tenant-001'
  ON CONFLICT (user_id) DO UPDATE SET active = false
  RETURNING user_id
)
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM inactive_auth)
    THEN 'Inactive profile seeded for qa.inactive@primecare.test'
    ELSE 'SKIP inactive seed: create qa.inactive@primecare.test in Supabase Auth'
  END AS inactive_seed_status,
  (SELECT count(*) FROM inactive_seed) AS profiles_touched;

-- Inactive profile RLS validation (skipped automatically if Auth user missing).
DO $$
DECLARE
  inactive_user_id uuid;
  order_count bigint;
  lab_count bigint;
BEGIN
  SELECT u.id
  INTO inactive_user_id
  FROM auth.users u
  WHERE lower(u.email) = lower('qa.inactive@primecare.test')
  LIMIT 1;

  IF inactive_user_id IS NULL THEN
    RAISE NOTICE 'SKIP inactive profile RLS validation: create qa.inactive@primecare.test in Supabase Auth, then re-run the inactive block.';
    RETURN;
  END IF;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', inactive_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', inactive_user_id::text, 'role', 'authenticated')::text,
    true
  );

  SELECT count(*) INTO order_count FROM public.orders;
  SELECT count(*) INTO lab_count FROM public.labs;

  RAISE NOTICE 'INACTIVE PROFILE orders visible (expect 0): %', order_count;
  RAISE NOTICE 'INACTIVE PROFILE labs visible (expect 0): %', lab_count;
END $$;

-- Unknown role (optional manual check): should fail profiles role CHECK constraint.
-- Use a real auth.users UUID if testing manually — do not use fake UUIDs (FK violation).
-- INSERT INTO public.profiles (user_id, tenant_id, role, active)
-- VALUES (
--   (SELECT id FROM auth.users WHERE lower(email) = lower('qa.inactive@primecare.test')),
--   (SELECT id FROM public.tenants WHERE tenant_code = 'qa-tenant-001'),
--   'UNKNOWN',
--   true
-- );

-- ---------------------------------------------------------------------------
-- Direct API/browser-console validation
-- ---------------------------------------------------------------------------
-- For each QA user, log in through the app, then run browser console checks:
--
-- LAB:
--   await supabase.from("orders").select("order_id, lab_id")
--   Expected: only QA_LAB_001 orders.
--
-- AGENT:
--   await supabase.from("labs").select("lab_id, agent_id, assigned_agent_id")
--   Expected: QA_LAB_001 and QA_LAB_002 only.
--
-- ADMIN / EXECUTIVE:
--   await supabase.from("orders").select("order_id, lab_id")
--   Expected: all QA tenant orders.
--
-- Missing/inactive/unknown role:
--   Login should fail closed in the frontend, and direct table selects should return no rows.

-- ---------------------------------------------------------------------------
-- Policy audit queries
-- ---------------------------------------------------------------------------
-- Tables without RLS enabled:
WITH critical(table_name) AS (
  VALUES
    ('profiles'), ('labs'), ('orders'), ('order_items'), ('order_lines'), ('payments'),
    ('ar_credit_control'), ('agent_visits'), ('inventory'), ('inventory_ledger'),
    ('products'), ('purchase_orders'), ('purchase_order_items')
)
SELECT c.table_name, COALESCE(cls.relrowsecurity, false) AS rls_enabled
FROM critical c
LEFT JOIN pg_class cls ON cls.relname = c.table_name
LEFT JOIN pg_namespace ns ON ns.oid = cls.relnamespace AND ns.nspname = 'public'
WHERE COALESCE(cls.relrowsecurity, false) = false
ORDER BY c.table_name;

-- Policies still allowing anon:
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND 'anon' = ANY (roles)
ORDER BY tablename, policyname;

-- Policies using literal true in USING:
SELECT schemaname, tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual ~* '(^|[^a-z_])true([^a-z_]|$)'
ORDER BY tablename, policyname;

-- Policies using literal true in WITH CHECK:
SELECT schemaname, tablename, policyname, cmd, roles, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND with_check ~* '(^|[^a-z_])true([^a-z_]|$)'
ORDER BY tablename, policyname;

-- Pilot-critical active policies:
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'labs', 'orders', 'order_items', 'order_lines', 'payments',
    'ar_credit_control', 'agent_visits', 'inventory', 'inventory_ledger',
    'products', 'purchase_orders', 'purchase_order_items'
  )
ORDER BY tablename, policyname;
