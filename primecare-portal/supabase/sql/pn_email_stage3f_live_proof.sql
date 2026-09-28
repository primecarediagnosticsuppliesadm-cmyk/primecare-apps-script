-- PN-EMAIL Stage 3F live routing proof.
-- Run after routing SQL apply. Does not send email.
-- Creates ephemeral proof events/lab, asserts, then deletes them.
-- Does not create the Stage 3F certification prospect.
-- Does not rewrite forensic delivery rows.

DO $$
DECLARE
  v_tenant uuid;
  v_vishwa uuid;
  v_founder uuid;
  v_founder_email text;
  v_vishwa_profile_email text;
  v_lab_id text;
  v_lab_b text;
  v_created_event uuid;
  v_activated_event uuid;
  v_b_event uuid;
  v_created_n int;
  v_created_email text;
  v_activated_n int;
  v_activated_email text;
  v_b_code text;
  v_inactive_code text;
  v_local_code text;
  v_route record;
  v_agent_visible int;
BEGIN
  SELECT p.tenant_id, p.user_id, lower(btrim(p.email))
    INTO v_tenant, v_vishwa, v_vishwa_profile_email
  FROM public.profiles p
  WHERE nullif(btrim(p.agent_id), '') = 'AGT_VISHWAK_RATA_36CC'
    AND lower(btrim(COALESCE(p.role, ''))) = 'agent'
  ORDER BY p.active DESC NULLS LAST, p.user_id
  LIMIT 1;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'stage3f_vishwa_missing';
  END IF;

  SELECT p.user_id, lower(btrim(p.email))
    INTO v_founder, v_founder_email
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant
    AND lower(btrim(COALESCE(p.role, ''))) = 'executive'
  ORDER BY p.active DESC NULLS LAST, p.user_id
  LIMIT 1;

  SELECT * INTO v_route
  FROM public.resolve_prospect_lifecycle_email_route(v_tenant, 'prospect_created', NULL);
  IF v_route.error_code IS NOT NULL
    OR v_route.route_email IS DISTINCT FROM 'primecarediagnosticsuppliesadm@gmail.com'
  THEN
    RAISE EXCEPTION 'stage3f_ops_resolve_failed % %', v_route.route_email, v_route.error_code;
  END IF;

  SELECT * INTO v_route
  FROM public.resolve_prospect_lifecycle_email_route(
    v_tenant, 'prospect_activated', 'AGT_VISHWAK_RATA_36CC'
  );
  IF v_route.error_code IS NOT NULL
    OR v_route.route_email IS DISTINCT FROM 'vishu.sen80@gmail.com'
  THEN
    RAISE EXCEPTION 'stage3f_vishwa_resolve_failed % %', v_route.route_email, v_route.error_code;
  END IF;

  SELECT * INTO v_route
  FROM public.resolve_prospect_lifecycle_email_route(
    v_tenant, 'prospect_activated', 'AGT_STAGE3F_AGENT_B_PROOF'
  );
  IF v_route.error_code IS DISTINCT FROM 'missing_route' OR v_route.route_email IS NOT NULL THEN
    RAISE EXCEPTION 'stage3f_agent_b_inherited % %', v_route.route_email, v_route.error_code;
  END IF;

  INSERT INTO public.notification_email_routes (
    tenant_id, event_type, recipient_kind, agent_id, recipient_email, active
  ) VALUES (
    v_tenant, 'prospect_activated', 'sourcing_agent',
    'AGT_STAGE3F_INACTIVE_PROOF', 'inactive-proof@gmail.com', false
  );

  INSERT INTO public.notification_email_routes (
    tenant_id, event_type, recipient_kind, agent_id, recipient_email, active
  ) VALUES (
    v_tenant, 'prospect_activated', 'sourcing_agent',
    'AGT_STAGE3F_LOCAL_PROOF', 'agent@primecare.local', true
  );

  PERFORM set_config('primecare.prospect_notify', '1', true);
  PERFORM set_config('primecare.email_delivery', '1', true);

  SELECT error_code INTO v_inactive_code
  FROM public.resolve_prospect_lifecycle_email_route(
    v_tenant, 'prospect_activated', 'AGT_STAGE3F_INACTIVE_PROOF'
  );
  IF v_inactive_code IS DISTINCT FROM 'inactive_route' THEN
    RAISE EXCEPTION 'stage3f_inactive_not_closed %', v_inactive_code;
  END IF;

  SELECT error_code INTO v_local_code
  FROM public.resolve_prospect_lifecycle_email_route(
    v_tenant, 'prospect_activated', 'AGT_STAGE3F_LOCAL_PROOF'
  );
  IF v_local_code IS DISTINCT FROM 'non_dispatchable_domain' THEN
    RAISE EXCEPTION 'stage3f_local_dispatchable %', v_local_code;
  END IF;

  v_lab_id := public.primecare_normalize_lab_id('LAB-P-3FROUTEPROOF');
  v_lab_b := public.primecare_normalize_lab_id('LAB-P-3FROUTEPRFB');

  DELETE FROM public.labs l
  WHERE l.tenant_id = v_tenant
    AND public.primecare_normalize_lab_id(l.lab_id) IN (v_lab_id, v_lab_b);

  INSERT INTO public.labs (
    tenant_id, lab_id, lab_name, owner_name, phone, area, status,
    sourced_by_agent_id, ordering_mode
  ) VALUES (
    v_tenant, v_lab_id, 'PN EMAIL STAGE3F ROUTING PROOF — DELETE',
    'Routing Proof', '0000000000', 'Proof', 'PROSPECT',
    'AGT_VISHWAK_RATA_36CC', 'hq_managed'
  ), (
    v_tenant, v_lab_b, 'PN EMAIL STAGE3F ROUTING PROOF B — DELETE',
    'Routing Proof B', '0000000000', 'Proof', 'PROSPECT',
    'AGT_STAGE3F_AGENT_B_PROOF', 'hq_managed'
  );

  INSERT INTO public.notification_events (
    tenant_id, event_type, source_module, source_id, actor_user_id,
    target_role, target_user_id, payload_json, severity, status
  ) VALUES (
    v_tenant, 'prospect_created', 'labs', v_lab_id, v_vishwa,
    'admin', NULL,
    jsonb_build_object('lab_name', 'PN EMAIL STAGE3F ROUTING PROOF — DELETE'),
    'info', 'pending'
  )
  RETURNING event_id INTO v_created_event;

  SELECT
    count(*) FILTER (
      WHERE channel = 'email'
        AND status = 'queued'
        AND public.prospect_email_is_production_dispatchable(recipient_email)
    ),
    max(recipient_email) FILTER (WHERE status = 'queued')
  INTO v_created_n, v_created_email
  FROM public.notification_delivery_log
  WHERE event_id = v_created_event
    AND channel = 'email';

  IF v_created_n <> 1
    OR v_created_email IS DISTINCT FROM 'primecarediagnosticsuppliesadm@gmail.com'
  THEN
    RAISE EXCEPTION 'stage3f_created_enqueue % %', v_created_n, v_created_email;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_delivery_log d
    WHERE d.event_id = v_created_event
      AND d.channel = 'email'
      AND (
        d.recipient_user_id = v_founder
        OR lower(btrim(COALESCE(d.recipient_email, ''))) IS NOT DISTINCT FROM v_founder_email
        OR lower(btrim(COALESCE(d.recipient_email, ''))) IS NOT DISTINCT FROM v_vishwa_profile_email
      )
  ) THEN
    RAISE EXCEPTION 'stage3f_created_profile_fanout';
  END IF;

  INSERT INTO public.notification_events (
    tenant_id, event_type, source_module, source_id, actor_user_id,
    target_role, target_user_id, payload_json, severity, status
  ) VALUES (
    v_tenant, 'prospect_activated', 'labs', v_lab_id, v_founder,
    'agent', v_vishwa,
    jsonb_build_object('lab_name', 'PN EMAIL STAGE3F ROUTING PROOF — DELETE'),
    'info', 'pending'
  )
  RETURNING event_id INTO v_activated_event;

  SELECT
    count(*) FILTER (
      WHERE channel = 'email'
        AND status = 'queued'
        AND public.prospect_email_is_production_dispatchable(recipient_email)
    ),
    max(recipient_email) FILTER (WHERE status = 'queued')
  INTO v_activated_n, v_activated_email
  FROM public.notification_delivery_log
  WHERE event_id = v_activated_event
    AND channel = 'email';

  IF v_activated_n <> 1
    OR v_activated_email IS DISTINCT FROM 'vishu.sen80@gmail.com'
  THEN
    RAISE EXCEPTION 'stage3f_activated_enqueue % %', v_activated_n, v_activated_email;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.notification_delivery_log d
    WHERE d.event_id = v_activated_event
      AND d.channel = 'email'
      AND (
        lower(btrim(COALESCE(d.recipient_email, ''))) IS NOT DISTINCT FROM v_vishwa_profile_email
        OR lower(btrim(COALESCE(d.recipient_email, ''))) IS NOT DISTINCT FROM v_founder_email
        OR d.recipient_email ILIKE '%@primecare.local'
      )
  ) THEN
    RAISE EXCEPTION 'stage3f_activated_profile_or_local';
  END IF;

  INSERT INTO public.notification_events (
    tenant_id, event_type, source_module, source_id, actor_user_id,
    target_role, payload_json, severity, status
  ) VALUES (
    v_tenant, 'prospect_activated', 'labs', v_lab_b, v_founder,
    'agent', jsonb_build_object('proof', 'agent_b'), 'info', 'pending'
  )
  RETURNING event_id INTO v_b_event;

  SELECT d.error_code
    INTO v_b_code
  FROM public.notification_delivery_log d
  WHERE d.event_id = v_b_event
    AND d.channel = 'email'
  LIMIT 1;

  IF v_b_code IS DISTINCT FROM 'missing_profile' THEN
    RAISE EXCEPTION 'stage3f_agent_b_enqueue_not_closed %', v_b_code;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.notification_delivery_log d
    WHERE d.event_id = v_b_event AND d.status = 'queued'
  ) THEN
    RAISE EXCEPTION 'stage3f_agent_b_queued_vishwa';
  END IF;

  BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_vishwa::text, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', v_vishwa::text, 'role', 'authenticated')::text,
      true
    );
    PERFORM set_config('role', 'authenticated', true);
    SELECT count(*) INTO v_agent_visible FROM public.notification_email_routes;
    PERFORM set_config('role', 'postgres', true);
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('role', 'postgres', true);
      v_agent_visible := NULL;
  END;

  IF v_agent_visible IS NOT NULL AND v_agent_visible <> 0 THEN
    RAISE EXCEPTION 'stage3f_agent_rls_visible %', v_agent_visible;
  END IF;

  DELETE FROM public.notification_delivery_log
  WHERE event_id IN (v_created_event, v_activated_event, v_b_event);
  DELETE FROM public.notification_events
  WHERE event_id IN (v_created_event, v_activated_event, v_b_event);
  DELETE FROM public.labs
  WHERE tenant_id = v_tenant
    AND public.primecare_normalize_lab_id(lab_id) IN (v_lab_id, v_lab_b);
  DELETE FROM public.notification_email_routes
  WHERE agent_id IN ('AGT_STAGE3F_INACTIVE_PROOF', 'AGT_STAGE3F_LOCAL_PROOF');

  RAISE NOTICE 'STAGE 3F LIVE PROOF PASS created=% activated=% agent_b=%',
    v_created_email, v_activated_email, v_b_code;
EXCEPTION
  WHEN OTHERS THEN
    DELETE FROM public.notification_delivery_log
    WHERE event_id IN (v_created_event, v_activated_event, v_b_event);
    DELETE FROM public.notification_events
    WHERE event_id IN (v_created_event, v_activated_event, v_b_event);
    IF v_tenant IS NOT NULL THEN
      DELETE FROM public.labs
      WHERE tenant_id = v_tenant
        AND lab_id IN ('LAB-P-3FROUTEPROOF', 'LAB-P-3FROUTEPRFB');
      DELETE FROM public.notification_email_routes
      WHERE agent_id IN ('AGT_STAGE3F_INACTIVE_PROOF', 'AGT_STAGE3F_LOCAL_PROOF');
    END IF;
    RAISE;
END
$$;
