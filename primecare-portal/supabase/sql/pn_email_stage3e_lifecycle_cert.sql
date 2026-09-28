-- PN-EMAIL Stage 3E — exact-row real-recipient lifecycle certification claim.
-- Additive. Does not send email by itself. No cron. Does not rewrite forensic rows.
-- Does not enable normal Production batch claim. Does not remove production_freeze.
--
-- Exact delivery_id only. Lab name must be the Stage 3E synthetic prefix.
-- Old forensic IDs and the Stage 2 cert ID are rejected without row mutation.

CREATE OR REPLACE FUNCTION public.pn_email_stage3e_lab_name_eligible(p_lab_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(COALESCE(p_lab_name, '')) ILIKE 'PN EMAIL STAGE3E REAL RECIPIENT CERT%';
$$;

ALTER FUNCTION public.pn_email_stage3e_lab_name_eligible(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.pn_email_stage3e_lab_name_eligible(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pn_email_stage3e_lab_name_eligible(text) FROM anon;
REVOKE ALL ON FUNCTION public.pn_email_stage3e_lab_name_eligible(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.pn_email_stage3e_lab_name_eligible(text) FROM service_role;

COMMENT ON FUNCTION public.pn_email_stage3e_lab_name_eligible(text) IS
  'PN-EMAIL 3E: synthetic certification lab-name prefix. Does not send.';

CREATE OR REPLACE FUNCTION public.claim_notification_email_stage3e_delivery(p_delivery_id uuid)
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
  v_event public.notification_events%ROWTYPE;
  v_lab public.labs%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_event_type text;
  v_role text;
  v_canonical text;
BEGIN
  IF p_delivery_id IS NULL THEN
    RETURN;
  END IF;

  IF p_delivery_id IN (
    'c02c0d63-9a0f-4ec6-8966-6035258364ad'::uuid,
    '424796d2-3e78-438c-8fb6-ab5c3bb3e28b'::uuid,
    '63561826-8bb3-4004-b857-b58c397b2aae'::uuid
  ) THEN
    RETURN QUERY
    SELECT
      p_delivery_id,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::integer,
      NULL::text,
      NULL::jsonb,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      'rejected_forensic'::text;
    RETURN;
  END IF;

  IF p_delivery_id = '3face3b7-abac-46ff-839a-eccc1ef2b79e'::uuid THEN
    RETURN QUERY
    SELECT
      p_delivery_id,
      NULL::uuid,
      NULL::uuid,
      NULL::uuid,
      NULL::text,
      NULL::text,
      NULL::integer,
      NULL::text,
      NULL::jsonb,
      NULL::text,
      NULL::text,
      NULL::text,
      NULL::text,
      'rejected_stage2_cert'::text;
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

  IF v_row.channel IS DISTINCT FROM 'email' THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      NULL::text, NULL::jsonb, NULL::text, v_row.certification_kind,
      NULL::text, NULL::text, 'not_claimable'::text;
    RETURN;
  END IF;

  IF v_row.certification_kind IS NOT NULL THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      NULL::text, NULL::jsonb, NULL::text, v_row.certification_kind,
      NULL::text, NULL::text, 'rejected_certification_kind'::text;
    RETURN;
  END IF;

  SELECT e.*
    INTO v_event
  FROM public.notification_events e
  WHERE e.event_id = v_row.event_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      NULL::text, NULL::jsonb, NULL::text, v_row.certification_kind,
      NULL::text, NULL::text, 'not_claimable'::text;
    RETURN;
  END IF;

  v_event_type := lower(btrim(COALESCE(v_event.event_type, '')));
  IF v_event_type NOT IN ('prospect_created', 'prospect_activated') THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      NULL::text, NULL::text, 'rejected_event_type'::text;
    RETURN;
  END IF;

  SELECT l.*
    INTO v_lab
  FROM public.labs l
  WHERE l.tenant_id = v_event.tenant_id
    AND public.primecare_normalize_lab_id(l.lab_id)
      = public.primecare_normalize_lab_id(v_event.source_id)
  LIMIT 1;

  IF NOT FOUND OR NOT public.pn_email_stage3e_lab_name_eligible(v_lab.lab_name) THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      NULL::text, v_lab.lab_id, 'rejected_lab'::text;
    RETURN;
  END IF;

  IF v_row.recipient_user_id IS NULL THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      NULL::text, v_lab.lab_id, 'rejected_role'::text;
    RETURN;
  END IF;

  SELECT p.*
    INTO v_profile
  FROM public.profiles p
  WHERE p.tenant_id = v_row.tenant_id
    AND p.user_id = v_row.recipient_user_id
  ORDER BY p.active DESC NULLS LAST, p.user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      NULL::text, v_lab.lab_id, 'rejected_role'::text;
    RETURN;
  END IF;

  v_role := lower(btrim(COALESCE(v_profile.role, '')));
  IF v_role IN ('lab', 'customer') THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      v_role, v_lab.lab_id, 'rejected_role'::text;
    RETURN;
  END IF;

  IF v_event_type = 'prospect_created' AND v_role NOT IN ('admin', 'executive') THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      v_role, v_lab.lab_id, 'rejected_role'::text;
    RETURN;
  END IF;

  IF v_event_type = 'prospect_activated' THEN
    IF v_role <> 'agent'
      OR nullif(btrim(COALESCE(v_profile.agent_id, '')), '')
        IS DISTINCT FROM nullif(btrim(COALESCE(v_lab.sourced_by_agent_id, '')), '')
    THEN
      RETURN QUERY
      SELECT
        v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
        v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
        v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
        v_role, v_lab.lab_id, 'rejected_role'::text;
      RETURN;
    END IF;
  END IF;

  IF COALESCE(v_profile.active, false) IS NOT TRUE THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      v_role, v_lab.lab_id, 'rejected_inactive'::text;
    RETURN;
  END IF;

  v_canonical := lower(btrim(COALESCE(v_profile.email, '')));
  IF NOT public.prospect_email_is_production_dispatchable(v_profile.email)
    OR NOT public.prospect_email_is_production_dispatchable(v_row.recipient_email)
    OR v_canonical IS DISTINCT FROM lower(btrim(COALESCE(v_row.recipient_email, '')))
  THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      v_role, v_lab.lab_id, 'rejected_domain'::text;
    RETURN;
  END IF;

  IF v_row.status = 'sent'
    OR nullif(btrim(COALESCE(v_row.provider_message_id, '')), '') IS NOT NULL
  THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_canonical, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      v_role, v_lab.lab_id, 'already_sent'::text;
    RETURN;
  END IF;

  IF v_row.status NOT IN ('queued', 'failed') THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_canonical, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      v_role, v_lab.lab_id, 'not_claimable'::text;
    RETURN;
  END IF;

  UPDATE public.notification_delivery_log d
  SET
    status = 'processing',
    attempt_count = COALESCE(d.attempt_count, 0) + 1,
    last_attempt_at = now(),
    provider = COALESCE(d.provider, 'resend')
  WHERE d.delivery_id = v_row.delivery_id
    AND d.channel = 'email'
    AND d.certification_kind IS NULL
    AND d.status IS DISTINCT FROM 'sent'
    AND d.provider_message_id IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      p_delivery_id, v_event.event_id, v_event.tenant_id, NULL::uuid,
      NULL::text, NULL::text, NULL::integer,
      v_event.event_type, v_event.payload_json, v_event.source_id, NULL::text,
      v_role, v_lab.lab_id, 'not_claimable'::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_row.delivery_id,
    v_row.event_id,
    v_row.tenant_id,
    v_row.recipient_user_id,
    v_canonical,
    v_row.provider_message_id,
    v_row.attempt_count,
    v_event.event_type,
    v_event.payload_json,
    v_event.source_id,
    v_row.certification_kind,
    v_role,
    v_lab.lab_id,
    'claimed'::text;
END;
$$;

ALTER FUNCTION public.claim_notification_email_stage3e_delivery(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_notification_email_stage3e_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_email_stage3e_delivery(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_email_stage3e_delivery(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_email_stage3e_delivery(uuid) TO service_role;

COMMENT ON FUNCTION public.claim_notification_email_stage3e_delivery(uuid) IS
  'PN-EMAIL 3E: claim exactly one Stage 3E synthetic-lab lifecycle email by delivery_id. Forensic and Stage 2 IDs are rejected without mutation. Does not send. Does not batch.';

NOTIFY pgrst, 'reload schema';
