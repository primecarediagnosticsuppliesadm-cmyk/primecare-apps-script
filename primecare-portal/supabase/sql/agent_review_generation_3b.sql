-- GATE 3B. QA only. Do not apply to Production. Do not db push.
-- Evidence builder and review generator. Does not build UI or analysis.
-- Does not insert a production subject review or a September 2026 cycle.

CREATE OR REPLACE FUNCTION public.agent_review_business_date(p_ts timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_ts IS NULL THEN NULL
    ELSE (p_ts AT TIME ZONE 'Asia/Kolkata')::date
  END;
$$;

COMMENT ON FUNCTION public.agent_review_business_date(timestamptz) IS
  'India field business date. Inclusive review periods use this date, not the browser timezone.';

CREATE OR REPLACE FUNCTION public.agent_review_metric(
  p_key text,
  p_availability text,
  p_reliability text,
  p_source text,
  p_value jsonb,
  p_reason_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'metric_key', p_key,
    'availability', p_availability,
    'reliability', p_reliability,
    'source', p_source,
    'semantics', p_availability,
    'reason_code', p_reason_code,
    'value', CASE
      WHEN p_availability = 'UNAVAILABLE' OR p_reliability = 'UNAVAILABLE' THEN NULL
      ELSE p_value
    END
  ));
$$;

