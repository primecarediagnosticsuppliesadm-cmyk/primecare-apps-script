-- Prerequisite for 20260816150000_notification_delivery_log_parity.sql
-- Reproduces LIVE QA public.notification_event_visible_to_current_user exactly.
-- Canonical source: QA (zipuzmfkwwucbchlphcj) pg_get_functiondef 2026-08-16.
-- Originally created by manual supabase/sql/notifications_foundation_migration.sql (not versioned).
-- Idempotent CREATE OR REPLACE. Does not weaken RLS. No anon table grants.
--
-- Dependencies (already present on Production RLS pilot):
--   tenant_id_matches(uuid), is_admin_or_executive(), current_user_role(),
--   lab_record_is_visible_to_current_user(uuid, text), current_profile_lab_id()

CREATE OR REPLACE FUNCTION public.notification_event_visible_to_current_user(
  p_tenant_id uuid,
  p_target_role text,
  p_target_user_id uuid,
  p_target_lab_id text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.tenant_id_matches(p_tenant_id)
    AND (
      public.is_admin_or_executive()
      OR (
        public.current_user_role() = 'agent'
        AND (
          (p_target_user_id IS NOT NULL AND p_target_user_id = auth.uid())
          OR (
            p_target_lab_id IS NOT NULL
            AND public.lab_record_is_visible_to_current_user(p_tenant_id, p_target_lab_id)
            AND (
              p_target_role IS NULL
              OR lower(trim(p_target_role)) = 'agent'
            )
          )
        )
      )
      OR (
        public.current_user_role() = 'lab'
        AND p_target_lab_id IS NOT NULL
        AND lower(trim(p_target_lab_id)) = lower(trim(COALESCE(public.current_profile_lab_id(), '')))
      )
    );
$$;

-- LIVE QA: EXECUTE granted to PUBLIC (default). Explicit grants keep parity intentional.
GRANT EXECUTE ON FUNCTION public.notification_event_visible_to_current_user(uuid, text, uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_event_visible_to_current_user(uuid, text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.notification_event_visible_to_current_user(uuid, text, uuid, text) IS
  'Role/tenant visibility gate for notification_events and notification_delivery_log SELECT. QA-canonical parity.';
