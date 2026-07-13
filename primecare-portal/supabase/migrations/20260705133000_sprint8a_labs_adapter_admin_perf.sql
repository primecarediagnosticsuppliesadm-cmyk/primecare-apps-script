-- Sprint 8A — Labs adapter admin fast path.
-- Admin visibility in distributor_lab_record_visible is equivalent to own-tenant
-- lab visibility. Use that simple predicate for admin while preserving the
-- generic helper for agent/lab/distributor and executive roles.

CREATE OR REPLACE FUNCTION public._read_labs_adapter_visible_v1(
  p_role text,
  p_current_tenant_id uuid,
  p_tenant_id uuid,
  p_lab_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_role = 'admin' THEN p_tenant_id = p_current_tenant_id
    ELSE public.distributor_lab_record_visible(p_tenant_id, p_lab_id)
  END;
$$;

CREATE OR REPLACE FUNCTION public.read_labs_list_v1(
  p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 5000);
  v_rows jsonb;
  v_as_of timestamptz;
  v_profile_as_of timestamptz;
  v_receivable_as_of timestamptz;
  v_count integer := 0;
  v_role text := public.current_user_role();
  v_tenant_id uuid := public.current_tenant_id();
BEGIN
  SELECT COALESCE(MAX(p.refreshed_at), now()) INTO v_profile_as_of
  FROM public.proj_lab_profile_v1 p
  WHERE public._read_labs_adapter_visible_v1(v_role, v_tenant_id, p.tenant_id, p.lab_id);

  SELECT MAX(r.refreshed_at) INTO v_receivable_as_of
  FROM public.proj_lab_receivable_v1 r
  WHERE public._read_labs_adapter_visible_v1(v_role, v_tenant_id, r.tenant_id, r.lab_id);

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
     AND r.lab_id = p.lab_id
    WHERE public._read_labs_adapter_visible_v1(v_role, v_tenant_id, p.tenant_id, p.lab_id)
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

GRANT EXECUTE ON FUNCTION public._read_labs_adapter_visible_v1(text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_labs_list_v1(integer) TO authenticated;

COMMENT ON FUNCTION public._read_labs_adapter_visible_v1(text, uuid, uuid, text) IS
  'Visibility helper for read_labs_list_v1. Admin own-tenant fast path; all other roles use distributor_lab_record_visible.';
