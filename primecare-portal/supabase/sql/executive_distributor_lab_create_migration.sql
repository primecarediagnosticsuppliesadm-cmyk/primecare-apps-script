-- Executive / distributor-admin lab creation for Launch Distributor flows.
-- Fixes RLS blocking INSERT into labs + ar_credit_control when tenant_id is a distributor
-- (not the signed-in executive's home tenant_id).
-- Idempotent. No anon policies. Non-executive roles remain tenant-scoped.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_insert_lab_for_tenant(target_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    target_tenant_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = target_tenant_id)
    AND (
      public.current_user_role() = 'executive'
      OR (
        public.current_user_role() = 'admin'
        AND public.tenant_id_matches(target_tenant_id)
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_insert_ar_for_lab(
  target_tenant_id uuid,
  target_lab_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.can_insert_lab_for_tenant(target_tenant_id)
    AND EXISTS (
      SELECT 1
      FROM public.labs l
      WHERE l.tenant_id = target_tenant_id
        AND public.primecare_normalize_lab_id(l.lab_id)
          = public.primecare_normalize_lab_id(target_lab_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.lab_is_visible_to_executive_distributor(row_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_role() = 'executive'
    AND row_tenant_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = row_tenant_id);
$$;

GRANT EXECUTE ON FUNCTION public.can_insert_lab_for_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_insert_ar_for_lab(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lab_is_visible_to_executive_distributor(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- labs: INSERT for distributor tenants + executive cross-tenant SELECT
-- ---------------------------------------------------------------------------
ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "labs_insert_distributor_by_role" ON public.labs;
CREATE POLICY "labs_insert_distributor_by_role"
  ON public.labs FOR INSERT TO authenticated
  WITH CHECK (public.can_insert_lab_for_tenant(tenant_id));

DROP POLICY IF EXISTS "labs_executive_select_distributor" ON public.labs;
CREATE POLICY "labs_executive_select_distributor"
  ON public.labs FOR SELECT TO authenticated
  USING (public.lab_is_visible_to_executive_distributor(tenant_id));

-- ---------------------------------------------------------------------------
-- ar_credit_control: INSERT for distributor labs (was missing) + executive SELECT
-- ---------------------------------------------------------------------------
ALTER TABLE public.ar_credit_control ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "temp_anon_ar_credit_select" ON public.ar_credit_control;
DROP POLICY IF EXISTS "temp_anon_ar_credit_update" ON public.ar_credit_control;
DROP POLICY IF EXISTS "temp_anon_ar_select" ON public.ar_credit_control;
DROP POLICY IF EXISTS "temp_anon_ar_update" ON public.ar_credit_control;

DROP POLICY IF EXISTS "ar_credit_insert_by_role" ON public.ar_credit_control;
CREATE POLICY "ar_credit_insert_by_role"
  ON public.ar_credit_control FOR INSERT TO authenticated
  WITH CHECK (public.can_insert_ar_for_lab(tenant_id, lab_id));

DROP POLICY IF EXISTS "ar_credit_executive_select_distributor" ON public.ar_credit_control;
CREATE POLICY "ar_credit_executive_select_distributor"
  ON public.ar_credit_control FOR SELECT TO authenticated
  USING (public.lab_is_visible_to_executive_distributor(tenant_id));
