-- Production schema parity migration (unintended drift vs QA certified baseline).
-- Project: alxhrnotnvwpblsiadxj
-- Apply after create_lab_with_ar_credit_rpc.sql if not yet applied.
--
-- Fixes ONLY unintended Production gaps found in QA vs Prod audit (2026-06-28):
--   1. Remove leftover temp_anon policies (orders, payments, inventory_ledger)
--   2. Replace broad profiles policies with tenant-scoped HQ policies (QA parity)
--   3. Add missing performance indexes present on QA
--
-- Intentionally NOT changed (prod ahead or acceptable):
--   - payments.collected_by / payments.note (prod has; QA behind)
--   - purchase_orders.tenant_id uuid (prod; QA still text)
--   - idx_labs_tenant_agent COALESCE definition (prod pilot-correct)
--   - idx_inventory_ledger_order_id / idx_inventory_ledger_product_id (prod has; QA behind)

-- ---------------------------------------------------------------------------
-- 1) Drop unsafe anon policies left from pre-pilot migrations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "temp_anon_orders_select" ON public.orders;
DROP POLICY IF EXISTS "temp_anon_orders_insert" ON public.orders;
DROP POLICY IF EXISTS "temp_anon_orders_update" ON public.orders;
DROP POLICY IF EXISTS "allow anon read orders" ON public.orders;

DROP POLICY IF EXISTS "temp_anon_payments_select" ON public.payments;
DROP POLICY IF EXISTS "temp_anon_payments_insert" ON public.payments;
DROP POLICY IF EXISTS "temp_anon_payments_update" ON public.payments;

DROP POLICY IF EXISTS "temp_anon_inventory_ledger_select" ON public.inventory_ledger;
DROP POLICY IF EXISTS "temp_anon_inventory_ledger_insert" ON public.inventory_ledger;

-- ---------------------------------------------------------------------------
-- 2) Profiles RLS — tenant-scoped admin; executive cross-tenant (QA parity)
-- Source: hq_profiles_rls_tenant_scope_migration.sql
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_write" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_scoped" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_scoped" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_scoped" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_scoped" ON public.profiles;

CREATE POLICY "profiles_select_scoped"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.current_user_role() = 'admin'
      AND public.tenant_id_matches(tenant_id)
    )
    OR public.current_user_role() = 'executive'
  );

CREATE POLICY "profiles_insert_scoped"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.current_user_role() = 'admin'
      AND public.tenant_id_matches(tenant_id)
    )
    OR public.current_user_role() = 'executive'
  );

CREATE POLICY "profiles_update_scoped"
  ON public.profiles FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.current_user_role() = 'admin'
      AND public.tenant_id_matches(tenant_id)
    )
    OR public.current_user_role() = 'executive'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      public.current_user_role() = 'admin'
      AND public.tenant_id_matches(tenant_id)
    )
    OR public.current_user_role() = 'executive'
  );

CREATE POLICY "profiles_delete_scoped"
  ON public.profiles FOR DELETE TO authenticated
  USING (
    (
      public.current_user_role() = 'admin'
      AND public.tenant_id_matches(tenant_id)
    )
    OR public.current_user_role() = 'executive'
  );

-- ---------------------------------------------------------------------------
-- 3) Missing indexes (QA has; prod missing)
-- Source: hq_orders_date_index_migration.sql
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_tenant_order_date
  ON public.orders (tenant_id, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_payments_tenant_payment_date
  ON public.payments (tenant_id, payment_date DESC);

-- ---------------------------------------------------------------------------
-- Post-apply verification (run manually)
-- ---------------------------------------------------------------------------
-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname='public' AND 'anon' = ANY(roles)
--   AND tablename IN ('orders','payments','inventory_ledger');
-- -- expect 0 rows
--
-- SELECT policyname FROM pg_policies
-- WHERE schemaname='public' AND tablename='profiles' ORDER BY policyname;
-- -- expect profiles_*_scoped (4 policies)
--
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname='public' AND indexname IN (
--   'idx_orders_tenant_order_date','idx_payments_tenant_payment_date'
-- );
