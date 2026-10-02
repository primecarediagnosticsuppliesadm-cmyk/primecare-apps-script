-- P0-A commercial response.
-- Attaches a structured HQ decision to an existing AE-1C visit_handoffs row.
-- Does not create a product master, quote, order, invoice, or payment.
-- Does not write products.cost_price.
-- Purchase cost, supplier, and the HQ note stay off the agent-visible row
-- and off visit_handoffs.hq_response.

-- ---------------------------------------------------------------------------
-- Supplier identity (minimum)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_name text NOT NULL,
  supplier_name_key text GENERATED ALWAYS AS (lower(btrim(supplier_name))) STORED,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT suppliers_name_check CHECK (btrim(supplier_name) <> ''),
  CONSTRAINT suppliers_tenant_name_uidx UNIQUE (tenant_id, supplier_name_key)
);

COMMENT ON TABLE public.suppliers IS
  'P0-A source identity. Not a supplier CRM, portal, or procurement ledger.';

DROP TRIGGER IF EXISTS suppliers_set_updated_at ON public.suppliers;
CREATE TRIGGER suppliers_set_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Verified source offer. History of product/source/cost/time.
-- product_id is nullable until HQ matches products.product_id.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.supplier_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers (id),
  product_id text,
  specification text,
  verified_cost numeric(12, 2) NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT supplier_offers_cost_check CHECK (verified_cost >= 0),
  CONSTRAINT supplier_offers_product_or_spec_check CHECK (
    nullif(btrim(COALESCE(product_id, '')), '') IS NOT NULL
    OR nullif(btrim(COALESCE(specification, '')), '') IS NOT NULL
  )
);

COMMENT ON TABLE public.supplier_offers IS
  'Verified purchase cost for one source at one time. Not products.cost_price and not a selling price.';

CREATE INDEX IF NOT EXISTS supplier_offers_tenant_product_idx
  ON public.supplier_offers (tenant_id, product_id, verified_at DESC);

-- ---------------------------------------------------------------------------
-- Agent-visible commercial terms. No supplier, cost, margin, or HQ note.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handoff_commercial_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  handoff_id uuid NOT NULL UNIQUE REFERENCES public.visit_handoffs (id),
  decision text NOT NULL,
  product_id text,
  specification text,
  quantity numeric(12, 3),
  pack_uom text,
  availability text,
  lead_time text,
  selling_price numeric(12, 2),
  valid_until date,
  agent_visible_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT handoff_commercial_responses_decision_check CHECK (
    decision IN ('YES', 'NO', 'NEED_MORE_INFORMATION')
  ),
  CONSTRAINT handoff_commercial_responses_text_check CHECK (
    btrim(agent_visible_text) <> ''
  ),
  CONSTRAINT handoff_commercial_responses_price_check CHECK (
    selling_price IS NULL OR selling_price >= 0
  ),
  CONSTRAINT handoff_commercial_responses_qty_check CHECK (
    quantity IS NULL OR quantity > 0
  )
);

COMMENT ON TABLE public.handoff_commercial_responses IS
  'P0-A agent-visible commercial terms for one AE-1C handoff. Not a quote and not an order.';

-- ---------------------------------------------------------------------------
-- HQ-only economics. Separate table so RLS can hide it from Agent and Lab.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handoff_commercial_economics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  handoff_id uuid NOT NULL UNIQUE REFERENCES public.visit_handoffs (id),
  response_id uuid NOT NULL UNIQUE REFERENCES public.handoff_commercial_responses (id),
  supplier_id uuid REFERENCES public.suppliers (id),
  supplier_offer_id uuid REFERENCES public.supplier_offers (id),
  verified_cost numeric(12, 2),
  verified_at timestamptz,
  internal_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT handoff_commercial_economics_cost_check CHECK (
    verified_cost IS NULL OR verified_cost >= 0
  )
);

COMMENT ON TABLE public.handoff_commercial_economics IS
  'HQ-only source, purchase cost, and internal note for one commercial response. Not agent-visible.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_commercial_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handoff_commercial_economics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers_select_hq" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_insert_deny" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update_deny" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_delete_deny" ON public.suppliers;
CREATE POLICY "suppliers_select_hq"
  ON public.suppliers FOR SELECT TO authenticated
  USING (
    public.tenant_id_matches(tenant_id)
    AND public.is_admin_or_executive()
  );
CREATE POLICY "suppliers_insert_deny"
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "suppliers_update_deny"
  ON public.suppliers FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "suppliers_delete_deny"
  ON public.suppliers FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "supplier_offers_select_hq" ON public.supplier_offers;
