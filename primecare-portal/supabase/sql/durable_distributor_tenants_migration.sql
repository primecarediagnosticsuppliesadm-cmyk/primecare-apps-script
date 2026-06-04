-- Durable Distributor Provisioning V1: tenant metadata columns + executive-scoped RLS.
-- Does not weaken existing table RLS on other objects; adds policies only where tenants had RLS enabled without policies.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

COMMENT ON COLUMN public.tenants.metadata IS 'Provisioning config, admin contact, territories, provisioning timeline.';

DROP POLICY IF EXISTS "tenants_executive_select" ON public.tenants;
DROP POLICY IF EXISTS "tenants_executive_insert" ON public.tenants;
DROP POLICY IF EXISTS "tenants_executive_update" ON public.tenants;

CREATE POLICY "tenants_executive_select"
  ON public.tenants FOR SELECT TO authenticated
  USING (public.is_admin_or_executive());

CREATE POLICY "tenants_executive_insert"
  ON public.tenants FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_executive());

CREATE POLICY "tenants_executive_update"
  ON public.tenants FOR UPDATE TO authenticated
  USING (public.is_admin_or_executive())
  WITH CHECK (public.is_admin_or_executive());
