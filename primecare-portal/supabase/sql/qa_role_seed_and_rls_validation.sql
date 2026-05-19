-- PrimeCare QA Role Seed + RLS Validation
-- Purpose: prove Supabase Auth + profiles + RLS isolation for LAB, AGENT, ADMIN, EXECUTIVE.
-- Run only in the QA Supabase project after production_auth_rls_pilot_migration.sql.
--
-- IMPORTANT:
-- 1) Create four QA users in Supabase Auth first:
--    qa.lab@primecare.test
--    qa.agent@primecare.test
--    qa.admin@primecare.test
--    qa.executive@primecare.test
-- 2) Copy each Auth user UUID into the params CTE below.
-- 3) Do not run this against Production.
-- 4) The validation blocks use SET LOCAL ROLE authenticated and request.jwt.claims
--    to simulate PostgREST/RLS access for each user.

-- ---------------------------------------------------------------------------
-- QA seed data
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT
    'qa-tenant-001'::text AS tenant_id,
    '00000000-0000-0000-0000-000000000101'::uuid AS lab_user_id,
    '00000000-0000-0000-0000-000000000102'::uuid AS agent_user_id,
    '00000000-0000-0000-0000-000000000103'::uuid AS admin_user_id,
    '00000000-0000-0000-0000-000000000104'::uuid AS executive_user_id
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
  SELECT lab_user_id, tenant_id, 'LAB', 'QA_LAB_001', NULL, NULL, true FROM params
  UNION ALL
  SELECT agent_user_id, tenant_id, 'AGENT', NULL, 'QA_AGENT_001', 'QA Agent One', true FROM params
  UNION ALL
  SELECT admin_user_id, tenant_id, 'ADMIN', NULL, NULL, NULL, true FROM params
  UNION ALL
  SELECT executive_user_id, tenant_id, 'EXECUTIVE', NULL, NULL, NULL, true FROM params
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
    agent_id,
    agent_name,
    active
  )
  SELECT tenant_id, 'QA_LAB_001', 'QA Alpha Diagnostics', 'QA_AGENT_001', 'QA Agent One', true FROM params
  UNION ALL
  SELECT tenant_id, 'QA_LAB_002', 'QA Beta Labs', 'QA_AGENT_001', 'QA Agent One', true FROM params
  UNION ALL
  SELECT tenant_id, 'QA_LAB_003', 'QA Gamma Unassigned', 'QA_AGENT_999', 'Other QA Agent', true FROM params
  ON CONFLICT DO NOTHING
  RETURNING lab_id
),
seed_orders AS (
  INSERT INTO public.orders (
    tenant_id,
    order_id,
    lab_id,
    agent_id,
    order_date,
    status,
    total_amount,
    created_by,
    created_at
  )
  SELECT tenant_id, 'QA_ORD_001', 'QA_LAB_001', 'QA_AGENT_001', current_date - 2, 'Placed', 1200, 'qa.lab@primecare.test', now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_ORD_002', 'QA_LAB_002', 'QA_AGENT_001', current_date - 1, 'Fulfilled', 2400, 'qa.agent@primecare.test', now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_ORD_003', 'QA_LAB_003', 'QA_AGENT_999', current_date, 'Placed', 3600, 'other.agent@primecare.test', now() FROM params
  ON CONFLICT DO NOTHING
  RETURNING order_id
),
seed_order_items AS (
  INSERT INTO public.order_items (
    tenant_id,
    order_item_id,
    order_id,
    lab_id,
    product_id,
    product_name,
    quantity,
    unit_price,
    total_price,
    created_at
  )
  SELECT tenant_id, 'QA_OI_001', 'QA_ORD_001', 'QA_LAB_001', 'QA_SKU_001', 'QA Test Kit A', 2, 600, 1200, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_OI_002', 'QA_ORD_002', 'QA_LAB_002', 'QA_SKU_002', 'QA Test Kit B', 3, 800, 2400, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_OI_003', 'QA_ORD_003', 'QA_LAB_003', 'QA_SKU_003', 'QA Test Kit C', 4, 900, 3600, now() FROM params
  ON CONFLICT DO NOTHING
  RETURNING order_item_id
),
seed_payments AS (
  INSERT INTO public.payments (
    tenant_id,
    payment_id,
    order_id,
    lab_id,
    agent_id,
    amount_received,
    payment_date,
    mode,
    outstanding_balance,
    collected_by,
    note
  )
  SELECT tenant_id, 'QA_PAY_001', 'QA_ORD_001', 'QA_LAB_001', 'QA_AGENT_001', 300, current_date, 'Cash', 900, 'QA Agent One', 'QA lab payment' FROM params
  UNION ALL
  SELECT tenant_id, 'QA_PAY_002', 'QA_ORD_002', 'QA_LAB_002', 'QA_AGENT_001', 1000, current_date, 'UPI', 1400, 'QA Agent One', 'QA assigned lab payment' FROM params
  UNION ALL
  SELECT tenant_id, 'QA_PAY_003', 'QA_ORD_003', 'QA_LAB_003', 'QA_AGENT_999', 500, current_date, 'Bank', 3100, 'Other QA Agent', 'QA unassigned payment' FROM params
  ON CONFLICT DO NOTHING
  RETURNING payment_id
),
seed_ar AS (
  INSERT INTO public.ar_credit_control (
    tenant_id,
    lab_id,
    agent_id,
    outstanding,
    total_paid,
    updated_at
  )
  SELECT tenant_id, 'QA_LAB_001', 'QA_AGENT_001', 900, 300, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_LAB_002', 'QA_AGENT_001', 1400, 1000, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_LAB_003', 'QA_AGENT_999', 3100, 500, now() FROM params
  ON CONFLICT DO NOTHING
  RETURNING lab_id
),
seed_visits AS (
  INSERT INTO public.agent_visits (
    tenant_id,
    visit_id,
    lab_id,
    agent_id,
    agent_name,
    visit_date,
    visit_type,
    notes,
    created_at
  )
  SELECT tenant_id, 'QA_VIS_001', 'QA_LAB_001', 'QA_AGENT_001', 'QA Agent One', current_date - 1, 'Follow-up', 'QA assigned visit', now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_VIS_002', 'QA_LAB_002', 'QA_AGENT_001', 'QA Agent One', current_date, 'Collection', 'QA assigned collection visit', now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_VIS_003', 'QA_LAB_003', 'QA_AGENT_999', 'Other QA Agent', current_date, 'Support', 'QA unassigned visit', now() FROM params
  ON CONFLICT DO NOTHING
  RETURNING visit_id
),
seed_inventory AS (
  INSERT INTO public.inventory (
    tenant_id,
    product_id,
    product_name,
    current_stock,
    updated_at
  )
  SELECT tenant_id, 'QA_SKU_001', 'QA Test Kit A', 100, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_SKU_002', 'QA Test Kit B', 50, now() FROM params
  UNION ALL
  SELECT tenant_id, 'QA_SKU_003', 'QA Test Kit C', 25, now() FROM params
  ON CONFLICT DO NOTHING
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
  UNION ALL
  SELECT tenant_id, 'ORDER_OUT', 'QA_SKU_002', 'QA Test Kit B', 'QA_ORD_002', 3, 53, 50, 'qa.agent@primecare.test', now() FROM params
  ON CONFLICT DO NOTHING
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
  ON CONFLICT DO NOTHING
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
  ON CONFLICT DO NOTHING
  RETURNING po_id
)
SELECT
  'QA seed complete. Replace placeholder UUIDs with real Supabase Auth user IDs before running.' AS status,
  (SELECT count(*) FROM seed_profiles) AS profiles_upserted;

