-- Track A twin of 20260905140000_lab_ordering_1f_anon_order_lockdown.sql
-- Lab Ordering 1F — close leftover anon order table exposure.
--
-- Production still has (live inspection, 2026-09-05):
--   temp_anon_order_items_insert  role=anon cmd=INSERT  with_check=true
--   temp_anon_order_items_select  role=anon cmd=SELECT  qual=true
--
-- Certified 1B (20260905130000) recreates authenticated HQ-only write policies
-- on order_items / order_lines. It does NOT DROP temp_anon_* policies and does
-- NOT REVOKE anon table privileges. Permissive RLS policies are OR'd per role,
-- so those anon USING(true)/WITH CHECK(true) policies survive 1B.
--
-- This migration is scoped to orders / order_items / order_lines only.
-- It does not change authenticated 1A/1B policies, create_lab_order, catalog
-- views, inventory, payments, or AR.
--
-- Track A twin. Do not apply separately when the versioned migration is applied.
-- QA certification only. Do not apply to Production from this sprint.

-- Explicit named drops (Production live names + quoted variants).
DROP POLICY IF EXISTS temp_anon_order_items_insert ON public.order_items;
DROP POLICY IF EXISTS "temp_anon_order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS temp_anon_order_items_select ON public.order_items;
DROP POLICY IF EXISTS "temp_anon_order_items_select" ON public.order_items;

DROP POLICY IF EXISTS temp_anon_orders_select ON public.orders;
DROP POLICY IF EXISTS "temp_anon_orders_select" ON public.orders;
DROP POLICY IF EXISTS temp_anon_orders_insert ON public.orders;
DROP POLICY IF EXISTS "temp_anon_orders_insert" ON public.orders;
DROP POLICY IF EXISTS temp_anon_orders_update ON public.orders;
DROP POLICY IF EXISTS "temp_anon_orders_update" ON public.orders;
DROP POLICY IF EXISTS "allow anon read orders" ON public.orders;

DROP POLICY IF EXISTS "allow anon read order lines" ON public.order_lines;

-- Any other policy granted to anon on these three tables.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('order_items', 'order_lines', 'orders')
      AND 'anon' = ANY (roles)
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.%I',
      pol.policyname,
      pol.tablename
    );
  END LOOP;
END $$;

-- Privilege lockdown. REVOKE FROM PUBLIC is required because PUBLIC grants
-- also apply to anon. Restore authenticated / service_role so HQ 1B writes
-- and SECURITY DEFINER RPCs keep working. RLS remains enabled.
REVOKE ALL ON TABLE public.order_items FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.order_lines FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orders FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.orders TO authenticated;

GRANT ALL ON TABLE public.order_items TO service_role;
GRANT ALL ON TABLE public.order_lines TO service_role;
GRANT ALL ON TABLE public.orders TO service_role;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
