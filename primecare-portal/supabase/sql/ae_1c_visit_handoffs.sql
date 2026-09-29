-- AE-1C Second Move — visit_handoffs ownership workflow.
-- Additive. QA apply only. Do NOT apply to Production from this slice.
-- Visit remains evidence. Handoff is ownership. Orders remain financial truth.
-- No selling_price, quote_amount, revenue, collection, invoice, margin, or cost.

CREATE TABLE IF NOT EXISTS public.visit_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  visit_uuid uuid NOT NULL,
  lab_id text NOT NULL,
  agent_id text NOT NULL,
  trigger_outcome text NOT NULL,
  status text NOT NULL,
  owner text,
  requirement_summary text NOT NULL,
  needed_by date,
  hq_response text,
  hq_responded_at timestamptz,
  hq_responded_by uuid,
  close_reason text,
  close_note text,
  closed_at timestamptz,
  closed_by uuid,
  order_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_handoffs_visit_tenant_fkey
    FOREIGN KEY (visit_uuid, tenant_id)
    REFERENCES public.agent_visits (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT visit_handoffs_visit_uuid_key UNIQUE (visit_uuid),
  CONSTRAINT visit_handoffs_trigger_outcome_check CHECK (
    trigger_outcome IN ('REQUIREMENT', 'QUOTE_OPPORTUNITY')
  ),
  CONSTRAINT visit_handoffs_status_check CHECK (
    status IN ('OPEN_HQ', 'HQ_RESPONDED', 'CLOSED')
  ),
  CONSTRAINT visit_handoffs_owner_check CHECK (
    owner IS NULL OR owner IN ('HQ', 'AGENT')
  ),
  CONSTRAINT visit_handoffs_state_check CHECK (
    (
      status = 'OPEN_HQ'
      AND owner = 'HQ'
      AND closed_at IS NULL
      AND close_reason IS NULL
    )
    OR (
      status = 'HQ_RESPONDED'
      AND owner = 'AGENT'
      AND hq_response IS NOT NULL
      AND btrim(hq_response) <> ''
      AND hq_responded_at IS NOT NULL
      AND closed_at IS NULL
      AND close_reason IS NULL
    )
    OR (
      status = 'CLOSED'
      AND owner IS NULL
      AND closed_at IS NOT NULL
      AND close_reason IS NOT NULL
    )
  ),
  CONSTRAINT visit_handoffs_close_reason_check CHECK (
    close_reason IS NULL
    OR close_reason IN (
      'CONVERTED',
      'PRICE',
      'AVAILABILITY',
      'CREDIT',
      'COMPETITOR_RELATIONSHIP',
      'SPEC_MISMATCH',
      'RESPONSE_DELAY',
      'NO_LONGER_REQUIRED',
      'OTHER'
    )
  ),
  CONSTRAINT visit_handoffs_requirement_summary_check CHECK (
    btrim(requirement_summary) <> ''
  )
);

COMMENT ON TABLE public.visit_handoffs IS
  'AE-1C: one ownership handoff per qualifying visit. Not a ticket, quote, or order.';
COMMENT ON COLUMN public.visit_handoffs.requirement_summary IS
  'Agent-confirmed ask to PrimeCare. Not a catalog quote or financial amount.';
COMMENT ON COLUMN public.visit_handoffs.order_id IS
  'Optional reference to an existing canonical order. Never creates an order.';
COMMENT ON COLUMN public.visit_handoffs.close_note IS
  'Required only when close_reason = OTHER.';

