-- Atomic Add Lab (labs + ar_credit_control) and RLS-safe lab existence check.
--
-- Root cause: can_insert_ar_for_lab() used EXISTS (SELECT FROM labs ...) inside
-- SECURITY DEFINER, but PostgreSQL still applies RLS using the *invoker* on that
-- SELECT. After a separate REST insert, the caller often cannot SELECT the new lab
-- row (executive cross-tenant / missing labs_executive_select_distributor), so
-- ar_credit_insert_by_role WITH CHECK evaluates FALSE even though the lab exists.
--
-- Fixes:
--   1) private_labs_row_exists — table-owner read bypasses RLS for existence checks
--   2) can_insert_ar_for_lab — delegates to private_labs_row_exists
--   3) create_lab_with_ar_credit — single transaction for both inserts
--
-- Idempotent. No anon grants. No USING(true).

-- ---------------------------------------------------------------------------
-- RLS-safe lab existence (owner read; not granted to authenticated)
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
-- Repair can_insert_ar_for_lab (used by ar_credit_insert_by_role)
-- ---------------------------------------------------------------------------
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
GRANT EXECUTE ON FUNCTION public.can_insert_ar_for_lab(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Atomic create: labs + ar_credit_control (single transaction)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_lab_with_ar_credit(
  p_tenant_id uuid,
  p_lab_id text,
  p_lab_name text,
  p_owner_name text,
  p_phone text,
  p_area text,
  p_credit_terms text,
  p_credit_limit numeric DEFAULT 0,
  p_collections_notes text DEFAULT NULL,
  p_status text DEFAULT 'ACTIVE'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lab_id text;
  v_lab public.labs%ROWTYPE;
  v_ar public.ar_credit_control%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_required';
  END IF;

  v_lab_id := public.primecare_normalize_lab_id(p_lab_id);
  IF v_lab_id IS NULL OR btrim(p_lab_name) = '' THEN
    RAISE EXCEPTION 'lab_args_required';
  END IF;

  IF NOT public.can_insert_lab_for_tenant(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.private_labs_row_exists(p_tenant_id, v_lab_id) THEN
    RAISE EXCEPTION 'lab_already_exists';
  END IF;

  INSERT INTO public.labs (
    tenant_id,
    lab_id,
    lab_name,
    owner_name,
    phone,
    area,
    credit_terms,
    status
  )
  VALUES (
    p_tenant_id,
    v_lab_id,
    btrim(p_lab_name),
    nullif(btrim(p_owner_name), ''),
    nullif(btrim(p_phone), ''),
    nullif(btrim(p_area), ''),
    nullif(btrim(p_credit_terms), ''),
    COALESCE(nullif(btrim(p_status), ''), 'ACTIVE')
  )
  RETURNING * INTO v_lab;

  INSERT INTO public.ar_credit_control (
    tenant_id,
    lab_id,
    lab_name,
    credit_limit,
    outstanding,
    total_delivered,
    total_paid,
    collections_notes
  )
  VALUES (
    p_tenant_id,
    v_lab_id,
    btrim(p_lab_name),
    COALESCE(p_credit_limit, 0),
    0,
    0,
    0,
    p_collections_notes
  )
  RETURNING * INTO v_ar;

  RETURN jsonb_build_object(
    'success', true,
    'lab', to_jsonb(v_lab),
    'ar', to_jsonb(v_ar)
  );
END;
$$;

ALTER FUNCTION public.create_lab_with_ar_credit(
  uuid, text, text, text, text, text, text, numeric, text, text
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_lab_with_ar_credit(
  uuid, text, text, text, text, text, text, numeric, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_lab_with_ar_credit(
  uuid, text, text, text, text, text, text, numeric, text, text
) TO authenticated;