-- ---------------------------------------------------------------------------
-- RLS validation helpers
-- ---------------------------------------------------------------------------
-- Replace the UUIDs in each block with the matching QA Auth user IDs.
-- Expected row counts assume the seed data above.

-- LAB user: should see QA_LAB_001 only.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000101';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000101","role":"authenticated"}';

SELECT 'LAB orders visible' AS test, array_agg(order_id ORDER BY order_id) AS visible_order_ids FROM public.orders;
SELECT 'LAB payments visible' AS test, array_agg(payment_id ORDER BY payment_id) AS visible_payment_ids FROM public.payments;
SELECT 'LAB AR visible' AS test, array_agg(lab_id ORDER BY lab_id) AS visible_ar_lab_ids FROM public.ar_credit_control;
SELECT 'LAB cross-lab blocked' AS test, count(*) AS should_be_zero FROM public.orders WHERE lab_id <> 'QA_LAB_001';
ROLLBACK;

-- AGENT user: should see assigned QA_LAB_001 and QA_LAB_002, not QA_LAB_003.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000102';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}';

SELECT 'AGENT labs visible' AS test, array_agg(lab_id ORDER BY lab_id) AS visible_lab_ids FROM public.labs;
SELECT 'AGENT orders visible' AS test, array_agg(order_id ORDER BY order_id) AS visible_order_ids FROM public.orders;
SELECT 'AGENT visits visible' AS test, array_agg(visit_id ORDER BY visit_id) AS visible_visit_ids FROM public.agent_visits;
SELECT 'AGENT unassigned lab blocked' AS test, count(*) AS should_be_zero FROM public.labs WHERE lab_id = 'QA_LAB_003';
ROLLBACK;

