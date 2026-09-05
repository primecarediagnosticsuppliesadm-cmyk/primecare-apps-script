-- Agent Prospect 2A — sourced_by_agent_id + create_prospect_lab RPC.
--
-- Certified architecture (Flow 2A only):
--   * Use existing public.labs (no new lab table).
--   * sourced_by_agent_id = immutable acquisition attribution (NOT ownership).
--   * Do NOT backfill historical Labs.
--   * Do NOT set assigned_agent_id from sourced_by during prospect creation.
--   * Agents create PROSPECT rows only via create_prospect_lab (no generic INSERT).
--   * No AR, lab user, invoice, shipment, inventory, payment, or lab_ownership.
--
-- Apply via supabase db query --linked after assert-supabase-environment --expect=qa.
-- Do NOT apply to Production in 2A. Do NOT use supabase db push.

-- ---------------------------------------------------------------------------
-- A. Column (nullable; existing rows remain NULL)
-- ---------------------------------------------------------------------------
ALTER TABLE public.labs
  ADD COLUMN IF NOT EXISTS sourced_by_agent_id text NULL;

COMMENT ON COLUMN public.labs.sourced_by_agent_id IS
  'Immutable acquisition attribution: profiles.agent_id of the Agent who sourced the Lab. NOT current ownership. Do not backfill from assigned_agent_id / agent_id / agent_name / lab_ownership.';

-- ---------------------------------------------------------------------------
-- B. Bounded partial index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS labs_tenant_sourced_by_agent_id_idx
  ON public.labs (tenant_id, sourced_by_agent_id)
  WHERE sourced_by_agent_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- C. Immutability — ordinary authenticated UPDATE cannot change sourced_by.
--    Service role JWT and postgres sessions without auth.uid() (migrations)
--    may still SET the column when required.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.labs_sourced_by_agent_id_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jwt_role text;
BEGIN
  IF NEW.sourced_by_agent_id IS NOT DISTINCT FROM OLD.sourced_by_agent_id THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_jwt_role := coalesce(auth.jwt() ->> 'role', '');
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := '';
  END;

  IF v_jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'sourced_by_immutable';
END;
$$;

ALTER FUNCTION public.labs_sourced_by_agent_id_immutable() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.labs_sourced_by_agent_id_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.labs_sourced_by_agent_id_immutable() FROM anon;
REVOKE ALL ON FUNCTION public.labs_sourced_by_agent_id_immutable() FROM authenticated;

DROP TRIGGER IF EXISTS labs_sourced_by_agent_id_immutable_trg ON public.labs;
CREATE TRIGGER labs_sourced_by_agent_id_immutable_trg
  BEFORE UPDATE ON public.labs
  FOR EACH ROW
  EXECUTE FUNCTION public.labs_sourced_by_agent_id_immutable();

