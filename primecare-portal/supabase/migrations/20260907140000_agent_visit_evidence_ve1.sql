-- Agent Visit Evidence VE-1 — additive schema + RLS.
-- Certified by Blueprint 26_Agent_Visit_Evidence.md / ADR-VE-001 … ADR-VE-008.
--
-- QA only. Do NOT apply to Production in VE-1.
-- Do NOT db push while CLI is linked to Production.
--
-- Additive: nullable discovery columns on agent_visits + child table
-- agent_visit_discovery_lines. No backfill. No DROP of existing visit columns.
-- No writes to orders, invoices, payments, AR, inventory, ordering mode, or sourced-by attribution.

-- ---------------------------------------------------------------------------
-- A. Unique (id, tenant_id) so children can composite-FK without using visit_id text
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agent_visits_id_tenant_uidx'
      AND conrelid = 'public.agent_visits'::regclass
  ) THEN
    ALTER TABLE public.agent_visits
      ADD CONSTRAINT agent_visits_id_tenant_uidx UNIQUE (id, tenant_id);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- B. Additive nullable discovery columns on agent_visits
-- ---------------------------------------------------------------------------
ALTER TABLE public.agent_visits
  ADD COLUMN IF NOT EXISTS visited_at timestamptz,
  ADD COLUMN IF NOT EXISTS decision_maker_met boolean,
  ADD COLUMN IF NOT EXISTS decision_maker_name text,
  ADD COLUMN IF NOT EXISTS decision_maker_role text,
  ADD COLUMN IF NOT EXISTS commercial_outcome text,
  ADD COLUMN IF NOT EXISTS lab_size_band text,
  ADD COLUMN IF NOT EXISTS estimated_monthly_wallet_inr numeric(14, 2),
  ADD COLUMN IF NOT EXISTS wallet_range_band text,
  ADD COLUMN IF NOT EXISTS wallet_confidence text,
  ADD COLUMN IF NOT EXISTS evidence_confidence text,
  ADD COLUMN IF NOT EXISTS reorder_interval text,
  ADD COLUMN IF NOT EXISTS payment_method_or_terms text,
  ADD COLUMN IF NOT EXISTS approx_credit_days integer,
  ADD COLUMN IF NOT EXISTS top_complaint text,
  ADD COLUMN IF NOT EXISTS top_complaint_notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.agent_visits
  ALTER COLUMN updated_at SET DEFAULT now();

COMMENT ON COLUMN public.agent_visits.visited_at IS
  'Optional timestamptz. If null, visit_date remains calendar SoT.';
COMMENT ON COLUMN public.agent_visits.decision_maker_met IS
  'Discovery: whether a decision maker was met. Null = unknown.';
COMMENT ON COLUMN public.agent_visits.commercial_outcome IS
  'Visit commercial output. Discovery only — does not create an order.';
COMMENT ON COLUMN public.agent_visits.lab_size_band IS
  'Qualitative discovery band. No wallet ₹ thresholds.';
COMMENT ON COLUMN public.agent_visits.estimated_monthly_wallet_inr IS
  'Agent-estimated monthly procurement wallet. Discovery — not financial SoT.';
COMMENT ON COLUMN public.agent_visits.wallet_range_band IS
  'Qualitative stated range. No coded INR CHECK thresholds.';
COMMENT ON COLUMN public.agent_visits.approx_credit_days IS
  'Observed credit days. Discovery — never writes ar_credit_control.';