DROP POLICY IF EXISTS "supplier_offers_insert_deny" ON public.supplier_offers;
DROP POLICY IF EXISTS "supplier_offers_update_deny" ON public.supplier_offers;
DROP POLICY IF EXISTS "supplier_offers_delete_deny" ON public.supplier_offers;
CREATE POLICY "supplier_offers_select_hq"
  ON public.supplier_offers FOR SELECT TO authenticated
  USING (
    public.tenant_id_matches(tenant_id)
    AND public.is_admin_or_executive()
  );
CREATE POLICY "supplier_offers_insert_deny"
  ON public.supplier_offers FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "supplier_offers_update_deny"
  ON public.supplier_offers FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "supplier_offers_delete_deny"
  ON public.supplier_offers FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "handoff_commercial_responses_select" ON public.handoff_commercial_responses;
DROP POLICY IF EXISTS "handoff_commercial_responses_insert_deny" ON public.handoff_commercial_responses;
DROP POLICY IF EXISTS "handoff_commercial_responses_update_deny" ON public.handoff_commercial_responses;
DROP POLICY IF EXISTS "handoff_commercial_responses_delete_deny" ON public.handoff_commercial_responses;
CREATE POLICY "handoff_commercial_responses_select"
  ON public.handoff_commercial_responses FOR SELECT TO authenticated
  USING (
    public.tenant_id_matches(tenant_id)
    AND (
      public.is_admin_or_executive()
      OR EXISTS (
        SELECT 1
        FROM public.visit_handoffs h
        WHERE h.id = handoff_commercial_responses.handoff_id
          AND h.tenant_id = handoff_commercial_responses.tenant_id
          AND public.current_user_role() = 'agent'
          AND h.agent_id = public.current_profile_agent_id()
          AND public.lab_record_is_visible_to_current_user(h.tenant_id, h.lab_id)
      )
    )
  );
CREATE POLICY "handoff_commercial_responses_insert_deny"
  ON public.handoff_commercial_responses FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "handoff_commercial_responses_update_deny"
  ON public.handoff_commercial_responses FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "handoff_commercial_responses_delete_deny"
  ON public.handoff_commercial_responses FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "handoff_commercial_economics_select_hq" ON public.handoff_commercial_economics;
DROP POLICY IF EXISTS "handoff_commercial_economics_insert_deny" ON public.handoff_commercial_economics;
DROP POLICY IF EXISTS "handoff_commercial_economics_update_deny" ON public.handoff_commercial_economics;
DROP POLICY IF EXISTS "handoff_commercial_economics_delete_deny" ON public.handoff_commercial_economics;
CREATE POLICY "handoff_commercial_economics_select_hq"
  ON public.handoff_commercial_economics FOR SELECT TO authenticated
  USING (
    public.tenant_id_matches(tenant_id)
    AND public.is_admin_or_executive()
  );
CREATE POLICY "handoff_commercial_economics_insert_deny"
  ON public.handoff_commercial_economics FOR INSERT TO authenticated
  WITH CHECK (false);
CREATE POLICY "handoff_commercial_economics_update_deny"
  ON public.handoff_commercial_economics FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
CREATE POLICY "handoff_commercial_economics_delete_deny"
  ON public.handoff_commercial_economics FOR DELETE TO authenticated
  USING (false);

REVOKE ALL ON TABLE public.suppliers FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.supplier_offers FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.handoff_commercial_responses FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.handoff_commercial_economics FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.suppliers TO authenticated;
GRANT SELECT ON TABLE public.supplier_offers TO authenticated;
GRANT SELECT ON TABLE public.handoff_commercial_responses TO authenticated;
GRANT SELECT ON TABLE public.handoff_commercial_economics TO authenticated;
GRANT ALL ON TABLE public.suppliers TO service_role;
GRANT ALL ON TABLE public.supplier_offers TO service_role;
GRANT ALL ON TABLE public.handoff_commercial_responses TO service_role;
GRANT ALL ON TABLE public.handoff_commercial_economics TO service_role;