-- ---------------------------------------------------------------------------
-- D. Agent visibility: same-tenant sourced_by_agent_id OR existing assignment path.
--    Lab users remain own lab_id only. Admin/executive tenant visibility unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lab_is_visible_to_current_user(
  row_tenant_id uuid,
  row_lab_id text,
  row_agent_id text DEFAULT NULL,
  row_agent_name text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.tenant_id_matches(row_tenant_id)
    AND (
      public.is_admin_or_executive()
      OR (
        public.current_user_role() = 'lab'
        AND public.primecare_normalize_lab_id(row_lab_id) = public.current_profile_lab_id()
      )
      OR (
        public.current_user_role() = 'agent'
        AND (
          nullif(btrim(row_agent_id), '') = public.current_profile_agent_id()
          OR lower(nullif(btrim(row_agent_name), '')) = public.current_profile_agent_name()
          OR EXISTS (
            SELECT 1
            FROM public.labs vis
            WHERE vis.tenant_id = row_tenant_id
              AND public.primecare_normalize_lab_id(vis.lab_id)
                = public.primecare_normalize_lab_id(row_lab_id)
              AND nullif(btrim(vis.sourced_by_agent_id), '') = public.current_profile_agent_id()
          )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.lab_record_is_visible_to_current_user(
  row_tenant_id uuid,
  row_lab_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.tenant_id_matches(row_tenant_id)
    AND (
      public.is_admin_or_executive()
      OR (
        public.current_user_role() = 'lab'
        AND public.primecare_normalize_lab_id(row_lab_id) = public.current_profile_lab_id()
      )
      OR (
        public.current_user_role() = 'agent'
        AND EXISTS (
          SELECT 1
          FROM public.labs l
          WHERE l.tenant_id = row_tenant_id
            AND public.primecare_normalize_lab_id(l.lab_id) = public.primecare_normalize_lab_id(row_lab_id)
            AND (
              nullif(btrim(COALESCE(l.agent_id, l.assigned_agent_id)), '') = public.current_profile_agent_id()
              OR lower(nullif(btrim(l.agent_name), '')) = public.current_profile_agent_name()
              OR nullif(btrim(l.sourced_by_agent_id), '') = public.current_profile_agent_id()
            )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.lab_record_is_visible_to_current_user(
  row_tenant_id text,
  row_lab_id text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN row_tenant_id IS NULL OR btrim(row_tenant_id) = '' THEN false
      ELSE public.lab_record_is_visible_to_current_user(row_tenant_id::uuid, row_lab_id)
    END;
$$;

GRANT EXECUTE ON FUNCTION public.lab_is_visible_to_current_user(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lab_record_is_visible_to_current_user(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lab_record_is_visible_to_current_user(text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- E. create_prospect_lab — Agent-only, identity derived server-side
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_prospect_lab(
  p_lab_name text,
  p_owner_name text,
  p_phone text,
  p_area text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_profile public.profiles%ROWTYPE;
  v_tenant uuid;
  v_agent_id text;
  v_lab_name text;
  v_owner_name text;
  v_phone text;
  v_area text;
  v_phone_digits text;
  v_name_n text;
  v_area_n text;
  v_lab_id text;
  v_attempt integer;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'prospect_unauthenticated';
  END IF;

  SELECT p.*
    INTO v_profile
  FROM public.profiles p
  WHERE p.user_id = v_uid
  ORDER BY p.active DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'prospect_profile_missing';
  END IF;

  IF COALESCE(v_profile.active, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'prospect_inactive';
  END IF;

  IF lower(btrim(COALESCE(v_profile.role, ''))) <> 'agent' THEN
    RAISE EXCEPTION 'prospect_not_agent';
  END IF;

  v_tenant := v_profile.tenant_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'prospect_tenant_required';
  END IF;

  v_agent_id := nullif(btrim(v_profile.agent_id), '');
  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'prospect_agent_id_required';
  END IF;

  v_lab_name := btrim(COALESCE(p_lab_name, ''));
  v_owner_name := btrim(COALESCE(p_owner_name, ''));
  v_phone := btrim(COALESCE(p_phone, ''));
  v_area := btrim(COALESCE(p_area, ''));
  v_phone_digits := nullif(regexp_replace(v_phone, '[^0-9]', '', 'g'), '');

  IF v_lab_name = '' OR v_owner_name = '' OR v_phone = '' OR v_area = '' OR v_phone_digits IS NULL THEN
    RAISE EXCEPTION 'prospect_args_required';
  END IF;

  v_name_n := lower(btrim(regexp_replace(v_lab_name, '\s+', ' ', 'g')));
  v_area_n := lower(btrim(regexp_replace(v_area, '\s+', ' ', 'g')));

  IF EXISTS (
    SELECT 1
    FROM public.labs l
    WHERE l.tenant_id = v_tenant
      AND nullif(regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g'), '') = v_phone_digits
  ) THEN
    RAISE EXCEPTION 'prospect_phone_exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.labs l
    WHERE l.tenant_id = v_tenant
      AND lower(btrim(regexp_replace(COALESCE(l.lab_name, ''), '\s+', ' ', 'g'))) = v_name_n
      AND lower(btrim(regexp_replace(COALESCE(l.area, ''), '\s+', ' ', 'g'))) = v_area_n
  ) THEN
    RAISE EXCEPTION 'prospect_name_area_exists';
  END IF;

  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;
    v_lab_id := public.primecare_normalize_lab_id(
      'LAB-P-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
    );
    EXIT WHEN v_lab_id IS NOT NULL
      AND NOT public.private_labs_row_exists(v_tenant, v_lab_id);
    IF v_attempt >= 8 THEN
      RAISE EXCEPTION 'prospect_lab_id_collision';
    END IF;
  END LOOP;

  INSERT INTO public.labs (
    tenant_id,
    lab_id,
    lab_name,
    owner_name,
    phone,
    area,
    status,
    sourced_by_agent_id,
    ordering_mode
  )
  VALUES (
    v_tenant,
    v_lab_id,
    v_lab_name,
    v_owner_name,
    v_phone,
    v_area,
    'PROSPECT',
    v_agent_id,
    'hq_managed'
  );

  INSERT INTO public.user_provisioning_events (
    hq_tenant_id,
    subject_user_id,
    event_type,
    actor_user_id,
    payload
  )
  VALUES (
    v_tenant,
    v_uid,
    'created',
    v_uid,
    jsonb_build_object(
      'action', 'lab_prospect_created',
      'tenant_id', v_tenant,
      'lab_id', v_lab_id,
      'sourced_by_agent_id', v_agent_id,
      'user_id', v_uid
    )
  );

  RETURN jsonb_build_object(
    'lab_id', v_lab_id,
    'lab_name', v_lab_name,
    'status', 'PROSPECT',
    'sourced_by_agent_id', v_agent_id
  );
END;
$$;

ALTER FUNCTION public.create_prospect_lab(text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_prospect_lab(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_prospect_lab(text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_prospect_lab(text, text, text, text) TO authenticated;

COMMENT ON FUNCTION public.create_prospect_lab(text, text, text, text) IS
  'Agent-only PROSPECT lab create. Tenant and sourced_by_agent_id derived from the authenticated profiles row. Does not create AR, ownership, or lab users.';

NOTIFY pgrst, 'reload schema';
