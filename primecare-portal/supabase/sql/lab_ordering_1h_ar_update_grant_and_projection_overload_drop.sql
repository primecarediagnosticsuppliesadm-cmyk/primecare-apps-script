-- Lab Ordering 1H — AR UPDATE grant + drop obsolete 2-arg projection overloads.
--
-- Production root cause (2026-09-05, read-only audit):
--   has_table_privilege('authenticated','public.ar_credit_control','UPDATE') = false
--   so bumpArOutstandingForFulfillment cannot UPDATE and updateOrderStatusWrite
--   writes orders.ar_posted = false. Inventory / invoice / shipment still succeed.
--
-- RLS is NOT changed. ar_credit_update_by_role already authorizes Admin/Executive
-- via can_manage_distributor_ops_for_tenant (and Agent for visible labs only).
-- Do not GRANT to anon. Do not recreate projection workers.
--
-- Canonical remaining signatures (unchanged bodies):
--   refresh_proj_order_row_v1(uuid, text, boolean DEFAULT true)
--   refresh_proj_lab_receivable_row_v1(uuid, text, boolean DEFAULT true)

GRANT UPDATE ON TABLE public.ar_credit_control TO authenticated;

REVOKE UPDATE ON TABLE public.ar_credit_control FROM anon;
REVOKE UPDATE ON TABLE public.ar_credit_control FROM PUBLIC;

DROP FUNCTION IF EXISTS public.refresh_proj_order_row_v1(uuid, text);
DROP FUNCTION IF EXISTS public.refresh_proj_lab_receivable_row_v1(uuid, text);

NOTIFY pgrst, 'reload schema';
