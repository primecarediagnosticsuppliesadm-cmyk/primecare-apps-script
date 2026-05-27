-- PrimeCare Notification Foundation (internal event log only — no external providers).
-- Run after production_auth_rls_pilot_migration.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- notification_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_type text NOT NULL,
  source_module text NOT NULL,
  source_id text,
  actor_user_id uuid,
  target_role text,
  target_user_id uuid,
  target_lab_id text,
  payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'info',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_events_severity_check CHECK (
    lower(severity) IN ('info', 'low', 'medium', 'high', 'critical')
  ),
  CONSTRAINT notification_events_status_check CHECK (
    lower(status) IN ('pending', 'read', 'acknowledged', 'archived')
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_events_tenant_created
  ON public.notification_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_events_tenant_type
  ON public.notification_events (tenant_id, event_type);
CREATE INDEX IF NOT EXISTS idx_notification_events_tenant_status
  ON public.notification_events (tenant_id, status);

COMMENT ON TABLE public.notification_events IS
  'Internal notification event log; no external delivery from this table alone.';

-- ---------------------------------------------------------------------------
-- notification_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_templates (
  template_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  event_type text NOT NULL,
  channel text NOT NULL,
  title_template text NOT NULL DEFAULT '',
  body_template text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_templates_channel_check CHECK (
    lower(channel) IN (
      'in_app',
      'email_placeholder',
      'whatsapp_placeholder',
      'sms_placeholder'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_lookup
  ON public.notification_templates (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), event_type, channel);

-- ---------------------------------------------------------------------------
-- notification_preferences
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  preference_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid,
  role text,
  lab_id text,
  event_type text NOT NULL,
  channel text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  quiet_hours_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_channel_check CHECK (
    lower(channel) IN (
      'in_app',
      'email_placeholder',
      'whatsapp_placeholder',
      'sms_placeholder'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_tenant_user
  ON public.notification_preferences (tenant_id, user_id);

-- ---------------------------------------------------------------------------
-- notification_delivery_log (placeholder channels only — never live send)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
  delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL REFERENCES public.notification_events (event_id) ON DELETE CASCADE,
  channel text NOT NULL,
  recipient text,
  status text NOT NULL DEFAULT 'placeholder_not_sent',
  provider_response jsonb,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  error_message text,
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
      'logged_in_app',
      'skipped',
      'failed'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_tenant_event
  ON public.notification_delivery_log (tenant_id, event_id);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_tenant_attempted
  ON public.notification_delivery_log (tenant_id, attempted_at DESC);

-- ---------------------------------------------------------------------------
-- Seed global in_app templates (no external send)
-- ---------------------------------------------------------------------------
INSERT INTO public.notification_templates (
  tenant_id,
  event_type,
  channel,
  title_template,
  body_template,
  active
)
SELECT NULL, v.event_type, 'in_app', v.title_template, v.body_template, true
FROM (
  VALUES
    ('order_created', 'Order created', 'Order {{source_id}} was created for lab {{target_lab_id}}.'),
    ('order_fulfilled', 'Order fulfilled', 'Order {{source_id}} was fulfilled.'),
    ('payment_received', 'Payment received', 'Payment recorded for lab {{target_lab_id}}.'),
    ('collection_due', 'Collection due', 'Collection follow-up is due for lab {{target_lab_id}}.'),
    ('credit_hold_triggered', 'Credit hold', 'Credit hold triggered for lab {{target_lab_id}}.'),
    ('low_stock', 'Low stock', 'Inventory item is below threshold.'),
    ('purchase_order_created', 'PO created', 'Purchase order {{source_id}} was created.'),
    ('purchase_order_received', 'PO received', 'Purchase order {{source_id}} was received.'),
    ('agent_visit_logged', 'Visit logged', 'Agent visit logged for lab {{target_lab_id}}.'),
    ('qualification_updated', 'Qualification updated', 'Lab qualification was updated.')
) AS v(event_type, title_template, body_template)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_templates t
  WHERE t.tenant_id IS NULL
    AND t.event_type = v.event_type
    AND t.channel = 'in_app'
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_events_select_by_role" ON public.notification_events;
DROP POLICY IF EXISTS "notification_events_insert_by_role" ON public.notification_events;
DROP POLICY IF EXISTS "notification_events_update_by_role" ON public.notification_events;

CREATE POLICY "notification_events_select_by_role"
  ON public.notification_events FOR SELECT TO authenticated
  USING (
    public.notification_event_visible_to_current_user(
      tenant_id,
      target_role,
      target_user_id,
      target_lab_id
    )
  );

CREATE POLICY "notification_events_insert_by_role"
  ON public.notification_events FOR INSERT TO authenticated
  WITH CHECK (
    public.tenant_id_matches(tenant_id)
    AND (
      actor_user_id IS NULL
      OR actor_user_id = auth.uid()
      OR public.is_admin_or_executive()
    )
  );

CREATE POLICY "notification_events_update_by_role"
  ON public.notification_events FOR UPDATE TO authenticated
  USING (
    public.notification_event_visible_to_current_user(
      tenant_id,
      target_role,
      target_user_id,
      target_lab_id
    )
  )
  WITH CHECK (
    public.tenant_id_matches(tenant_id)
    AND public.notification_event_visible_to_current_user(
      tenant_id,
      target_role,
      target_user_id,
      target_lab_id
    )
  );

DROP POLICY IF EXISTS "notification_templates_select_by_role" ON public.notification_templates;
DROP POLICY IF EXISTS "notification_templates_write_admin" ON public.notification_templates;

CREATE POLICY "notification_templates_select_by_role"
  ON public.notification_templates FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR public.tenant_id_matches(tenant_id)
  );

CREATE POLICY "notification_templates_write_admin"
  ON public.notification_templates FOR ALL TO authenticated
  USING (
    (tenant_id IS NULL AND public.is_admin_or_executive())
    OR public.can_write_ops_for_tenant(tenant_id)
  )
  WITH CHECK (
    (tenant_id IS NULL AND public.is_admin_or_executive())
    OR public.can_write_ops_for_tenant(tenant_id)
  );

DROP POLICY IF EXISTS "notification_preferences_select_by_role" ON public.notification_preferences;
DROP POLICY IF EXISTS "notification_preferences_write_own" ON public.notification_preferences;

CREATE POLICY "notification_preferences_select_by_role"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (
    public.is_admin_or_executive()
    AND public.tenant_id_matches(tenant_id)
  )
  OR (
    user_id IS NOT NULL
    AND user_id = auth.uid()
    AND public.tenant_id_matches(tenant_id)
  );

CREATE POLICY "notification_preferences_write_own"
  ON public.notification_preferences FOR ALL TO authenticated
  USING (
    public.is_admin_or_executive()
    AND public.tenant_id_matches(tenant_id)
  )
  OR (
    user_id = auth.uid()
    AND public.tenant_id_matches(tenant_id)
  )
  WITH CHECK (
    public.is_admin_or_executive()
    AND public.tenant_id_matches(tenant_id)
  )
  OR (
    user_id = auth.uid()
    AND public.tenant_id_matches(tenant_id)
  );

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
