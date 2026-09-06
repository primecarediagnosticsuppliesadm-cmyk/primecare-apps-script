-- Agent Prospect 2C — HQ activate_prospect_lab + v_labs_credit.created_at.
--
-- Certified architecture (Flow 2C only):
--   * Admin/Executive same-tenant activation of PROSPECT Labs.
--   * Tenant derived from authenticated profile (client tenant_id not trusted).
--   * sourced_by_agent_id is NEVER written.
--   * AR created once using HQ Add Lab defaults (limit 0, zeros).
--   * ordering_mode remains hq_managed.
--   * Optional ownership: sourced Agent if still active, else p_initial_agent_id, else unassigned.
--   * No Lab user, order, invoice, shipment, inventory, or payment.
--
-- Apply via supabase db query --linked after assert-supabase-environment --expect=qa.
-- Do NOT apply to Production in 2C. Do NOT use supabase db push.

-- ---------------------------------------------------------------------------
-- A. v_labs_credit — append created_at for HQ prospect review
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_labs_credit
WITH (security_invoker = true)
AS
SELECT
  l.tenant_id,
  l.lab_id,
  l.lab_name,
  l.owner_name,
  l.phone,
  l.area,
  l.status,
  l.assigned_agent_id,
  l.ordering_mode,
  COALESCE(a.outstanding, (0)::numeric) AS outstanding,
  COALESCE(a.credit_limit, (0)::numeric) AS credit_limit,
  COALESCE(a.days_overdue, 0) AS days_overdue,
  COALESCE(a.allowed_overdue_days, 15) AS allowed_overdue_days,
  COALESCE(a.credit_hold, false) AS credit_hold,
  CASE
    WHEN (COALESCE(a.credit_hold, false) = true) THEN 'BLOCKED'::text
    WHEN (
      (COALESCE(a.credit_limit, (0)::numeric) > (0)::numeric)
      AND (COALESCE(a.outstanding, (0)::numeric) >= COALESCE(a.credit_limit, (0)::numeric))
    ) THEN 'LIMIT_REACHED'::text
    WHEN (COALESCE(a.days_overdue, 0) > COALESCE(a.allowed_overdue_days, 15)) THEN 'OVERDUE'::text
    ELSE 'OK'::text
  END AS credit_status,
  l.sourced_by_agent_id,
  l.created_at
FROM public.labs l
LEFT JOIN public.ar_credit_control a
  ON l.tenant_id = a.tenant_id
 AND l.lab_id = a.lab_id;

COMMENT ON VIEW public.v_labs_credit IS
  'Labs with credit posture + ordering_mode + sourced_by_agent_id + created_at; security_invoker enforces caller RLS.';

REVOKE ALL ON TABLE public.v_labs_credit FROM PUBLIC;
REVOKE ALL ON TABLE public.v_labs_credit FROM anon;
GRANT SELECT ON TABLE public.v_labs_credit TO authenticated;

-- ---------------------------------------------------------------------------
-- B. activate_prospect_lab
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
  'HQ Admin/Executive: PROSPECT -> ACTIVE with one AR row, optional ownership, hq_managed ordering. Never writes sourced_by_agent_id.';

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- C. Block generic PROSPECT -> ACTIVE (must use activate_prospect_lab)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.labs_prospect_activate_via_rpc_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND upper(btrim(COALESCE(OLD.status, ''))) = 'PROSPECT'
    AND upper(btrim(COALESCE(NEW.status, ''))) = 'ACTIVE'
    AND current_setting('primecare.activate_prospect', true) IS DISTINCT FROM '1'
  THEN
    RAISE EXCEPTION 'use_activate_prospect_lab';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.labs_prospect_activate_via_rpc_only() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.labs_prospect_activate_via_rpc_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labs_prospect_activate_via_rpc_only() FROM anon;
REVOKE ALL ON FUNCTION public.labs_prospect_activate_via_rpc_only() FROM authenticated;

DROP TRIGGER IF EXISTS labs_prospect_activate_via_rpc_only_trg ON public.labs;
CREATE TRIGGER labs_prospect_activate_via_rpc_only_trg
  BEFORE UPDATE ON public.labs
  FOR EACH ROW
  EXECUTE FUNCTION public.labs_prospect_activate_via_rpc_only();
