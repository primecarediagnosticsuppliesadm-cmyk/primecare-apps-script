-- PrimeCare agent commission ledger (durable workflow state).
-- Calculation inputs remain public.payments / orders; this stores entries + payouts.
-- Run after production_auth_rls_pilot_migration.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- Table: public.commission_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_entries (
  id text PRIMARY KEY,
  distributor_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  registry_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_ymd text NOT NULL,
  agent_key text NOT NULL,
  agent_name text,
  collected_amount numeric(14, 2) NOT NULL DEFAULT 0,
  revenue_attributed numeric(14, 2) NOT NULL DEFAULT 0,
  commission_amount numeric(14, 2) NOT NULL DEFAULT 0,
  collection_commission numeric(14, 2) NOT NULL DEFAULT 0,
  revenue_commission numeric(14, 2) NOT NULL DEFAULT 0,
  efficiency_pct numeric(6, 2) NOT NULL DEFAULT 0,
  labs_touched integer NOT NULL DEFAULT 0,
  payment_count integer NOT NULL DEFAULT 0,
  threshold_met boolean NOT NULL DEFAULT false,
  eligible boolean NOT NULL DEFAULT false,
  phase_id text,
  rule_version text,
  status text NOT NULL DEFAULT 'pending',
  approved_at timestamptz,
  approved_by text,
  rejected_at timestamptz,
  rejected_by text,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_entries_status_check CHECK (
    status IN ('pending', 'approved', 'paid', 'rejected')
  ),
  CONSTRAINT commission_entries_period_check CHECK (period_ymd ~ '^\d{4}-\d{2}$')
);

COMMENT ON TABLE public.commission_entries IS
  'Agent commission workflow entries per distributor tenant and period.';
COMMENT ON COLUMN public.commission_entries.distributor_id IS
  'Distributor tenant scope; RLS isolation key.';
COMMENT ON COLUMN public.commission_entries.registry_tenant_id IS
  'HQ tenant context that recorded the entry.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_entries_distributor_period_agent
  ON public.commission_entries (distributor_id, period_ymd, agent_key);

CREATE INDEX IF NOT EXISTS idx_commission_entries_distributor_period_status
  ON public.commission_entries (distributor_id, period_ymd, status);

CREATE INDEX IF NOT EXISTS idx_commission_entries_distributor_updated
  ON public.commission_entries (distributor_id, updated_at DESC);

DROP TRIGGER IF EXISTS commission_entries_set_updated_at ON public.commission_entries;
CREATE TRIGGER commission_entries_set_updated_at
  BEFORE UPDATE ON public.commission_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: public.commission_payouts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commission_payouts (
  id text PRIMARY KEY,
  distributor_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  registry_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  period_ymd text NOT NULL,
  total_commission numeric(14, 2) NOT NULL DEFAULT 0,
  agent_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'paid',
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_payouts_status_check CHECK (status IN ('paid', 'void')),
  CONSTRAINT commission_payouts_period_check CHECK (period_ymd ~ '^\d{4}-\d{2}$')
);

COMMENT ON TABLE public.commission_payouts IS
  'Monthly commission payout batches per distributor tenant.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_commission_payouts_distributor_period
  ON public.commission_payouts (distributor_id, period_ymd)
  WHERE status = 'paid';

CREATE INDEX IF NOT EXISTS idx_commission_payouts_distributor_paid_at
  ON public.commission_payouts (distributor_id, paid_at DESC);

DROP TRIGGER IF EXISTS commission_payouts_set_updated_at ON public.commission_payouts;
CREATE TRIGGER commission_payouts_set_updated_at
  BEFORE UPDATE ON public.commission_payouts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — executive full access; admin own tenant only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_commission(
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
    AND public.current_user_role() IN ('admin', 'executive')
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = target_distributor_id)
    AND (
      public.current_user_role() = 'executive'
      OR public.tenant_id_matches(target_distributor_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.commission_visible_to_current_user(
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
    AND public.current_user_role() IN ('admin', 'executive')
    AND (
      public.current_user_role() = 'executive'
      OR public.tenant_id_matches(row_distributor_id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_commission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commission_visible_to_current_user(uuid) TO authenticated;

ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_entries_select ON public.commission_entries;
CREATE POLICY commission_entries_select
  ON public.commission_entries
  FOR SELECT
  TO authenticated
  USING (public.commission_visible_to_current_user(distributor_id));

DROP POLICY IF EXISTS commission_entries_insert ON public.commission_entries;
CREATE POLICY commission_entries_insert
  ON public.commission_entries
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_commission(distributor_id));

DROP POLICY IF EXISTS commission_entries_update ON public.commission_entries;
CREATE POLICY commission_entries_update
  ON public.commission_entries
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_commission(distributor_id))
  WITH CHECK (public.can_manage_commission(distributor_id));

DROP POLICY IF EXISTS commission_payouts_select ON public.commission_payouts;
CREATE POLICY commission_payouts_select
  ON public.commission_payouts
  FOR SELECT
  TO authenticated
  USING (public.commission_visible_to_current_user(distributor_id));

DROP POLICY IF EXISTS commission_payouts_insert ON public.commission_payouts;
CREATE POLICY commission_payouts_insert
  ON public.commission_payouts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_commission(distributor_id));

DROP POLICY IF EXISTS commission_payouts_update ON public.commission_payouts;
CREATE POLICY commission_payouts_update
  ON public.commission_payouts
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_commission(distributor_id))
  WITH CHECK (public.can_manage_commission(distributor_id));
