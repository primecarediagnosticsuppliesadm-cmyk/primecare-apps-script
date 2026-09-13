-- PN-1B2 — email dispatch claim/finalize RPCs (QA only).
-- Does not send email. No cron, pg_net, webhook, or provider key.
-- Authenticated clients still cannot UPDATE channel=email rows.

ALTER TABLE public.notification_delivery_log
  ADD COLUMN IF NOT EXISTS provider_recipient text;

COMMENT ON COLUMN public.notification_delivery_log.provider_recipient IS
  'PN-1B2: actual provider To after QA rewrite. recipient_email remains the intended snapshot.';

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
      AND d.provider_message_id IS NULL
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
  'PN-1B2: claim up to 10 email delivery rows FOR UPDATE SKIP LOCKED. Does not send.';

CREATE OR REPLACE FUNCTION public.finalize_notification_email_delivery(
  p_delivery_id uuid,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_provider_recipient text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_summary text DEFAULT NULL,
  p_next_attempt_at timestamptz DEFAULT NULL,
  p_provider_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_row public.notification_delivery_log%ROWTYPE;
BEGIN
  IF p_delivery_id IS NULL THEN
    RETURN;
  END IF;

  v_status := lower(btrim(COALESCE(p_status, '')));
  IF v_status NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'email_finalize_status_invalid';
  END IF;

  PERFORM set_config('primecare.email_delivery', '1', true);

  SELECT d.*
    INTO v_row
  FROM public.notification_delivery_log d
  WHERE d.delivery_id = p_delivery_id
    AND d.channel = 'email'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.status = 'sent' OR nullif(btrim(COALESCE(v_row.provider_message_id, '')), '') IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.notification_delivery_log
  SET
    status = v_status,
    provider = COALESCE(provider, 'resend'),
    provider_message_id = CASE
      WHEN v_status = 'sent' THEN nullif(btrim(COALESCE(p_provider_message_id, '')), '')
      ELSE provider_message_id
    END,
    provider_recipient = COALESCE(nullif(btrim(COALESCE(p_provider_recipient, '')), ''), provider_recipient),
    provider_error = CASE
      WHEN v_status = 'sent' THEN NULL
      ELSE COALESCE(nullif(btrim(COALESCE(p_provider_error, '')), ''), provider_error)
    END,
    error_code = CASE WHEN v_status = 'sent' THEN NULL ELSE nullif(btrim(COALESCE(p_error_code, '')), '') END,
    error_summary = CASE WHEN v_status = 'sent' THEN NULL ELSE nullif(btrim(COALESCE(p_error_summary, '')), '') END,
    sent_at = CASE WHEN v_status = 'sent' THEN now() ELSE sent_at END,
    delivered_at = CASE WHEN v_status = 'sent' THEN now() ELSE delivered_at END,
    failed_at = CASE WHEN v_status = 'failed' THEN now() ELSE failed_at END,
    next_attempt_at = CASE
      WHEN v_status = 'failed' THEN p_next_attempt_at
      ELSE NULL
    END
  WHERE delivery_id = p_delivery_id
    AND channel = 'email';
END;
$$;

ALTER FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text, text, timestamptz, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text, text, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text, text, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text, text, timestamptz, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text, text, timestamptz, text) TO service_role;

COMMENT ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text, text, timestamptz, text) IS
  'PN-1B2: mark email delivery sent/failed/skipped. No-op if already sent. Authenticated EXECUTE revoked.';

NOTIFY pgrst, 'reload schema';
