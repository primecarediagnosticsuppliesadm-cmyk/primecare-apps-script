-- Executive / distributor catalog + inventory RLS for Distributor OS Year-1 model.
--
-- Context:
-- PrimeCare HQ operates distributors centrally. Executives assign catalog SKUs in
-- tenants.metadata.config.distributorCatalog and mirror them to public.products +
-- public.inventory under the distributor tenant_id. Prior policies used
-- tenant_id_matches() for both read and write, so executives (profile tenant = HQ)
-- could neither see nor upsert Guntur rows — Revenue Funnel showed Products=0 /
-- Inventory Rows=0 while Catalog Assigned=3.
--
-- This migration mirrors existing executive cross-tenant patterns:
--   - can_manage_lab_contract_for_distributor()  (lab_contracts_migration.sql)
--   - can_insert_lab_for_tenant()                (executive_distributor_lab_create_migration.sql)
--
-- Rules (no new tables, no anon access):
--   - executive: read + write products/inventory for any row whose tenant_id exists in public.tenants
--   - admin:     read + write only when tenant_id_matches(profile tenant)
--   - lab:       read-only on own tenant (unchanged)
--   - agent:     no products/inventory access (unchanged)
--
-- Idempotent. Run after production_auth_rls_pilot_migration.sql.
-- Does not weaken agent/lab write isolation or grant anon policies.

-- ---------------------------------------------------------------------------
-- Helper — write + executive/admin read for catalog mirror operations
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_catalog_inventory_for_tenant(
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
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = target_tenant_id)
    AND (
      public.current_user_role() = 'executive'
      OR (
        public.current_user_role() = 'admin'
        AND public.tenant_id_matches(target_tenant_id)
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_catalog_inventory_for_tenant(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- products — executive cross-tenant read/write; admin own-tenant; lab read-only
-- ---------------------------------------------------------------------------
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_select_by_role" ON public.products;
CREATE POLICY "products_select_by_role"
  ON public.products FOR SELECT TO authenticated
  USING (
    public.can_manage_catalog_inventory_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'lab'
      AND public.tenant_id_matches(tenant_id)
    )
  );

DROP POLICY IF EXISTS "products_admin_write" ON public.products;
DROP POLICY IF EXISTS "products_insert_by_role" ON public.products;
DROP POLICY IF EXISTS "products_update_by_role" ON public.products;
DROP POLICY IF EXISTS "products_delete_by_role" ON public.products;

CREATE POLICY "products_insert_by_role"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalog_inventory_for_tenant(tenant_id));

CREATE POLICY "products_update_by_role"
  ON public.products FOR UPDATE TO authenticated
  USING (public.can_manage_catalog_inventory_for_tenant(tenant_id))
  WITH CHECK (public.can_manage_catalog_inventory_for_tenant(tenant_id));

CREATE POLICY "products_delete_by_role"
  ON public.products FOR DELETE TO authenticated
  USING (public.can_manage_catalog_inventory_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- inventory — same scope as products (v_stock_dashboard inherits via base tables)
-- ---------------------------------------------------------------------------
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_select_by_role" ON public.inventory;
CREATE POLICY "inventory_select_by_role"
  ON public.inventory FOR SELECT TO authenticated
  USING (
    public.can_manage_catalog_inventory_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'lab'
      AND public.tenant_id_matches(tenant_id)
    )
  );

DROP POLICY IF EXISTS "inventory_admin_write" ON public.inventory;
DROP POLICY IF EXISTS "inventory_insert_by_role" ON public.inventory;
DROP POLICY IF EXISTS "inventory_update_by_role" ON public.inventory;
DROP POLICY IF EXISTS "inventory_delete_by_role" ON public.inventory;

CREATE POLICY "inventory_insert_by_role"
  ON public.inventory FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalog_inventory_for_tenant(tenant_id));

CREATE POLICY "inventory_update_by_role"
  ON public.inventory FOR UPDATE TO authenticated
  USING (public.can_manage_catalog_inventory_for_tenant(tenant_id))
  WITH CHECK (public.can_manage_catalog_inventory_for_tenant(tenant_id));

