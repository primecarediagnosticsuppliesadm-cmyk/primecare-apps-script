-- Lab Ordering 1B — tenant-scoped catalog price + Lab order_items write lockdown.
--
-- Root cause of ₹15 vs ₹800:
--   Live v_lab_catalog joined products on product_id only. QA_SKU_002 exists on
--   two tenants (HQ selling_price=800, other tenant selling_price=15). Lab UI
--   displayed the cross-tenant 15; create_lab_order persisted HQ 800.
--
-- Fix: join products on tenant_id + product_id (same as
-- lab_catalog_view_tenant_join_migration.sql, which was never applied to QA).
-- Authoritative price remains products.selling_price.
--
-- Lab must not INSERT/UPDATE/DELETE order_items or order_lines. HQ/Admin write
-- paths (can_write_ops / can_manage_distributor_ops) are preserved.
-- create_lab_order is SECURITY DEFINER and still persists lines.
--
-- QA only. Do not apply to Production from this sprint.

DROP VIEW IF EXISTS public.v_lab_catalog;

CREATE VIEW public.v_lab_catalog
WITH (security_invoker = true)
AS
SELECT
  i.tenant_id,
  i.product_id,
  COALESCE(p.product_name, i.product_id) AS product_name,
  COALESCE(p.category, 'Consumables'::text) AS category,
  'PrimeCare'::text AS brand,
  COALESCE(p.selling_price, (0)::numeric) AS unit_selling_price,
  COALESCE(p.cost_price, (0)::numeric) AS unit_cost,
  (0)::numeric AS tax_rate,
  CASE
    WHEN (p.active IS TRUE) THEN 'Y'::text
    ELSE 'N'::text
  END AS active_flag,
  i.current_stock,
  i.min_stock,
  i.reorder_qty,
  CASE
    WHEN (i.current_stock <= i.min_stock) THEN 'REORDER'::text
    ELSE 'OK'::text
  END AS reorder_status
FROM public.inventory i
LEFT JOIN public.products p
  ON p.tenant_id = i.tenant_id
 AND upper(trim(both from p.product_id)) = upper(trim(both from i.product_id));

COMMENT ON VIEW public.v_lab_catalog IS
  'Lab ordering catalog: tenant-scoped inventory joined to products.selling_price (one row per SKU per tenant).';

GRANT SELECT ON public.v_lab_catalog TO authenticated;

DROP POLICY IF EXISTS order_items_insert_by_role ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_by_role" ON public.order_items;
CREATE POLICY order_items_insert_by_role
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR public.can_manage_distributor_ops_for_tenant(tenant_id)
  );

DROP POLICY IF EXISTS order_items_update_by_role ON public.order_items;
DROP POLICY IF EXISTS "order_items_update_by_role" ON public.order_items;
CREATE POLICY order_items_update_by_role
  ON public.order_items FOR UPDATE TO authenticated
  USING (
    public.can_write_ops_for_tenant(tenant_id)
    OR public.can_manage_distributor_ops_for_tenant(tenant_id)
  )
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR public.can_manage_distributor_ops_for_tenant(tenant_id)
  );

DROP POLICY IF EXISTS order_items_delete_by_role ON public.order_items;
DROP POLICY IF EXISTS "order_items_delete_by_role" ON public.order_items;
CREATE POLICY order_items_delete_by_role
  ON public.order_items FOR DELETE TO authenticated
  USING (
    public.can_write_ops_for_tenant(tenant_id)
    OR public.can_manage_distributor_ops_for_tenant(tenant_id)
  );

DROP POLICY IF EXISTS order_lines_insert_by_role ON public.order_lines;
DROP POLICY IF EXISTS "order_lines_insert_by_role" ON public.order_lines;
CREATE POLICY order_lines_insert_by_role
  ON public.order_lines FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR public.can_manage_distributor_ops_for_tenant(tenant_id)
  );

DROP POLICY IF EXISTS order_lines_update_by_role ON public.order_lines;
DROP POLICY IF EXISTS "order_lines_update_by_role" ON public.order_lines;
CREATE POLICY order_lines_update_by_role
  ON public.order_lines FOR UPDATE TO authenticated
  USING (
    public.can_write_ops_for_tenant(tenant_id)
    OR public.can_manage_distributor_ops_for_tenant(tenant_id)
  )
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR public.can_manage_distributor_ops_for_tenant(tenant_id)
  );

DROP POLICY IF EXISTS order_lines_delete_by_role ON public.order_lines;
DROP POLICY IF EXISTS "order_lines_delete_by_role" ON public.order_lines;
CREATE POLICY order_lines_delete_by_role
  ON public.order_lines FOR DELETE TO authenticated
  USING (
    public.can_write_ops_for_tenant(tenant_id)
    OR public.can_manage_distributor_ops_for_tenant(tenant_id)
  );
