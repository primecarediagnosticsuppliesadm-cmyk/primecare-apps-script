-- Sprint 8A — Labs profile projection (QA shadow).
-- Blueprint: 18_Domain_Projection_Architecture.md
-- Registry: PRJ-LAB-PROFILE-v1
--
-- This projection owns lab identity/profile/ownership/qualification/ordering
-- display fields only. Receivables remain owned by proj_lab_receivable_v1.

-- ---------------------------------------------------------------------------
-- proj_lab_profile_v1 — one row per (tenant_id, lab_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.proj_lab_profile_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lab_id text NOT NULL,
  lab_name text NOT NULL DEFAULT '',
  owner_name text NOT NULL DEFAULT '',
  phone text,
  area text NOT NULL DEFAULT '',
  territory text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  ordering_mode text NOT NULL DEFAULT 'hq_managed',
  assigned_agent_id text NOT NULL DEFAULT '',
  assigned_agent_name text NOT NULL DEFAULT '',
  primary_agent_id text NOT NULL DEFAULT '',
  primary_agent_name text NOT NULL DEFAULT '',
  secondary_agent_id text,
  secondary_agent_name text,
  manager_id uuid,
  ownership_status text NOT NULL DEFAULT '',
  qualification_status text,
  qualification_stage text,
  qualification_score numeric(10, 2),
  qualification_notes text,
  next_follow_up date,
  distributor_id uuid,
  distributor_name text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  model_version integer NOT NULL DEFAULT 1,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proj_lab_profile_v1_tenant_lab_uidx UNIQUE (tenant_id, lab_id)
);

CREATE INDEX IF NOT EXISTS idx_proj_lab_profile_v1_tenant_lab
  ON public.proj_lab_profile_v1 (tenant_id, lab_id);

CREATE INDEX IF NOT EXISTS idx_proj_lab_profile_v1_tenant_agent
  ON public.proj_lab_profile_v1 (tenant_id, assigned_agent_id);

CREATE INDEX IF NOT EXISTS idx_proj_lab_profile_v1_tenant_refreshed
  ON public.proj_lab_profile_v1 (tenant_id, refreshed_at DESC);

ALTER TABLE public.proj_lab_profile_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proj_lab_profile_v1_select" ON public.proj_lab_profile_v1;
CREATE POLICY "proj_lab_profile_v1_select"
  ON public.proj_lab_profile_v1 FOR SELECT TO authenticated
  USING (public.distributor_lab_record_visible(tenant_id, lab_id));

COMMENT ON TABLE public.proj_lab_profile_v1 IS
  'Laboratory profile projection. Owns lab identity/profile/ownership/qualification/ordering display fields only.';