COMMENT ON COLUMN public.agent_visits.payment_method_or_terms IS
  'Observed payment method/terms. Discovery — not HQ credit terms.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_visits_commercial_outcome_check'
      AND conrelid = 'public.agent_visits'::regclass
  ) THEN
    ALTER TABLE public.agent_visits
      ADD CONSTRAINT agent_visits_commercial_outcome_check CHECK (
        commercial_outcome IS NULL
        OR commercial_outcome IN (
          'REQUIREMENT',
          'QUOTE_OPPORTUNITY',
          'FOLLOW_UP',
          'ORDER_OPPORTUNITY',
          'NO_OPPORTUNITY',
          'UNKNOWN'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_visits_lab_size_band_check'
      AND conrelid = 'public.agent_visits'::regclass
  ) THEN
    ALTER TABLE public.agent_visits
      ADD CONSTRAINT agent_visits_lab_size_band_check CHECK (
        lab_size_band IS NULL
        OR lab_size_band IN (
          'SMALL',
          'MEDIUM',
          'LARGE',
          'CHAIN_HOSPITAL',
          'UNKNOWN'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_visits_wallet_confidence_check'
      AND conrelid = 'public.agent_visits'::regclass
  ) THEN
    ALTER TABLE public.agent_visits
      ADD CONSTRAINT agent_visits_wallet_confidence_check CHECK (
        wallet_confidence IS NULL
        OR wallet_confidence IN (
          'ESTIMATED',
          'CUSTOMER_STATED',
          'DOCUMENT_CONFIRMED',
          'UNKNOWN'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_visits_evidence_confidence_check'
      AND conrelid = 'public.agent_visits'::regclass
  ) THEN
    ALTER TABLE public.agent_visits
      ADD CONSTRAINT agent_visits_evidence_confidence_check CHECK (
        evidence_confidence IS NULL
        OR evidence_confidence IN (
          'ESTIMATED',
          'CUSTOMER_STATED',
          'DOCUMENT_CONFIRMED',
          'UNKNOWN'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_visits_top_complaint_check'
      AND conrelid = 'public.agent_visits'::regclass
  ) THEN
    ALTER TABLE public.agent_visits
      ADD CONSTRAINT agent_visits_top_complaint_check CHECK (
        top_complaint IS NULL
        OR top_complaint IN (
          'PRICE',
          'AVAILABILITY',
          'DELIVERY',
          'STOCKOUT',
          'SHORT_EXPIRY',
          'CREDIT',
          'QUALITY',
          'SERVICE',
          'ANALYZER_SUPPORT',
          'SOFTWARE',
          'OTHER',
          'UNKNOWN'
        )
      );
  END IF;
END
$$;

DROP TRIGGER IF EXISTS agent_visits_set_updated_at ON public.agent_visits;
CREATE TRIGGER agent_visits_set_updated_at
  BEFORE UPDATE ON public.agent_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- C. Server-stamp Agent identity (do not trust client agent_id / tenant_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_visits_stamp_agent_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_role text;
BEGIN
  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'agent' THEN
    RAISE EXCEPTION 'visit_write_agent_only';
  END IF;

  SELECT p.*
    INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'visit_profile_missing';
  END IF;

  IF v_profile.tenant_id IS NULL THEN
    RAISE EXCEPTION 'visit_tenant_required';
  END IF;

  IF nullif(btrim(COALESCE(v_profile.agent_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'visit_agent_id_required';
  END IF;

  NEW.tenant_id := v_profile.tenant_id;
  NEW.agent_id := nullif(btrim(v_profile.agent_id), '');
  NEW.agent_name := nullif(btrim(COALESCE(v_profile.agent_name, v_profile.display_name, '')), '');

  IF NEW.commercial_outcome IS NOT NULL THEN
    NEW.commercial_outcome := upper(btrim(NEW.commercial_outcome));
  END IF;
  IF NEW.lab_size_band IS NOT NULL THEN
    NEW.lab_size_band := upper(btrim(NEW.lab_size_band));
  END IF;
  IF NEW.wallet_confidence IS NOT NULL THEN
    NEW.wallet_confidence := upper(btrim(NEW.wallet_confidence));
  END IF;
  IF NEW.evidence_confidence IS NOT NULL THEN
    NEW.evidence_confidence := upper(btrim(NEW.evidence_confidence));
  END IF;
  IF NEW.top_complaint IS NOT NULL THEN
    NEW.top_complaint := upper(btrim(NEW.top_complaint));
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.agent_visits_stamp_agent_identity() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.agent_visits_stamp_agent_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_visits_stamp_agent_identity() FROM anon;
REVOKE ALL ON FUNCTION public.agent_visits_stamp_agent_identity() FROM authenticated;

DROP TRIGGER IF EXISTS agent_visits_stamp_agent_identity_trg ON public.agent_visits;
CREATE TRIGGER agent_visits_stamp_agent_identity_trg
  BEFORE INSERT OR UPDATE ON public.agent_visits
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_visits_stamp_agent_identity();

COMMENT ON FUNCTION public.agent_visits_stamp_agent_identity() IS
  'VE-1: Agent INSERT/UPDATE stamps tenant_id, agent_id, agent_name from current_profile(). Rejects non-agent writers.';

-- ---------------------------------------------------------------------------
-- D. Compose existing helpers (not a new visibility model)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_visit_evidence_visible_to_current_user(
  p_tenant_id uuid,
  p_lab_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.tenant_id_matches(p_tenant_id)
    AND (
      public.is_admin_or_executive()
      OR (
        public.current_user_role() = 'agent'
        AND public.lab_record_is_visible_to_current_user(p_tenant_id, p_lab_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.agent_visit_row_writable_by_current_agent(
  p_tenant_id uuid,
  p_lab_id text,
  p_agent_id text,
  p_agent_name text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_role() = 'agent'
    AND public.can_write_agent_work(p_tenant_id, p_agent_id, p_agent_name)
    AND public.lab_record_is_visible_to_current_user(p_tenant_id, p_lab_id);
$$;

ALTER FUNCTION public.agent_visit_evidence_visible_to_current_user(uuid, text) OWNER TO postgres;
ALTER FUNCTION public.agent_visit_row_writable_by_current_agent(uuid, text, text, text) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.agent_visit_evidence_visible_to_current_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_visit_row_writable_by_current_agent(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- E. agent_visits RLS — tighten INSERT/UPDATE; Lab/HR/anon have no match
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "agent_visits_select_by_role" ON public.agent_visits;
DROP POLICY IF EXISTS "agent_visits_insert_by_role" ON public.agent_visits;
DROP POLICY IF EXISTS "agent_visits_update_by_role" ON public.agent_visits;
DROP POLICY IF EXISTS "agent_visits_delete_by_role" ON public.agent_visits;

CREATE POLICY "agent_visits_select_by_role"
  ON public.agent_visits FOR SELECT TO authenticated
  USING (
    public.agent_visit_evidence_visible_to_current_user(tenant_id, lab_id)
  );

CREATE POLICY "agent_visits_insert_by_role"
  ON public.agent_visits FOR INSERT TO authenticated
  WITH CHECK (
    public.agent_visit_row_writable_by_current_agent(
      tenant_id,
      lab_id,
      agent_id,
      agent_name
    )
  );

CREATE POLICY "agent_visits_update_by_role"
  ON public.agent_visits FOR UPDATE TO authenticated
  USING (
    public.agent_visit_row_writable_by_current_agent(
      tenant_id,
      lab_id,
      agent_id,
      agent_name
    )
  )
  WITH CHECK (
    public.agent_visit_row_writable_by_current_agent(
      tenant_id,
      lab_id,
      agent_id,
      agent_name
    )
  );

-- No DELETE policy (V1).

-- ---------------------------------------------------------------------------
-- F. Child table agent_visit_discovery_lines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_visit_discovery_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  lab_id text NOT NULL,
  visit_uuid uuid NOT NULL,
  line_kind text NOT NULL,
  confidence text,
  manufacturer text,
  model text,
  notes text,
  description text,
  brand text,
  monthly_spend_inr numeric(14, 2),
  monthly_quantity numeric(14, 2),
  supplier text,
  product_category text,
  approx_volume numeric(14, 2),
  approx_price_pack numeric(14, 2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_visit_discovery_lines_visit_tenant_fkey
    FOREIGN KEY (visit_uuid, tenant_id)
    REFERENCES public.agent_visits (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT agent_visit_discovery_lines_kind_check CHECK (
    line_kind IN ('ANALYZER', 'REAGENT', 'CONSUMABLE')
  ),
  CONSTRAINT agent_visit_discovery_lines_confidence_check CHECK (
    confidence IS NULL
    OR confidence IN (
      'ESTIMATED',
      'CUSTOMER_STATED',
      'DOCUMENT_CONFIRMED',
      'UNKNOWN'
    )
  )
);

COMMENT ON TABLE public.agent_visit_discovery_lines IS
  'VE-1 visit-scoped observational evidence (analyzer/reagent/consumable). Not CRM, not product master, not financial SoT.';
COMMENT ON COLUMN public.agent_visit_discovery_lines.visit_uuid IS
  'FK to agent_visits.id (uuid PK). Must never reference legacy visit_id text.';
COMMENT ON COLUMN public.agent_visit_discovery_lines.lab_id IS
  'Denormalized for RLS; stamped from parent visit.';
COMMENT ON COLUMN public.agent_visit_discovery_lines.monthly_spend_inr IS
  'Discovery estimate. Not an invoice or AR amount.';
COMMENT ON COLUMN public.agent_visit_discovery_lines.approx_price_pack IS
  'Discovery estimate. Not catalog unit_selling_price.';

CREATE INDEX IF NOT EXISTS idx_agent_visit_discovery_lines_tenant_visit
  ON public.agent_visit_discovery_lines (tenant_id, visit_uuid);

CREATE INDEX IF NOT EXISTS idx_agent_visit_discovery_lines_tenant_lab
  ON public.agent_visit_discovery_lines (tenant_id, public.primecare_normalize_lab_id(lab_id));

DROP TRIGGER IF EXISTS agent_visit_discovery_lines_set_updated_at
  ON public.agent_visit_discovery_lines;
CREATE TRIGGER agent_visit_discovery_lines_set_updated_at
  BEFORE UPDATE ON public.agent_visit_discovery_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Stamp tenant_id + lab_id from parent visit; uppercase enums.
CREATE OR REPLACE FUNCTION public.agent_visit_discovery_lines_stamp_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_visit public.agent_visits%ROWTYPE;
  v_role text;
BEGIN
  v_role := public.current_user_role();
  IF v_role IS DISTINCT FROM 'agent' THEN
    RAISE EXCEPTION 'visit_write_agent_only';
  END IF;

  SELECT v.*
    INTO v_visit
  FROM public.agent_visits v
  WHERE v.id = NEW.visit_uuid
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'visit_parent_missing';
  END IF;

  NEW.tenant_id := v_visit.tenant_id;
  NEW.lab_id := v_visit.lab_id;
  NEW.line_kind := upper(btrim(NEW.line_kind));
  IF NEW.confidence IS NOT NULL THEN
    NEW.confidence := upper(btrim(NEW.confidence));
  END IF;

  IF NOT public.agent_visit_row_writable_by_current_agent(
    v_visit.tenant_id,
    v_visit.lab_id,
    v_visit.agent_id,
    v_visit.agent_name
  ) THEN
    RAISE EXCEPTION 'visit_line_parent_not_writable';
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.agent_visit_discovery_lines_stamp_parent() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.agent_visit_discovery_lines_stamp_parent() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_visit_discovery_lines_stamp_parent() FROM anon;
REVOKE ALL ON FUNCTION public.agent_visit_discovery_lines_stamp_parent() FROM authenticated;

DROP TRIGGER IF EXISTS agent_visit_discovery_lines_stamp_parent_trg
  ON public.agent_visit_discovery_lines;
CREATE TRIGGER agent_visit_discovery_lines_stamp_parent_trg
  BEFORE INSERT OR UPDATE ON public.agent_visit_discovery_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_visit_discovery_lines_stamp_parent();

ALTER TABLE public.agent_visit_discovery_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_visit_discovery_lines_select_by_role"
  ON public.agent_visit_discovery_lines;
DROP POLICY IF EXISTS "agent_visit_discovery_lines_insert_by_role"
  ON public.agent_visit_discovery_lines;
DROP POLICY IF EXISTS "agent_visit_discovery_lines_update_by_role"
  ON public.agent_visit_discovery_lines;
DROP POLICY IF EXISTS "agent_visit_discovery_lines_delete_by_role"
  ON public.agent_visit_discovery_lines;

CREATE POLICY "agent_visit_discovery_lines_select_by_role"
  ON public.agent_visit_discovery_lines FOR SELECT TO authenticated
  USING (
    public.agent_visit_evidence_visible_to_current_user(tenant_id, lab_id)
  );

CREATE POLICY "agent_visit_discovery_lines_insert_by_role"
  ON public.agent_visit_discovery_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agent_visits v
      WHERE v.id = visit_uuid
        AND v.tenant_id = tenant_id
        AND public.agent_visit_row_writable_by_current_agent(
          v.tenant_id,
          v.lab_id,
          v.agent_id,
          v.agent_name
        )
    )
  );

CREATE POLICY "agent_visit_discovery_lines_update_by_role"
  ON public.agent_visit_discovery_lines FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agent_visits v
      WHERE v.id = visit_uuid
        AND v.tenant_id = tenant_id
        AND public.agent_visit_row_writable_by_current_agent(
          v.tenant_id,
          v.lab_id,
          v.agent_id,
          v.agent_name
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.agent_visits v
      WHERE v.id = visit_uuid
        AND v.tenant_id = tenant_id
        AND public.agent_visit_row_writable_by_current_agent(
          v.tenant_id,
          v.lab_id,
          v.agent_id,
          v.agent_name
        )
    )
  );

-- No DELETE policy (V1).

-- ---------------------------------------------------------------------------
-- G. Grants — authenticated read/write; no anon; no DELETE
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.agent_visits FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_visits FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agent_visits TO authenticated;

REVOKE ALL ON TABLE public.agent_visit_discovery_lines FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_visit_discovery_lines FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.agent_visit_discovery_lines TO authenticated;

NOTIFY pgrst, 'reload schema';
