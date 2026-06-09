-- Executive / distributor operational RLS hardening (Remediation Sprint).
--
-- Fixes HQ executive cross-tenant gaps on:
--   lab_qualifications, orders, payments, labs (write), purchase_orders
-- Adds missing policies:
--   payments UPDATE/DELETE, orders DELETE, purchase order explicit CRUD policies
-- Scopes admin SELECT on lab_contracts to own tenant (executive retains global read).
--
-- Mirrors patterns from:
--   can_manage_lab_contract_for_distributor()  (lab_contracts_migration.sql)
--   can_manage_catalog_inventory_for_tenant()  (executive_distributor_catalog_inventory_rls.sql)
--   lab_is_visible_to_executive_distributor()  (executive_distributor_lab_create_migration.sql)
--
-- Run after:
--   production_auth_rls_pilot_migration.sql
--   executive_distributor_lab_create_migration.sql
--   lab_qualifications_migration.sql
--   lab_contracts_migration.sql
--   executive_distributor_catalog_inventory_rls.sql (products/inventory — separate file)
--
-- Idempotent. No anon policies. Do NOT use CASCADE.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- UUID helper MUST be created first because the text overload delegates to it.
CREATE OR REPLACE FUNCTION public.can_manage_distributor_ops_for_tenant(
  target_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_tenant_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.tenants t
      WHERE t.id = target_tenant_id
    )
    AND (
      public.current_user_role() = 'executive'
      OR (
        public.current_user_role() = 'admin'
        AND public.tenant_id_matches(target_tenant_id)
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_distributor_ops_for_tenant(uuid) TO authenticated;

-- Text overload is required only for legacy text tenant_id columns, currently:
--   purchase_orders.tenant_id
--   purchase_order_items.tenant_id
-- It safely rejects blank/non-UUID text instead of throwing a cast error.
CREATE OR REPLACE FUNCTION public.can_manage_distributor_ops_for_tenant(
  target_tenant_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN target_tenant_id IS NULL OR btrim(target_tenant_id) = '' THEN false
      WHEN btrim(target_tenant_id) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN false
      ELSE public.can_manage_distributor_ops_for_tenant(btrim(target_tenant_id)::uuid)
    END;
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_distributor_ops_for_tenant(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.distributor_lab_record_visible(
  row_tenant_id uuid,
  row_lab_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.lab_record_is_visible_to_current_user(row_tenant_id, row_lab_id)
    OR public.lab_is_visible_to_executive_distributor(row_tenant_id);
$$;

GRANT EXECUTE ON FUNCTION public.distributor_lab_record_visible(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- lab_contracts — scope admin SELECT to own tenant; executive reads all
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lab_contract_visible_to_current_user(
  row_distributor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    row_distributor_id IS NOT NULL
    AND (
      public.current_user_role() = 'executive'
      OR public.tenant_id_matches(row_distributor_id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.lab_contract_visible_to_current_user(uuid) TO authenticated;

-- Drop likely prior SELECT policy names so older broad admin/executive policies do not remain.
DROP POLICY IF EXISTS "lab_contracts_select_by_role" ON public.lab_contracts;
DROP POLICY IF EXISTS "lab_contracts_read_by_role" ON public.lab_contracts;
DROP POLICY IF EXISTS "lab_contracts_select_admin_executive" ON public.lab_contracts;
DROP POLICY IF EXISTS "lab_contracts_select_by_distributor" ON public.lab_contracts;

CREATE POLICY "lab_contracts_select_by_role"
  ON public.lab_contracts FOR SELECT TO authenticated
  USING (public.lab_contract_visible_to_current_user(distributor_id));

-- ---------------------------------------------------------------------------
-- labs — executive cross-tenant UPDATE/DELETE (INSERT already via can_insert_lab_for_tenant)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "labs_admin_write" ON public.labs;
DROP POLICY IF EXISTS "labs_admin_delete" ON public.labs;

CREATE POLICY "labs_admin_write"
  ON public.labs FOR UPDATE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_manage_distributor_ops_for_tenant(tenant_id));

CREATE POLICY "labs_admin_delete"
  ON public.labs FOR DELETE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- lab_qualifications — executive cross-tenant read/write
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "lab_qualifications_select_by_role" ON public.lab_qualifications;
CREATE POLICY "lab_qualifications_select_by_role"
  ON public.lab_qualifications FOR SELECT TO authenticated
  USING (public.distributor_lab_record_visible(tenant_id, lab_id));

DROP POLICY IF EXISTS "lab_qualifications_insert_by_role" ON public.lab_qualifications;
CREATE POLICY "lab_qualifications_insert_by_role"
  ON public.lab_qualifications FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  );

DROP POLICY IF EXISTS "lab_qualifications_update_by_role" ON public.lab_qualifications;
CREATE POLICY "lab_qualifications_update_by_role"
  ON public.lab_qualifications FOR UPDATE TO authenticated
  USING (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  )
  WITH CHECK (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  );

DROP POLICY IF EXISTS "lab_qualifications_delete_by_role" ON public.lab_qualifications;
CREATE POLICY "lab_qualifications_delete_by_role"
  ON public.lab_qualifications FOR DELETE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- orders — executive cross-tenant read/write/delete
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "orders_select_by_role" ON public.orders;
CREATE POLICY "orders_select_by_role"
  ON public.orders FOR SELECT TO authenticated
  USING (public.distributor_lab_record_visible(tenant_id, lab_id));

DROP POLICY IF EXISTS "orders_insert_by_role" ON public.orders;
CREATE POLICY "orders_insert_by_role"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'lab'
      AND public.tenant_id_matches(tenant_id)
      AND public.primecare_normalize_lab_id(lab_id) = public.current_profile_lab_id()
    )
  );

DROP POLICY IF EXISTS "orders_update_by_role" ON public.orders;
CREATE POLICY "orders_update_by_role"
  ON public.orders FOR UPDATE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_manage_distributor_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS "orders_delete_by_role" ON public.orders;
CREATE POLICY "orders_delete_by_role"
  ON public.orders FOR DELETE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- payments — executive cross-tenant read/write/update/delete
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "payments_select_by_role" ON public.payments;
CREATE POLICY "payments_select_by_role"
  ON public.payments FOR SELECT TO authenticated
  USING (public.distributor_lab_record_visible(tenant_id, lab_id));

DROP POLICY IF EXISTS "payments_insert_by_role" ON public.payments;
CREATE POLICY "payments_insert_by_role"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  );

DROP POLICY IF EXISTS "payments_update_by_role" ON public.payments;
CREATE POLICY "payments_update_by_role"
  ON public.payments FOR UPDATE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_manage_distributor_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS "payments_delete_by_role" ON public.payments;
CREATE POLICY "payments_delete_by_role"
  ON public.payments FOR DELETE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- ar_credit_control — executive cross-tenant read/update
-- Do NOT drop ar_credit_insert_by_role here; that policy is owned by the
-- executive_distributor_lab_create_migration.sql workflow.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "ar_credit_select_by_role" ON public.ar_credit_control;
CREATE POLICY "ar_credit_select_by_role"
  ON public.ar_credit_control FOR SELECT TO authenticated
  USING (public.distributor_lab_record_visible(tenant_id, lab_id));

DROP POLICY IF EXISTS "ar_credit_update_by_role" ON public.ar_credit_control;
CREATE POLICY "ar_credit_update_by_role"
  ON public.ar_credit_control FOR UPDATE TO authenticated
  USING (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  )
  WITH CHECK (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  );

-- ---------------------------------------------------------------------------
-- purchase_orders — executive cross-tenant read/write/delete
-- tenant_id is currently TEXT on this table, so the text helper overload is used.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "purchase_orders_select_by_role" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_admin_write" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert_by_role" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_update_by_role" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_delete_by_role" ON public.purchase_orders;

CREATE POLICY "purchase_orders_select_by_role"
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id));

CREATE POLICY "purchase_orders_insert_by_role"
  ON public.purchase_orders FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_distributor_ops_for_tenant(tenant_id));

CREATE POLICY "purchase_orders_update_by_role"
  ON public.purchase_orders FOR UPDATE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_manage_distributor_ops_for_tenant(tenant_id));