-- Receivable-owned parity field required by read_labs_list_v1 composition.
ALTER TABLE public.proj_lab_receivable_v1
  ADD COLUMN IF NOT EXISTS allowed_overdue_days numeric(10, 2) NOT NULL DEFAULT 15;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._proj_credit_hold_bool_v1(p_credit_hold text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(btrim(COALESCE(p_credit_hold, ''))) IN ('TRUE', 'T', 'YES', 'Y', '1', 'HOLD');
$$;

CREATE OR REPLACE FUNCTION public._proj_credit_status_v1(
  p_outstanding numeric,
  p_credit_limit numeric,
  p_days_overdue numeric,
  p_allowed_overdue_days numeric,
  p_credit_hold text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN public._proj_credit_hold_bool_v1(p_credit_hold) THEN 'BLOCKED'
      WHEN COALESCE(p_credit_limit, 0) > 0
        AND COALESCE(p_outstanding, 0) >= COALESCE(p_credit_limit, 0) THEN 'LIMIT_REACHED'
      WHEN COALESCE(p_days_overdue, 0) > COALESCE(p_allowed_overdue_days, 15) THEN 'OVERDUE'
      ELSE 'OK'
    END;
$$;

-- ---------------------------------------------------------------------------
-- refresh_proj_lab_receivable_row_v1 — preserve receivables ownership and add
-- allowed_overdue_days for exact labs adapter parity.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_proj_lab_receivable_row_v1(
  p_tenant_id uuid,
  p_lab_id text,
  p_cascade_metrics boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lab text;
  v_ar public.ar_credit_control%ROWTYPE;
  v_credit record;
  v_has_ar boolean := false;
  v_has_credit boolean := false;
  v_payments_sum numeric(14, 2) := 0;
  v_last_payment date;
  v_outstanding numeric(14, 2) := 0;
  v_total_paid numeric(14, 2) := 0;
  v_total_delivered numeric(14, 2) := 0;
  v_credit_limit numeric(14, 2) := 0;
  v_overdue numeric(10, 2) := 0;
  v_allowed_overdue numeric(10, 2) := 15;
  v_credit_hold text := '';
  v_lab_name text := '';
  v_agent text := '';
  v_agent_id text := '';
  v_area text := '';
  v_risk text;
  v_payment_status text;
BEGIN
  v_lab := public.primecare_normalize_lab_id(p_lab_id);
  IF p_tenant_id IS NULL OR v_lab IS NULL THEN
    RAISE EXCEPTION 'receivable_refresh_args_required';
  END IF;
  PERFORM public._proj_assert_refresh_access_v1(p_tenant_id);

  SELECT * INTO v_ar
  FROM public.ar_credit_control ar
  WHERE ar.tenant_id = p_tenant_id
    AND public.primecare_normalize_lab_id(ar.lab_id) = v_lab
  LIMIT 1;

  v_has_ar := FOUND;

  IF to_regclass('public.v_labs_credit') IS NOT NULL THEN
    SELECT
      lc.lab_name,
      lc.outstanding,
      lc.credit_limit,
      lc.credit_hold,
      lc.days_overdue,
      lc.allowed_overdue_days,
      lc.area,
      lc.assigned_agent_id,
      lc.owner_name
    INTO v_credit
    FROM public.v_labs_credit lc
    WHERE lc.tenant_id = p_tenant_id
      AND public.primecare_normalize_lab_id(lc.lab_id) = v_lab
    LIMIT 1;
    v_has_credit := FOUND;
  END IF;

  SELECT
    COALESCE(SUM(p.amount_received), 0),
    MAX(p.payment_date)
  INTO v_payments_sum, v_last_payment
  FROM public.payments p
  WHERE p.tenant_id = p_tenant_id
    AND public.primecare_normalize_lab_id(p.lab_id) = v_lab;

  IF v_has_ar THEN
    v_outstanding := COALESCE(v_ar.outstanding, 0);
    v_total_paid := GREATEST(COALESCE(v_ar.total_paid, 0), COALESCE(v_payments_sum, 0));
    v_total_delivered := COALESCE(v_ar.total_delivered, 0);
    v_credit_limit := COALESCE(v_ar.credit_limit, 0);
    v_overdue := COALESCE(v_credit.days_overdue, 0);
    v_allowed_overdue := COALESCE(v_credit.allowed_overdue_days, 15);
    v_credit_hold := COALESCE(v_ar.credit_hold::text, '');
    v_lab_name := COALESCE(v_ar.lab_name, v_credit.lab_name, v_lab);
    v_agent_id := COALESCE(v_credit.assigned_agent_id::text, '');
    v_agent := COALESCE(v_credit.owner_name, '');
    v_area := COALESCE(v_credit.area, '');
  ELSIF v_has_credit THEN
    v_outstanding := COALESCE(v_credit.outstanding, 0);
    v_total_paid := GREATEST(COALESCE(v_payments_sum, 0), 0);
    v_credit_limit := COALESCE(v_credit.credit_limit, 0);
    v_overdue := COALESCE(v_credit.days_overdue, 0);
    v_allowed_overdue := COALESCE(v_credit.allowed_overdue_days, 15);
    v_credit_hold := COALESCE(v_credit.credit_hold::text, '');
    v_lab_name := COALESCE(v_credit.lab_name, v_lab);
    v_agent_id := COALESCE(v_credit.assigned_agent_id::text, '');
    v_agent := COALESCE(v_credit.owner_name, '');
    v_area := COALESCE(v_credit.area, '');
  ELSE
    DELETE FROM public.proj_lab_receivable_v1
    WHERE tenant_id = p_tenant_id AND lab_id = v_lab;
    IF p_cascade_metrics THEN
      PERFORM public.refresh_proj_tenant_receivable_metrics_v1(p_tenant_id);
    END IF;
    RETURN jsonb_build_object('success', true, 'deleted', true, 'lab_id', v_lab);
  END IF;

  v_risk := public._proj_derive_risk_status_v1(v_credit_hold, v_overdue, v_outstanding);
  v_payment_status := public._proj_derive_payment_status_v1(
    v_outstanding, v_total_paid, v_overdue, v_credit_hold
  );

  INSERT INTO public.proj_lab_receivable_v1 (
    tenant_id, lab_id, lab_name, outstanding_amount, total_paid, total_delivered,
    credit_limit, credit_hold, overdue_days, allowed_overdue_days, risk_status,
    payment_status, assigned_agent, agent_id, area, last_payment_date, refreshed_at
  )
  VALUES (
    p_tenant_id, v_lab, v_lab_name, v_outstanding, v_total_paid, v_total_delivered,
    v_credit_limit, v_credit_hold, v_overdue, v_allowed_overdue, v_risk,
    v_payment_status, v_agent, v_agent_id, v_area, v_last_payment, now()
  )
  ON CONFLICT (tenant_id, lab_id) DO UPDATE
  SET
    lab_name = EXCLUDED.lab_name,
    outstanding_amount = EXCLUDED.outstanding_amount,
    total_paid = EXCLUDED.total_paid,
    total_delivered = EXCLUDED.total_delivered,
    credit_limit = EXCLUDED.credit_limit,
    credit_hold = EXCLUDED.credit_hold,
    overdue_days = EXCLUDED.overdue_days,
    allowed_overdue_days = EXCLUDED.allowed_overdue_days,
    risk_status = EXCLUDED.risk_status,
    payment_status = EXCLUDED.payment_status,
    assigned_agent = EXCLUDED.assigned_agent,
    agent_id = EXCLUDED.agent_id,
    area = EXCLUDED.area,
    last_payment_date = EXCLUDED.last_payment_date,
    refreshed_at = now();

  IF p_cascade_metrics THEN
    PERFORM public.refresh_proj_tenant_receivable_metrics_v1(p_tenant_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'lab_id', v_lab);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM public._proj_touch_meta_v1(
      p_tenant_id, 'PRJ-COL-LAB-v1', NULL, SQLERRM
    );
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- refresh_proj_lab_profile_row_v1
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_proj_lab_profile_row_v1(
  p_tenant_id uuid,
  p_lab_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lab text;
  v_lab_row public.labs%ROWTYPE;
  v_owner public.lab_ownership%ROWTYPE;
  v_qual record;
  v_has_owner boolean := false;
  v_has_qual boolean := false;
  v_tenant_name text := '';
  v_assigned_agent_id text := '';
  v_assigned_agent_name text := '';
  v_primary_agent_name text := '';
  v_secondary_agent_name text := '';
BEGIN
  v_lab := public.primecare_normalize_lab_id(p_lab_id);
  IF p_tenant_id IS NULL OR v_lab IS NULL THEN
    RAISE EXCEPTION 'lab_profile_refresh_args_required';
  END IF;
  PERFORM public._proj_assert_refresh_access_v1(p_tenant_id);

  SELECT * INTO v_lab_row
  FROM public.labs l
  WHERE l.tenant_id = p_tenant_id
    AND public.primecare_normalize_lab_id(l.lab_id) = v_lab
  LIMIT 1;

  IF NOT FOUND THEN
    DELETE FROM public.proj_lab_profile_v1
    WHERE tenant_id = p_tenant_id AND lab_id = v_lab;
    PERFORM public._proj_touch_meta_v1(
      p_tenant_id,
      'PRJ-LAB-PROFILE-v1',
      (SELECT COUNT(*) FROM public.proj_lab_profile_v1 p WHERE p.tenant_id = p_tenant_id),
      NULL
    );
    RETURN jsonb_build_object('success', true, 'deleted', true, 'lab_id', v_lab);
  END IF;

  SELECT * INTO v_owner
  FROM public.lab_ownership lo
  WHERE lo.tenant_id = p_tenant_id
    AND public.primecare_normalize_lab_id(lo.lab_id) = v_lab
    AND upper(btrim(COALESCE(lo.status, ''))) = 'ACTIVE'
  ORDER BY lo.assigned_at DESC NULLS LAST, lo.created_at DESC NULLS LAST
  LIMIT 1;
  v_has_owner := FOUND;

  SELECT
    q.founder_review_status,
    q.pipeline_stage,
    q.qualification_score,
    q.qualification_band,
    q.notes,
    q.next_follow_up_date
  INTO v_qual
  FROM public.lab_qualifications q
  WHERE q.tenant_id = p_tenant_id
    AND public.primecare_normalize_lab_id(q.lab_id) = v_lab
  ORDER BY q.updated_at DESC NULLS LAST, q.created_at DESC NULLS LAST
  LIMIT 1;
  v_has_qual := FOUND;

  SELECT COALESCE(t.tenant_name, '')
  INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = p_tenant_id
  LIMIT 1;

  v_assigned_agent_id := COALESCE(
    CASE WHEN v_has_owner THEN NULLIF(btrim(v_owner.primary_agent_id), '') END,
    NULLIF(btrim(COALESCE(v_lab_row.assigned_agent_id, '')), ''),
    ''
  );

  SELECT COALESCE(p.display_name, p.username, p.email, '')
  INTO v_assigned_agent_name
  FROM public.profiles p
  WHERE p.tenant_id = p_tenant_id
    AND (
      btrim(COALESCE(p.agent_id, '')) = v_assigned_agent_id
      OR p.user_id::text = v_assigned_agent_id
    )
  LIMIT 1;

  IF v_has_owner THEN
    SELECT COALESCE(p.display_name, p.username, p.email, '')
    INTO v_primary_agent_name
    FROM public.profiles p
    WHERE p.tenant_id = p_tenant_id
      AND (
        btrim(COALESCE(p.agent_id, '')) = btrim(COALESCE(v_owner.primary_agent_id, ''))
        OR p.user_id::text = btrim(COALESCE(v_owner.primary_agent_id, ''))
      )
    LIMIT 1;

    IF NULLIF(btrim(COALESCE(v_owner.secondary_agent_id, '')), '') IS NOT NULL THEN
      SELECT COALESCE(p.display_name, p.username, p.email, '')
      INTO v_secondary_agent_name
      FROM public.profiles p
      WHERE p.tenant_id = p_tenant_id
        AND (
          btrim(COALESCE(p.agent_id, '')) = btrim(COALESCE(v_owner.secondary_agent_id, ''))
          OR p.user_id::text = btrim(COALESCE(v_owner.secondary_agent_id, ''))
        )
      LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.proj_lab_profile_v1 (
    tenant_id, lab_id, lab_name, owner_name, phone, area, territory, status,
    ordering_mode, assigned_agent_id, assigned_agent_name, primary_agent_id,
    primary_agent_name, secondary_agent_id, secondary_agent_name, manager_id,
    ownership_status, qualification_status, qualification_stage,
    qualification_score, qualification_notes, next_follow_up, distributor_id,
    distributor_name, display_name, refreshed_at
  )
  VALUES (
    p_tenant_id,
    v_lab,
    COALESCE(v_lab_row.lab_name, v_lab),
    COALESCE(v_lab_row.owner_name, ''),
    v_lab_row.phone,
    COALESCE(v_lab_row.area, ''),
    COALESCE(v_lab_row.area, ''),
    COALESCE(v_lab_row.status, ''),
    COALESCE(v_lab_row.ordering_mode, 'hq_managed'),
    v_assigned_agent_id,
    COALESCE(v_assigned_agent_name, ''),
    COALESCE(CASE WHEN v_has_owner THEN v_owner.primary_agent_id END, ''),
    COALESCE(v_primary_agent_name, ''),
    CASE WHEN v_has_owner THEN NULLIF(btrim(v_owner.secondary_agent_id), '') END,
    NULLIF(v_secondary_agent_name, ''),
    CASE WHEN v_has_owner THEN v_owner.manager_id END,
    COALESCE(CASE WHEN v_has_owner THEN v_owner.status END, ''),
    CASE WHEN v_has_qual THEN COALESCE(v_qual.founder_review_status, v_qual.qualification_band) END,
    CASE WHEN v_has_qual THEN v_qual.pipeline_stage END,
    CASE WHEN v_has_qual THEN v_qual.qualification_score END,
    CASE WHEN v_has_qual THEN v_qual.notes END,
    CASE WHEN v_has_qual THEN v_qual.next_follow_up_date END,
    p_tenant_id,
    COALESCE(v_tenant_name, ''),
    COALESCE(v_lab_row.lab_name, v_lab),
    now()
  )
  ON CONFLICT (tenant_id, lab_id) DO UPDATE
  SET
    lab_name = EXCLUDED.lab_name,
    owner_name = EXCLUDED.owner_name,
    phone = EXCLUDED.phone,
    area = EXCLUDED.area,
    territory = EXCLUDED.territory,
    status = EXCLUDED.status,
    ordering_mode = EXCLUDED.ordering_mode,
    assigned_agent_id = EXCLUDED.assigned_agent_id,
    assigned_agent_name = EXCLUDED.assigned_agent_name,
    primary_agent_id = EXCLUDED.primary_agent_id,
    primary_agent_name = EXCLUDED.primary_agent_name,
    secondary_agent_id = EXCLUDED.secondary_agent_id,
    secondary_agent_name = EXCLUDED.secondary_agent_name,
    manager_id = EXCLUDED.manager_id,
    ownership_status = EXCLUDED.ownership_status,
    qualification_status = EXCLUDED.qualification_status,
    qualification_stage = EXCLUDED.qualification_stage,
    qualification_score = EXCLUDED.qualification_score,
    qualification_notes = EXCLUDED.qualification_notes,
    next_follow_up = EXCLUDED.next_follow_up,
    distributor_id = EXCLUDED.distributor_id,
    distributor_name = EXCLUDED.distributor_name,
    display_name = EXCLUDED.display_name,
    refreshed_at = now();

  PERFORM public._proj_touch_meta_v1(
    p_tenant_id,
    'PRJ-LAB-PROFILE-v1',
    (SELECT COUNT(*) FROM public.proj_lab_profile_v1 p WHERE p.tenant_id = p_tenant_id),
    NULL
  );

  RETURN jsonb_build_object('success', true, 'lab_id', v_lab);
EXCEPTION
  WHEN OTHERS THEN
    PERFORM public._proj_touch_meta_v1(
      p_tenant_id, 'PRJ-LAB-PROFILE-v1', NULL, SQLERRM
    );
    RAISE;
END;
$$;

-- ---------------------------------------------------------------------------
-- rebuild_projection_v1 — preserve existing branches and add Labs profile.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebuild_projection_v1(
  p_tenant_id uuid,
  p_registry_id text,
  p_days_back integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_days_back, 90), 1);
  v_from date := CURRENT_DATE - v_days;
  v_count bigint := 0;
  v_order record;
  v_lab record;
BEGIN
  IF p_tenant_id IS NULL OR btrim(COALESCE(p_registry_id, '')) = '' THEN
    RAISE EXCEPTION 'rebuild_args_required';
  END IF;

  PERFORM public._proj_assert_refresh_access_v1(p_tenant_id);

  IF p_registry_id = 'PRJ-ORD-ORDER-v1' THEN
    FOR v_order IN
      SELECT DISTINCT ON (btrim(COALESCE(o.order_id, o.id::text)))
        btrim(COALESCE(o.order_id, o.id::text)) AS business_order_id
      FROM public.orders o
      WHERE o.tenant_id = p_tenant_id
        AND (
          o.order_date IS NULL
          OR o.order_date >= v_from
          OR o.created_at >= v_from::timestamptz
        )
      ORDER BY btrim(COALESCE(o.order_id, o.id::text)), o.created_at DESC NULLS LAST
    LOOP
      PERFORM public.refresh_proj_order_row_v1(p_tenant_id, v_order.business_order_id, false);
      v_count := v_count + 1;
    END LOOP;
    PERFORM public._proj_touch_meta_v1(p_tenant_id, p_registry_id, v_count, NULL);
    PERFORM public.refresh_proj_tenant_order_metrics_v1(p_tenant_id, v_days);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', v_count);

  ELSIF p_registry_id = 'PRJ-COL-LAB-v1' THEN
    FOR v_lab IN
      SELECT DISTINCT public.primecare_normalize_lab_id(ar.lab_id) AS lab_id
      FROM public.ar_credit_control ar
      WHERE ar.tenant_id = p_tenant_id
        AND public.primecare_normalize_lab_id(ar.lab_id) IS NOT NULL
    LOOP
      PERFORM public.refresh_proj_lab_receivable_row_v1(p_tenant_id, v_lab.lab_id, false);
      v_count := v_count + 1;
    END LOOP;
    PERFORM public._proj_touch_meta_v1(p_tenant_id, p_registry_id, v_count, NULL);
    PERFORM public.refresh_proj_tenant_receivable_metrics_v1(p_tenant_id, v_days);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', v_count);

  ELSIF p_registry_id = 'PRJ-LAB-PROFILE-v1' THEN
    FOR v_lab IN
      SELECT DISTINCT public.primecare_normalize_lab_id(l.lab_id) AS lab_id
      FROM public.labs l
      WHERE l.tenant_id = p_tenant_id
        AND public.primecare_normalize_lab_id(l.lab_id) IS NOT NULL
      ORDER BY public.primecare_normalize_lab_id(l.lab_id)
    LOOP
      PERFORM public.refresh_proj_lab_profile_row_v1(p_tenant_id, v_lab.lab_id);
      v_count := v_count + 1;
    END LOOP;
    PERFORM public._proj_touch_meta_v1(p_tenant_id, p_registry_id, v_count, NULL);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', v_count);

  ELSIF p_registry_id = 'PRJ-ORD-METRICS-v1' THEN
    PERFORM public.refresh_proj_tenant_order_metrics_v1(p_tenant_id, v_days);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', 1);

  ELSIF p_registry_id = 'PRJ-COL-METRICS-v1' THEN
    PERFORM public.refresh_proj_tenant_receivable_metrics_v1(p_tenant_id, v_days);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', 1);

  ELSIF p_registry_id = 'PRJ-DSH-METRICS-v1' THEN
    PERFORM public.refresh_proj_tenant_dashboard_metrics_v1(p_tenant_id, v_days);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', 1);

  ELSIF p_registry_id = 'PRJ-EXE-METRICS-v1' THEN
    PERFORM public.refresh_proj_tenant_executive_metrics_v1(p_tenant_id);
    RETURN jsonb_build_object('success', true, 'registry_id', p_registry_id, 'row_count', 1);
  END IF;

  RAISE EXCEPTION 'unsupported_registry_id';
END;
$$;

-- ---------------------------------------------------------------------------
-- read_labs_list_v1 — read adapter (SECURITY INVOKER + projection RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.read_labs_list_v1(
  p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 5000);
  v_rows jsonb;
  v_as_of timestamptz;
  v_profile_as_of timestamptz;
  v_receivable_as_of timestamptz;
  v_count integer := 0;
BEGIN
  SELECT COALESCE(MAX(p.refreshed_at), now()) INTO v_profile_as_of
  FROM public.proj_lab_profile_v1 p;

  SELECT MAX(r.refreshed_at) INTO v_receivable_as_of
  FROM public.proj_lab_receivable_v1 r;

  v_as_of := LEAST(v_profile_as_of, COALESCE(v_receivable_as_of, v_profile_as_of));

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      p.tenant_id,
      p.lab_id,
      p.lab_name,
      p.owner_name,
      p.phone,
      p.area,
      p.status,
      p.assigned_agent_id,
      p.assigned_agent_name,
      p.primary_agent_id,
      p.primary_agent_name,
      p.secondary_agent_id,
      p.secondary_agent_name,
      p.manager_id,
      p.ownership_status,
      p.qualification_status,
      p.qualification_stage,
      p.qualification_score,
      p.next_follow_up,
      p.distributor_id,
      p.distributor_name,
      p.ordering_mode,
      COALESCE(r.outstanding_amount, 0) AS outstanding,
      COALESCE(r.credit_limit, 0) AS credit_limit,
      COALESCE(r.overdue_days, 0) AS days_overdue,
      COALESCE(r.allowed_overdue_days, 15) AS allowed_overdue_days,
      public._proj_credit_hold_bool_v1(r.credit_hold) AS credit_hold,
      public._proj_credit_status_v1(
        COALESCE(r.outstanding_amount, 0),
        COALESCE(r.credit_limit, 0),
        COALESCE(r.overdue_days, 0),
        COALESCE(r.allowed_overdue_days, 15),
        r.credit_hold
      ) AS credit_status,
      CASE
        WHEN p.ordering_mode IN ('hybrid', 'self_service')
          AND NOT public._proj_credit_hold_bool_v1(r.credit_hold) THEN true
        ELSE false
      END AS ordering_eligible,
      p.refreshed_at AS profile_refreshed_at,
      r.refreshed_at AS receivable_refreshed_at
    FROM public.proj_lab_profile_v1 p
    LEFT JOIN public.proj_lab_receivable_v1 r
      ON r.tenant_id = p.tenant_id
     AND public.primecare_normalize_lab_id(r.lab_id) = public.primecare_normalize_lab_id(p.lab_id)
    ORDER BY p.lab_name, p.lab_id
    LIMIT v_limit
  ) t;

  v_count := COALESCE(jsonb_array_length(v_rows), 0);

  RETURN jsonb_build_object(
    'success', true,
    'readFailed', false,
    'projection', true,
    'registry_id', 'PRJ-LAB-PROFILE-v1',
    'composed_registry_ids', jsonb_build_array('PRJ-LAB-PROFILE-v1', 'PRJ-COL-LAB-v1'),
    'as_of', v_as_of,
    'staleness_ms', GREATEST(0, (EXTRACT(EPOCH FROM (now() - v_as_of)) * 1000)::bigint),
    'data', v_rows,
    'meta', jsonb_build_object(
      'rawRowCount', v_count,
      'mappedRowCount', v_count,
      'limit', v_limit,
      'hasMore', v_count >= v_limit
    )
  );
END;
$$;

GRANT SELECT ON public.proj_lab_profile_v1 TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_lab_profile_row_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_proj_lab_receivable_row_v1(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_labs_list_v1(integer) TO authenticated;

COMMENT ON FUNCTION public.read_labs_list_v1(integer) IS
  'Labs list adapter composed from proj_lab_profile_v1 and proj_lab_receivable_v1. Shadow mode until VITE_READ_ADAPTER_LABS_V1 is approved.';
