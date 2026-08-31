-- PrimeCare Agent Resources V1 foundation (AR-1A).
-- Tables, private bucket agent-resources, RLS, storage policies, publish RPC.
-- Idempotent. Do NOT reuse operational-evidence or invoice-pdfs.
-- Track A: apply via SQL editor after invoice_system_phase5_migration.sql.
-- Track B: supabase/migrations/20260831200000_agent_resources_v1.sql (same body).
-- Do not apply to Production from AR-1A without founder certification.

-- Integrity: children FK (resource_id, tenant_id) → resources(id, tenant_id).
-- current_published_version_id FK (id, tenant_id, version) → versions(id, resource_id, tenant_id)
-- so the pointer cannot target another resource or tenant. Circular FK added after versions exist.
-- Audience/ack profile tenant match via trigger (profiles PK is user_id only).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agent_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  category text NOT NULL,
  required_reading boolean NOT NULL DEFAULT false,
  audience_type text NOT NULL,
  current_published_version_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT agent_resources_id_tenant_uidx UNIQUE (id, tenant_id),
  CONSTRAINT agent_resources_category_check CHECK (
    category IN (
      'start_here',
      'products_services',
      'field_sales',
      'lab_os',
      'sops',
      'policies',
      'training',
      'other'
    )
  ),
  CONSTRAINT agent_resources_audience_type_check CHECK (
    audience_type IN ('all_agents', 'named_agents')
  ),
  CONSTRAINT agent_resources_title_check CHECK (length(btrim(title)) > 0)
);