-- ---------------------------------------------------------------------------
-- Resolve + respond in one transaction.
-- respond_visit_handoff returns jsonb on failure, so a failed status change
-- must RAISE to roll back the commercial rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_visit_handoff_commercial(
  p_handoff_id uuid,
  p_decision text,
  p_agent_response text,
  p_product_id text DEFAULT NULL,
  p_specification text DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_pack_uom text DEFAULT NULL,
  p_supplier_name text DEFAULT NULL,
  p_verified_cost numeric DEFAULT NULL,
  p_availability text DEFAULT NULL,
  p_lead_time text DEFAULT NULL,
  p_selling_price numeric DEFAULT NULL,
  p_valid_until date DEFAULT NULL,
  p_internal_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_handoff public.visit_handoffs%ROWTYPE;
  v_decision text;
  v_agent text;
  v_spec text;
  v_pack text;
  v_availability text;
  v_lead text;
  v_supplier text;
  v_note text;
  v_product_key text;
  v_product_id text;
  v_product_name text;
  v_supplier_id uuid;
  v_offer_id uuid;
  v_response_id uuid;
  v_visible text;
  v_cost numeric(12, 2);
  v_price numeric(12, 2);
  v_cost_text text;
  v_respond jsonb;
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

  IF p_handoff_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;

  SELECT * INTO v_handoff
  FROM public.visit_handoffs h
  WHERE h.id = p_handoff_id
  FOR UPDATE;
  IF NOT FOUND OR v_handoff.tenant_id IS DISTINCT FROM v_profile.tenant_id THEN
    RETURN jsonb_build_object('success', false, 'code', 'forbidden');
  END IF;
  IF v_handoff.status IS DISTINCT FROM 'OPEN_HQ' OR v_handoff.owner IS DISTINCT FROM 'HQ' THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'already_responded',
      'handoff', public.visit_handoff_row_json(v_handoff)
    );
  END IF;

  v_decision := upper(btrim(COALESCE(p_decision, '')));
  IF v_decision NOT IN ('YES', 'NO', 'NEED_MORE_INFORMATION') THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_decision');
  END IF;

  v_agent := nullif(btrim(COALESCE(p_agent_response, '')), '');
  IF v_agent IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'blank_response');
  END IF;
  IF length(v_agent) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'response_too_long');
  END IF;

  v_spec := nullif(btrim(COALESCE(p_specification, '')), '');
  v_pack := nullif(btrim(COALESCE(p_pack_uom, '')), '');
  v_availability := nullif(btrim(COALESCE(p_availability, '')), '');
  v_lead := nullif(btrim(COALESCE(p_lead_time, '')), '');
  v_supplier := nullif(btrim(COALESCE(p_supplier_name, '')), '');
  v_note := nullif(btrim(COALESCE(p_internal_note, '')), '');
  v_product_key := nullif(btrim(COALESCE(p_product_id, '')), '');

  IF v_spec IS NOT NULL AND length(v_spec) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'specification_too_long');
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'code', 'note_too_long');
  END IF;
  IF p_quantity IS NOT NULL AND p_quantity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'invalid_quantity');
  END IF;

  IF v_decision <> 'YES' THEN
    IF v_product_key IS NOT NULL
       OR p_quantity IS NOT NULL
       OR v_pack IS NOT NULL
       OR v_supplier IS NOT NULL
       OR p_verified_cost IS NOT NULL
       OR v_availability IS NOT NULL
       OR v_lead IS NOT NULL
       OR p_selling_price IS NOT NULL
       OR p_valid_until IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'pricing_not_allowed');
    END IF;
  ELSE
    IF v_product_key IS NULL AND v_spec IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'product_or_spec_required');
    END IF;
    IF v_supplier IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'supplier_required');
    END IF;
    IF length(v_supplier) > 160 THEN
      RETURN jsonb_build_object('success', false, 'code', 'supplier_too_long');
    END IF;
    IF p_verified_cost IS NULL OR p_verified_cost < 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'cost_required');
    END IF;
    IF p_selling_price IS NULL OR p_selling_price <= 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'selling_price_required');
    END IF;
    IF v_availability IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'availability_required');
    END IF;
    IF v_lead IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'lead_time_required');
    END IF;
    IF p_valid_until IS NULL THEN
      RETURN jsonb_build_object('success', false, 'code', 'valid_until_required');
    END IF;
    v_cost := round(p_verified_cost, 2);
    v_price := round(p_selling_price, 2);
    v_cost_text := to_char(v_cost, 'FM999999990.00');
    IF position(v_cost_text IN COALESCE(v_agent, '')) > 0
       OR position(v_cost_text IN COALESCE(v_spec, '')) > 0
       OR position(v_cost_text IN COALESCE(v_availability, '')) > 0
       OR position(v_cost_text IN COALESCE(v_lead, '')) > 0 THEN
      RETURN jsonb_build_object('success', false, 'code', 'cost_in_agent_response');
    END IF;
    IF length(v_supplier) >= 3 AND (
      position(lower(v_supplier) IN lower(COALESCE(v_agent, ''))) > 0
      OR position(lower(v_supplier) IN lower(COALESCE(v_spec, ''))) > 0
      OR position(lower(v_supplier) IN lower(COALESCE(v_availability, ''))) > 0
      OR position(lower(v_supplier) IN lower(COALESCE(v_lead, ''))) > 0
    ) THEN
      RETURN jsonb_build_object('success', false, 'code', 'supplier_in_agent_response');
    END IF;
  END IF;

  IF v_product_key IS NOT NULL THEN
    SELECT p.product_id, p.product_name
      INTO v_product_id, v_product_name
    FROM public.products p
    WHERE p.tenant_id = v_handoff.tenant_id
      AND upper(btrim(p.product_id)) = upper(v_product_key)
    LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'code', 'unknown_product');
    END IF;
  END IF;

  v_visible := 'Decision: ' || CASE v_decision
    WHEN 'YES' THEN 'YES'
    WHEN 'NO' THEN 'NO'
    ELSE 'NEED MORE INFORMATION'
  END;
  IF v_decision = 'YES' THEN
    IF v_product_id IS NOT NULL THEN
      v_visible := v_visible || E'\nProduct: ' || COALESCE(v_product_name, v_product_id) || ' (' || v_product_id || ')';
    END IF;
    IF v_spec IS NOT NULL THEN
      v_visible := v_visible || E'\nSpecification: ' || v_spec;
    END IF;
    IF p_quantity IS NOT NULL THEN
      v_visible := v_visible || E'\nQuantity: ' || trim(to_char(p_quantity, 'FM999999990.###'));
    END IF;
    IF v_pack IS NOT NULL THEN
      v_visible := v_visible || E'\nPack: ' || v_pack;
    END IF;
    v_visible := v_visible
      || E'\nSelling price: ' || to_char(v_price, 'FM999999990.00')
      || E'\nAvailability: ' || v_availability
      || E'\nLead time: ' || v_lead
      || E'\nValid until: ' || to_char(p_valid_until, 'YYYY-MM-DD');
  ELSIF v_spec IS NOT NULL THEN
    v_visible := v_visible || E'\nSpecification: ' || v_spec;
  END IF;
  v_visible := v_visible || E'\nNext action: ' || v_agent;

  IF v_decision = 'YES' THEN
    SELECT s.id INTO v_supplier_id
    FROM public.suppliers s
    WHERE s.tenant_id = v_handoff.tenant_id
      AND s.supplier_name_key = lower(v_supplier)
    LIMIT 1;
    IF FOUND THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.id = v_supplier_id AND s.active IS TRUE
      ) THEN
        RETURN jsonb_build_object('success', false, 'code', 'supplier_inactive');
      END IF;
    ELSE
      BEGIN
        INSERT INTO public.suppliers (tenant_id, supplier_name)
        VALUES (v_handoff.tenant_id, v_supplier)
        RETURNING id INTO v_supplier_id;
      EXCEPTION
        WHEN unique_violation THEN
          SELECT s.id INTO v_supplier_id
          FROM public.suppliers s
          WHERE s.tenant_id = v_handoff.tenant_id
            AND s.supplier_name_key = lower(v_supplier)
            AND s.active IS TRUE
          LIMIT 1;
          IF v_supplier_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'code', 'supplier_inactive');
          END IF;
      END;
    END IF;

    INSERT INTO public.supplier_offers (
      tenant_id, supplier_id, product_id, specification, verified_cost, verified_at, created_by
    ) VALUES (
      v_handoff.tenant_id, v_supplier_id, v_product_id, v_spec, v_cost, now(), v_uid
    )
    RETURNING id INTO v_offer_id;
  END IF;

  INSERT INTO public.handoff_commercial_responses (
    tenant_id,
    handoff_id,
    decision,
    product_id,
    specification,
    quantity,
    pack_uom,
    availability,
    lead_time,
    selling_price,
    valid_until,
    agent_visible_text,
    created_by
  ) VALUES (
    v_handoff.tenant_id,
    v_handoff.id,
    v_decision,
    CASE WHEN v_decision = 'YES' THEN v_product_id ELSE NULL END,
    v_spec,
    CASE WHEN v_decision = 'YES' THEN p_quantity ELSE NULL END,
    CASE WHEN v_decision = 'YES' THEN v_pack ELSE NULL END,
    CASE WHEN v_decision = 'YES' THEN v_availability ELSE NULL END,
    CASE WHEN v_decision = 'YES' THEN v_lead ELSE NULL END,
    CASE WHEN v_decision = 'YES' THEN v_price ELSE NULL END,
    CASE WHEN v_decision = 'YES' THEN p_valid_until ELSE NULL END,
    v_visible,
    v_uid
  )
  RETURNING id INTO v_response_id;

  INSERT INTO public.handoff_commercial_economics (
    tenant_id,
    handoff_id,
    response_id,
    supplier_id,
    supplier_offer_id,
    verified_cost,
    verified_at,
    internal_note,
    created_by
  ) VALUES (
    v_handoff.tenant_id,
    v_handoff.id,
    v_response_id,
    v_supplier_id,
    v_offer_id,
    CASE WHEN v_decision = 'YES' THEN v_cost ELSE NULL END,
    CASE WHEN v_decision = 'YES' THEN now() ELSE NULL END,
    v_note,
    v_uid
  );

  v_respond := public.respond_visit_handoff(p_handoff_id, v_visible);
  IF COALESCE(v_respond->>'success', '') IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'commercial_respond_failed:%', COALESCE(v_respond->>'code', 'failed');
  END IF;

  RETURN v_respond;
