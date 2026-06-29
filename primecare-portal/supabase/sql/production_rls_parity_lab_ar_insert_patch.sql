-- Production-only RLS parity patch: Add Lab → ar_credit_control INSERT (403 after labs 201).
-- Root cause: can_insert_ar_for_lab() EXISTS (SELECT FROM labs) runs under invoker RLS;
-- caller cannot SELECT the lab row they just inserted (split REST requests / executive
-- cross-tenant SELECT gap), so ar_credit_insert_by_role WITH CHECK evaluates FALSE.
--
-- Safe: idempotent, no anon grants, no USING(true), no RLS weakening.
-- Apply in Production Supabase SQL editor (alxhrnotnvwpblsiadxj).
-- Prefer full fix: supabase/sql/create_lab_with_ar_credit_rpc.sql

-- ---------------------------------------------------------------------------
-- RLS-safe lab existence (table-owner read)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.private_labs_row_exists(
  target_tenant_id uuid,
  target_lab_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.labs l
    WHERE l.tenant_id = target_tenant_id
      AND public.primecare_normalize_lab_id(l.lab_id)
        = public.primecare_normalize_lab_id(target_lab_id)
  );
$$;

ALTER FUNCTION public.private_labs_row_exists(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.private_labs_row_exists(uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Helpers (match QA executive_distributor_lab_create_migration.sql)
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
    AND public.private_labs_row_exists(target_tenant_id, target_lab_id);
$$;

ALTER FUNCTION public.can_insert_ar_for_lab(uuid, text) OWNER TO postgres;

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

-- Table privilege (RLS still enforced)
GRANT INSERT ON TABLE public.ar_credit_control TO authenticated;

-- ---------------------------------------------------------------------------
-- labs INSERT policy (executive cross-tenant + admin same-tenant)
-- Coexists with labs_admin_write from pilot migration.
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
-- ar_credit_control INSERT (the missing policy causing prod 403)
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