CREATE POLICY "inventory_delete_by_role"
  ON public.inventory FOR DELETE TO authenticated
  USING (public.can_manage_catalog_inventory_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- Verification (run manually in Supabase SQL editor after migration + mirror sync)
-- Replace UUIDs with your QA distributor/HQ ids when different.
-- ---------------------------------------------------------------------------
-- Guntur distributor (example):
--   787999b9-72f5-4163-a860-551c12ce3414
-- HQ tenant (example):
--   f168b98f-47a6-42c3-b788-24c00436fac2
-- Executive Auth user (qa_role_seed):
--   23377bff-d1c7-4195-8b8e-b87bbc50fb43
-- Admin Auth user:
--   7b1fa41c-ad14-44d4-a16a-d91073dc91e6

-- A) Policy audit — confirm helper + policies installed
-- SELECT policyname, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('products', 'inventory')
-- ORDER BY tablename, policyname;

-- B) Executive sees Guntur products/inventory (after Distributor OS → Sync inventory mirror)
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SET LOCAL "request.jwt.claim.sub" = '23377bff-d1c7-4195-8b8e-b87bbc50fb43';
-- SET LOCAL "request.jwt.claim.role" = 'authenticated';
-- SET LOCAL "request.jwt.claims" = '{"sub":"23377bff-d1c7-4195-8b8e-b87bbc50fb43","role":"authenticated"}';
--
-- SELECT 'EXEC Guntur products' AS test,
--        count(*) AS product_count,
--        array_agg(product_id ORDER BY product_id) AS product_ids
-- FROM public.products
-- WHERE tenant_id = '787999b9-72f5-4163-a860-551c12ce3414'::uuid;
--
-- SELECT 'EXEC Guntur inventory' AS test,
--        count(*) AS inventory_count,
--        array_agg(product_id ORDER BY product_id) AS product_ids
-- FROM public.inventory
-- WHERE tenant_id = '787999b9-72f5-4163-a860-551c12ce3414'::uuid;
--
-- SELECT 'EXEC Guntur stock dashboard' AS test,
--        count(*) AS dashboard_rows
-- FROM public.v_stock_dashboard
-- WHERE tenant_id = '787999b9-72f5-4163-a860-551c12ce3414'::uuid;
-- ROLLBACK;
-- Expected after mirror sync: product_count = 3, inventory_count = 3, dashboard_rows = 3

-- C) Admin sees own tenant only (not Guntur distributor rows)
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SET LOCAL "request.jwt.claim.sub" = '7b1fa41c-ad14-44d4-a16a-d91073dc91e6';
-- SET LOCAL "request.jwt.claim.role" = 'authenticated';
-- SET LOCAL "request.jwt.claims" = '{"sub":"7b1fa41c-ad14-44d4-a16a-d91073dc91e6","role":"authenticated"}';
--
-- SELECT 'ADMIN HQ products' AS test, count(*) AS hq_product_count
-- FROM public.products
-- WHERE tenant_id = 'f168b98f-47a6-42c3-b788-24c00436fac2'::uuid;
--
-- SELECT 'ADMIN Guntur blocked' AS test, count(*) AS should_be_zero
-- FROM public.products
-- WHERE tenant_id = '787999b9-72f5-4163-a860-551c12ce3414'::uuid;
-- ROLLBACK;
-- Expected: hq_product_count >= 0 (own tenant), should_be_zero = 0

-- D) HQ rows remain isolated from distributor writes (executive still sees both)
-- BEGIN;
-- SET LOCAL ROLE authenticated;
-- SET LOCAL "request.jwt.claim.sub" = '23377bff-d1c7-4195-8b8e-b87bbc50fb43';
-- SET LOCAL "request.jwt.claim.role" = 'authenticated';
-- SET LOCAL "request.jwt.claims" = '{"sub":"23377bff-d1c7-4195-8b8e-b87bbc50fb43","role":"authenticated"}';
--
-- SELECT tenant_id, count(*) AS product_count
-- FROM public.products
-- WHERE tenant_id IN (
--   'f168b98f-47a6-42c3-b788-24c00436fac2'::uuid,
--   '787999b9-72f5-4163-a860-551c12ce3414'::uuid
-- )
-- GROUP BY tenant_id
-- ORDER BY tenant_id;
-- ROLLBACK;
-- Expected: separate counts per tenant_id; no cross-tenant row bleed

-- E) Service-role ground truth (bypasses RLS — run outside JWT simulation)
-- SELECT product_id, product_name, tenant_id
-- FROM public.products
-- WHERE tenant_id = '787999b9-72f5-4163-a860-551c12ce3414';
-- SELECT product_id, tenant_id, current_stock
-- FROM public.inventory
-- WHERE tenant_id = '787999b9-72f5-4163-a860-551c12ce3414';