END;
$$;

ALTER FUNCTION public.resolve_visit_handoff_commercial(
  uuid, text, text, text, text, numeric, text, text, numeric, text, text, numeric, date, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.resolve_visit_handoff_commercial(
  uuid, text, text, text, text, numeric, text, text, numeric, text, text, numeric, date, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_visit_handoff_commercial(
  uuid, text, text, text, text, numeric, text, text, numeric, text, text, numeric, date, text
) TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_visit_handoff_commercial(
  uuid, text, text, text, text, numeric, text, text, numeric, text, text, numeric, date, text
) IS
  'P0-A: HQ writes commercial terms and calls respond_visit_handoff in the same transaction. hq_response is the agent-visible text only.';

-- ---------------------------------------------------------------------------
-- Lab catalog must not publish purchase cost.
-- The view stays the ordering price source (products.selling_price).
-- It runs as the owner so a lab can still see the selling price after
-- products SELECT no longer includes the lab role.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_lab_catalog;
CREATE VIEW public.v_lab_catalog
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  i.tenant_id,
  i.product_id,
  COALESCE(p.product_name, i.product_id) AS product_name,
  COALESCE(p.category, 'Consumables'::text) AS category,
  'PrimeCare'::text AS brand,
  COALESCE(p.selling_price, (0)::numeric) AS unit_selling_price,
  (0)::numeric AS tax_rate,
  CASE
    WHEN (p.active IS TRUE) THEN 'Y'::text
    ELSE 'N'::text
  END AS active_flag,
  i.current_stock,
  i.min_stock,
  i.reorder_qty,
  CASE
    WHEN (i.current_stock <= i.min_stock) THEN 'REORDER'::text
    ELSE 'OK'::text
  END AS reorder_status
FROM public.inventory i
LEFT JOIN public.products p
  ON p.tenant_id = i.tenant_id
 AND upper(trim(both from p.product_id)) = upper(trim(both from i.product_id))
WHERE auth.uid() IS NOT NULL
  AND (
    public.can_manage_catalog_inventory_for_tenant(i.tenant_id)
    OR (
      public.current_user_role() = 'lab'
      AND public.tenant_id_matches(i.tenant_id)
    )
  );

COMMENT ON VIEW public.v_lab_catalog IS
  'Lab ordering catalog. Selling price only. Purchase cost is not a column.';

REVOKE ALL ON public.v_lab_catalog FROM PUBLIC, anon;
GRANT SELECT ON public.v_lab_catalog TO authenticated;

DROP POLICY IF EXISTS "products_select_by_role" ON public.products;
CREATE POLICY "products_select_by_role"
  ON public.products FOR SELECT TO authenticated
  USING (
    public.can_manage_catalog_inventory_for_tenant(tenant_id)
  );

COMMENT ON POLICY "products_select_by_role" ON public.products IS
  'HQ catalog read. Lab customers use v_lab_catalog and cannot read cost_price.';

-- Stock views previously ran as the owner and exposed cost_price to any
-- grantee, including anon. They now follow products RLS.
ALTER VIEW public.v_stock_dashboard SET (security_invoker = true);
ALTER VIEW public.v_reorder_candidates SET (security_invoker = true);
REVOKE ALL ON public.v_stock_dashboard FROM anon;
REVOKE ALL ON public.v_reorder_candidates FROM anon;