CREATE POLICY "purchase_orders_delete_by_role"
  ON public.purchase_orders FOR DELETE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS "purchase_order_items_select_by_role" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_admin_write" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_insert_by_role" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_update_by_role" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_delete_by_role" ON public.purchase_order_items;

CREATE POLICY "purchase_order_items_select_by_role"
  ON public.purchase_order_items FOR SELECT TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id));

CREATE POLICY "purchase_order_items_insert_by_role"
  ON public.purchase_order_items FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_distributor_ops_for_tenant(tenant_id));

CREATE POLICY "purchase_order_items_update_by_role"
  ON public.purchase_order_items FOR UPDATE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_manage_distributor_ops_for_tenant(tenant_id));

CREATE POLICY "purchase_order_items_delete_by_role"
  ON public.purchase_order_items FOR DELETE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- order_items — align write path with orders executive cross-tenant
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "order_items_insert_by_role" ON public.order_items;
CREATE POLICY "order_items_insert_by_role"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.order_id = order_items.order_id
        AND public.tenant_id_matches(o.tenant_id)
        AND public.current_user_role() = 'lab'
        AND public.primecare_normalize_lab_id(o.lab_id) = public.current_profile_lab_id()
    )
  );

DROP POLICY IF EXISTS "order_items_update_by_role" ON public.order_items;
CREATE POLICY "order_items_update_by_role"
  ON public.order_items FOR UPDATE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_manage_distributor_ops_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- order_lines — align write path with orders executive cross-tenant
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "order_lines_insert_by_role" ON public.order_lines;
CREATE POLICY "order_lines_insert_by_role"
  ON public.order_lines FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.order_id = order_lines.order_id
        AND public.tenant_id_matches(o.tenant_id)
        AND public.current_user_role() = 'lab'
        AND public.primecare_normalize_lab_id(o.lab_id) = public.current_profile_lab_id()
    )
  );

DROP POLICY IF EXISTS "order_lines_update_by_role" ON public.order_lines;
CREATE POLICY "order_lines_update_by_role"
  ON public.order_lines FOR UPDATE TO authenticated
  USING (public.can_manage_distributor_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_manage_distributor_ops_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- Verification (run manually in Supabase SQL editor)
-- Guntur: 787999b9-72f5-4163-a860-551c12ce3414
-- Executive: 23377bff-d1c7-4195-8b8e-b87bbc50fb43
-- ---------------------------------------------------------------------------
-- SELECT policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'labs', 'lab_qualifications', 'lab_contracts', 'orders', 'order_items',
--     'order_lines', 'payments', 'ar_credit_control', 'purchase_orders',
--     'purchase_order_items'
--   )
-- ORDER BY tablename, policyname;
