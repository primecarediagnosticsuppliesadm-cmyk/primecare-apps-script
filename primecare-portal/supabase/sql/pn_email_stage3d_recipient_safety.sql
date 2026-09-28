-- PN-EMAIL Stage 3D — Production lifecycle recipient safety.
-- Additive. Does not send email. No cron. EMAIL_ENABLED must remain false.
-- Does not rewrite existing forensic delivery rows.
-- Does not remove production_freeze.
--
-- Canonical eligibility is address-based (.local / primecare.local rejected).
-- Does not hard-code Founder Gmail, Vishwa, usernames, or agent IDs.

CREATE OR REPLACE FUNCTION public.prospect_email_is_production_dispatchable(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    public.prospect_email_address_usable(p_email)
    AND lower(split_part(btrim(p_email), '@', 2)) IS DISTINCT FROM 'local'
    AND lower(split_part(btrim(p_email), '@', 2)) NOT LIKE '%.local';
$$;

ALTER FUNCTION public.prospect_email_is_production_dispatchable(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prospect_email_is_production_dispatchable(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prospect_email_is_production_dispatchable(text) FROM anon;
REVOKE ALL ON FUNCTION public.prospect_email_is_production_dispatchable(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.prospect_email_is_production_dispatchable(text) FROM service_role;

COMMENT ON FUNCTION public.prospect_email_is_production_dispatchable(text) IS
  'PN-EMAIL 3D: syntax-usable Production lifecycle address. Rejects NULL/blank/invalid and *.local / primecare.local. Does not reject Gmail.';

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
  v_error_summary text;
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
        lower(btrim(p.email)) AS email_norm,
        public.prospect_email_is_production_dispatchable(p.email) AS dispatchable
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
          CASE WHEN rec.dispatchable THEN 'queued' ELSE 'skipped' END,
          rec.user_id,
          rec.email_norm,
          NULL,
          0,
          CASE WHEN rec.dispatchable THEN now() ELSE NULL END,
          CASE WHEN rec.dispatchable THEN NULL ELSE 'non_dispatchable_domain' END,
          CASE WHEN rec.dispatchable THEN NULL ELSE 'recipient domain is not Production-dispatchable' END,
          now()
        );
      EXCEPTION
        WHEN unique_violation THEN
          NULL;
      END;
    END LOOP;
    RETURN;
  END IF;

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
  v_error_summary := NULL;

  IF COALESCE(v_src.active, false) IS NOT TRUE THEN
    v_status := 'skipped';
    v_error_code := 'inactive_profile';
    v_error_summary := 'sourcing Agent profile inactive';
  ELSIF NOT public.prospect_email_address_usable(v_src.email) THEN
    v_status := 'skipped';
    v_error_code := 'missing_email';
    v_error_summary := 'sourcing Agent email missing or invalid';
  ELSIF NOT public.prospect_email_is_production_dispatchable(v_src.email) THEN
    v_status := 'skipped';
    v_error_code := 'non_dispatchable_domain';
    v_error_summary := 'sourcing Agent domain is not Production-dispatchable';
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
      v_error_summary,
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
  'PN-1B1/3D: queue Production-dispatchable HQ/Agent email rows. .local is skipped, never queued as sendable. Does not send.';

CREATE OR REPLACE FUNCTION public.claim_notification_email_deliveries(p_limit integer DEFAULT 10)
RETURNS TABLE (
  delivery_id uuid,
  event_id uuid,
  tenant_id uuid,
  recipient_user_id uuid,
  recipient_email text,
  provider_message_id text,
  attempt_count integer,
  event_type text,
  payload_json jsonb,
  source_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
BEGIN
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 10);
  PERFORM set_config('primecare.email_delivery', '1', true);

  RETURN QUERY
  WITH picked AS (
    SELECT d.delivery_id
    FROM public.notification_delivery_log d
    WHERE d.channel = 'email'
      AND d.certification_kind IS NULL
      AND d.provider_message_id IS NULL
      AND public.prospect_email_is_production_dispatchable(d.recipient_email)
      AND COALESCE(d.attempt_count, 0) < 4
      AND (
        d.status = 'queued'
        OR (
          d.status = 'failed'
          AND d.next_attempt_at IS NOT NULL
          AND d.next_attempt_at <= now()
        )
        OR (
          d.status = 'processing'
          AND d.last_attempt_at IS NOT NULL
          AND d.last_attempt_at < now() - interval '15 minutes'
        )
      )
      AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= now() OR d.status = 'processing')
    ORDER BY d.next_attempt_at NULLS FIRST, d.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  upd AS (
    UPDATE public.notification_delivery_log d
    SET
      status = 'processing',
      attempt_count = COALESCE(d.attempt_count, 0) + 1,
      last_attempt_at = now(),
      provider = COALESCE(d.provider, 'resend')
    FROM picked
    WHERE d.delivery_id = picked.delivery_id
      AND d.channel = 'email'
      AND d.certification_kind IS NULL
      AND d.status IS DISTINCT FROM 'sent'
      AND d.provider_message_id IS NULL
    RETURNING
      d.delivery_id,
      d.event_id,
      d.tenant_id,
      d.recipient_user_id,
      d.recipient_email,
      d.provider_message_id,
      d.attempt_count
  )
  SELECT
    u.delivery_id,
    u.event_id,
    u.tenant_id,
    u.recipient_user_id,
    u.recipient_email,
    u.provider_message_id,
    u.attempt_count,
    e.event_type,
    e.payload_json,
    e.source_id
  FROM upd u
  JOIN public.notification_events e ON e.event_id = u.event_id;
END;
$$;

ALTER FUNCTION public.claim_notification_email_deliveries(integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_notification_email_deliveries(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_email_deliveries(integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_email_deliveries(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_email_deliveries(integer) TO service_role;

COMMENT ON FUNCTION public.claim_notification_email_deliveries(integer) IS
  'PN-1B2/2A/3D: claim up to 10 normal dispatchable email rows. Certification and .local recipients are excluded. Does not send.';
