-- PN-EMAIL production dispatch preparation.
-- Additive. Does not send email. Does not claim rows. Does not schedule cron.
-- Does not change notification routes or the seven queued business deliveries.
-- Does not edit 20260930120000_p0_public_privilege_hardening.sql.

ALTER TABLE public.notification_delivery_log
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz;

COMMENT ON COLUMN public.notification_delivery_log.bounced_at IS
  'Provider bounce signal. Not set by API acceptance.';

COMMENT ON COLUMN public.notification_delivery_log.complained_at IS
  'Provider complaint signal. Not set by API acceptance.';

COMMENT ON COLUMN public.notification_delivery_log.delivered_at IS
  'Provider delivery signal. API acceptance must leave this NULL.';

CREATE TABLE IF NOT EXISTS public.notification_email_provider_events (
  svix_id text PRIMARY KEY,
  provider_message_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_provider_events_type_chk
    CHECK (event_type IN ('email.delivered', 'email.bounced', 'email.complained'))
);

COMMENT ON TABLE public.notification_email_provider_events IS
  'PN-EMAIL: verified Resend webhook events. svix_id is the idempotency key. Does not choose recipients.';

CREATE INDEX IF NOT EXISTS notification_email_provider_events_message_idx
  ON public.notification_email_provider_events (provider_message_id);

