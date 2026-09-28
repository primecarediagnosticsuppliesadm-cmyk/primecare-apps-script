-- PN-EMAIL Stage 2C — certification-row creation fix + in-place UNSENT repair.
-- Additive. Does not send email. No cron. EMAIL_ENABLED must remain false.
-- Does not rewrite SENT certification recipients.
-- Does not touch normal/customer notification rows.

-- ---------------------------------------------------------------------------
-- A. Fix create RPC: never SELECT INTO the input-derived recipient variable.
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
  v_existing_id uuid;
  v_existing_event uuid;
  v_existing_recipient text;
  v_existing_kind text;
  v_existing_status text;
BEGIN
  v_email := lower(btrim(COALESCE(p_recipient_email, '')));
  IF v_email = '' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'email_certification_recipient_invalid';
  END IF;

  PERFORM set_config('primecare.email_delivery', '1', true);

  SELECT d.delivery_id, d.event_id, d.recipient_email, d.certification_kind, d.status
    INTO v_existing_id, v_existing_event, v_existing_recipient, v_existing_kind, v_existing_status
  FROM public.notification_delivery_log d
  WHERE d.certification_kind = 'pn_email_stage2'
  FOR UPDATE;

  IF FOUND THEN
    delivery_id := v_existing_id;
    event_id := v_existing_event;
    recipient_email := v_existing_recipient;
    certification_kind := v_existing_kind;
    status := v_existing_status;
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
  'PN-EMAIL Stage 2C: idempotent synthetic certification email row. Input recipient is never overwritten by a no-row SELECT INTO. Existing row is reused without rewriting SENT recipients.';

-- ---------------------------------------------------------------------------
-- B. In-place repair of the known UNSENT Stage 2B fail-closed row.
--    Guarded. Idempotent if already repaired. Does not delete/recreate.
--    Founder-authorized recipient for this exact delivery_id only.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id constant uuid := '3face3b7-abac-46ff-839a-eccc1ef2b79e';
  v_approved constant text := 'primecarediagnosticsuppliesadm@gmail.com';
  v_n integer;
  v_status text;
  v_kind text;
  v_email text;
  v_error text;
  v_sent timestamptz;
  v_pmid text;
  v_provider_recipient text;
BEGIN
  PERFORM set_config('primecare.email_delivery', '1', true);

  SELECT d.status, d.certification_kind, d.recipient_email, d.error_code,
         d.sent_at, d.provider_message_id, d.provider_recipient
    INTO v_status, v_kind, v_email, v_error, v_sent, v_pmid, v_provider_recipient
  FROM public.notification_delivery_log d
  WHERE d.delivery_id = v_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stage2c_cert_row_missing';
  END IF;

  IF v_kind IS DISTINCT FROM 'pn_email_stage2' THEN
    RAISE EXCEPTION 'stage2c_cert_row_not_certification';
  END IF;

  IF v_sent IS NOT NULL OR nullif(btrim(COALESCE(v_pmid, '')), '') IS NOT NULL THEN
    RAISE EXCEPTION 'stage2c_cert_row_already_sent';
  END IF;

  -- Idempotent success: already repaired to queued + approved recipient.
  IF v_status = 'queued'
    AND lower(btrim(COALESCE(v_email, ''))) = v_approved
    AND v_provider_recipient IS NULL
    AND v_pmid IS NULL
    AND v_sent IS NULL
  THEN
    RETURN;
  END IF;

  UPDATE public.notification_delivery_log d
  SET
    recipient_email = v_approved,
    status = 'queued',
    provider_recipient = NULL,
    provider_message_id = NULL,
    provider_error = NULL,
    error_code = NULL,
    error_summary = NULL,
    sent_at = NULL,
    next_attempt_at = NULL
  WHERE d.delivery_id = v_id
    AND d.certification_kind = 'pn_email_stage2'
    AND d.status = 'skipped'
    AND d.sent_at IS NULL
    AND d.provider_message_id IS NULL
    AND d.recipient_email IS NULL
    AND d.error_code = 'recipient_mismatch';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'stage2c_cert_row_guard_failed';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
