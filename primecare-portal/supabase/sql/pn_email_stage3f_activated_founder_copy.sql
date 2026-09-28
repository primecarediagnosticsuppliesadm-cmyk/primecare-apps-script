-- PN-EMAIL Stage 3F — one-time Founder certification copy of prospect_activated.
-- Additive. Does not send by itself. No cron. Does not rewrite the natural Vishwa row.
-- Does not change notification_email_routes or profile/auth emails.
-- Does not enable Production batch.

ALTER TABLE public.notification_delivery_log
  DROP CONSTRAINT IF EXISTS notification_delivery_log_certification_kind_check;

ALTER TABLE public.notification_delivery_log
  ADD CONSTRAINT notification_delivery_log_certification_kind_check
  CHECK (
    certification_kind IS NULL
    OR certification_kind = 'pn_email_stage2'
    OR certification_kind = 'pn_email_stage3f_activated_copy'
  );

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_log_stage3f_activated_copy_uidx
  ON public.notification_delivery_log (event_id)
  WHERE certification_kind = 'pn_email_stage3f_activated_copy';

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
  v_lab public.labs%ROWTYPE;
  v_event public.notification_events%ROWTYPE;
  v_natural public.notification_delivery_log%ROWTYPE;
  v_existing public.notification_delivery_log%ROWTYPE;
  v_founder public.profiles%ROWTYPE;
  v_email text;
BEGIN
  PERFORM set_config('primecare.email_delivery', '1', true);

  SELECT l.*
    INTO v_lab
  FROM public.labs l
  WHERE public.primecare_normalize_lab_id(l.lab_id)
      = public.primecare_normalize_lab_id('LAB-P-E9FFF046A399')
  LIMIT 1;

  IF NOT FOUND
    OR upper(btrim(COALESCE(v_lab.status, ''))) <> 'ACTIVE'
    OR nullif(btrim(COALESCE(v_lab.sourced_by_agent_id, '')), '') IS DISTINCT FROM 'AGT_VISHWAK_RATA_36CC'
    OR NOT public.pn_email_stage3e_lab_name_eligible(v_lab.lab_name)
  THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, 'rejected_lab'::text;
    RETURN;
  END IF;

  SELECT e.*
    INTO v_event
  FROM public.notification_events e
  WHERE e.tenant_id = v_lab.tenant_id
    AND lower(btrim(COALESCE(e.event_type, ''))) = 'prospect_activated'
    AND public.primecare_normalize_lab_id(e.source_id)
      = public.primecare_normalize_lab_id(v_lab.lab_id)
  ORDER BY e.created_at ASC, e.event_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text, 'rejected_event'::text;
    RETURN;
  END IF;

  SELECT d.*
    INTO v_natural
  FROM public.notification_delivery_log d
  WHERE d.event_id = v_event.event_id
    AND d.channel = 'email'
    AND d.certification_kind IS NULL
    AND lower(btrim(COALESCE(d.recipient_email, ''))) = 'vishu.sen80@gmail.com'
    AND d.recipient_user_id = '685b0ff4-e8ed-40bc-8eb4-8d0dad66e7d4'::uuid
  ORDER BY d.created_at ASC, d.delivery_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, v_event.event_id, NULL::text, NULL::text, NULL::text, 'missing_natural_route'::text;
    RETURN;
  END IF;

  SELECT p.*
    INTO v_founder
  FROM public.profiles p
  WHERE p.user_id = 'f49f7627-0b98-4d07-8b72-16846e454ca4'::uuid
    AND p.tenant_id = v_lab.tenant_id
    AND lower(btrim(COALESCE(p.role, ''))) = 'executive'
    AND COALESCE(p.active, false) IS TRUE
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, v_event.event_id, NULL::text, NULL::text, NULL::text, 'rejected_founder'::text;
    RETURN;
  END IF;

  v_email := lower(btrim(COALESCE(v_founder.email, '')));
  IF NOT public.prospect_email_is_production_dispatchable(v_founder.email)
    OR v_email = 'vishu.sen80@gmail.com'
    OR v_email = 'primecarediagnosticsuppliesadm@gmail.com'
  THEN
    RETURN QUERY SELECT NULL::uuid, v_event.event_id, NULL::text, NULL::text, NULL::text, 'rejected_domain'::text;
    RETURN;
  END IF;

  SELECT d.*
    INTO v_existing
  FROM public.notification_delivery_log d
  WHERE d.event_id = v_event.event_id
    AND d.certification_kind = 'pn_email_stage3f_activated_copy'
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
        ELSE 'existing'
      END;
    RETURN;
  END IF;

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
    certification_kind,
    attempted_at
  )
  VALUES (
    v_event.event_id,
    v_event.tenant_id,
    'email',
    'queued',
    v_founder.user_id,
    v_email,
    NULL,
    0,
    now(),
    'pn_email_stage3f_activated_copy',
    now()
  )
  RETURNING * INTO v_existing;

  RETURN QUERY SELECT
    v_existing.delivery_id,
    v_existing.event_id,
    v_existing.recipient_email,
    v_existing.certification_kind,
    v_existing.status,
    'created'::text;
END;
$$;

