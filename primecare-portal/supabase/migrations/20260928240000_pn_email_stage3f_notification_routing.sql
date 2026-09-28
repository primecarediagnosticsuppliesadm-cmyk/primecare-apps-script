-- PN-EMAIL Stage 3F — explicit lifecycle notification routing.
-- Additive. Does not send email. No cron. EMAIL_ENABLED must remain false.
-- Does not rewrite existing forensic delivery rows.
-- Does not change authentication / profile emails.
-- Does not remove production_freeze.
-- Does not deploy notification_preferences.
--
-- Destination is server-resolved from notification_email_routes.
-- Caller-supplied To cannot select a recipient.

CREATE TABLE IF NOT EXISTS public.notification_email_routes (
  route_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id),
  event_type text NOT NULL,
  recipient_kind text NOT NULL,
  recipient_user_id uuid NULL,
  agent_id text NULL,
  recipient_email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_routes_event_type_chk
    CHECK (event_type IN ('prospect_created', 'prospect_activated')),
  CONSTRAINT notification_email_routes_kind_chk
    CHECK (recipient_kind IN ('operations', 'sourcing_agent')),
  CONSTRAINT notification_email_routes_kind_consistency_chk
    CHECK (
      (
        event_type = 'prospect_created'
        AND recipient_kind = 'operations'
        AND agent_id IS NULL
      )
      OR (
        event_type = 'prospect_activated'
        AND recipient_kind = 'sourcing_agent'
        AND nullif(btrim(agent_id), '') IS NOT NULL
      )
    )
);

COMMENT ON TABLE public.notification_email_routes IS
  'PN-EMAIL 3F: tenant-scoped lifecycle email destinations. Not login/profile identity. Not a notification platform.';

COMMENT ON COLUMN public.notification_email_routes.recipient_email IS
  'Approved notification destination. Independent of profiles.email / auth email.';

COMMENT ON COLUMN public.notification_email_routes.agent_id IS
  'Sourcing Agent id for prospect_activated routes. NULL for tenant operations prospect_created.';

CREATE UNIQUE INDEX IF NOT EXISTS notification_email_routes_created_uidx
  ON public.notification_email_routes (tenant_id)
  WHERE event_type = 'prospect_created'
    AND recipient_kind = 'operations';

CREATE UNIQUE INDEX IF NOT EXISTS notification_email_routes_activated_uidx
  ON public.notification_email_routes (tenant_id, agent_id)
  WHERE event_type = 'prospect_activated'
    AND recipient_kind = 'sourcing_agent';

CREATE INDEX IF NOT EXISTS notification_email_routes_tenant_event_idx
  ON public.notification_email_routes (tenant_id, event_type, active);

CREATE OR REPLACE FUNCTION public.notification_email_routes_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notification_email_routes_set_updated_at() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notification_email_routes_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_email_routes_set_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.notification_email_routes_set_updated_at() FROM authenticated;
REVOKE ALL ON FUNCTION public.notification_email_routes_set_updated_at() FROM service_role;

DROP TRIGGER IF EXISTS notification_email_routes_set_updated_at_trg
  ON public.notification_email_routes;
CREATE TRIGGER notification_email_routes_set_updated_at_trg
  BEFORE UPDATE ON public.notification_email_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.notification_email_routes_set_updated_at();

ALTER TABLE public.notification_email_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_routes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_email_routes_select_hq" ON public.notification_email_routes;
DROP POLICY IF EXISTS "notification_email_routes_write_hq" ON public.notification_email_routes;

CREATE POLICY "notification_email_routes_select_hq"
  ON public.notification_email_routes
  FOR SELECT
  TO authenticated
  USING (
    public.tenant_id_matches(tenant_id)
    AND public.current_user_role() IN ('admin', 'executive')
  );

CREATE POLICY "notification_email_routes_write_hq"
  ON public.notification_email_routes
  FOR ALL
  TO authenticated
  USING (
    public.tenant_id_matches(tenant_id)
    AND public.current_user_role() IN ('admin', 'executive')
  )
  WITH CHECK (
    public.tenant_id_matches(tenant_id)
    AND public.current_user_role() IN ('admin', 'executive')
  );

