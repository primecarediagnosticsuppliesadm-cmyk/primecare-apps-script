-- PN-1B1 — Prospect email delivery queue foundation (QA only).
-- Extends notification_delivery_log from LIVE QA truth.
-- Does NOT send email. No provider, Edge Function, cron, webhook, DNS, or API key.
-- Does not change Flow 2 business semantics or notification_events lifecycle statuses.
-- Queue failure must not roll back Prospect create/activate or the in-app event.

-- ---------------------------------------------------------------------------
-- A. Schema — additive channel/status + queue columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_delivery_log
  ADD COLUMN IF NOT EXISTS recipient_user_id uuid,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_summary text;

ALTER TABLE public.notification_delivery_log
  DROP CONSTRAINT IF EXISTS notification_delivery_log_channel_check;

ALTER TABLE public.notification_delivery_log
  ADD CONSTRAINT notification_delivery_log_channel_check
  CHECK (
    lower(channel) = ANY (
      ARRAY[
        'in_app'::text,
        'email_placeholder'::text,
        'whatsapp_placeholder'::text,
        'sms_placeholder'::text,
        'email'::text
      ]
    )
  );

ALTER TABLE public.notification_delivery_log
  DROP CONSTRAINT IF EXISTS notification_delivery_log_status_check;

ALTER TABLE public.notification_delivery_log
  ADD CONSTRAINT notification_delivery_log_status_check
  CHECK (
    lower(status) = ANY (
      ARRAY[
        'placeholder_not_sent'::text,
        'logged_in_app'::text,
        'queued'::text,
        'processing'::text,
        'sent'::text,
        'failed'::text,
        'skipped'::text
      ]
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_log_email_recipient_uidx
  ON public.notification_delivery_log (event_id, channel, recipient_user_id)
  WHERE channel = 'email'
    AND recipient_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_log_email_null_recipient_uidx
  ON public.notification_delivery_log (event_id, channel)
  WHERE channel = 'email'
    AND recipient_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_notification_delivery_log_email_dispatch
  ON public.notification_delivery_log (status, next_attempt_at)
  WHERE channel = 'email';

COMMENT ON COLUMN public.notification_delivery_log.recipient_email IS
  'PN-1B1: queue-time recipient snapshot. Not a send. Dispatcher not in this slice.';

-- ---------------------------------------------------------------------------
-- B. Usable-email predicate (format only; does not weaken QA test domains)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prospect_email_address_usable(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    nullif(btrim(COALESCE(p_email, '')), '') IS NOT NULL
    AND btrim(p_email) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$$;

ALTER FUNCTION public.prospect_email_address_usable(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prospect_email_address_usable(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prospect_email_address_usable(text) FROM anon;
REVOKE ALL ON FUNCTION public.prospect_email_address_usable(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.prospect_email_address_usable(text) FROM service_role;

-- ---------------------------------------------------------------------------
-- C. Client write lock — authenticated cannot INSERT/UPDATE channel=email
--    unless GUC primecare.email_delivery=1 (server helper / future dispatcher).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_delivery_log_email_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF lower(btrim(COALESCE(NEW.channel, ''))) = 'email'
      AND current_setting('primecare.email_delivery', true) IS DISTINCT FROM '1'
    THEN
      RAISE EXCEPTION 'email_delivery_forbidden';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (
      lower(btrim(COALESCE(NEW.channel, ''))) = 'email'
      OR lower(btrim(COALESCE(OLD.channel, ''))) = 'email'
    )
      AND current_setting('primecare.email_delivery', true) IS DISTINCT FROM '1'
    THEN
      RAISE EXCEPTION 'email_delivery_forbidden';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notification_delivery_log_email_server_only() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notification_delivery_log_email_server_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_delivery_log_email_server_only() FROM anon;
REVOKE ALL ON FUNCTION public.notification_delivery_log_email_server_only() FROM authenticated;
REVOKE ALL ON FUNCTION public.notification_delivery_log_email_server_only() FROM service_role;

DROP TRIGGER IF EXISTS notification_delivery_log_email_server_only_trg
  ON public.notification_delivery_log;
CREATE TRIGGER notification_delivery_log_email_server_only_trg
  BEFORE INSERT OR UPDATE ON public.notification_delivery_log
  FOR EACH ROW
  EXECUTE FUNCTION public.notification_delivery_log_email_server_only();

DROP POLICY IF EXISTS notification_delivery_log_insert ON public.notification_delivery_log;
CREATE POLICY notification_delivery_log_insert
  ON public.notification_delivery_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id_matches(tenant_id)
    AND lower(channel) <> 'email'
    AND EXISTS (
      SELECT 1
      FROM public.notification_events e
      WHERE e.event_id = notification_delivery_log.event_id
        AND e.tenant_id = notification_delivery_log.tenant_id
        AND (is_admin_or_executive() OR current_user_role() = 'agent')
    )
  );

DROP POLICY IF EXISTS notification_delivery_log_insert_by_role ON public.notification_delivery_log;
CREATE POLICY notification_delivery_log_insert_by_role
  ON public.notification_delivery_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id_matches(tenant_id)
    AND lower(channel) <> 'email'
    AND EXISTS (
      SELECT 1
      FROM public.notification_events e
      WHERE e.event_id = notification_delivery_log.event_id
        AND e.tenant_id = notification_delivery_log.tenant_id
    )
  );

DROP POLICY IF EXISTS notification_delivery_log_update ON public.notification_delivery_log;
CREATE POLICY notification_delivery_log_update
  ON public.notification_delivery_log
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id_matches(tenant_id)
    AND lower(channel) <> 'email'
    AND EXISTS (
      SELECT 1
      FROM public.notification_events e
      WHERE e.event_id = notification_delivery_log.event_id
        AND e.tenant_id = notification_delivery_log.tenant_id
        AND is_admin_or_executive()
    )
  )
  WITH CHECK (
    tenant_id_matches(tenant_id)
    AND lower(channel) <> 'email'
    AND EXISTS (
      SELECT 1
      FROM public.notification_events e
      WHERE e.event_id = notification_delivery_log.event_id
        AND e.tenant_id = notification_delivery_log.tenant_id
        AND is_admin_or_executive()
    )
  );

-- ---------------------------------------------------------------------------
-- D. Queue helper — one delivery per event + email + recipient_user_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enqueue_prospect_email_deliveries(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.notification_events%ROWTYPE;
  v_lab public.labs%ROWTYPE;
  v_src public.profiles%ROWTYPE;
  v_event_type text;
  v_source_agent_id text;
  v_email text;
  v_status text;
  v_error_code text;
  rec RECORD;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN;
  END IF;

  SELECT e.*
    INTO v_event
  FROM public.notification_events e
  WHERE e.event_id = p_event_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_event_type := lower(btrim(COALESCE(v_event.event_type, '')));
  IF v_event_type NOT IN ('prospect_created', 'prospect_activated') THEN
    RETURN;
  END IF;

  PERFORM set_config('primecare.email_delivery', '1', true);

  IF v_event_type = 'prospect_created' THEN
    FOR rec IN
      SELECT DISTINCT ON (lower(btrim(p.email)))
        p.user_id,
        lower(btrim(p.email)) AS email_norm
      FROM public.profiles p
      WHERE p.tenant_id = v_event.tenant_id
        AND COALESCE(p.active, false) IS TRUE
        AND lower(btrim(COALESCE(p.role, ''))) IN ('admin', 'executive')
        AND public.prospect_email_address_usable(p.email)
      ORDER BY
        lower(btrim(p.email)),
        CASE lower(btrim(COALESCE(p.role, '')))
          WHEN 'admin' THEN 0
          WHEN 'executive' THEN 1
          ELSE 2
        END,
        p.user_id
    LOOP
      BEGIN
        INSERT INTO public.notification_delivery_log (
          event_id,
          tenant_id,
          channel,
          status,
          recipient_user_id,
          recipient_email,
          provider,
          attempt_count,
          next_attempt_at,
          error_code,
          error_summary,
          attempted_at
        )
        VALUES (
          v_event.event_id,
          v_event.tenant_id,
          'email',
          'queued',
          rec.user_id,
          rec.email_norm,
          NULL,
          0,
          now(),
          NULL,
          NULL,
          now()
        );
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;
    END LOOP;
    RETURN;
  END IF;

  -- prospect_activated: immutable sourcing Agent only.
  SELECT l.*
    INTO v_lab
  FROM public.labs l
  WHERE l.tenant_id = v_event.tenant_id
    AND public.primecare_normalize_lab_id(l.lab_id)
      = public.primecare_normalize_lab_id(v_event.source_id)
  LIMIT 1;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.notification_delivery_log (
        event_id,
        tenant_id,
        channel,
        status,
        recipient_user_id,
        recipient_email,
        provider,
        attempt_count,
        next_attempt_at,
        error_code,
        error_summary,
        attempted_at
      )
      VALUES (
        v_event.event_id,
        v_event.tenant_id,
        'email',
        'skipped',
        NULL,
        NULL,
        NULL,
        0,
        NULL,
        'missing_profile',
        'sourcing lab or profile could not be resolved',
        now()
      );
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
    RETURN;
  END IF;

  v_source_agent_id := nullif(btrim(COALESCE(v_lab.sourced_by_agent_id, '')), '');
  IF v_source_agent_id IS NOT NULL THEN
    SELECT p.*
      INTO v_src
    FROM public.profiles p
    WHERE p.tenant_id = v_event.tenant_id
      AND lower(btrim(COALESCE(p.role, ''))) = 'agent'
      AND nullif(btrim(p.agent_id), '') = v_source_agent_id
    ORDER BY p.active DESC NULLS LAST, p.user_id
    LIMIT 1;
  END IF;

  IF v_src.user_id IS NULL THEN
    BEGIN
      INSERT INTO public.notification_delivery_log (
        event_id,
        tenant_id,
        channel,
        status,
        recipient_user_id,
        recipient_email,
        provider,
        attempt_count,
        next_attempt_at,
        error_code,
        error_summary,
        attempted_at
      )
      VALUES (
        v_event.event_id,
        v_event.tenant_id,
        'email',
        'skipped',
        NULL,
        NULL,
        NULL,
        0,
        NULL,
        'missing_profile',
        'sourcing Agent profile missing',
        now()
      );
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
    RETURN;
  END IF;

  IF v_event.target_user_id IS NOT NULL
    AND v_src.user_id IS DISTINCT FROM v_event.target_user_id
  THEN
    BEGIN
      INSERT INTO public.notification_delivery_log (
        event_id,
        tenant_id,
        channel,
        status,
        recipient_user_id,
        recipient_email,
        provider,
        attempt_count,
        next_attempt_at,
        error_code,
        error_summary,
        attempted_at
      )
      VALUES (
        v_event.event_id,
        v_event.tenant_id,
        'email',
        'skipped',
        v_event.target_user_id,
        NULL,
        NULL,
        0,
        NULL,
        'target_mismatch',
        'event target_user_id is not the sourcing Agent',
        now()
      );
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
    RETURN;
  END IF;

  v_email := lower(btrim(COALESCE(v_src.email, '')));
  v_status := 'queued';
  v_error_code := NULL;

  IF COALESCE(v_src.active, false) IS NOT TRUE THEN
    v_status := 'skipped';
    v_error_code := 'inactive_profile';
  ELSIF NOT public.prospect_email_address_usable(v_src.email) THEN
    v_status := 'skipped';
    v_error_code := 'missing_email';
  END IF;

  BEGIN
    INSERT INTO public.notification_delivery_log (
      event_id,
      tenant_id,
      channel,
      status,
      recipient_user_id,
      recipient_email,
      provider,
      attempt_count,
      next_attempt_at,
      error_code,
      error_summary,
      attempted_at
    )
    VALUES (
      v_event.event_id,
      v_event.tenant_id,
      'email',
      v_status,
      v_src.user_id,
      nullif(v_email, ''),
      NULL,
      0,
      CASE WHEN v_status = 'queued' THEN now() ELSE NULL END,
      v_error_code,
      CASE
        WHEN v_error_code = 'inactive_profile' THEN 'sourcing Agent profile inactive'
        WHEN v_error_code = 'missing_email' THEN 'sourcing Agent email missing or invalid'
        ELSE NULL
      END,
      now()
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END;
$$;

ALTER FUNCTION public.enqueue_prospect_email_deliveries(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enqueue_prospect_email_deliveries(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_prospect_email_deliveries(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_prospect_email_deliveries(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.enqueue_prospect_email_deliveries(uuid) FROM service_role;

COMMENT ON FUNCTION public.enqueue_prospect_email_deliveries(uuid) IS
  'PN-1B1: queue channel=email delivery rows for prospect_created / prospect_activated. Does not send. unique_violation is a no-op.';

-- ---------------------------------------------------------------------------
-- E. AFTER INSERT trigger — isolated; cannot fail the in-app event insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_events_enqueue_prospect_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND lower(btrim(COALESCE(NEW.event_type, ''))) IN ('prospect_created', 'prospect_activated')
  THEN
    BEGIN
      PERFORM public.enqueue_prospect_email_deliveries(NEW.event_id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'prospect_email_enqueue_failed event_id=% event_type=% sqlstate=% sqlerrm=%',
          NEW.event_id, NEW.event_type, SQLSTATE, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notification_events_enqueue_prospect_email() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notification_events_enqueue_prospect_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_events_enqueue_prospect_email() FROM anon;
REVOKE ALL ON FUNCTION public.notification_events_enqueue_prospect_email() FROM authenticated;
REVOKE ALL ON FUNCTION public.notification_events_enqueue_prospect_email() FROM service_role;

DROP TRIGGER IF EXISTS notification_events_enqueue_prospect_email_trg
  ON public.notification_events;
CREATE TRIGGER notification_events_enqueue_prospect_email_trg
  AFTER INSERT ON public.notification_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notification_events_enqueue_prospect_email();

NOTIFY pgrst, 'reload schema';