CREATE OR REPLACE FUNCTION public.agent_review_render_placeholders(p_text text, p_evidence jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_metric jsonb;
  v_token text;
  v_rendered text := coalesce(p_text, '');
  v_known text[] := ARRAY[
    'prospects_sourced',
    'visits_authored',
    'unique_labs_visited',
    'labs_with_repeat_visits_in_period',
    'visits_with_notes',
    'visits_with_next_action',
    'visits_with_scheduled_follow_up'
  ];
BEGIN
  IF p_evidence IS NULL OR jsonb_typeof(p_evidence) <> 'object' THEN
    RAISE EXCEPTION 'review_placeholder_evidence_missing';
  END IF;

  FOR v_key IN
    SELECT match[1]
    FROM regexp_matches(v_rendered, '\{\{([A-Za-z0-9_]+)\}\}', 'g') AS match
  LOOP
    IF NOT (v_key = ANY (v_known)) THEN
      RAISE EXCEPTION 'review_placeholder_unknown';
    END IF;
    SELECT value INTO v_metric
    FROM jsonb_array_elements(coalesce(p_evidence -> 'metrics', '[]'::jsonb)) AS value
    WHERE value ->> 'metric_key' = v_key
    LIMIT 1;
    IF v_metric IS NULL THEN
      RAISE EXCEPTION 'review_placeholder_missing';
    END IF;
    IF upper(coalesce(v_metric ->> 'availability', '')) = 'UNAVAILABLE'
       OR upper(coalesce(v_metric ->> 'reliability', '')) = 'UNAVAILABLE'
       OR v_metric -> 'value' IS NULL
       OR v_metric -> 'value' = 'null'::jsonb THEN
      v_token := 'not available in PrimeCare for this review period';
    ELSIF jsonb_typeof(v_metric -> 'value') = 'number' THEN
      v_token := v_metric ->> 'value';
    ELSE
      RAISE EXCEPTION 'review_placeholder_not_scalar';
    END IF;
    v_rendered := replace(v_rendered, '{{' || v_key || '}}', v_token);
  END LOOP;

  IF position('{{' IN v_rendered) > 0 OR position('}}' IN v_rendered) > 0 THEN
    RAISE EXCEPTION 'review_placeholder_unresolved';
  END IF;
  RETURN v_rendered;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_review_build_evidence(
  p_subject_agent_id text,
  p_period_start date,
  p_period_end date,
  p_review_type text
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_agent text;
  v_matches int;
  v_evidence jsonb;
BEGIN
  IF NOT public.is_admin_or_executive() THEN
    RAISE EXCEPTION 'review_generate_forbidden';
  END IF;
  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RAISE EXCEPTION 'review_period_invalid';
  END IF;
  IF p_review_type NOT IN ('FIRST_MONTH', 'MONTHLY', 'QUARTERLY', 'ANNUAL') THEN
    RAISE EXCEPTION 'review_type_invalid';
  END IF;

  v_tenant := public.current_tenant_id();
  SELECT count(*) INTO v_matches
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant
    AND upper(btrim(coalesce(p.agent_id, ''))) = upper(btrim(coalesce(p_subject_agent_id, '')))
    AND lower(p.role) = 'agent'
    AND coalesce(p.active, false);
  IF v_matches <> 1 THEN
    RAISE EXCEPTION 'review_subject_not_in_tenant';
  END IF;

  SELECT p.agent_id INTO v_agent
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant
    AND upper(btrim(coalesce(p.agent_id, ''))) = upper(btrim(coalesce(p_subject_agent_id, '')))
    AND lower(p.role) = 'agent'
    AND coalesce(p.active, false);

  WITH visits AS (
    SELECT
      v.id,
      v.lab_id,
      public.agent_review_business_date(v.visit_date) AS business_date,
      nullif(btrim(v.visit_type), '') AS visit_type,
      (nullif(btrim(v.notes), '') IS NOT NULL) AS has_note,
      nullif(btrim(v.next_action), '') AS next_action,
      v.next_follow_up_date,
      nullif(btrim(v.next_follow_up_type), '') AS next_follow_up_type
    FROM public.agent_visits v
    WHERE v.tenant_id = v_tenant
      AND upper(btrim(coalesce(v.agent_id, ''))) = upper(btrim(v_agent))
      AND public.agent_review_business_date(v.visit_date) BETWEEN p_period_start AND p_period_end
  ),
  prospects AS (
    SELECT
      l.lab_id,
      l.lab_name,
      public.agent_review_business_date(l.created_at) AS sourced_on
    FROM public.labs l
    WHERE l.tenant_id = v_tenant
      AND upper(btrim(coalesce(l.sourced_by_agent_id, ''))) = upper(btrim(v_agent))
      AND public.agent_review_business_date(l.created_at) BETWEEN p_period_start AND p_period_end
  ),
  repeat_labs AS (
    SELECT lab_id, count(*) AS visit_count
    FROM visits
    GROUP BY lab_id
    HAVING count(*) > 1
  ),
  type_counts AS (
    SELECT coalesce((
      SELECT jsonb_object_agg(g.visit_type, g.n)
      FROM (
        SELECT coalesce(visit_type, 'UNSPECIFIED') AS visit_type, count(*)::int AS n
        FROM visits
        GROUP BY 1
      ) g
    ), '{}'::jsonb) AS counts
  )
  SELECT jsonb_build_object(
    'subject_agent_id', v_agent,
    'review_type', p_review_type,
    'time_zone', 'Asia/Kolkata',
    'period_start', p_period_start,
    'period_end', p_period_end,
    'metrics', jsonb_build_array(
      public.agent_review_metric('prospects_sourced', 'HISTORICAL', 'HIGH', 'labs.sourced_by_agent_id + created_at', to_jsonb((SELECT count(*) FROM prospects)), NULL),
      public.agent_review_metric('visits_authored', 'HISTORICAL', 'HIGH', 'agent_visits.agent_id + visit_date', to_jsonb((SELECT count(*) FROM visits)), NULL),
      public.agent_review_metric('unique_labs_visited', 'HISTORICAL', 'HIGH', 'agent_visits.lab_id', to_jsonb((SELECT count(DISTINCT lab_id) FROM visits)), NULL),
      public.agent_review_metric('labs_with_repeat_visits_in_period', 'HISTORICAL', 'HIGH', 'agent_visits.lab_id grouped in period', to_jsonb((SELECT count(*) FROM repeat_labs)), NULL),
      public.agent_review_metric('visit_type_counts', 'HISTORICAL', 'HIGH', 'agent_visits.visit_type', (SELECT counts FROM type_counts), NULL),
      public.agent_review_metric('visits_with_notes', 'HISTORICAL', 'HIGH', 'agent_visits.notes', to_jsonb((SELECT count(*) FROM visits WHERE has_note)), NULL),
      public.agent_review_metric('visits_with_next_action', 'HISTORICAL', 'HIGH', 'agent_visits.next_action', to_jsonb((SELECT count(*) FROM visits WHERE next_action IS NOT NULL)), NULL),
      public.agent_review_metric('visits_with_scheduled_follow_up', 'HISTORICAL', 'HIGH', 'agent_visits.next_follow_up_date', to_jsonb((SELECT count(*) FROM visits WHERE next_follow_up_date IS NOT NULL)), NULL),
      public.agent_review_metric('follow_up_completion_rate', 'UNAVAILABLE', 'UNAVAILABLE', 'no completed follow-up fact', NULL, 'NO_CERTIFIED_HISTORICAL_SOURCE'),
      public.agent_review_metric('commercial_outcome', 'UNAVAILABLE', 'UNAVAILABLE', 'agent_visits.commercial_outcome', NULL, 'NO_CERTIFIED_HISTORICAL_SOURCE'),
      public.agent_review_metric('discovery_lines', 'UNAVAILABLE', 'UNAVAILABLE', 'agent_visit_discovery_lines', NULL, 'NO_CERTIFIED_HISTORICAL_SOURCE'),
      public.agent_review_metric('decision_maker_coverage', 'UNAVAILABLE', 'UNAVAILABLE', 'agent_visits.decision_maker_met', NULL, 'NO_CERTIFIED_HISTORICAL_SOURCE'),
      public.agent_review_metric('wallet', 'UNAVAILABLE', 'UNAVAILABLE', 'agent_visits.wallet columns', NULL, 'NO_CERTIFIED_HISTORICAL_SOURCE'),
      public.agent_review_metric('complaint', 'UNAVAILABLE', 'UNAVAILABLE', 'agent_visits.top_complaint', NULL, 'NO_CERTIFIED_HISTORICAL_SOURCE'),
      public.agent_review_metric('qualification', 'UNAVAILABLE', 'UNAVAILABLE', 'lab_qualifications current snapshot', NULL, 'CURRENT_STATE_NOT_PERIOD'),
      public.agent_review_metric('personal_order_credit', 'UNAVAILABLE', 'UNAVAILABLE', 'orders.agent_id', NULL, 'BOOK_ORDERS_EXCLUDED'),
      public.agent_review_metric('personal_collection_credit', 'UNAVAILABLE', 'UNAVAILABLE', 'payments.agent_id', NULL, 'BOOK_COLLECTIONS_EXCLUDED')
    ),
    'support', jsonb_build_object(
      'prospects', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'lab_id', lab_id,
          'lab_name', lab_name,
          'sourced_on', sourced_on
        ) ORDER BY sourced_on, lab_id)
        FROM prospects
      ), '[]'::jsonb),
      'visits', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'visit_id', visits.id,
          'lab_id', visits.lab_id,
          'lab_name', (
            SELECT l.lab_name
            FROM public.labs l
            WHERE l.tenant_id = v_tenant
              AND l.lab_id = visits.lab_id
            LIMIT 1
          ),
          'visit_date', visits.business_date,
          'visit_type', visits.visit_type,
          'has_note', visits.has_note,
          'next_action', visits.next_action,
          'scheduled_follow_up_date', visits.next_follow_up_date,
          'scheduled_follow_up_type', visits.next_follow_up_type
        ) ORDER BY visits.business_date, visits.id)
        FROM visits
      ), '[]'::jsonb),
      'repeat_labs', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'lab_id', r.lab_id,
          'lab_name', (
            SELECT l.lab_name
            FROM public.labs l
            WHERE l.tenant_id = v_tenant
              AND l.lab_id = r.lab_id
            LIMIT 1
          ),
          'visit_count', r.visit_count
        ) ORDER BY r.visit_count DESC, r.lab_id)
        FROM repeat_labs r
      ), '[]'::jsonb)
    )
  ) INTO v_evidence;

  IF NOT public.agent_review_evidence_json_ok(v_evidence) THEN
    RAISE EXCEPTION 'review_evidence_invalid';
  END IF;
  RETURN v_evidence;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_review_generate_cycle(
  p_subject_agent_id text,
  p_period_start date,
  p_period_end date,
  p_template_key text
) RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_agent text;
  v_template_id uuid;
  v_review_type text;
  v_template_key text;
  v_template_version int;
  v_cycle uuid;
  v_status text;
  v_evidence jsonb;
  v_question_text text;
