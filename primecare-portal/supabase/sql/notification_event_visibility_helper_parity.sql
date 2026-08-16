-- Mirror of supabase/migrations/20260816145000_notification_event_visibility_helper_parity.sql
-- LIVE QA-canonical notification_event_visible_to_current_user (SECURITY DEFINER, search_path=public).

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

GRANT EXECUTE ON FUNCTION public.notification_event_visible_to_current_user(uuid, text, uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_event_visible_to_current_user(uuid, text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.notification_event_visible_to_current_user(uuid, text, uuid, text) IS
  'Role/tenant visibility gate for notification_events and notification_delivery_log SELECT. QA-canonical parity.';
