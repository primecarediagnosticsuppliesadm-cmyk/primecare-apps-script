-- Mirror of supabase/migrations/20260815120000_lab_product_intelligence.sql
-- Lab product intelligence: incumbent mix (N rows per lab).
-- Also persist visit follow-up type/action (Agent Visit audit fix).

ALTER TABLE public.agent_visits
  ADD COLUMN IF NOT EXISTS next_follow_up_type text,
  ADD COLUMN IF NOT EXISTS next_action text;

CREATE TABLE IF NOT EXISTS public.lab_product_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lab_id text NOT NULL,
  source_visit_id text,
  product_category text,
  brand text,
  monthly_quantity numeric(14, 2),
  current_supplier text,
  primary_pain_point text,
  sku_spec text,
  pack_size text,
  current_purchase_price numeric(14, 2),
  purchase_frequency text,
  willingness_to_switch text,
  alternative_brand_ok text,
  sample_requested boolean NOT NULL DEFAULT false,
  sample_sku text,
  sample_quantity numeric(14, 2),
  sample_issued_at date,
  agent_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_product_intelligence_pain_check CHECK (
    primary_pain_point IS NULL
    OR lower(primary_pain_point) IN (
      'price', 'quality', 'availability', 'delivery', 'credit', 'service', 'other'
    )
  ),
  CONSTRAINT lab_product_intelligence_frequency_check CHECK (
    purchase_frequency IS NULL
    OR lower(purchase_frequency) IN (
      'weekly', 'monthly', 'quarterly', 'as_needed', 'unknown'
    )
  ),
  CONSTRAINT lab_product_intelligence_switch_check CHECK (
    willingness_to_switch IS NULL
    OR lower(willingness_to_switch) IN ('high', 'medium', 'low', 'unknown')
  )
);

CREATE INDEX IF NOT EXISTS idx_lab_product_intelligence_tenant_lab
  ON public.lab_product_intelligence (tenant_id, lab_id);

CREATE INDEX IF NOT EXISTS idx_lab_product_intelligence_tenant_visit
  ON public.lab_product_intelligence (tenant_id, source_visit_id);

DROP TRIGGER IF EXISTS lab_product_intelligence_set_updated_at ON public.lab_product_intelligence;
CREATE TRIGGER lab_product_intelligence_set_updated_at
  BEFORE UPDATE ON public.lab_product_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.lab_product_intelligence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab_product_intelligence_select_by_role" ON public.lab_product_intelligence;
DROP POLICY IF EXISTS "lab_product_intelligence_insert_by_role" ON public.lab_product_intelligence;
DROP POLICY IF EXISTS "lab_product_intelligence_update_by_role" ON public.lab_product_intelligence;
DROP POLICY IF EXISTS "lab_product_intelligence_delete_by_role" ON public.lab_product_intelligence;

CREATE POLICY "lab_product_intelligence_select_by_role"
  ON public.lab_product_intelligence FOR SELECT TO authenticated
  USING (public.lab_record_is_visible_to_current_user(tenant_id, lab_id));

CREATE POLICY "lab_product_intelligence_insert_by_role"
  ON public.lab_product_intelligence FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  );

CREATE POLICY "lab_product_intelligence_update_by_role"
  ON public.lab_product_intelligence FOR UPDATE TO authenticated
  USING (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  )
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  );

CREATE POLICY "lab_product_intelligence_delete_by_role"
  ON public.lab_product_intelligence FOR DELETE TO authenticated
  USING (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  );