-- ADMIN user: should see all QA tenant operational data.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000103';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000103","role":"authenticated"}';

SELECT 'ADMIN labs visible' AS test, count(*) AS expected_at_least_three FROM public.labs;
SELECT 'ADMIN orders visible' AS test, count(*) AS expected_at_least_three FROM public.orders;
SELECT 'ADMIN inventory visible' AS test, count(*) AS expected_at_least_three FROM public.inventory;
SELECT 'ADMIN purchase orders visible' AS test, count(*) AS expected_at_least_one FROM public.purchase_orders;
ROLLBACK;

-- EXECUTIVE user: should see tenant-wide operational/dashboard data.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000104';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000104","role":"authenticated"}';

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

-- Inactive profile: create a temporary inactive profile, then verify no rows.
WITH params AS (
  SELECT
    'qa-tenant-001'::text AS tenant_id,
    '00000000-0000-0000-0000-000000000199'::uuid AS inactive_user_id
)
INSERT INTO public.profiles (user_id, tenant_id, role, lab_id, active)
SELECT inactive_user_id, tenant_id, 'LAB', 'QA_LAB_001', false FROM params
ON CONFLICT (user_id) DO UPDATE SET active = false;

BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '00000000-0000-0000-0000-000000000199';
SET LOCAL "request.jwt.claim.role" = 'authenticated';
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-000000000199","role":"authenticated"}';

SELECT 'INACTIVE PROFILE orders blocked' AS test, count(*) AS should_be_zero FROM public.orders;
SELECT 'INACTIVE PROFILE labs blocked' AS test, count(*) AS should_be_zero FROM public.labs;
ROLLBACK;

-- Unknown role: should fail the profiles CHECK constraint.
-- Expected: ERROR due role check constraint.
-- INSERT INTO public.profiles (user_id, tenant_id, role, active)
-- VALUES ('00000000-0000-0000-0000-000000000198', 'qa-tenant-001', 'UNKNOWN', true);

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
--   await supabase.from("labs").select("lab_id, agent_id, agent_name")
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
    ('profiles'), ('labs'), ('orders'), ('order_items'), ('payments'),
    ('ar_credit_control'), ('agent_visits'), ('inventory'), ('inventory_ledger'),
    ('purchase_orders'), ('purchase_order_items')
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
    'profiles', 'labs', 'orders', 'order_items', 'payments', 'ar_credit_control',
    'agent_visits', 'inventory', 'inventory_ledger', 'purchase_orders',
    'purchase_order_items'
  )
ORDER BY tablename, policyname;
