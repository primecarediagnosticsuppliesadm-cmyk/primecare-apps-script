-- Production: generate-invoice-pdf edge function service_role grants.
--
-- Security model:
--   • userClient + JWT: auth.getUser + invoices SELECT id (RLS access gate only).
--   • service_role: internal PDF data reads + storage upload + invoices UPDATE.
-- No anon grants; no USING(true); RLS unchanged for authenticated.

GRANT SELECT ON TABLE public.invoices TO service_role;
GRANT UPDATE ON TABLE public.invoices TO service_role;
GRANT SELECT ON TABLE public.invoice_line_items TO service_role;
GRANT SELECT ON TABLE public.labs TO service_role;
GRANT SELECT ON TABLE public.orders TO service_role;
GRANT SELECT ON TABLE public.order_items TO service_role;
GRANT SELECT ON TABLE public.order_lines TO service_role;

-- Verification:
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND grantee = 'service_role'
--   AND table_name IN (
--     'invoices', 'invoice_line_items', 'labs',
--     'orders', 'order_items', 'order_lines'
--   )
-- ORDER BY table_name, privilege_type;
