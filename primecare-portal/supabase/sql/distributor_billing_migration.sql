-- PrimeCare ↔ Distributor platform billing payments (HQ fee collection).
-- NOT lab AR (public.payments) and NOT lab commercial contracts (public.lab_contracts).
-- Run after production_auth_rls_pilot_migration.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- Table: public.distributor_billing_payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distributor_billing_payments (
  id text PRIMARY KEY,
  distributor_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  registry_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'INR',
  payment_type text NOT NULL DEFAULT 'platform_fee',
  payment_date date NOT NULL DEFAULT (CURRENT_DATE),
  paid_at timestamptz NOT NULL DEFAULT now(),
  period_ymd date,
  mode text,
  reference text,
  note text,
  recorded_by text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distributor_billing_payments_type_check CHECK (
    payment_type IN ('platform_fee', 'opening_balance', 'adjustment', 'refund')
  )
);

COMMENT ON TABLE public.distributor_billing_payments IS
  'Distributor → PrimeCare HQ platform fee receipts. Separate from lab collections (payments).';
COMMENT ON COLUMN public.distributor_billing_payments.distributor_id IS
  'Distributor tenant that paid HQ; RLS isolation key.';
COMMENT ON COLUMN public.distributor_billing_payments.registry_tenant_id IS
  'HQ tenant context that recorded the payment.';
COMMENT ON COLUMN public.distributor_billing_payments.metadata IS
  'Migration provenance and audit refs — not authoritative for amount due.';

CREATE INDEX IF NOT EXISTS idx_dbp_distributor_payment_date
  ON public.distributor_billing_payments (distributor_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_dbp_distributor_paid_at
  ON public.distributor_billing_payments (distributor_id, paid_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dbp_opening_balance_once
  ON public.distributor_billing_payments (distributor_id)
  WHERE payment_type = 'opening_balance';

DROP TRIGGER IF EXISTS distributor_billing_payments_set_updated_at
  ON public.distributor_billing_payments;
CREATE TRIGGER distributor_billing_payments_set_updated_at
  BEFORE UPDATE ON public.distributor_billing_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers — executive operates any distributor; admin scoped to profile tenant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_distributor_billing(
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

CREATE OR REPLACE FUNCTION public.distributor_billing_visible_to_current_user(
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

GRANT EXECUTE ON FUNCTION public.can_manage_distributor_billing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.distributor_billing_visible_to_current_user(uuid) TO authenticated;

ALTER TABLE public.distributor_billing_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS distributor_billing_payments_select ON public.distributor_billing_payments;
CREATE POLICY distributor_billing_payments_select
  ON public.distributor_billing_payments
  FOR SELECT
  TO authenticated
  USING (public.distributor_billing_visible_to_current_user(distributor_id));

DROP POLICY IF EXISTS distributor_billing_payments_insert ON public.distributor_billing_payments;
CREATE POLICY distributor_billing_payments_insert
  ON public.distributor_billing_payments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_distributor_billing(distributor_id));

DROP POLICY IF EXISTS distributor_billing_payments_update ON public.distributor_billing_payments;
CREATE POLICY distributor_billing_payments_update
  ON public.distributor_billing_payments
  FOR UPDATE
  TO authenticated
  USING (public.can_manage_distributor_billing(distributor_id))
  WITH CHECK (public.can_manage_distributor_billing(distributor_id));