CREATE INDEX IF NOT EXISTS notification_delivery_log_provider_message_idx
  ON public.notification_delivery_log (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.notification_email_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_provider_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.notification_email_provider_events FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_email_provider_events FROM anon;
REVOKE ALL ON TABLE public.notification_email_provider_events FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.notification_email_provider_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_notification_email_provider_event(
  p_svix_id text,
  p_provider_message_id text,
  p_event_type text,
  p_occurred_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
  v_message text;
  v_type text;
  v_inserted integer;
  v_updated integer;
BEGIN
  v_id := nullif(btrim(COALESCE(p_svix_id, '')), '');
  v_message := nullif(btrim(COALESCE(p_provider_message_id, '')), '');
  v_type := lower(btrim(COALESCE(p_event_type, '')));

  IF v_id IS NULL OR v_message IS NULL OR p_occurred_at IS NULL THEN
    RETURN 'ignored';
  END IF;

  IF v_type NOT IN ('email.delivered', 'email.bounced', 'email.complained') THEN
    RETURN 'ignored';
  END IF;

  PERFORM set_config('primecare.email_delivery', '1', true);

  INSERT INTO public.notification_email_provider_events (
    svix_id,
    provider_message_id,
    event_type,
    occurred_at
  )
  VALUES (v_id, v_message, v_type, p_occurred_at)
  ON CONFLICT (svix_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN 'duplicate';
  END IF;

  UPDATE public.notification_delivery_log d
  SET
    delivered_at = CASE
      WHEN v_type = 'email.delivered' AND d.delivered_at IS NULL THEN p_occurred_at
      ELSE d.delivered_at
    END,
    bounced_at = CASE
      WHEN v_type = 'email.bounced' AND d.bounced_at IS NULL THEN p_occurred_at
      ELSE d.bounced_at
    END,
    complained_at = CASE
      WHEN v_type = 'email.complained' AND d.complained_at IS NULL THEN p_occurred_at
      ELSE d.complained_at
    END
  WHERE d.channel = 'email'
    AND d.status = 'sent'
    AND d.provider_message_id = v_message;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN 'unmatched';
  END IF;
  RETURN 'recorded';
END;
$$;

ALTER FUNCTION public.record_notification_email_provider_event(text, text, text, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_notification_email_provider_event(text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_notification_email_provider_event(text, text, text, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.record_notification_email_provider_event(text, text, text, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_notification_email_provider_event(text, text, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.record_notification_email_provider_event(text, text, text, timestamptz) IS
  'PN-EMAIL: store one verified provider event and stamp delivered_at, bounced_at, or complained_at. Does not change status, recipient, route, or provider_message_id. Duplicate svix_id is a no-op.';

-- Close the crash window inside the normal batch claim. This body runs only
-- when the function is called. Applying this migration does not call it.
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

  UPDATE public.notification_delivery_log d
  SET
    status = 'failed',
    error_code = CASE
      WHEN d.last_attempt_at IS NOT NULL
        AND d.last_attempt_at < now() - interval '24 hours'
        THEN 'send_uncertain_do_not_retry'
      ELSE 'attempts_exhausted'
    END,
    error_summary = CASE
      WHEN d.last_attempt_at IS NOT NULL
        AND d.last_attempt_at < now() - interval '24 hours'
        THEN 'provider acceptance uncertain after idempotency window; no further provider call'
      ELSE 'attempt limit reached; no further provider call'
    END,
    failed_at = COALESCE(d.failed_at, now()),
    next_attempt_at = NULL
  WHERE d.channel = 'email'
    AND d.status = 'processing'
    AND d.certification_kind IS NULL
    AND d.provider_message_id IS NULL
    AND d.delivery_id NOT IN (
      'c02c0d63-9a0f-4ec6-8966-6035258364ad'::uuid,
      '424796d2-3e78-438c-8fb6-ab5c3bb3e28b'::uuid,
      '63561826-8bb3-4004-b857-b58c397b2aae'::uuid,
      'b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64'::uuid,
      '3cbbe9bf-0d1a-42f7-9170-b74dd5a60b79'::uuid,
      'fd799383-62f3-499f-a1e3-17c1bdc4ea89'::uuid,
      '3face3b7-abac-46ff-839a-eccc1ef2b79e'::uuid
    )
    AND (
      (
        d.last_attempt_at IS NOT NULL
        AND d.last_attempt_at < now() - interval '24 hours'
      )
      OR COALESCE(d.attempt_count, 0) >= 4
    );

  RETURN QUERY
  WITH picked AS (
    SELECT d.delivery_id
    FROM public.notification_delivery_log d
    WHERE d.channel = 'email'
      AND d.certification_kind IS NULL
      AND d.provider_message_id IS NULL
      AND public.prospect_email_is_production_dispatchable(d.recipient_email)
      AND d.delivery_id NOT IN (
        'c02c0d63-9a0f-4ec6-8966-6035258364ad'::uuid,
        '424796d2-3e78-438c-8fb6-ab5c3bb3e28b'::uuid,
        '63561826-8bb3-4004-b857-b58c397b2aae'::uuid,
        'b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64'::uuid,
        '3cbbe9bf-0d1a-42f7-9170-b74dd5a60b79'::uuid,
        'fd799383-62f3-499f-a1e3-17c1bdc4ea89'::uuid,
        '3face3b7-abac-46ff-839a-eccc1ef2b79e'::uuid
      )
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
          AND d.last_attempt_at >= now() - interval '24 hours'
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
      AND COALESCE(d.attempt_count, 0) < 4
      AND d.delivery_id NOT IN (
        'c02c0d63-9a0f-4ec6-8966-6035258364ad'::uuid,
        '424796d2-3e78-438c-8fb6-ab5c3bb3e28b'::uuid,
        '63561826-8bb3-4004-b857-b58c397b2aae'::uuid,
        'b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64'::uuid,
        '3cbbe9bf-0d1a-42f7-9170-b74dd5a60b79'::uuid,
        'fd799383-62f3-499f-a1e3-17c1bdc4ea89'::uuid,
        '3face3b7-abac-46ff-839a-eccc1ef2b79e'::uuid
      )
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
  'PN-EMAIL: claim up to 10 dispatchable rows. Forensic and certification rows are excluded. Processing older than 24 hours or past 4 attempts is failed with no provider call. Does not send.';

CREATE OR REPLACE FUNCTION public.claim_notification_email_production_delivery(p_delivery_id uuid)
RETURNS TABLE (
  claim_outcome text,
  delivery_id uuid,
  event_id uuid,
  tenant_id uuid,
  recipient_user_id uuid,
  recipient_email text,
  provider_message_id text,
  attempt_count integer,
  certification_kind text,
  event_type text,
  payload_json jsonb,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.notification_delivery_log%ROWTYPE;
  v_event public.notification_events%ROWTYPE;
  v_outcome text;
  v_exists boolean;
BEGIN
  IF p_delivery_id IS NULL THEN
    claim_outcome := 'not_found';
    delivery_id := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_delivery_id IN (
    'c02c0d63-9a0f-4ec6-8966-6035258364ad'::uuid,
    '424796d2-3e78-438c-8fb6-ab5c3bb3e28b'::uuid,
    '63561826-8bb3-4004-b857-b58c397b2aae'::uuid,
    'b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64'::uuid,
    '3cbbe9bf-0d1a-42f7-9170-b74dd5a60b79'::uuid,
    'fd799383-62f3-499f-a1e3-17c1bdc4ea89'::uuid,
    '3face3b7-abac-46ff-839a-eccc1ef2b79e'::uuid
  ) THEN
    claim_outcome := 'forensic_excluded';
    delivery_id := p_delivery_id;
    error_code := 'forensic_excluded';
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM set_config('primecare.email_delivery', '1', true);

  SELECT d.*
    INTO v_row
  FROM public.notification_delivery_log d
  WHERE d.delivery_id = p_delivery_id
    AND d.channel = 'email'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.notification_delivery_log d
      WHERE d.delivery_id = p_delivery_id
        AND d.channel = 'email'
    )
      INTO v_exists;
    claim_outcome := CASE WHEN v_exists THEN 'locked' ELSE 'not_found' END;
    delivery_id := p_delivery_id;
    error_code := claim_outcome;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT e.*
    INTO v_event
  FROM public.notification_events e
  WHERE e.event_id = v_row.event_id;

  IF v_row.certification_kind IS NOT NULL THEN
    v_outcome := 'certification_excluded';
  ELSIF nullif(btrim(COALESCE(v_row.provider_message_id, '')), '') IS NOT NULL THEN
    v_outcome := 'provider_id_present';
  ELSIF v_row.status = 'sent' THEN
    v_outcome := 'already_sent';
  ELSIF NOT public.prospect_email_is_production_dispatchable(v_row.recipient_email) THEN
    v_outcome := 'not_dispatchable';
  ELSIF v_row.status = 'processing'
    AND v_row.last_attempt_at IS NOT NULL
    AND v_row.last_attempt_at < now() - interval '24 hours'
  THEN
    UPDATE public.notification_delivery_log d
    SET
      status = 'failed',
      error_code = 'send_uncertain_do_not_retry',
      error_summary = 'provider acceptance uncertain after idempotency window; no further provider call',
      failed_at = COALESCE(d.failed_at, now()),
      next_attempt_at = NULL
    WHERE d.delivery_id = v_row.delivery_id
      AND d.channel = 'email'
      AND d.provider_message_id IS NULL
      AND d.certification_kind IS NULL;
    v_outcome := 'send_uncertain_do_not_retry';
  ELSIF COALESCE(v_row.attempt_count, 0) >= 4 THEN
    UPDATE public.notification_delivery_log d
    SET
      status = 'failed',
      error_code = 'attempts_exhausted',
      error_summary = 'attempt limit reached; no further provider call',
      failed_at = COALESCE(d.failed_at, now()),
      next_attempt_at = NULL
    WHERE d.delivery_id = v_row.delivery_id
      AND d.channel = 'email'
      AND d.provider_message_id IS NULL
      AND d.certification_kind IS NULL
      AND d.status IS DISTINCT FROM 'sent';
    v_outcome := 'attempts_exhausted';
  ELSIF NOT (
    (
      v_row.status = 'queued'
      OR (
        v_row.status = 'failed'
        AND v_row.next_attempt_at IS NOT NULL
        AND v_row.next_attempt_at <= now()
      )
      OR (
        v_row.status = 'processing'
        AND v_row.last_attempt_at IS NOT NULL
        AND v_row.last_attempt_at < now() - interval '15 minutes'
        AND v_row.last_attempt_at >= now() - interval '24 hours'
      )
    )
    AND (
      v_row.next_attempt_at IS NULL
      OR v_row.next_attempt_at <= now()
      OR v_row.status = 'processing'
    )
  ) THEN
    v_outcome := 'not_due';
  ELSE
    UPDATE public.notification_delivery_log d
    SET
      status = 'processing',
      attempt_count = COALESCE(d.attempt_count, 0) + 1,
      last_attempt_at = now(),
      provider = COALESCE(d.provider, 'resend')
    WHERE d.delivery_id = v_row.delivery_id
      AND d.channel = 'email'
      AND d.certification_kind IS NULL
      AND d.provider_message_id IS NULL
      AND d.status IS DISTINCT FROM 'sent'
      AND COALESCE(d.attempt_count, 0) < 4
      AND d.delivery_id NOT IN (
        'c02c0d63-9a0f-4ec6-8966-6035258364ad'::uuid,
        '424796d2-3e78-438c-8fb6-ab5c3bb3e28b'::uuid,
        '63561826-8bb3-4004-b857-b58c397b2aae'::uuid
      );
    IF NOT FOUND THEN
      v_outcome := 'not_eligible';
    ELSE
      SELECT d.*
        INTO v_row
      FROM public.notification_delivery_log d
      WHERE d.delivery_id = p_delivery_id;
      v_outcome := 'claimed';
    END IF;
  END IF;

  claim_outcome := v_outcome;
  delivery_id := v_row.delivery_id;
  event_id := v_row.event_id;
  tenant_id := v_row.tenant_id;
  recipient_user_id := v_row.recipient_user_id;
  recipient_email := v_row.recipient_email;
  provider_message_id := v_row.provider_message_id;
  attempt_count := v_row.attempt_count;
  certification_kind := v_row.certification_kind;
  event_type := v_event.event_type;
  payload_json := v_event.payload_json;
  error_code := CASE WHEN v_outcome = 'claimed' THEN NULL ELSE v_outcome END;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.claim_notification_email_production_delivery(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_notification_email_production_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_email_production_delivery(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_email_production_delivery(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_email_production_delivery(uuid) TO service_role;

COMMENT ON FUNCTION public.claim_notification_email_production_delivery(uuid) IS
  'PN-EMAIL: claim one stored delivery by id. Caller cannot supply recipient or content. Forensic, certification, sent, and provider-id rows are not claimed. Uncertain or exhausted rows are failed with no provider call.';

NOTIFY pgrst, 'reload schema';