ALTER FUNCTION public.create_pn_email_stage3f_activated_founder_copy() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_pn_email_stage3f_activated_founder_copy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pn_email_stage3f_activated_founder_copy() FROM anon;
REVOKE ALL ON FUNCTION public.create_pn_email_stage3f_activated_founder_copy() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_pn_email_stage3f_activated_founder_copy() TO service_role;

COMMENT ON FUNCTION public.create_pn_email_stage3f_activated_founder_copy() IS
  'PN-EMAIL 3F: one-time Founder certification copy of LAB-P-E9FFF046A399 prospect_activated. Resolves Founder profile email server-side. Does not rewrite the natural Vishwa delivery or routes. Does not send.';

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
  v_event public.notification_events%ROWTYPE;
  v_lab public.labs%ROWTYPE;
  v_founder public.profiles%ROWTYPE;
  v_canonical text;
BEGIN
  IF p_delivery_id IS NULL THEN
    RETURN;
  END IF;

  IF p_delivery_id IN (
    'c02c0d63-9a0f-4ec6-8966-6035258364ad'::uuid,
    '424796d2-3e78-438c-8fb6-ab5c3bb3e28b'::uuid,
    '63561826-8bb3-4004-b857-b58c397b2aae'::uuid,
    'b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64'::uuid,
    '3face3b7-abac-46ff-839a-eccc1ef2b79e'::uuid,
    '3cbbe9bf-0d1a-42f7-9170-b74dd5a60b79'::uuid,
    'fd799383-62f3-499f-a1e3-17c1bdc4ea89'::uuid
  ) THEN
    RETURN QUERY
    SELECT
      p_delivery_id, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::text, NULL::text, NULL::integer,
      NULL::text, NULL::jsonb, NULL::text, NULL::text,
      NULL::text, NULL::text, 'rejected_forensic'::text;
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

  IF v_row.channel IS DISTINCT FROM 'email'
    OR v_row.certification_kind IS DISTINCT FROM 'pn_email_stage3f_activated_copy'
  THEN
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

  IF NOT FOUND
    OR lower(btrim(COALESCE(v_event.event_type, ''))) IS DISTINCT FROM 'prospect_activated'
  THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      COALESCE(v_event.event_type, NULL::text), v_event.payload_json, v_event.source_id,
      v_row.certification_kind, NULL::text, NULL::text, 'rejected_event_type'::text;
    RETURN;
  END IF;

  SELECT l.*
    INTO v_lab
  FROM public.labs l
  WHERE l.tenant_id = v_event.tenant_id
    AND public.primecare_normalize_lab_id(l.lab_id)
      = public.primecare_normalize_lab_id(v_event.source_id)
  LIMIT 1;

  IF NOT FOUND
    OR public.primecare_normalize_lab_id(v_lab.lab_id)
      IS DISTINCT FROM public.primecare_normalize_lab_id('LAB-P-E9FFF046A399')
    OR NOT public.pn_email_stage3e_lab_name_eligible(v_lab.lab_name)
  THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      NULL::text, v_lab.lab_id, 'rejected_lab'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.notification_delivery_log n
    WHERE n.event_id = v_event.event_id
      AND n.channel = 'email'
      AND n.certification_kind IS NULL
      AND n.delivery_id = 'fd799383-62f3-499f-a1e3-17c1bdc4ea89'::uuid
      AND lower(btrim(COALESCE(n.recipient_email, ''))) = 'vishu.sen80@gmail.com'
  ) THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      NULL::text, v_lab.lab_id, 'missing_natural_route'::text;
    RETURN;
  END IF;

  SELECT p.*
    INTO v_founder
  FROM public.profiles p
  WHERE p.user_id = 'f49f7627-0b98-4d07-8b72-16846e454ca4'::uuid
    AND p.user_id = v_row.recipient_user_id
    AND lower(btrim(COALESCE(p.role, ''))) = 'executive'
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

  v_canonical := lower(btrim(COALESCE(v_row.recipient_email, '')));
  IF NOT public.prospect_email_is_production_dispatchable(v_row.recipient_email)
    OR v_canonical IS DISTINCT FROM lower(btrim(COALESCE(v_founder.email, '')))
    OR v_canonical IN ('vishu.sen80@gmail.com', 'primecarediagnosticsuppliesadm@gmail.com')
  THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      'executive', v_lab.lab_id, 'rejected_domain'::text;
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
      'executive', v_lab.lab_id, 'already_sent'::text;
    RETURN;
  END IF;

  IF v_row.status NOT IN ('queued', 'failed') THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_canonical, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      'executive', v_lab.lab_id, 'not_claimable'::text;
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
    AND d.certification_kind = 'pn_email_stage3f_activated_copy'
    AND d.status IS DISTINCT FROM 'sent'
    AND d.provider_message_id IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      p_delivery_id, v_event.event_id, v_event.tenant_id, NULL::uuid,
      NULL::text, NULL::text, NULL::integer,
      v_event.event_type, v_event.payload_json, v_event.source_id, NULL::text,
      'executive', v_lab.lab_id, 'not_claimable'::text;
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
    'executive'::text,
    v_lab.lab_id,
    'claimed'::text;
END;
$$;

ALTER FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) TO service_role;

COMMENT ON FUNCTION public.claim_notification_email_stage3f_activated_copy(uuid) IS
  'PN-EMAIL 3F: exact-row claim for the Founder activated-copy certification only. Cannot claim the natural Vishwa delivery. Does not send.';