CREATE INDEX IF NOT EXISTS visit_handoffs_tenant_status_idx
  ON public.visit_handoffs (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS visit_handoffs_tenant_agent_idx
  ON public.visit_handoffs (tenant_id, agent_id, status);

DROP TRIGGER IF EXISTS visit_handoffs_set_updated_at ON public.visit_handoffs;
CREATE TRIGGER visit_handoffs_set_updated_at
  BEFORE UPDATE ON public.visit_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.visit_handoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visit_handoffs_select_by_role" ON public.visit_handoffs;
DROP POLICY IF EXISTS "visit_handoffs_insert_deny" ON public.visit_handoffs;
DROP POLICY IF EXISTS "visit_handoffs_update_deny" ON public.visit_handoffs;
DROP POLICY IF EXISTS "visit_handoffs_delete_deny" ON public.visit_handoffs;

CREATE POLICY "visit_handoffs_select_by_role"
  ON public.visit_handoffs FOR SELECT TO authenticated
  USING (
    public.tenant_id_matches(tenant_id)
    AND (
      public.is_admin_or_executive()
      OR (
        public.current_user_role() = 'agent'
        AND agent_id = public.current_profile_agent_id()
        AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
      )
    )
  );

CREATE POLICY "visit_handoffs_insert_deny"
  ON public.visit_handoffs FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE POLICY "visit_handoffs_update_deny"
  ON public.visit_handoffs FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "visit_handoffs_delete_deny"
  ON public.visit_handoffs FOR DELETE TO authenticated
  USING (false);

REVOKE ALL ON TABLE public.visit_handoffs FROM PUBLIC;
REVOKE ALL ON TABLE public.visit_handoffs FROM anon;
GRANT SELECT ON TABLE public.visit_handoffs TO authenticated;
GRANT ALL ON TABLE public.visit_handoffs TO service_role;

CREATE OR REPLACE FUNCTION public.visit_handoff_row_json(p_row public.visit_handoffs)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'tenant_id', p_row.tenant_id,
    'visit_uuid', p_row.visit_uuid,
    'lab_id', p_row.lab_id,
    'agent_id', p_row.agent_id,
    'trigger_outcome', p_row.trigger_outcome,
    'status', p_row.status,
    'owner', p_row.owner,
    'requirement_summary', p_row.requirement_summary,
    'needed_by', p_row.needed_by,
    'hq_response', p_row.hq_response,
    'hq_responded_at', p_row.hq_responded_at,
    'hq_responded_by', p_row.hq_responded_by,
    'close_reason', p_row.close_reason,
    'close_note', p_row.close_note,
    'closed_at', p_row.closed_at,
    'closed_by', p_row.closed_by,
    'order_id', p_row.order_id,
    'created_at', p_row.created_at,
    'created_by', p_row.created_by,
    'updated_at', p_row.updated_at
  );
$$;