REVOKE ALL ON TABLE public.notification_email_routes FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_email_routes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_email_routes TO authenticated;
GRANT ALL ON TABLE public.notification_email_routes TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_prospect_lifecycle_email_route(
  p_tenant_id uuid,
  p_event_type text,
  p_agent_id text
)
RETURNS TABLE (
  route_email text,
  route_kind text,
  route_agent_id text,
  error_code text,
  error_summary text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_agent text;
  v_row public.notification_email_routes%ROWTYPE;
BEGIN
  v_type := lower(btrim(COALESCE(p_event_type, '')));
  v_agent := nullif(btrim(COALESCE(p_agent_id, '')), '');

  IF v_type = 'prospect_created' THEN
    SELECT r.*
      INTO v_row
    FROM public.notification_email_routes r
    WHERE r.tenant_id = p_tenant_id
      AND r.event_type = 'prospect_created'
      AND r.recipient_kind = 'operations'
      AND r.agent_id IS NULL
    ORDER BY r.active DESC NULLS LAST, r.updated_at DESC, r.route_id
    LIMIT 1;

    IF NOT FOUND THEN
      route_email := NULL;
      route_kind := 'operations';
      route_agent_id := NULL;
      error_code := 'missing_route';
      error_summary := 'no tenant operations notification route';
      RETURN NEXT;
      RETURN;
    END IF;
  ELSIF v_type = 'prospect_activated' THEN
    IF v_agent IS NULL THEN
      route_email := NULL;
      route_kind := 'sourcing_agent';
      route_agent_id := NULL;
      error_code := 'missing_route';
      error_summary := 'sourcing Agent id missing for activation route';
      RETURN NEXT;
      RETURN;
    END IF;

    SELECT r.*
      INTO v_row
    FROM public.notification_email_routes r
    WHERE r.tenant_id = p_tenant_id
      AND r.event_type = 'prospect_activated'
      AND r.recipient_kind = 'sourcing_agent'
      AND r.agent_id = v_agent
    ORDER BY r.active DESC NULLS LAST, r.updated_at DESC, r.route_id
    LIMIT 1;

    IF NOT FOUND THEN
      route_email := NULL;
      route_kind := 'sourcing_agent';
      route_agent_id := v_agent;
      error_code := 'missing_route';
      error_summary := 'no sourcing Agent notification route';
      RETURN NEXT;
      RETURN;
    END IF;
  ELSE
    RETURN;
  END IF;

  IF COALESCE(v_row.active, false) IS NOT TRUE THEN
    route_email := lower(btrim(COALESCE(v_row.recipient_email, '')));
    route_kind := v_row.recipient_kind;
    route_agent_id := v_row.agent_id;
    error_code := 'inactive_route';
    error_summary := 'notification route is inactive';
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT public.prospect_email_address_usable(v_row.recipient_email) THEN
    route_email := nullif(lower(btrim(COALESCE(v_row.recipient_email, ''))), '');
    route_kind := v_row.recipient_kind;
    route_agent_id := v_row.agent_id;
    error_code := 'missing_email';
    error_summary := 'notification route email missing or invalid';
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT public.prospect_email_is_production_dispatchable(v_row.recipient_email) THEN
    route_email := lower(btrim(v_row.recipient_email));
    route_kind := v_row.recipient_kind;
    route_agent_id := v_row.agent_id;
    error_code := 'non_dispatchable_domain';
    error_summary := 'notification route domain is not Production-dispatchable';
    RETURN NEXT;
    RETURN;
  END IF;

  route_email := lower(btrim(v_row.recipient_email));
  route_kind := v_row.recipient_kind;
  route_agent_id := v_row.agent_id;
  error_code := NULL;
  error_summary := NULL;
  RETURN NEXT;
END;
$$;

ALTER FUNCTION public.resolve_prospect_lifecycle_email_route(uuid, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolve_prospect_lifecycle_email_route(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_prospect_lifecycle_email_route(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_prospect_lifecycle_email_route(uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.resolve_prospect_lifecycle_email_route(uuid, text, text) FROM service_role;

COMMENT ON FUNCTION public.resolve_prospect_lifecycle_email_route(uuid, text, text) IS
  'PN-EMAIL 3F: resolve tenant/event/agent notification destination. Never falls back to profile email, Founder, or another Agent. Does not send.';

CREATE OR REPLACE FUNCTION public.record_prospect_email_delivery(
  p_event_id uuid,
  p_tenant_id uuid,
  p_recipient_user_id uuid,
  p_recipient_email text,
  p_status text,
  p_error_code text,
  p_error_summary text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('primecare.email_delivery', '1', true);
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
      p_event_id,
      p_tenant_id,
      'email',
      p_status,
      p_recipient_user_id,
      nullif(lower(btrim(COALESCE(p_recipient_email, ''))), ''),
      NULL,
      0,
      CASE WHEN p_status = 'queued' THEN now() ELSE NULL END,
      p_error_code,
      p_error_summary,
      now()
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
  END;
END;
$$;

ALTER FUNCTION public.record_prospect_email_delivery(uuid, uuid, uuid, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_prospect_email_delivery(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_prospect_email_delivery(uuid, uuid, uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.record_prospect_email_delivery(uuid, uuid, uuid, text, text, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.record_prospect_email_delivery(uuid, uuid, uuid, text, text, text, text) FROM service_role;

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
  v_route_email text;
  v_route_kind text;
  v_route_agent_id text;
  v_error_code text;
  v_error_summary text;
  v_status text;
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
    SELECT r.route_email, r.route_kind, r.route_agent_id, r.error_code, r.error_summary
      INTO v_route_email, v_route_kind, v_route_agent_id, v_error_code, v_error_summary
    FROM public.resolve_prospect_lifecycle_email_route(
      v_event.tenant_id,
      'prospect_created',
      NULL
    ) r
    LIMIT 1;

    v_status := CASE WHEN v_error_code IS NULL THEN 'queued' ELSE 'skipped' END;
    PERFORM public.record_prospect_email_delivery(
      v_event.event_id,
      v_event.tenant_id,
      NULL,
      v_route_email,
      v_status,
      v_error_code,
      COALESCE(v_error_summary, 'tenant operations notification route')
    );
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
    PERFORM public.record_prospect_email_delivery(
      v_event.event_id,
      v_event.tenant_id,
      NULL,
      NULL,
      'skipped',
      'missing_profile',
      'sourcing lab or profile could not be resolved'
    );
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
    PERFORM public.record_prospect_email_delivery(
      v_event.event_id,
      v_event.tenant_id,
      NULL,
      NULL,
      'skipped',
      'missing_profile',
      'sourcing Agent profile missing'
    );
    RETURN;
  END IF;

  IF v_event.target_user_id IS NOT NULL
    AND v_src.user_id IS DISTINCT FROM v_event.target_user_id
  THEN
    PERFORM public.record_prospect_email_delivery(
      v_event.event_id,
      v_event.tenant_id,
      v_event.target_user_id,
      NULL,
      'skipped',
      'target_mismatch',
      'event target_user_id is not the sourcing Agent'
    );
    RETURN;
  END IF;

  IF COALESCE(v_src.active, false) IS NOT TRUE THEN
    PERFORM public.record_prospect_email_delivery(
      v_event.event_id,
      v_event.tenant_id,
      v_src.user_id,
      NULL,
      'skipped',
      'inactive_profile',
      'sourcing Agent profile inactive'
    );
    RETURN;
  END IF;

  SELECT r.route_email, r.route_kind, r.route_agent_id, r.error_code, r.error_summary
    INTO v_route_email, v_route_kind, v_route_agent_id, v_error_code, v_error_summary
  FROM public.resolve_prospect_lifecycle_email_route(
    v_event.tenant_id,
    'prospect_activated',
    v_source_agent_id
  ) r
  LIMIT 1;

  v_status := CASE WHEN v_error_code IS NULL THEN 'queued' ELSE 'skipped' END;
  PERFORM public.record_prospect_email_delivery(
    v_event.event_id,
    v_event.tenant_id,
    v_src.user_id,
    v_route_email,
    v_status,
    v_error_code,
    COALESCE(v_error_summary, 'sourcing Agent notification route')
  );
END;
$$;

ALTER FUNCTION public.enqueue_prospect_email_deliveries(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.enqueue_prospect_email_deliveries(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_prospect_email_deliveries(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.enqueue_prospect_email_deliveries(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.enqueue_prospect_email_deliveries(uuid) FROM service_role;

COMMENT ON FUNCTION public.enqueue_prospect_email_deliveries(uuid) IS
  'PN-1B1/3F: queue exactly one Production-dispatchable lifecycle email from notification_email_routes. Never uses caller To, profile email, Founder role fan-out, or another Agent route. Does not send.';

-- Stage 3E exact-row claim: destination is the queued notification email,
-- not profiles.email. Preserve forensic/Stage 2 denies, lab-name gate, and
-- no Production batch claim.
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
    '63561826-8bb3-4004-b857-b58c397b2aae'::uuid,
    'b2b5f1a9-5678-4c1c-85ac-c06ea5b7fe64'::uuid
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

  v_canonical := lower(btrim(COALESCE(v_row.recipient_email, '')));
  IF NOT public.prospect_email_is_production_dispatchable(v_row.recipient_email) THEN
    RETURN QUERY
    SELECT
      v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
      v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
      v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
      NULL::text, v_lab.lab_id, 'rejected_domain'::text;
    RETURN;
  END IF;

  IF v_event_type = 'prospect_created' THEN
    IF v_row.recipient_user_id IS NULL THEN
      v_role := 'operations';
    ELSE
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
      IF v_role IN ('lab', 'customer', 'agent') THEN
        RETURN QUERY
        SELECT
          v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
          v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
          v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
          v_role, v_lab.lab_id, 'rejected_role'::text;
        RETURN;
      END IF;

      IF v_role NOT IN ('admin', 'executive', 'operations') THEN
        RETURN QUERY
        SELECT
          v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
          v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
          v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
          v_role, v_lab.lab_id, 'rejected_role'::text;
        RETURN;
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
    END IF;
  ELSE
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

    IF COALESCE(v_profile.active, false) IS NOT TRUE THEN
      RETURN QUERY
      SELECT
        v_row.delivery_id, v_row.event_id, v_row.tenant_id, v_row.recipient_user_id,
        v_row.recipient_email, v_row.provider_message_id, v_row.attempt_count,
        v_event.event_type, v_event.payload_json, v_event.source_id, v_row.certification_kind,
        v_role, v_lab.lab_id, 'rejected_inactive'::text;
      RETURN;
    END IF;
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
  'PN-EMAIL 3E/3F: exact-row lifecycle claim. Sends to queued notification destination, not profile email. Forensic and Stage 2 rows denied. Does not enable Production batch.';

INSERT INTO public.notification_email_routes (
  tenant_id,
  event_type,
  recipient_kind,
  recipient_user_id,
  agent_id,
  recipient_email,
  active
)
SELECT
  p.tenant_id,
  'prospect_created',
  'operations',
  NULL,
  NULL,
  'primecarediagnosticsuppliesadm@gmail.com',
  true
FROM public.profiles p
WHERE nullif(btrim(p.agent_id), '') = 'AGT_VISHWAK_RATA_36CC'
  AND NOT EXISTS (
    SELECT 1
    FROM public.notification_email_routes r
    WHERE r.tenant_id = p.tenant_id
      AND r.event_type = 'prospect_created'
      AND r.recipient_kind = 'operations'
  )
LIMIT 1;

INSERT INTO public.notification_email_routes (
  tenant_id,
  event_type,
  recipient_kind,
  recipient_user_id,
  agent_id,
  recipient_email,
  active
)
SELECT
  p.tenant_id,
  'prospect_activated',
  'sourcing_agent',
  p.user_id,
  'AGT_VISHWAK_RATA_36CC',
  'vishu.sen80@gmail.com',
  true
FROM public.profiles p
WHERE nullif(btrim(p.agent_id), '') = 'AGT_VISHWAK_RATA_36CC'
  AND lower(btrim(COALESCE(p.role, ''))) = 'agent'
  AND NOT EXISTS (
    SELECT 1
    FROM public.notification_email_routes r
    WHERE r.tenant_id = p.tenant_id
      AND r.event_type = 'prospect_activated'
      AND r.recipient_kind = 'sourcing_agent'
      AND r.agent_id = 'AGT_VISHWAK_RATA_36CC'
  )
ORDER BY p.active DESC NULLS LAST, p.user_id
LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.notification_email_routes r
    WHERE r.event_type = 'prospect_created'
      AND r.recipient_kind = 'operations'
      AND r.agent_id IS NULL
      AND r.active IS TRUE
      AND lower(btrim(r.recipient_email)) = 'primecarediagnosticsuppliesadm@gmail.com'
  ) THEN
    RAISE EXCEPTION 'stage3f_ops_route_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.notification_email_routes r
    WHERE r.event_type = 'prospect_activated'
      AND r.recipient_kind = 'sourcing_agent'
      AND r.agent_id = 'AGT_VISHWAK_RATA_36CC'
      AND r.active IS TRUE
      AND lower(btrim(r.recipient_email)) = 'vishu.sen80@gmail.com'
  ) THEN
    RAISE EXCEPTION 'stage3f_vishwa_route_missing';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
