-- Fix v_lab_catalog cross-tenant product join fan-out.
--
-- Problem: joining inventory → products on product_id only duplicates rows when the
-- same SKU exists under HQ, distributor, and lab tenants (Lab Ordering showed 12
-- cards for 3 SKUs).
--
-- Fix: scope join to tenant_id + product_id (matches v_stock_dashboard pattern).
-- security_invoker ensures RLS applies per authenticated user (PostgreSQL 15+).
--
-- Idempotent. Does not change RLS or seed data.
-- Run after production_auth_rls_pilot_migration.sql.

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
  'Lab ordering catalog: tenant-scoped inventory joined to products (one row per SKU per tenant).';