BEGIN
  IF NOT public.is_admin_or_executive() THEN
    RAISE EXCEPTION 'review_generate_forbidden';
  END IF;
  IF nullif(btrim(coalesce(p_template_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'review_template_not_found';
  END IF;

  v_tenant := public.current_tenant_id();
  SELECT t.id, t.review_type, t.template_key, t.version
    INTO v_template_id, v_review_type, v_template_key, v_template_version
  FROM public.agent_review_templates t
  WHERE t.tenant_id = v_tenant
    AND t.template_key = btrim(p_template_key)
    AND t.status = 'active'
  ORDER BY t.version DESC
  LIMIT 1;
  IF v_template_id IS NULL THEN
    RAISE EXCEPTION 'review_template_not_found';
  END IF;

  SELECT p.agent_id INTO v_agent
  FROM public.profiles p
  WHERE p.tenant_id = v_tenant
    AND upper(btrim(coalesce(p.agent_id, ''))) = upper(btrim(coalesce(p_subject_agent_id, '')))
    AND lower(p.role) = 'agent'
    AND coalesce(p.active, false);
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'review_subject_not_in_tenant';
  END IF;

  SELECT c.id, c.status INTO v_cycle, v_status
  FROM public.agent_review_cycles c
  WHERE c.tenant_id = v_tenant
    AND c.subject_agent_id = v_agent
    AND c.review_type = v_review_type
    AND c.period_start = p_period_start
    AND c.period_end = p_period_end;
  IF v_cycle IS NOT NULL THEN
    RETURN jsonb_build_object(
      'cycle_id', v_cycle,
      'status', v_status,
      'idempotent', true
    );
  END IF;

  v_evidence := public.agent_review_build_evidence(
    v_agent, p_period_start, p_period_end, v_review_type
  );

  FOR v_question_text IN
    SELECT q.question_text
    FROM public.agent_review_questions q
    WHERE q.template_id = v_template_id
      AND q.active
  LOOP
    PERFORM public.agent_review_render_placeholders(v_question_text, v_evidence);
  END LOOP;

  BEGIN
    INSERT INTO public.agent_review_cycles (
      tenant_id, subject_agent_id, review_type, period_start, period_end,
      template_id, template_key, template_version, created_by_user_id
    ) VALUES (
      v_tenant, v_agent, v_review_type, p_period_start, p_period_end,
      v_template_id, v_template_key, v_template_version, auth.uid()
    ) RETURNING id INTO v_cycle;

    INSERT INTO public.agent_review_evidence_snapshots (
      tenant_id, cycle_id, snapshot_version, period_start, period_end,
      evidence_json, created_by_user_id
    ) VALUES (
      v_tenant, v_cycle, 1, p_period_start, p_period_end, v_evidence, auth.uid()
    );

    INSERT INTO public.agent_review_question_instances (
      tenant_id, cycle_id, source_question_id, question_key, question_version,
      section, question_text, response_type, options_json, required, display_order,
      analysis_tags, audience, display_rule_json, selection_reason, selection_context_json
    )
    SELECT
      q.tenant_id, v_cycle, q.id, q.question_key, q.version,
      q.section, public.agent_review_render_placeholders(q.question_text, v_evidence),
      q.response_type, q.options_json, q.required, q.display_order,
      q.analysis_tags, q.audience, q.display_rule_json, 'CORE', '{}'::jsonb
    FROM public.agent_review_questions q
    WHERE q.template_id = v_template_id
      AND q.active
      AND q.display_rule_json = '{}'::jsonb;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_evidence -> 'metrics') AS metric
      WHERE metric ->> 'metric_key' = 'decision_maker_coverage'
        AND metric ->> 'availability' = 'UNAVAILABLE'
    ) THEN
      INSERT INTO public.agent_review_question_instances (
        tenant_id, cycle_id, question_key, question_version, section, question_text,
        response_type, required, display_order, audience, selection_reason, selection_context_json
      ) VALUES (
        v_tenant, v_cycle, 'ev_decision_maker_gap', 1, 'Evidence',
        'PrimeCare has no recorded structured decision-maker information for this review period. What made decision-maker information difficult to capture?',
        'LONG_TEXT', false, 200, 'AGENT', 'EVIDENCE_TRIGGERED',
        jsonb_build_object(
          'metric_key', 'decision_maker_coverage',
          'rule', 'UNAVAILABLE',
          'review_type', v_review_type
        )
      );
    END IF;

    INSERT INTO public.agent_review_question_instances (
      tenant_id, cycle_id, source_question_id, question_key, question_version,
      section, question_text, response_type, options_json, required, display_order,
      analysis_tags, audience, display_rule_json, selection_reason, selection_context_json
    )
    SELECT
      q.tenant_id, v_cycle, q.id, q.question_key, q.version,
      q.section, public.agent_review_render_placeholders(q.question_text, v_evidence),
      q.response_type, q.options_json, q.required, q.display_order,
      q.analysis_tags, q.audience, q.display_rule_json, 'CORE', '{}'::jsonb
    FROM public.agent_review_questions q
    WHERE q.template_id = v_template_id
      AND q.active
      AND q.display_rule_json <> '{}'::jsonb;

    IF EXISTS (
      SELECT 1
      FROM public.agent_review_question_instances i
      WHERE i.cycle_id = v_cycle
        AND i.question_text ~ '\{\{'
    ) THEN
      RAISE EXCEPTION 'review_placeholder_unresolved';
    END IF;

    UPDATE public.agent_review_cycles
    SET status = 'READY'
    WHERE id = v_cycle
    RETURNING status INTO v_status;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT c.id, c.status INTO v_cycle, v_status
      FROM public.agent_review_cycles c
      WHERE c.tenant_id = v_tenant
        AND c.subject_agent_id = v_agent
        AND c.review_type = v_review_type
        AND c.period_start = p_period_start
        AND c.period_end = p_period_end;
      IF v_cycle IS NULL THEN
        RAISE;
      END IF;
      RETURN jsonb_build_object('cycle_id', v_cycle, 'status', v_status, 'idempotent', true);
  END;

  RETURN jsonb_build_object(
    'cycle_id', v_cycle,
    'status', v_status,
    'snapshot_version', 1,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_review_append_evidence_snapshot(p_cycle_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_agent text;
  v_review_type text;
  v_start date;
  v_end date;
  v_status text;
  v_next int;
  v_evidence jsonb;
BEGIN
  IF NOT public.is_admin_or_executive() THEN
    RAISE EXCEPTION 'review_generate_forbidden';
  END IF;
  v_tenant := public.current_tenant_id();
  SELECT c.subject_agent_id, c.review_type, c.period_start, c.period_end, c.status
    INTO v_agent, v_review_type, v_start, v_end, v_status
  FROM public.agent_review_cycles c
  WHERE c.id = p_cycle_id
    AND c.tenant_id = v_tenant;
  IF v_agent IS NULL THEN
    RAISE EXCEPTION 'review_cycle_not_found';
  END IF;
  IF v_status = 'FINALIZED' THEN
    RAISE EXCEPTION 'review_snapshot_cycle_finalized';
  END IF;

  v_evidence := public.agent_review_build_evidence(v_agent, v_start, v_end, v_review_type);
  SELECT coalesce(max(snapshot_version), 0) + 1 INTO v_next
  FROM public.agent_review_evidence_snapshots
  WHERE cycle_id = p_cycle_id;

  INSERT INTO public.agent_review_evidence_snapshots (
    tenant_id, cycle_id, snapshot_version, period_start, period_end,
    evidence_json, created_by_user_id
  ) VALUES (
    v_tenant, p_cycle_id, v_next, v_start, v_end, v_evidence, auth.uid()
  );
  RETURN v_next;
END;
$$;

CREATE OR REPLACE FUNCTION public.agent_review_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'review_snapshot_immutable';
END;
$$;

DROP TRIGGER IF EXISTS agent_review_snapshot_immutable_trg ON public.agent_review_evidence_snapshots;
CREATE TRIGGER agent_review_snapshot_immutable_trg
  BEFORE UPDATE OR DELETE ON public.agent_review_evidence_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_review_snapshot_immutable();

ALTER FUNCTION public.agent_review_business_date(timestamptz) OWNER TO postgres;
ALTER FUNCTION public.agent_review_metric(text, text, text, text, jsonb, text) OWNER TO postgres;
ALTER FUNCTION public.agent_review_render_placeholders(text, jsonb) OWNER TO postgres;
ALTER FUNCTION public.agent_review_build_evidence(text, date, date, text) OWNER TO postgres;
ALTER FUNCTION public.agent_review_generate_cycle(text, date, date, text) OWNER TO postgres;
ALTER FUNCTION public.agent_review_append_evidence_snapshot(uuid) OWNER TO postgres;
ALTER FUNCTION public.agent_review_snapshot_immutable() OWNER TO postgres;

REVOKE ALL ON FUNCTION public.agent_review_business_date(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_review_metric(text, text, text, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_review_render_placeholders(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_review_build_evidence(text, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_review_generate_cycle(text, date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_review_append_evidence_snapshot(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agent_review_snapshot_immutable() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.agent_review_business_date(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_review_metric(text, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_review_render_placeholders(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_review_build_evidence(text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_review_generate_cycle(text, date, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_review_append_evidence_snapshot(uuid) TO authenticated;
