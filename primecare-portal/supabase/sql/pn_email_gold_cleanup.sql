-- PN-EMAIL GOLD cleanup. Additive. Does not send. No cron. No route rewrite.
-- Preserves historical delivery rows including the Founder activation copy.
-- Does not UPDATE sent/delivered timestamps on existing rows.

-- 1. Disable one-time Founder-copy create/claim. Historical sent copy remains.
CREATE OR REPLACE FUNCTION public.create_pn_email_stage3f_activated_founder_copy()
RETURNS TABLE (
  delivery_id uuid,
  event_id uuid,
  recipient_email text,
  certification_kind text,
  status text,
  create_outcome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.notification_delivery_log%ROWTYPE;
BEGIN
  SELECT d.*
    INTO v_existing
  FROM public.notification_delivery_log d
  WHERE d.certification_kind = 'pn_email_stage3f_activated_copy'
    AND d.delivery_id = '3c165e0c-b2e9-406b-a9ea-09c85dcf6355'::uuid
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing.delivery_id,
      v_existing.event_id,
      v_existing.recipient_email,
      v_existing.certification_kind,
      v_existing.status,
      CASE
        WHEN v_existing.status = 'sent'
          OR nullif(btrim(COALESCE(v_existing.provider_message_id, '')), '') IS NOT NULL
        THEN 'already_sent'
        ELSE 'disabled'
      END;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, 'disabled'::text;
END;
$$;

ALTER FUNCTION public.create_pn_email_stage3f_activated_founder_copy() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_pn_email_stage3f_activated_founder_copy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pn_email_stage3f_activated_founder_copy() FROM anon;
REVOKE ALL ON FUNCTION public.create_pn_email_stage3f_activated_founder_copy() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_pn_email_stage3f_activated_founder_copy() TO service_role;

COMMENT ON FUNCTION public.create_pn_email_stage3f_activated_founder_copy() IS
  'PN-EMAIL GOLD: Founder activation-copy create is retired. Returns already_sent for the historical row. Never inserts or sends.';

CREATE OR REPLACE FUNCTION public.claim_notification_email_stage3f_activated_copy(p_delivery_id uuid)
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
  source_id text,
  certification_kind text,
  recipient_role text,
  lab_id text,
  claim_outcome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.notification_delivery_log%ROWTYPE;
BEGIN
  IF p_delivery_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('primecare.email_delivery', '1', true);

  SELECT d.*
    INTO v_row
  FROM public.notification_delivery_log d
  WHERE d.delivery_id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.status = 'sent'
    OR nullif(btrim(COALESCE(v_row.provider_message_id, '')), '') IS NOT NULL
  THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      NULL::text, NULL::jsonb, NULL::text, v_row.certification_kind,
      NULL::text, NULL::text, 'already_sent'::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
    v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
    NULL::text, NULL::jsonb, NULL::text, v_row.certification_kind,
    NULL::text, NULL::text, 'disabled'::text;
END;
$$;

ALTER FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) TO service_role;

COMMENT ON FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) IS
  'PN-EMAIL GOLD: Founder activation-copy claim is retired. Historical sent rows stay already_sent. Never claims for send.';

-- 2. Permanent forensic exclusion from normal automatic batch claim.
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
      AND d.delivery_id NOT IN (
        'c02c0d63-9a0f-4ec6-8966-6035258364ad'::uuid,
        '424796d2-3e78-438c-8fb6-ab5c3bb3e28b'::uuid,
        '63561826-8bb3-4004-b857-b58c397b2aae'::uuid
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
      AND d.delivery_id NOT IN (
        'c02c0d63-9a0f-4ec6-8966-6035258364ad'::uuid,
        '424796d2-3e78-438c-8fb6-ab5c3bb3e28b'::uuid,
        '63561826-8bb3-4004-b857-b58c397b2aae'::uuid
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
  'PN-EMAIL GOLD: claim up to 10 normal dispatchable email rows. Certification, forensic, and .local recipients are excluded. Does not send.';

-- 3. Provider acceptance is sent, not delivered. Do not rewrite historical rows
--    (finalize is a no-op once status=sent / provider_message_id is set).
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
    delivered_at = CASE
      WHEN v_status = 'sent' THEN NULL
      ELSE delivered_at
    END,
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
  'PN-EMAIL GOLD: mark email sent/failed/skipped. sent_at is provider acceptance. delivered_at stays NULL until a real delivery signal exists. No-op if already sent.';

NOTIFY pgrst, 'reload schema';
