-- P0 privilege hardening for objects created by postgres.
-- Does not change data, RLS policies, or function bodies.
-- Does not alter supabase_admin default privileges.

REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public
  FROM authenticated, anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES
  FROM authenticated, anon, service_role;

REVOKE EXECUTE
  ON FUNCTION public.mark_invoice_paid_if_fully_allocated(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.mark_invoice_paid_if_fully_allocated(uuid)
  TO postgres, service_role;

REVOKE EXECUTE
  ON FUNCTION public._proj_touch_meta_v1(uuid, text, bigint, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public._proj_touch_meta_v1(uuid, text, bigint, text)
  TO postgres, service_role;
