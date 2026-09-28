-- PN-EMAIL Stage 2A — single-send Production certification safety.
-- Additive only. Does not send email. No cron. No rewrite of existing rows.
-- Normal Production prospect/customer email remains production_frozen.
-- Certification claim is exact-ID, marker-gated, service_role/postgres only.

-- ---------------------------------------------------------------------------
-- A. Explicit certification marker (NULL = normal delivery)
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_delivery_log
  ADD COLUMN IF NOT EXISTS certification_kind text;

ALTER TABLE public.notification_delivery_log
  DROP CONSTRAINT IF EXISTS notification_delivery_log_certification_kind_check;

ALTER TABLE public.notification_delivery_log
  ADD CONSTRAINT notification_delivery_log_certification_kind_check
  CHECK (
    certification_kind IS NULL
    OR certification_kind = 'pn_email_stage2'
  );

COMMENT ON COLUMN public.notification_delivery_log.certification_kind IS
  'PN-EMAIL Stage 2A: explicit server-controlled certification marker. NULL = normal delivery. Never infer from recipient_email.';

CREATE UNIQUE INDEX IF NOT EXISTS notification_delivery_log_pn_email_stage2_uidx
  ON public.notification_delivery_log (certification_kind)
  WHERE certification_kind = 'pn_email_stage2';

-- ---------------------------------------------------------------------------
-- B. Normal batch claim must never pick certification rows
-- ---------------------------------------------------------------------------
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
  'PN-1B2/2A: claim up to 10 normal email rows. Certification rows (certification_kind set) are excluded.';

-- ---------------------------------------------------------------------------
-- C. Client cannot INSERT certification events
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_events_stage2_cert_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND lower(btrim(COALESCE(NEW.event_type, ''))) = 'pn_email_stage2_certification'
    AND current_setting('primecare.email_delivery', true) IS DISTINCT FROM '1'
  THEN
    RAISE EXCEPTION 'email_certification_forbidden';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notification_events_stage2_cert_server_only() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notification_events_stage2_cert_server_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_events_stage2_cert_server_only() FROM anon;
REVOKE ALL ON FUNCTION public.notification_events_stage2_cert_server_only() FROM authenticated;

DROP TRIGGER IF EXISTS notification_events_stage2_cert_server_only_trg
  ON public.notification_events;
CREATE TRIGGER notification_events_stage2_cert_server_only_trg
  BEFORE INSERT ON public.notification_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notification_events_stage2_cert_server_only();