CREATE OR REPLACE FUNCTION public.create_visit_handoff(
  p_visit_uuid uuid,
  p_requirement_summary text,
  p_needed_by date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_visit public.agent_visits%ROWTYPE;
  v_summary text;
  v_outcome text;
  v_existing public.visit_handoffs%ROWTYPE;
  v_row public.visit_handoffs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = v_uid AND p.active IS TRUE
  LIMIT 1;
  IF NOT FOUND OR lower(btrim(COALESCE(v_profile.role, ''))) IS DISTINCT FROM 'agent' THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;
  IF nullif(btrim(COALESCE(v_profile.agent_id, '')), '') IS NULL OR v_profile.tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  v_summary := nullif(btrim(COALESCE(p_requirement_summary, '')), '');
  IF v_summary IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'blank_requirement');
  END IF;

  IF p_visit_uuid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'visit_not_found');
  END IF;

  SELECT * INTO v_visit
  FROM public.agent_visits v
  WHERE v.id = p_visit_uuid
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'visit_not_found');
  END IF;

  IF v_visit.tenant_id IS DISTINCT FROM v_profile.tenant_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  IF NOT public.agent_visit_row_writable_by_current_agent(
    v_visit.tenant_id,
    v_visit.lab_id,
    v_visit.agent_id,
    v_visit.agent_name
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  IF nullif(btrim(COALESCE(v_visit.agent_id, '')), '') IS DISTINCT FROM nullif(btrim(v_profile.agent_id), '') THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  v_outcome := upper(btrim(COALESCE(v_visit.commercial_outcome, '')));
  IF v_outcome NOT IN ('REQUIREMENT', 'QUOTE_OPPORTUNITY') THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_outcome');
  END IF;

  SELECT * INTO v_existing
  FROM public.visit_handoffs h
  WHERE h.visit_uuid = v_visit.id
  LIMIT 1;

  IF FOUND THEN
    IF v_existing.agent_id IS DISTINCT FROM v_profile.agent_id
       OR v_existing.tenant_id IS DISTINCT FROM v_profile.tenant_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'forbidden');
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'code', 'already_exists',
      'handoff', public.visit_handoff_row_json(v_existing)
    );
  END IF;

  INSERT INTO public.visit_handoffs (
    tenant_id,
    visit_uuid,
    lab_id,
    agent_id,
    trigger_outcome,
    status,
    owner,
    requirement_summary,
    needed_by,
    created_by
  ) VALUES (
    v_visit.tenant_id,
    v_visit.id,
    v_visit.lab_id,
    v_visit.agent_id,
    v_outcome,
    'OPEN_HQ',
    'HQ',
    v_summary,
    p_needed_by,
    v_uid
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'created',
    'handoff', public.visit_handoff_row_json(v_row)
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.visit_handoffs h
    WHERE h.visit_uuid = p_visit_uuid
    LIMIT 1;
    IF FOUND AND v_existing.agent_id = v_profile.agent_id AND v_existing.tenant_id = v_profile.tenant_id THEN
      RETURN jsonb_build_object(
        'success', true,
        'code', 'already_exists',
        'handoff', public.visit_handoff_row_json(v_existing)
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_visit_handoff(
  p_handoff_id uuid,
  p_hq_response text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_row public.visit_handoffs%ROWTYPE;
  v_response text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = v_uid AND p.active IS TRUE
  LIMIT 1;
  IF NOT FOUND OR NOT public.is_admin_or_executive() THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  v_response := nullif(btrim(COALESCE(p_hq_response, '')), '');
  IF v_response IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'blank_response');
  END IF;

  UPDATE public.visit_handoffs
  SET
    hq_response = v_response,
    hq_responded_at = now(),
    hq_responded_by = v_uid,
    status = 'HQ_RESPONDED',
    owner = 'AGENT'
  WHERE id = p_handoff_id
    AND tenant_id = v_profile.tenant_id
    AND status = 'OPEN_HQ'
    AND owner = 'HQ'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row FROM public.visit_handoffs WHERE id = p_handoff_id LIMIT 1;
    IF NOT FOUND OR v_row.tenant_id IS DISTINCT FROM v_profile.tenant_id THEN
      RETURN jsonb_build_object('success', false, 'code', 'forbidden');
    END IF;
    RETURN jsonb_build_object(
      'success', false,
      'code', 'already_responded',
      'handoff', public.visit_handoff_row_json(v_row)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', 'responded',
    'handoff', public.visit_handoff_row_json(v_row)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_visit_handoff(
  p_handoff_id uuid,
  p_action text,
  p_loss_reason text DEFAULT NULL,
  p_order_id text DEFAULT NULL,
  p_next_follow_up_date date DEFAULT NULL,
  p_next_action text DEFAULT NULL,
  p_close_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_row public.visit_handoffs%ROWTYPE;
  v_action text;
  v_loss text;
  v_order text;
  v_note text;
  v_updated public.visit_handoffs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = v_uid AND p.active IS TRUE
  LIMIT 1;
  IF NOT FOUND OR lower(btrim(COALESCE(v_profile.role, ''))) IS DISTINCT FROM 'agent' THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  v_action := upper(btrim(COALESCE(p_action, '')));
  IF v_action NOT IN ('FOLLOWED_UP', 'CONVERTED', 'NOT_PROCEEDING') THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_action');
  END IF;

  SELECT * INTO v_row
  FROM public.visit_handoffs h
  WHERE h.id = p_handoff_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  IF v_row.tenant_id IS DISTINCT FROM v_profile.tenant_id
     OR v_row.agent_id IS DISTINCT FROM v_profile.agent_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  IF NOT public.lab_record_is_visible_to_current_user(v_row.tenant_id, v_row.lab_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  IF v_row.status IS DISTINCT FROM 'HQ_RESPONDED' OR v_row.owner IS DISTINCT FROM 'AGENT' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'stale_or_closed',
      'handoff', public.visit_handoff_row_json(v_row)
    );
  END IF;

  IF v_action = 'FOLLOWED_UP' THEN
    IF p_next_follow_up_date IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'follow_up_date_required');
    END IF;
    UPDATE public.agent_visits
    SET
      follow_up_required = true,
      next_follow_up_date = p_next_follow_up_date,
      next_follow_up_type = COALESCE(nullif(btrim(next_follow_up_type), ''), 'Call'),
      next_action = COALESCE(nullif(btrim(COALESCE(p_next_action, '')), ''), next_action)
    WHERE id = v_row.visit_uuid
      AND tenant_id = v_row.tenant_id;

    SELECT * INTO v_updated FROM public.visit_handoffs WHERE id = v_row.id;
    RETURN jsonb_build_object(
      'success', true,
      'code', 'followed_up',
      'handoff', public.visit_handoff_row_json(v_updated)
    );
  END IF;

  IF v_action = 'CONVERTED' THEN
    v_order := nullif(btrim(COALESCE(p_order_id, '')), '');
    IF v_order IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE o.order_id = v_order
          AND o.tenant_id = v_row.tenant_id
          AND public.primecare_normalize_lab_id(o.lab_id) = public.primecare_normalize_lab_id(v_row.lab_id)
      ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'invalid_order');
      END IF;
    END IF;

    UPDATE public.visit_handoffs
    SET
      status = 'CLOSED',
      owner = NULL,
      close_reason = 'CONVERTED',
      close_note = NULL,
      order_id = v_order,
      closed_at = now(),
      closed_by = v_uid
    WHERE id = v_row.id
      AND status = 'HQ_RESPONDED'
      AND owner = 'AGENT'
    RETURNING * INTO v_updated;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'code', 'stale_or_closed');
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'code', 'converted',
      'handoff', public.visit_handoff_row_json(v_updated)
    );
  END IF;

  v_loss := upper(btrim(COALESCE(p_loss_reason, '')));
  IF v_loss NOT IN (
    'PRICE',
    'AVAILABILITY',
    'CREDIT',
    'COMPETITOR_RELATIONSHIP',
    'SPEC_MISMATCH',
    'RESPONSE_DELAY',
    'NO_LONGER_REQUIRED',
    'OTHER'
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_loss_reason');
  END IF;
  v_note := nullif(btrim(COALESCE(p_close_note, '')), '');
  IF v_loss = 'OTHER' AND v_note IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'other_note_required');
  END IF;

  UPDATE public.visit_handoffs
  SET
    status = 'CLOSED',
    owner = NULL,
    close_reason = v_loss,
    close_note = CASE WHEN v_loss = 'OTHER' THEN v_note ELSE NULL END,
    closed_at = now(),
    closed_by = v_uid
  WHERE id = v_row.id
    AND status = 'HQ_RESPONDED'
    AND owner = 'AGENT'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'stale_or_closed');
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'code', 'not_proceeding',
    'handoff', public.visit_handoff_row_json(v_updated)
  );
