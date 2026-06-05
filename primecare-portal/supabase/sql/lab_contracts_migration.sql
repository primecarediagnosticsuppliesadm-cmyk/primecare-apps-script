-- PrimeCare Lab Commercial Contracts — durable Distributor ↔ Lab terms.
-- Separate from PrimeCare ↔ Distributor platform agreement (tenants.metadata.config dates).
-- Run after production_auth_rls_pilot_migration.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- Table: public.lab_contracts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lab_contracts (
  id text PRIMARY KEY,
  contract_number text NOT NULL,
  distributor_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  registry_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lab_id text NOT NULL,
  lab_name text,
  distributor_name text,
  contract_type text NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  start_date date NOT NULL,
  end_date date NOT NULL,
  auto_renewal boolean NOT NULL DEFAULT false,
  owner text,
  notes text,
  payment_terms text,
  credit_limit numeric(14, 2) NOT NULL DEFAULT 0,
  collection_target_pct numeric(5, 2) NOT NULL DEFAULT 0,
  monthly_commitment numeric(14, 2) NOT NULL DEFAULT 0,
  distributor_margin_pct numeric(5, 2) NOT NULL DEFAULT 0,
  primecare_margin_pct numeric(5, 2) NOT NULL DEFAULT 0,
  l1b jsonb,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_contracts_distributor_contract_number_key
    UNIQUE (distributor_id, contract_number),
  CONSTRAINT lab_contracts_type_check CHECK (
    contract_type IN (
      'L1A Consumables',
      'L1B Reagent Rental',
      'Lab OS',
      'Hybrid'
    )
  ),
  CONSTRAINT lab_contracts_status_check CHECK (
    status IN (
      'Draft',
      'Under Review',
      'Active',
      'Suspended',
      'Expired',
      'Terminated'
    )
  ),
  CONSTRAINT lab_contracts_date_range_check CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.lab_contracts IS
  'Distributor ↔ Lab commercial contracts (L1A, L1B, Lab OS, Hybrid). Not the PrimeCare ↔ Distributor platform agreement.';
COMMENT ON COLUMN public.lab_contracts.distributor_id IS
  'Distributor tenant scope for RLS, launch gates, and OS views.';
COMMENT ON COLUMN public.lab_contracts.registry_tenant_id IS
  'Registry bucket that created the row (HQ or distributor localStorage key tenant).';
COMMENT ON COLUMN public.lab_contracts.metadata IS
  'Migration provenance, legacy keys, and non-core extensions.';

CREATE INDEX IF NOT EXISTS idx_lab_contracts_distributor_status
  ON public.lab_contracts (distributor_id, status);

CREATE INDEX IF NOT EXISTS idx_lab_contracts_distributor_lab
  ON public.lab_contracts (
    distributor_id,
    public.primecare_normalize_lab_id(lab_id)
  );

CREATE INDEX IF NOT EXISTS idx_lab_contracts_end_date
  ON public.lab_contracts (end_date);

DROP TRIGGER IF EXISTS lab_contracts_set_updated_at ON public.lab_contracts;
CREATE TRIGGER lab_contracts_set_updated_at
  BEFORE UPDATE ON public.lab_contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers — HQ executive operates any distributor; admin scoped to profile tenant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_lab_contract_for_distributor(
  target_distributor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_distributor_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = target_distributor_id)
    AND (
      public.current_user_role() = 'executive'
      OR (
        public.current_user_role() = 'admin'
        AND public.tenant_id_matches(target_distributor_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.lab_contract_visible_to_current_user(
  row_distributor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    row_distributor_id IS NOT NULL
    AND (
      public.is_admin_or_executive()
      OR public.tenant_id_matches(row_distributor_id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_lab_contract_for_distributor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lab_contract_visible_to_current_user(uuid) TO authenticated;

ALTER TABLE public.lab_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_contracts_select ON public.lab_contracts;
CREATE POLICY lab_contracts_select
  ON public.lab_contracts
  FOR SELECT
  TO authenticated
  USING (public.lab_contract_visible_to_current_user(distributor_id));

DROP POLICY IF EXISTS lab_contracts_insert ON public.lab_contracts;
CREATE POLICY lab_contracts_insert
  ON public.lab_contracts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_lab_contract_for_distributor(distributor_id));

DROP POLICY IF EXISTS lab_contracts_update ON public.lab_contracts;
CREATE POLICY lab_contracts_update
  ON public.lab_contracts
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_lab_contract_for_distributor(distributor_id))
  WITH CHECK (public.can_manage_lab_contract_for_distributor(distributor_id));

DROP POLICY IF EXISTS lab_contracts_delete ON public.lab_contracts;
CREATE POLICY lab_contracts_delete
  ON public.lab_contracts
  FOR DELETE
  TO authenticated
  USING (public.can_manage_lab_contract_for_distributor(distributor_id));