-- ---------------------------------------------------------------------------
-- D. Create the one synthetic certification delivery (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pn_email_stage2_certification_delivery(p_recipient_email text)
RETURNS TABLE (
  delivery_id uuid,
  event_id uuid,
  recipient_email text,
  certification_kind text,
  status text,
  inserted boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_tenant uuid;
  v_event_id uuid;
  v_delivery_id uuid;
  v_status text;
  v_kind text;
BEGIN
  v_email := lower(btrim(COALESCE(p_recipient_email, '')));
  IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'email_certification_recipient_invalid';
  END IF;

  PERFORM set_config('primecare.email_delivery', '1', true);

  SELECT d.delivery_id, d.event_id, d.recipient_email, d.certification_kind, d.status
    INTO v_delivery_id, v_event_id, v_email, v_kind, v_status
  FROM public.notification_delivery_log d
  WHERE d.certification_kind = 'pn_email_stage2'
  FOR UPDATE;

  IF FOUND THEN
    delivery_id := v_delivery_id;
    event_id := v_event_id;
    recipient_email := v_email;
    certification_kind := v_kind;
    status := v_status;
    inserted := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT t.tenant_id
    INTO v_tenant
  FROM public.notification_templates t
  WHERE t.event_type = 'prospect_created'
    AND t.channel = 'in_app'
    AND t.active IS TRUE
    AND t.tenant_id IS NOT NULL
  ORDER BY t.tenant_id
  LIMIT 1;

  IF v_tenant IS NULL THEN
    SELECT e.tenant_id
      INTO v_tenant
    FROM public.notification_events e
    WHERE e.tenant_id IS NOT NULL
    ORDER BY e.event_id
    LIMIT 1;
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'email_certification_tenant_missing';
  END IF;

  INSERT INTO public.notification_events (
    event_id,
    tenant_id,
    event_type,
    source_module,
    source_id,
    actor_user_id,
    target_role,
    target_user_id,
    target_lab_id,
    payload_json,
    severity,
    status
  )
  VALUES (
    gen_random_uuid(),
    v_tenant,
    'pn_email_stage2_certification',
    'system',
    'pn-email-stage2-certification',
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'certification', true,
      'kind', 'pn_email_stage2',
      'note', 'synthetic production email certification; no customer or lab data'
    ),
    'info',
    'pending'
  )
  RETURNING notification_events.event_id INTO v_event_id;

  INSERT INTO public.notification_delivery_log (
    event_id,
    tenant_id,
    channel,
    status,
    recipient_user_id,
    recipient_email,
    provider,
    attempt_count,
    certification_kind
  )
  VALUES (
    v_event_id,
    v_tenant,
    'email',
    'queued',
    NULL,
    v_email,
    'resend',
    0,
    'pn_email_stage2'
  )
  RETURNING notification_delivery_log.delivery_id INTO v_delivery_id;

  delivery_id := v_delivery_id;
  event_id := v_event_id;
  recipient_email := v_email;
  certification_kind := 'pn_email_stage2';
  status := 'queued';
  inserted := true;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.create_pn_email_stage2_certification_delivery(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_pn_email_stage2_certification_delivery(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pn_email_stage2_certification_delivery(text) FROM anon;
REVOKE ALL ON FUNCTION public.create_pn_email_stage2_certification_delivery(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_pn_email_stage2_certification_delivery(text) TO service_role;

COMMENT ON FUNCTION public.create_pn_email_stage2_certification_delivery(text) IS
  'PN-EMAIL Stage 2A: idempotent synthetic certification email row. Recipient supplied by dispatcher from EMAIL_PROD_TEST_RECIPIENT only.';

-- ---------------------------------------------------------------------------
-- E. Exact-ID certification claim — never claims a normal row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_notification_email_certification_delivery(p_delivery_id uuid)
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

  IF v_row.channel IS DISTINCT FROM 'email'
    OR v_row.certification_kind IS DISTINCT FROM 'pn_email_stage2'
  THEN
    RETURN;
  END IF;

  IF v_row.status = 'sent'
    OR nullif(btrim(COALESCE(v_row.provider_message_id, '')), '') IS NOT NULL
  THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id,
      v_row.event_id,
      v_row.tenant_id,
      v_row.recipient_user_id,
      v_row.recipient_email,
      v_row.provider_message_id,
      v_row.attempt_count,
      e.event_type,
      e.payload_json,
      e.source_id,
      v_row.certification_kind,
      'already_sent'::text
    FROM public.notification_events e
    WHERE e.event_id = v_row.event_id;
    RETURN;
  END IF;

  IF v_row.status NOT IN ('queued', 'failed') THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id,
      v_row.event_id,
      v_row.tenant_id,
      v_row.recipient_user_id,
      v_row.recipient_email,
      v_row.provider_message_id,
      v_row.attempt_count,
      e.event_type,
      e.payload_json,
      e.source_id,
      v_row.certification_kind,
      'not_claimable'::text
    FROM public.notification_events e
    WHERE e.event_id = v_row.event_id;
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
    AND d.certification_kind = 'pn_email_stage2'
    AND d.status IS DISTINCT FROM 'sent'
    AND d.provider_message_id IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_row.delivery_id,
    v_row.event_id,
    v_row.tenant_id,
    v_row.recipient_user_id,
    v_row.recipient_email,
    v_row.provider_message_id,
    v_row.attempt_count,
    e.event_type,
    e.payload_json,
    e.source_id,
    v_row.certification_kind,
    'claimed'::text
  FROM public.notification_events e
  WHERE e.event_id = v_row.event_id;
END;
$$;

ALTER FUNCTION public.claim_notification_email_certification_delivery(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.claim_notification_email_certification_delivery(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_email_certification_delivery(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_email_certification_delivery(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_email_certification_delivery(uuid) TO service_role;

COMMENT ON FUNCTION public.claim_notification_email_certification_delivery(uuid) IS
  'PN-EMAIL Stage 2A: lock exactly one pn_email_stage2 delivery by ID. Normal rows return no claim.';

NOTIFY pgrst, 'reload schema';
