-- Field Execution V1.1 — certification classification and visit duplicate protection.
--
-- Founder approved the Field Execution V1.1 production release.
-- Apply this file only. Do not use supabase db push.
-- Applying this file classifies three existing production records.
-- It does not cancel, delete, or rewrite amounts, invoices, payments, stock, or receivables.
--
-- Backfill runs as the migration role (auth.uid() is null). An agent session cannot
-- set record_origin. Existing visit notes are not updated.

-- ---------------------------------------------------------------------------
-- A. Classification columns. Default keeps every current row as field work.
-- ---------------------------------------------------------------------------
ALTER TABLE public.labs
  ADD COLUMN IF NOT EXISTS record_origin text NOT NULL DEFAULT 'field';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS record_origin text NOT NULL DEFAULT 'field';

ALTER TABLE public.labs
  DROP CONSTRAINT IF EXISTS labs_record_origin_check;
ALTER TABLE public.labs
  ADD CONSTRAINT labs_record_origin_check
  CHECK (record_origin IN ('field', 'certification', 'test'));

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_record_origin_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_record_origin_check
  CHECK (record_origin IN ('field', 'certification', 'test'));

CREATE OR REPLACE FUNCTION public.protect_record_origin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_origin text;
  v_previous text;
BEGIN
  v_origin := lower(btrim(COALESCE(NEW.record_origin, 'field')));
  IF v_origin NOT IN ('field', 'certification', 'test') THEN
    RAISE EXCEPTION 'record_origin_invalid' USING ERRCODE = '23514';
  END IF;
  NEW.record_origin := v_origin;

  -- Migration and service sessions have no end-user JWT.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND v_origin = 'field' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_previous := lower(btrim(COALESCE(OLD.record_origin, 'field')));
    IF v_origin = v_previous THEN
      RETURN NEW;
    END IF;
  END IF;

  IF public.is_admin_or_executive() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'record_origin_forbidden' USING ERRCODE = '42501';
END;
$$;

ALTER FUNCTION public.protect_record_origin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.protect_record_origin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_record_origin() FROM anon;
REVOKE ALL ON FUNCTION public.protect_record_origin() FROM authenticated;

DROP TRIGGER IF EXISTS labs_protect_record_origin_trg ON public.labs;
CREATE TRIGGER labs_protect_record_origin_trg
  BEFORE INSERT OR UPDATE ON public.labs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_record_origin();

DROP TRIGGER IF EXISTS orders_protect_record_origin_trg ON public.orders;
CREATE TRIGGER orders_protect_record_origin_trg
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_record_origin();

-- Exact production certification rows. Name and amount guards stop a reused id.
UPDATE public.labs
SET record_origin = 'certification'
WHERE tenant_id = '6c83b03f-2993-4aef-88a2-f23c42f242e8'
  AND lab_id = 'LAB-P-7CDAE963963F'
  AND lab_name = 'PN EMAIL STAGE3E REAL RECIPIENT CERT — DO NOT CONTACT'
  AND record_origin = 'field';

UPDATE public.labs
SET record_origin = 'certification'
WHERE tenant_id = '6c83b03f-2993-4aef-88a2-f23c42f242e8'
  AND lab_id = 'LAB-P-E9FFF046A399'
  AND lab_name = 'PN EMAIL STAGE3F REAL RECIPIENT CERT — DO NOT CONTACT'
  AND record_origin = 'field';

UPDATE public.orders
SET record_origin = 'certification'
WHERE tenant_id = '6c83b03f-2993-4aef-88a2-f23c42f242e8'
  AND order_id = 'ORD-1788803535585-vfjqng'
  AND total_amount = 1000
  AND notes = 'FLOW3A-PROD-CERT-20260907'
  AND record_origin = 'field';

-- ---------------------------------------------------------------------------
-- B. Expose classification on the lab read the agent dashboard already uses.
--    security_invoker stays on. No policy change.
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
  l.created_at,
  l.record_origin
FROM public.labs l
LEFT JOIN public.ar_credit_control a
  ON l.tenant_id = a.tenant_id
 AND l.lab_id = a.lab_id;

COMMENT ON VIEW public.v_labs_credit IS
  'Labs with credit posture, sourcing, created_at, and record_origin. security_invoker enforces caller RLS.';

REVOKE ALL ON TABLE public.v_labs_credit FROM PUBLIC;
REVOKE ALL ON TABLE public.v_labs_credit FROM anon;
GRANT SELECT ON TABLE public.v_labs_credit TO authenticated;

-- ---------------------------------------------------------------------------
-- C. Visit duplicate key and structured no-discussion reason.
--    Historical rows stay null. Agents already write agent_visits under VE-1 RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE public.agent_visits
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

ALTER TABLE public.agent_visits
  ADD COLUMN IF NOT EXISTS no_discussion_reason text;

ALTER TABLE public.agent_visits
  DROP CONSTRAINT IF EXISTS agent_visits_no_discussion_reason_check;
ALTER TABLE public.agent_visits
  ADD CONSTRAINT agent_visits_no_discussion_reason_check
  CHECK (
    no_discussion_reason IS NULL
    OR no_discussion_reason IN ('RECEPTION_ONLY', 'DECISION_MAKER_UNAVAILABLE', 'NOT_DISCUSSED')
  );

CREATE UNIQUE INDEX IF NOT EXISTS agent_visits_client_request_uidx
  ON public.agent_visits (tenant_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- Returns the original visit only for the same tenant and the same agent,
-- or for HQ in that tenant. SECURITY INVOKER keeps RLS in force.
CREATE OR REPLACE FUNCTION public.agent_visit_for_client_request(p_client_request_id uuid)
RETURNS SETOF public.agent_visits
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT v.*
  FROM public.agent_visits v
  WHERE v.client_request_id = p_client_request_id
    AND v.tenant_id = public.current_tenant_id()
    AND (
      public.is_admin_or_executive()
      OR lower(btrim(v.agent_id)) = lower(btrim(COALESCE(public.current_profile_agent_id(), '')))
    );
$$;

ALTER FUNCTION public.agent_visit_for_client_request(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.agent_visit_for_client_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_visit_for_client_request(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.agent_visit_for_client_request(uuid) TO authenticated;

COMMENT ON FUNCTION public.agent_visit_for_client_request(uuid) IS
  'Field Execution V1.1: authorized lookup after a duplicate client_request_id insert. Does not bypass RLS.';

NOTIFY pgrst, 'reload schema';
