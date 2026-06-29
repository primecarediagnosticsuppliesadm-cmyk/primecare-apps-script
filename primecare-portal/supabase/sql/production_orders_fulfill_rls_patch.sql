-- Production: fix Admin order fulfillment 403 on PATCH /orders (UPDATE).
--
-- Root cause: orders_update_by_role uses only can_manage_distributor_ops_for_tenant(),
-- which requires EXISTS (SELECT 1 FROM public.tenants WHERE id = tenant_id).
-- orders_select_by_role uses distributor_lab_record_visible(), which does NOT require
-- a tenants row. Admins can therefore SELECT orders whose tenant_id matches their
-- profile but whose tenant is not registered in public.tenants (prod bootstrap gap),
-- then fail UPDATE with 403 during fulfillment (updateOrderStatusWrite → patchOrderRow).
--
-- Fix: allow same-tenant admin/executive ops via can_write_ops_for_tenant() OR
-- cross-tenant distributor ops via can_manage_distributor_ops_for_tenant().
-- Preserves tenant isolation; no anon access; no USING(true).
--
-- Also restores authenticated table privileges on orders / order_items to QA parity
-- (RLS remains enforced).

-- ---------------------------------------------------------------------------
-- 1) orders UPDATE (and INSERT/DELETE for consistency with QA ops paths)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "orders_update_by_role" ON public.orders;
CREATE POLICY "orders_update_by_role"
  ON public.orders FOR UPDATE TO authenticated
  USING (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR public.can_write_ops_for_tenant(tenant_id)
  )
  WITH CHECK (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR public.can_write_ops_for_tenant(tenant_id)
  );

DROP POLICY IF EXISTS "orders_insert_by_role" ON public.orders;
CREATE POLICY "orders_insert_by_role"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'lab'
      AND public.tenant_id_matches(tenant_id)
      AND public.primecare_normalize_lab_id(lab_id) = public.current_profile_lab_id()
    )
  );

DROP POLICY IF EXISTS "orders_delete_by_role" ON public.orders;
CREATE POLICY "orders_delete_by_role"
  ON public.orders FOR DELETE TO authenticated
  USING (
    public.can_manage_distributor_ops_for_tenant(tenant_id)
    OR public.can_write_ops_for_tenant(tenant_id)
  );

-- ---------------------------------------------------------------------------
-- 2) Table grants — prod stripped authenticated INSERT/DELETE on orders
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_items TO authenticated;

-- ---------------------------------------------------------------------------
-- Production: invoice download regression — orders SELECT for same-tenant admin.
--
-- Root cause: orders_select_by_role uses distributor_lab_record_visible() only.
-- When lab_id is missing/stale, admin can list orders (bounded columns) but
-- select=* detail reads and UPDATE ... RETURNING can fail if lab visibility fails.
-- Align SELECT with UPDATE patch: same-tenant admin/executive via can_write_ops_for_tenant().
--
-- Apply after production_orders_fulfill_rls_patch.sql (or merge if not yet applied).

DROP POLICY IF EXISTS "orders_select_by_role" ON public.orders;
CREATE POLICY "orders_select_by_role"
  ON public.orders FOR SELECT TO authenticated
  USING (
    public.distributor_lab_record_visible(tenant_id, lab_id)
    OR public.can_write_ops_for_tenant(tenant_id)
  );

-- Ensure authenticated can SELECT orders (prod may have stripped grants).
GRANT SELECT ON TABLE public.orders TO authenticated;
GRANT SELECT ON TABLE public.order_items TO authenticated;
GRANT SELECT ON TABLE public.order_lines TO authenticated;