END;
$$;

ALTER FUNCTION public.create_visit_handoff(uuid, text, date) OWNER TO postgres;
ALTER FUNCTION public.respond_visit_handoff(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.resolve_visit_handoff(uuid, text, text, text, date, text, text) OWNER TO postgres;
ALTER FUNCTION public.visit_handoff_row_json(public.visit_handoffs) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_visit_handoff(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_visit_handoff(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_visit_handoff(uuid, text, text, text, date, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.visit_handoff_row_json(public.visit_handoffs) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_visit_handoff(uuid, text, date) FROM anon;
REVOKE ALL ON FUNCTION public.respond_visit_handoff(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_visit_handoff(uuid, text, text, text, date, text, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_visit_handoff(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_visit_handoff(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_visit_handoff(uuid, text, text, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visit_handoff_row_json(public.visit_handoffs) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_visit_handoff(uuid, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_visit_handoff(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_visit_handoff(uuid, text, text, text, date, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.visit_handoff_row_json(public.visit_handoffs) TO service_role;

COMMENT ON FUNCTION public.create_visit_handoff(uuid, text, date) IS
  'AE-1C: Agent send-to-PrimeCare. Stamps tenant/lab/agent/outcome from the visit. Idempotent on visit_uuid.';
COMMENT ON FUNCTION public.respond_visit_handoff(uuid, text) IS
  'AE-1C: HQ Admin/Executive response. OPEN_HQ only. Does not overwrite a prior response.';
COMMENT ON FUNCTION public.resolve_visit_handoff(uuid, text, text, text, date, text, text) IS
  'AE-1C: Agent FOLLOWED_UP keeps HQ_RESPONDED; CONVERTED/NOT_PROCEEDING close. Never creates an order.';
