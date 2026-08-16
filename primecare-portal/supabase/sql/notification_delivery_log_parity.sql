-- Mirror of supabase/migrations/20260816150000_notification_delivery_log_parity.sql
-- LIVE QA-canonical notification_delivery_log (no anon writes).

CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'placeholder_not_sent',
  provider_message_id text,
  provider_error text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_delivery_log_channel_check CHECK (
    lower(channel) IN (
      'in_app',
      'email_placeholder',
      'whatsapp_placeholder',
      'sms_placeholder'
    )
  ),
  CONSTRAINT notification_delivery_log_status_check CHECK (
    lower(status) IN (
      'placeholder_not_sent',
      'logged_in_app'
    )
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_delivery_log_event_id_fkey'
      AND conrelid = 'public.notification_delivery_log'::regclass
  ) THEN
    ALTER TABLE public.notification_delivery_log
      ADD CONSTRAINT notification_delivery_log_event_id_fkey
      FOREIGN KEY (event_id)
      REFERENCES public.notification_events (event_id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_tenant_event
  ON public.notification_delivery_log (tenant_id, event_id);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_tenant_attempted
  ON public.notification_delivery_log (tenant_id, attempted_at DESC);

ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_delivery_log_select_by_role" ON public.notification_delivery_log;
DROP POLICY IF EXISTS "notification_delivery_log_insert_by_role" ON public.notification_delivery_log;

CREATE POLICY "notification_delivery_log_select_by_role"
  ON public.notification_delivery_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.notification_events e
      WHERE e.event_id = notification_delivery_log.event_id
        AND public.notification_event_visible_to_current_user(
          e.tenant_id,
          e.target_role,
          e.target_user_id,
          e.target_lab_id
        )
    )
  );

CREATE POLICY "notification_delivery_log_insert_by_role"
  ON public.notification_delivery_log FOR INSERT TO authenticated
  WITH CHECK (
    public.tenant_id_matches(tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.notification_events e
      WHERE e.event_id = notification_delivery_log.event_id
        AND e.tenant_id = notification_delivery_log.tenant_id
    )
  );

REVOKE ALL ON TABLE public.notification_delivery_log FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_delivery_log FROM anon;
GRANT SELECT, INSERT ON TABLE public.notification_delivery_log TO authenticated;

COMMENT ON TABLE public.notification_delivery_log IS
  'Placeholder delivery audit for notification_events. No live external send. QA-canonical parity.';