CREATE TABLE IF NOT EXISTS public.agent_resource_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  version_number integer NOT NULL,
  storage_path text NOT NULL,
  original_filename text,
  mime_type text NOT NULL,
  file_size bigint NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  published_at timestamptz,
  archived_at timestamptz,
  CONSTRAINT agent_resource_versions_resource_tenant_fk
    FOREIGN KEY (resource_id, tenant_id)
    REFERENCES public.agent_resources (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT agent_resource_versions_id_resource_tenant_uidx
    UNIQUE (id, resource_id, tenant_id),
  CONSTRAINT agent_resource_versions_resource_number_uidx
    UNIQUE (resource_id, version_number),
  CONSTRAINT agent_resource_versions_number_check CHECK (version_number >= 1),
  CONSTRAINT agent_resource_versions_file_size_check CHECK (
    file_size > 0 AND file_size <= 10485760
  ),
  CONSTRAINT agent_resource_versions_mime_check CHECK (
    mime_type IN ('application/pdf', 'image/jpeg', 'image/png')
  ),
  CONSTRAINT agent_resource_versions_status_check CHECK (
    status IN ('draft', 'published', 'archived')
  ),
  CONSTRAINT agent_resource_versions_storage_path_check CHECK (
    storage_path IS NOT NULL
    AND position('..' in storage_path) = 0
    AND split_part(storage_path, '/', 1) = tenant_id::text
    AND split_part(storage_path, '/', 2) = resource_id::text
    AND split_part(storage_path, '/', 3) = id::text
    AND length(split_part(storage_path, '/', 4)) >= 8
    AND split_part(storage_path, '/', 5) = ''
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_resource_versions_one_published
  ON public.agent_resource_versions (resource_id)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_agent_resources_tenant_updated
  ON public.agent_resources (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_resource_versions_tenant_resource
  ON public.agent_resource_versions (tenant_id, resource_id, status);

ALTER TABLE public.agent_resources
  DROP CONSTRAINT IF EXISTS agent_resources_current_published_fk;

ALTER TABLE public.agent_resources
  ADD CONSTRAINT agent_resources_current_published_fk
  FOREIGN KEY (current_published_version_id, id, tenant_id)
  REFERENCES public.agent_resource_versions (id, resource_id, tenant_id)
  ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.agent_resource_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  profile_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_resource_audiences_resource_tenant_fk
    FOREIGN KEY (resource_id, tenant_id)
    REFERENCES public.agent_resources (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT agent_resource_audiences_resource_profile_uidx
    UNIQUE (resource_id, profile_user_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_resource_audiences_profile
  ON public.agent_resource_audiences (tenant_id, profile_user_id);

CREATE TABLE IF NOT EXISTS public.agent_resource_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  resource_id uuid NOT NULL,
  version_id uuid NOT NULL,
  profile_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_resource_acknowledgements_resource_tenant_fk
    FOREIGN KEY (resource_id, tenant_id)
    REFERENCES public.agent_resources (id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT agent_resource_acknowledgements_version_fk
    FOREIGN KEY (version_id, resource_id, tenant_id)
    REFERENCES public.agent_resource_versions (id, resource_id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT agent_resource_acknowledgements_unique
    UNIQUE (tenant_id, version_id, profile_user_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_resource_acks_tenant_version
  ON public.agent_resource_acknowledgements (tenant_id, version_id);

COMMENT ON TABLE public.agent_resources IS
  'Logical Agent Resources documents. Binaries live in Storage bucket agent-resources.';
COMMENT ON TABLE public.agent_resource_versions IS
  'File versions. At most one published per resource. Publish via publish_agent_resource_version only.';
COMMENT ON TABLE public.agent_resource_audiences IS
  'Named-agent audience. profile_user_id = profiles.user_id = auth.uid().';
COMMENT ON TABLE public.agent_resource_acknowledgements IS
  'Durable read acknowledgement per version. Not notification_events.';

DROP TRIGGER IF EXISTS agent_resources_set_updated_at ON public.agent_resources;
CREATE TRIGGER agent_resources_set_updated_at
  BEFORE UPDATE ON public.agent_resources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Profile must belong to the same tenant as the resource (profiles PK is user_id only).
CREATE OR REPLACE FUNCTION public.agent_resource_profile_tenant_matches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT p.tenant_id INTO v_tenant
  FROM public.profiles p
  WHERE p.user_id = NEW.profile_user_id;
  IF v_tenant IS NULL OR v_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'agent_resource_profile_tenant_mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_resource_audiences_profile_tenant
  ON public.agent_resource_audiences;
CREATE TRIGGER agent_resource_audiences_profile_tenant
  BEFORE INSERT OR UPDATE ON public.agent_resource_audiences
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_resource_profile_tenant_matches();

DROP TRIGGER IF EXISTS agent_resource_acknowledgements_profile_tenant
  ON public.agent_resource_acknowledgements;
CREATE TRIGGER agent_resource_acknowledgements_profile_tenant
  BEFORE INSERT OR UPDATE ON public.agent_resource_acknowledgements
  FOR EACH ROW
  EXECUTE FUNCTION public.agent_resource_profile_tenant_matches();

-- ---------------------------------------------------------------------------
-- Visibility helpers (do not alter is_admin_or_executive)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agent_resource_is_publisher(p_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin_or_executive()
    AND public.tenant_id_matches(p_tenant_id);
$$;

CREATE OR REPLACE FUNCTION public.agent_resource_version_visible_to_agent(
  p_resource_id uuid,
  p_version_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.current_user_role() = 'agent'
    AND (public.current_profile()).user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.agent_resources r
      INNER JOIN public.agent_resource_versions v
        ON v.id = r.current_published_version_id
       AND v.resource_id = r.id
       AND v.tenant_id = r.tenant_id
      WHERE r.id = p_resource_id
        AND v.id = p_version_id
        AND public.tenant_id_matches(r.tenant_id)
        AND r.archived_at IS NULL
        AND v.status = 'published'
        AND (
          r.audience_type = 'all_agents'
          OR EXISTS (
            SELECT 1
            FROM public.agent_resource_audiences a
            WHERE a.resource_id = r.id
              AND a.tenant_id = r.tenant_id
              AND a.profile_user_id = auth.uid()
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.agent_resource_path_tenant_id(object_path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN object_path IS NULL OR btrim(object_path) = '' THEN NULL
    WHEN split_part(object_path, '/', 1) ~ '^[0-9a-fA-F-]{36}$'
      THEN split_part(object_path, '/', 1)::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.agent_resource_path_resource_id(object_path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN split_part(object_path, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
      THEN split_part(object_path, '/', 2)::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.agent_resource_path_version_id(object_path text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN split_part(object_path, '/', 3) ~ '^[0-9a-fA-F-]{36}$'
      THEN split_part(object_path, '/', 3)::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.agent_resource_storage_can_read(object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.agent_resource_path_tenant_id(object_path) IS NOT NULL
    AND public.agent_resource_path_resource_id(object_path) IS NOT NULL
    AND public.agent_resource_path_version_id(object_path) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.agent_resource_versions v
      WHERE v.storage_path = object_path
        AND v.id = public.agent_resource_path_version_id(object_path)
        AND v.resource_id = public.agent_resource_path_resource_id(object_path)
        AND v.tenant_id = public.agent_resource_path_tenant_id(object_path)
        AND (
          public.agent_resource_is_publisher(v.tenant_id)
          OR public.agent_resource_version_visible_to_agent(v.resource_id, v.id)
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.agent_resource_storage_can_insert(object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin_or_executive()
    AND public.agent_resource_path_tenant_id(object_path) IS NOT NULL
    AND public.tenant_id_matches(public.agent_resource_path_tenant_id(object_path))
    AND EXISTS (
      SELECT 1
      FROM public.agent_resource_versions v
      WHERE v.storage_path = object_path
        AND v.status = 'draft'
        AND v.id = public.agent_resource_path_version_id(object_path)
        AND v.resource_id = public.agent_resource_path_resource_id(object_path)
        AND v.tenant_id = public.agent_resource_path_tenant_id(object_path)
    );
$$;

-- ---------------------------------------------------------------------------
-- Atomic publish
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_agent_resource_version(p_version_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version_id uuid;
  v_resource_id uuid;
  v_tenant_id uuid;
  v_status text;
  v_resource_tenant uuid;
  v_audience_type text;
  v_archived_at timestamptz;
BEGIN
  IF p_version_id IS NULL THEN
    RAISE EXCEPTION 'agent_resource_publish_version_required';
  END IF;

  IF NOT public.is_admin_or_executive() THEN
    RAISE EXCEPTION 'agent_resource_publish_forbidden';
  END IF;

  SELECT id, resource_id, tenant_id, status
  INTO v_version_id, v_resource_id, v_tenant_id, v_status
  FROM public.agent_resource_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF v_version_id IS NULL THEN
    RAISE EXCEPTION 'agent_resource_version_not_found';
  END IF;

  IF NOT public.tenant_id_matches(v_tenant_id) THEN
    RAISE EXCEPTION 'agent_resource_publish_tenant_mismatch';
  END IF;

  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'agent_resource_publish_not_draft';
  END IF;

  SELECT id, tenant_id, audience_type, archived_at
  INTO v_resource_id, v_resource_tenant, v_audience_type, v_archived_at
  FROM public.agent_resources
  WHERE id = v_resource_id
  FOR UPDATE;

  IF v_resource_id IS NULL THEN
    RAISE EXCEPTION 'agent_resource_not_found';
  END IF;

  IF v_resource_tenant IS DISTINCT FROM v_tenant_id THEN
    RAISE EXCEPTION 'agent_resource_publish_tenant_mismatch';
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'agent_resource_publish_resource_archived';
  END IF;

  IF v_audience_type = 'named_agents' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.agent_resource_audiences a
      WHERE a.resource_id = v_resource_id
        AND a.tenant_id = v_resource_tenant
    ) THEN
      RAISE EXCEPTION 'agent_resource_publish_named_audience_empty';
    END IF;
  END IF;

  UPDATE public.agent_resource_versions
  SET
    status = 'archived',
    archived_at = now()
  WHERE resource_id = v_resource_id
    AND tenant_id = v_resource_tenant
    AND status = 'published';

  UPDATE public.agent_resource_versions
  SET
    status = 'published',
    published_by = auth.uid(),
    published_at = now(),
    archived_at = NULL
  WHERE id = p_version_id;

  UPDATE public.agent_resources
  SET current_published_version_id = p_version_id
  WHERE id = v_resource_id;

  RETURN p_version_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Table RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.agent_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_resource_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_resource_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_resource_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_resources_select ON public.agent_resources;
CREATE POLICY agent_resources_select
  ON public.agent_resources
  FOR SELECT
  TO authenticated
  USING (
    public.agent_resource_is_publisher(tenant_id)
    OR (
      archived_at IS NULL
      AND current_published_version_id IS NOT NULL
      AND public.agent_resource_version_visible_to_agent(id, current_published_version_id)
    )
  );

DROP POLICY IF EXISTS agent_resources_insert ON public.agent_resources;
CREATE POLICY agent_resources_insert
  ON public.agent_resources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.agent_resource_is_publisher(tenant_id)
    AND current_published_version_id IS NULL
    AND (created_by IS NULL OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS agent_resources_update ON public.agent_resources;
CREATE POLICY agent_resources_update
  ON public.agent_resources
  FOR UPDATE
  TO authenticated
  USING (public.agent_resource_is_publisher(tenant_id))
  WITH CHECK (public.agent_resource_is_publisher(tenant_id));

DROP POLICY IF EXISTS agent_resource_versions_select ON public.agent_resource_versions;
CREATE POLICY agent_resource_versions_select
  ON public.agent_resource_versions
  FOR SELECT
  TO authenticated
  USING (
    public.agent_resource_is_publisher(tenant_id)
    OR public.agent_resource_version_visible_to_agent(resource_id, id)
  );

DROP POLICY IF EXISTS agent_resource_versions_insert ON public.agent_resource_versions;
CREATE POLICY agent_resource_versions_insert
  ON public.agent_resource_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.agent_resource_is_publisher(tenant_id)
    AND status = 'draft'
    AND published_by IS NULL
    AND published_at IS NULL
    AND archived_at IS NULL
    AND (created_by IS NULL OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS agent_resource_audiences_select ON public.agent_resource_audiences;
CREATE POLICY agent_resource_audiences_select
  ON public.agent_resource_audiences
  FOR SELECT
  TO authenticated
  USING (
    public.agent_resource_is_publisher(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND profile_user_id = auth.uid()
      AND public.tenant_id_matches(tenant_id)
    )
  );

DROP POLICY IF EXISTS agent_resource_audiences_insert ON public.agent_resource_audiences;
CREATE POLICY agent_resource_audiences_insert
  ON public.agent_resource_audiences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.agent_resource_is_publisher(tenant_id)
    AND (created_by IS NULL OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS agent_resource_audiences_update ON public.agent_resource_audiences;
CREATE POLICY agent_resource_audiences_update
  ON public.agent_resource_audiences
  FOR UPDATE
  TO authenticated
  USING (public.agent_resource_is_publisher(tenant_id))
  WITH CHECK (public.agent_resource_is_publisher(tenant_id));

DROP POLICY IF EXISTS agent_resource_audiences_delete ON public.agent_resource_audiences;
CREATE POLICY agent_resource_audiences_delete
  ON public.agent_resource_audiences
  FOR DELETE
  TO authenticated
  USING (public.agent_resource_is_publisher(tenant_id));

DROP POLICY IF EXISTS agent_resource_acknowledgements_select ON public.agent_resource_acknowledgements;
CREATE POLICY agent_resource_acknowledgements_select
  ON public.agent_resource_acknowledgements
  FOR SELECT
  TO authenticated
  USING (
    public.agent_resource_is_publisher(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND profile_user_id = auth.uid()
      AND public.tenant_id_matches(tenant_id)
    )
  );

DROP POLICY IF EXISTS agent_resource_acknowledgements_insert ON public.agent_resource_acknowledgements;
CREATE POLICY agent_resource_acknowledgements_insert
  ON public.agent_resource_acknowledgements
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() = 'agent'
    AND profile_user_id = auth.uid()
    AND public.tenant_id_matches(tenant_id)
    AND public.agent_resource_version_visible_to_agent(resource_id, version_id)
  );

-- No UPDATE/DELETE policies on acknowledgements or versions (publish via RPC).
-- No DELETE policies on resources/versions.

-- ---------------------------------------------------------------------------
-- Grants / revokes — publish columns not granted to authenticated
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.agent_resources FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_resources FROM anon;
REVOKE ALL ON TABLE public.agent_resources FROM authenticated;
REVOKE ALL ON TABLE public.agent_resource_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_resource_versions FROM anon;
REVOKE ALL ON TABLE public.agent_resource_versions FROM authenticated;
REVOKE ALL ON TABLE public.agent_resource_audiences FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_resource_audiences FROM anon;
REVOKE ALL ON TABLE public.agent_resource_audiences FROM authenticated;
REVOKE ALL ON TABLE public.agent_resource_acknowledgements FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_resource_acknowledgements FROM anon;
REVOKE ALL ON TABLE public.agent_resource_acknowledgements FROM authenticated;

GRANT SELECT, INSERT ON TABLE public.agent_resources TO authenticated;
GRANT UPDATE (
  title,
  description,
  category,
  required_reading,
  audience_type,
  archived_at,
  updated_at
) ON TABLE public.agent_resources TO authenticated;

GRANT SELECT, INSERT ON TABLE public.agent_resource_versions TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_resource_audiences TO authenticated;

GRANT SELECT, INSERT ON TABLE public.agent_resource_acknowledgements TO authenticated;

REVOKE ALL ON FUNCTION public.agent_resource_is_publisher(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_version_visible_to_agent(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_path_tenant_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_path_resource_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_path_version_id(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_storage_can_read(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_storage_can_insert(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_agent_resource_version(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agent_resource_profile_tenant_matches() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.agent_resource_is_publisher(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_version_visible_to_agent(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_path_tenant_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_path_resource_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_path_version_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_storage_can_read(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agent_resource_storage_can_insert(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_agent_resource_version(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Private storage bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-resources',
  'agent-resources',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS agent_resources_storage_select ON storage.objects;
CREATE POLICY agent_resources_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'agent-resources'
    AND public.agent_resource_storage_can_read(name)
  );

DROP POLICY IF EXISTS agent_resources_storage_insert ON storage.objects;
CREATE POLICY agent_resources_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'agent-resources'
    AND public.agent_resource_storage_can_insert(name)
  );

-- No UPDATE or DELETE policies: authenticated cannot mutate/remove objects.
