-- Sprint 8A — Labs projection adapter performance fix.
-- Adds join indexes and tenant-scoped filtering while preserving RLS semantics.

CREATE INDEX IF NOT EXISTS idx_proj_lab_profile_v1_tenant_norm_lab
  ON public.proj_lab_profile_v1 (tenant_id, public.primecare_normalize_lab_id(lab_id));

CREATE INDEX IF NOT EXISTS idx_proj_lab_recv_v1_tenant_norm_lab
  ON public.proj_lab_receivable_v1 (tenant_id, public.primecare_normalize_lab_id(lab_id));

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
  v_is_executive boolean := public.current_user_role() = 'executive';
BEGIN
  SELECT COALESCE(MAX(p.refreshed_at), now()) INTO v_profile_as_of
  FROM public.proj_lab_profile_v1 p
  WHERE v_is_executive OR public.tenant_id_matches(p.tenant_id);

  SELECT MAX(r.refreshed_at) INTO v_receivable_as_of
  FROM public.proj_lab_receivable_v1 r
  WHERE v_is_executive OR public.tenant_id_matches(r.tenant_id);

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
    WHERE v_is_executive OR public.tenant_id_matches(p.tenant_id)
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

COMMENT ON FUNCTION public.read_labs_list_v1(integer) IS
  'Labs list adapter composed from proj_lab_profile_v1 and proj_lab_receivable_v1. Tenant-scoped for QA shadow performance; RLS remains authoritative.';
