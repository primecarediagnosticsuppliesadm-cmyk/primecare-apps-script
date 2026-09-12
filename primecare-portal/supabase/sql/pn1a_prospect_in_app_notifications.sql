-- PN-1A — server-authoritative in-app Prospect notifications (QA only).
-- Reuses notification_events. Does not create a new inbox, email provider, or Edge Function.
-- Does not change Flow 2 business semantics of create_prospect_lab / activate_prospect_lab.
-- Notification failure must not roll back Prospect create/activate (nested subtransaction).

-- ---------------------------------------------------------------------------
-- A. Helper — only writer for prospect_created / prospect_activated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emit_prospect_in_app_notification(
  p_tenant_id uuid,
  p_event_type text,
  p_source_id text,
  p_actor_user_id uuid,
  p_target_role text,
  p_target_user_id uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type text;
  v_source_id text;
BEGIN
  v_event_type := lower(btrim(COALESCE(p_event_type, '')));
  v_source_id := nullif(btrim(COALESCE(p_source_id, '')), '');

  IF v_event_type NOT IN ('prospect_created', 'prospect_activated') THEN
    RETURN;
  END IF;

  IF p_tenant_id IS NULL OR v_source_id IS NULL THEN
    RETURN;
  END IF;

  IF v_event_type = 'prospect_activated' AND p_target_user_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM set_config('primecare.prospect_notify', '1', true);

    INSERT INTO public.notification_events (
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
      p_tenant_id,
      v_event_type,
      'labs',
      v_source_id,
      p_actor_user_id,
      nullif(btrim(COALESCE(p_target_role, '')), ''),
      p_target_user_id,
      NULL,
      COALESCE(p_payload, '{}'::jsonb),
      'info',
      'pending'
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
    WHEN OTHERS THEN
      RAISE WARNING 'prospect_notify_failed event_type=% source_id=% sqlstate=% sqlerrm=%',
        v_event_type, v_source_id, SQLSTATE, SQLERRM;
  END;
END;
$$;

ALTER FUNCTION public.emit_prospect_in_app_notification(uuid, text, text, uuid, text, uuid, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.emit_prospect_in_app_notification(uuid, text, text, uuid, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.emit_prospect_in_app_notification(uuid, text, text, uuid, text, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.emit_prospect_in_app_notification(uuid, text, text, uuid, text, uuid, jsonb) FROM authenticated;

COMMENT ON FUNCTION public.emit_prospect_in_app_notification(uuid, text, text, uuid, text, uuid, jsonb) IS
  'PN-1A: server-only in-app Prospect notification insert. Nested exception isolation; unique_violation is a no-op.';

-- ---------------------------------------------------------------------------
-- B. Idempotency — scoped to the two Prospect lifecycle event types
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS notification_events_prospect_lifecycle_uidx
  ON public.notification_events (tenant_id, event_type, source_id)
  WHERE event_type IN ('prospect_created', 'prospect_activated')
    AND source_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- C. Client spoof protection — authenticated INSERT cannot forge these types
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_events_prospect_server_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND lower(btrim(COALESCE(NEW.event_type, ''))) IN ('prospect_created', 'prospect_activated')
  THEN
    IF current_setting('primecare.prospect_notify', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'prospect_notify_forbidden';
    END IF;
    IF nullif(btrim(COALESCE(NEW.source_id, '')), '') IS NULL THEN
      RAISE EXCEPTION 'prospect_notify_source_id_required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notification_events_prospect_server_only() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notification_events_prospect_server_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_events_prospect_server_only() FROM anon;
REVOKE ALL ON FUNCTION public.notification_events_prospect_server_only() FROM authenticated;

DROP TRIGGER IF EXISTS notification_events_prospect_server_only_trg ON public.notification_events;
CREATE TRIGGER notification_events_prospect_server_only_trg
  BEFORE INSERT ON public.notification_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notification_events_prospect_server_only();

-- ---------------------------------------------------------------------------
-- D. In-app templates (no email channel)
-- ---------------------------------------------------------------------------
INSERT INTO public.notification_templates (
  tenant_id,
  event_type,
  channel,
  title_template,
  body_template,
  active
)
SELECT d.tenant_id, v.event_type, 'in_app', v.title_template, v.body_template, true
FROM (
  SELECT DISTINCT tenant_id
  FROM public.profiles
  WHERE tenant_id IS NOT NULL
) d
CROSS JOIN (
  VALUES
    (
      'prospect_created',
      'New Prospect Added',
      '{{lab_name}} was added by {{sourcing_agent_name}}. {{area}}'
    ),
    (
      'prospect_activated',
      'Prospect Approved',
      '{{lab_name}} has been approved.'
    )
) AS v(event_type, title_template, body_template)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_templates t
  WHERE t.tenant_id = d.tenant_id
    AND t.event_type = v.event_type
    AND t.channel = 'in_app'
);

-- ---------------------------------------------------------------------------
-- E. create_prospect_lab — identical Flow 2A semantics + isolated notify
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_prospect_lab(
  p_lab_name text,
  p_owner_name text,
  p_phone text,
  p_area text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_profile public.profiles%ROWTYPE;
  v_tenant uuid;
  v_agent_id text;
  v_lab_name text;
  v_owner_name text;
  v_phone text;
  v_area text;
  v_phone_digits text;
  v_name_n text;
  v_area_n text;
  v_lab_id text;
  v_attempt integer;
  v_agent_name text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'prospect_unauthenticated';
  END IF;

  SELECT p.*
    INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = v_uid
  ORDER BY p.active DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prospect_profile_missing';
  END IF;

  IF COALESCE(v_profile.active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'prospect_inactive';
  END IF;

  IF lower(btrim(COALESCE(v_profile.role, ''))) <> 'agent' THEN
    RAISE EXCEPTION 'prospect_not_agent';
  END IF;

  v_tenant := v_profile.tenant_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'prospect_tenant_required';
  END IF;

  v_agent_id := nullif(btrim(v_profile.agent_id), '');
  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'prospect_agent_id_required';
  END IF;

  v_lab_name := btrim(COALESCE(p_lab_name, ''));
  v_owner_name := btrim(COALESCE(p_owner_name, ''));
  v_phone := btrim(COALESCE(p_phone, ''));
  v_area := btrim(COALESCE(p_area, ''));
  v_phone_digits := nullif(regexp_replace(v_phone, '[^0-9]', '', 'g'), '');

  IF v_lab_name = '' OR v_owner_name = '' OR v_phone = '' OR v_area = '' OR v_phone_digits IS NULL THEN
    RAISE EXCEPTION 'prospect_args_required';
  END IF;

  v_name_n := lower(btrim(regexp_replace(v_lab_name, '\s+', ' ', 'g')));
  v_area_n := lower(btrim(regexp_replace(v_area, '\s+', ' ', 'g')));

  IF EXISTS (
    SELECT 1
    FROM public.labs l
    WHERE l.tenant_id = v_tenant
      AND nullif(regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), '') = v_phone_digits
  ) THEN
    RAISE EXCEPTION 'prospect_phone_exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.labs l
    WHERE l.tenant_id = v_tenant
      AND lower(btrim(regexp_replace(COALESCE(l.lab_name, ''), '\s+', ' ', 'g'))) = v_name_n
      AND lower(btrim(regexp_replace(COALESCE(l.area, ''), '\s+', ' ', 'g'))) = v_area_n
  ) THEN
    RAISE EXCEPTION 'prospect_name_area_exists';
  END IF;

  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;
    v_lab_id := public.primecare_normalize_lab_id(
      'LAB-P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    );
    EXIT WHEN v_lab_id IS NOT NULL
      AND NOT public.private_labs_row_exists(v_tenant, v_lab_id);
    IF v_attempt >= 8 THEN
      RAISE EXCEPTION 'prospect_lab_id_collision';
    END IF;
  END LOOP;

  INSERT INTO public.labs (
    tenant_id,
    lab_id,
    lab_name,
    owner_name,
    phone,
    area,
    status,
    sourced_by_agent_id,
    ordering_mode
  )
  VALUES (
    v_tenant,
    v_lab_id,
    v_lab_name,
    v_owner_name,
    v_phone,
    v_area,
    'PROSPECT',
    v_agent_id,
    'hq_managed'
  );

  INSERT INTO public.user_provisioning_events (
    hq_tenant_id,
    subject_user_id,
    event_type,
    actor_user_id,
    payload
  )
  VALUES (
    v_tenant,
    v_uid,
    'created',
    v_uid,
    jsonb_build_object(
      'action', 'lab_prospect_created',
      'tenant_id', v_tenant,
      'lab_id', v_lab_id,
      'sourced_by_agent_id', v_agent_id,
      'user_id', v_uid
    )
  );

  v_agent_name := COALESCE(
    nullif(btrim(v_profile.display_name), ''),
    nullif(btrim(v_profile.agent_name), ''),
    v_agent_id
  );

  BEGIN
    PERFORM public.emit_prospect_in_app_notification(
      v_tenant,
      'prospect_created',
      v_lab_id,
      v_uid,
      'admin',
      NULL,
      jsonb_build_object(
        'lab_id', v_lab_id,
        'lab_name', v_lab_name,
        'contact_name', v_owner_name,
        'phone', v_phone,
        'area', v_area,
        'sourcing_agent_id', v_agent_id,
        'sourcing_agent_name', v_agent_name,
        'created_at', now(),
        'cta', '/labs'
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'prospect_created_notify_failed lab_id=% sqlstate=% sqlerrm=%',
        v_lab_id, SQLSTATE, SQLERRM;
  END;

  RETURN jsonb_build_object(
    'lab_id', v_lab_id,
    'lab_name', v_lab_name,
    'status', 'PROSPECT',
    'sourced_by_agent_id', v_agent_id
  );
END;
$$;

ALTER FUNCTION public.create_prospect_lab(text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_prospect_lab(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_prospect_lab(text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_prospect_lab(text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_prospect_lab(text, text, text, text) IS
  'Agent-only PROSPECT lab create. Tenant and sourced_by_agent_id derived from the authenticated profiles row. Does not create AR, ownership, or lab users. PN-1A emits prospect_created after audit; notify failure does not fail create.';

-- ---------------------------------------------------------------------------
-- F. activate_prospect_lab — identical Flow 2C semantics + isolated notify
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_prospect_lab(
  p_lab_id text,
  p_initial_agent_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_profile public.profiles%ROWTYPE;
  v_tenant uuid;
  v_role text;
  v_lab_id text;
  v_lab public.labs%ROWTYPE;
  v_requested text;
  v_assign text;
  v_ar_created boolean := false;
  v_own_created boolean := false;
  v_updated int;
  v_source_user_id uuid;
  v_source_agent_id text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'activate_unauthenticated';
  END IF;

  SELECT p.*
    INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = v_uid
  ORDER BY p.active DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_profile_missing';
  END IF;

  IF COALESCE(v_profile.active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'activate_inactive';
  END IF;

  v_role := lower(btrim(COALESCE(v_profile.role, '')));
  IF v_role NOT IN ('admin', 'executive') THEN
    RAISE EXCEPTION 'activate_forbidden';
  END IF;

  v_tenant := v_profile.tenant_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'activate_tenant_required';
  END IF;

  v_lab_id := public.primecare_normalize_lab_id(p_lab_id);
  IF v_lab_id IS NULL OR btrim(COALESCE(p_lab_id, '')) = '' THEN
    RAISE EXCEPTION 'activate_lab_required';
  END IF;

  SELECT l.*
    INTO v_lab
  FROM public.labs l
  WHERE l.tenant_id = v_tenant
    AND public.primecare_normalize_lab_id(l.lab_id) = v_lab_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'activate_lab_not_found';
  END IF;

  IF upper(btrim(COALESCE(v_lab.status, ''))) = 'ACTIVE' THEN
    RAISE EXCEPTION 'activate_already_active';
  END IF;

  IF upper(btrim(COALESCE(v_lab.status, ''))) <> 'PROSPECT' THEN
    RAISE EXCEPTION 'activate_not_prospect';
  END IF;

  v_requested := nullif(btrim(COALESCE(p_initial_agent_id, '')), '');
  IF v_requested IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.tenant_id = v_tenant
        AND COALESCE(p.active, false) IS TRUE
        AND lower(btrim(COALESCE(p.role, ''))) = 'agent'
        AND nullif(btrim(p.agent_id), '') = v_requested
    ) THEN
      RAISE EXCEPTION 'activate_agent_invalid';
    END IF;
    v_assign := v_requested;
  ELSIF nullif(btrim(COALESCE(v_lab.sourced_by_agent_id, '')), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.tenant_id = v_tenant
        AND COALESCE(p.active, false) IS TRUE
        AND lower(btrim(COALESCE(p.role, ''))) = 'agent'
        AND nullif(btrim(p.agent_id), '') = nullif(btrim(v_lab.sourced_by_agent_id), '')
    )
  THEN
    v_assign := nullif(btrim(v_lab.sourced_by_agent_id), '');
  ELSE
    v_assign := NULL;
  END IF;

  PERFORM set_config('primecare.activate_prospect', '1', true);

  UPDATE public.labs
  SET
    status = 'ACTIVE',
    ordering_mode = 'hq_managed',
    assigned_agent_id = v_assign
  WHERE tenant_id = v_tenant
    AND public.primecare_normalize_lab_id(lab_id) = v_lab_id
    AND upper(btrim(COALESCE(status, ''))) = 'PROSPECT';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'activate_already_active';
  END IF;

  INSERT INTO public.ar_credit_control (
    tenant_id,
    lab_id,
    lab_name,
    credit_limit,
    outstanding,
    total_delivered,
    total_paid,
    collections_notes
  )
  VALUES (
    v_tenant,
    v_lab.lab_id,
    COALESCE(nullif(btrim(v_lab.lab_name), ''), v_lab.lab_id),
    0,
    0,
    0,
    0,
    NULL
  )
  ON CONFLICT (tenant_id, lab_id) DO NOTHING;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  v_ar_created := v_updated = 1;

  IF v_assign IS NOT NULL THEN
    UPDATE public.lab_ownership
    SET status = 'INACTIVE', updated_at = now()
    WHERE tenant_id = v_tenant
      AND lab_id = v_lab.lab_id
      AND status = 'ACTIVE';

    INSERT INTO public.lab_ownership (
      tenant_id,
      lab_tenant_id,
      lab_id,
      primary_agent_id,
      assigned_at,
      assigned_by,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_tenant,
      v_tenant,
      v_lab.lab_id,
      v_assign,
      now(),
      v_uid,
      'ACTIVE',
      now(),
      now()
    );
    v_own_created := true;
  END IF;

  INSERT INTO public.user_provisioning_events (
    hq_tenant_id,
    subject_user_id,
    event_type,
    actor_user_id,
    payload
  )
  VALUES (
    v_tenant,
    v_uid,
    'updated',
    v_uid,
    jsonb_build_object(
      'action', 'lab_prospect_activated',
      'tenant_id', v_tenant,
      'lab_id', v_lab.lab_id,
      'sourced_by_agent_id', v_lab.sourced_by_agent_id,
      'assigned_agent_id', v_assign,
      'actor_user_id', v_uid
    )
  );

  -- Recipient ONLY from immutable labs.sourced_by_agent_id. Never assigned/ownership.
  v_source_agent_id := nullif(btrim(COALESCE(v_lab.sourced_by_agent_id, '')), '');
  IF v_source_agent_id IS NOT NULL THEN
    SELECT p.user_id
      INTO v_source_user_id
    FROM public.profiles p
    WHERE p.tenant_id = v_tenant
      AND lower(btrim(COALESCE(p.role, ''))) = 'agent'
      AND nullif(btrim(p.agent_id), '') = v_source_agent_id
    ORDER BY p.active DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_source_user_id IS NOT NULL THEN
    BEGIN
      PERFORM public.emit_prospect_in_app_notification(
        v_tenant,
        'prospect_activated',
        v_lab.lab_id,
        v_uid,
        'agent',
        v_source_user_id,
        jsonb_build_object(
          'lab_id', v_lab.lab_id,
          'lab_name', COALESCE(nullif(btrim(v_lab.lab_name), ''), v_lab.lab_id),
          'activated_at', now(),
          'assigned_agent_id', v_assign,
          'sourcing_agent_id', v_source_agent_id,
          'next_action', 'Open Lab',
          'cta', '/labs'
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'prospect_activated_notify_failed lab_id=% sqlstate=% sqlerrm=%',
          v_lab.lab_id, SQLSTATE, SQLERRM;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'lab_id', v_lab.lab_id,
    'status', 'ACTIVE',
    'ordering_mode', 'hq_managed',
    'sourced_by_agent_id', v_lab.sourced_by_agent_id,
    'assigned_agent_id', v_assign,
    'ar_created', v_ar_created,
    'ownership_created', v_own_created
  );
END;
$$;

ALTER FUNCTION public.activate_prospect_lab(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.activate_prospect_lab(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_prospect_lab(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.activate_prospect_lab(text, text) TO authenticated;

COMMENT ON FUNCTION public.activate_prospect_lab(text, text) IS
  'HQ Admin/Executive: PROSPECT -> ACTIVE with one AR row, optional ownership, hq_managed ordering. Never writes sourced_by_agent_id. PN-1A emits prospect_activated to sourcing Agent after audit; notify failure does not fail activation.';

NOTIFY pgrst, 'reload schema';
