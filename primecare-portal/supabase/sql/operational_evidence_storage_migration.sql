-- PrimeCare Operational Evidence — durable metadata + private Storage bucket.
-- Run after production_auth_rls_pilot_migration.sql. Idempotent.
-- Path format: {tenant_id}/{evidence_type}/{record_id}/{file_name}

-- ---------------------------------------------------------------------------
-- Metadata table (cross-session / cross-browser evidence index)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.operational_evidence (
  evidence_id text PRIMARY KEY,
  tenant_id uuid NOT NULL,
  lab_id text NOT NULL,
  evidence_type text NOT NULL,
  record_id text NOT NULL,
  visit_id text,
  payment_id text,
  storage_path text NOT NULL,
  storage_backend text NOT NULL DEFAULT 'supabase',
  uploaded_by_user_id uuid,
  uploaded_by text,
  uploaded_by_role text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  remarks text,
  gps_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_evidence_type_check CHECK (
    evidence_type IN (
      'visit_photo',
      'collection_receipt',
      'collection_proof'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_operational_evidence_tenant_created
  ON public.operational_evidence (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operational_evidence_tenant_lab
  ON public.operational_evidence (tenant_id, public.primecare_normalize_lab_id(lab_id));
CREATE INDEX IF NOT EXISTS idx_operational_evidence_tenant_visit
  ON public.operational_evidence (tenant_id, visit_id)
  WHERE visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operational_evidence_tenant_payment
  ON public.operational_evidence (tenant_id, payment_id)
  WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operational_evidence_tenant_record
  ON public.operational_evidence (tenant_id, evidence_type, record_id);

COMMENT ON TABLE public.operational_evidence IS
  'Field evidence metadata; binary files live in Storage bucket operational-evidence.';

-- ---------------------------------------------------------------------------
-- Visibility helpers (lab role excluded)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.operational_evidence_path_tenant_id(object_path text)
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

CREATE OR REPLACE FUNCTION public.operational_evidence_visible_to_current_user(
  row_tenant_id uuid,
  row_uploaded_by_user_id uuid,
  row_uploaded_by text,
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
    AND public.current_user_role() <> 'lab'
    AND (
      public.is_admin_or_executive()
      OR (
        public.current_user_role() = 'agent'
        AND (
          row_uploaded_by_user_id = auth.uid()
          OR lower(nullif(btrim(row_uploaded_by), '')) = public.current_profile_agent_name()
          OR lower(nullif(btrim(row_uploaded_by), '')) = lower(nullif(btrim((public.current_profile()).agent_name), ''))
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.operational_evidence_storage_can_read(
  object_path text,
  object_owner uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.operational_evidence_path_tenant_id(object_path) IS NOT NULL
    AND public.tenant_id_matches(public.operational_evidence_path_tenant_id(object_path))
    AND public.current_user_role() <> 'lab'
    AND (
      public.is_admin_or_executive()
      OR (
        public.current_user_role() = 'agent'
        AND (
          object_owner = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.operational_evidence e
            WHERE e.storage_path = object_path
              AND public.operational_evidence_visible_to_current_user(
                e.tenant_id,
                e.uploaded_by_user_id,
                e.uploaded_by,
                e.lab_id
              )
          )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.operational_evidence_storage_can_insert(object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND public.operational_evidence_path_tenant_id(object_path) IS NOT NULL
    AND public.tenant_id_matches(public.operational_evidence_path_tenant_id(object_path))
    AND public.current_user_role() IN ('admin', 'executive', 'agent');
$$;

GRANT EXECUTE ON FUNCTION public.operational_evidence_path_tenant_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operational_evidence_visible_to_current_user(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operational_evidence_storage_can_read(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.operational_evidence_storage_can_insert(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Table RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.operational_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operational_evidence_select ON public.operational_evidence;
CREATE POLICY operational_evidence_select
  ON public.operational_evidence
  FOR SELECT
  TO authenticated
  USING (
    public.operational_evidence_visible_to_current_user(
      tenant_id,
      uploaded_by_user_id,
      uploaded_by,
      lab_id
    )
  );

DROP POLICY IF EXISTS operational_evidence_insert ON public.operational_evidence;
CREATE POLICY operational_evidence_insert
  ON public.operational_evidence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.tenant_id_matches(tenant_id)
    AND public.current_user_role() IN ('admin', 'executive', 'agent')
    AND (
      uploaded_by_user_id IS NULL
      OR uploaded_by_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS operational_evidence_update ON public.operational_evidence;
CREATE POLICY operational_evidence_update
  ON public.operational_evidence
  FOR UPDATE
  TO authenticated
  USING (
    public.operational_evidence_visible_to_current_user(
      tenant_id,
      uploaded_by_user_id,
      uploaded_by,
      lab_id
    )
  )
  WITH CHECK (
    public.tenant_id_matches(tenant_id)
    AND public.current_user_role() IN ('admin', 'executive', 'agent')
  );

-- No DELETE for agents by default; admins may purge via service role if needed.

-- ---------------------------------------------------------------------------
-- Private Storage bucket (not public)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'operational-evidence',
  'operational-evidence',
  false,
  8388608,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage object policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS operational_evidence_storage_select ON storage.objects;
CREATE POLICY operational_evidence_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'operational-evidence'
    AND public.operational_evidence_storage_can_read(name, owner)
  );

DROP POLICY IF EXISTS operational_evidence_storage_insert ON storage.objects;
CREATE POLICY operational_evidence_storage_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'operational-evidence'
    AND public.operational_evidence_storage_can_insert(name)
  );

DROP POLICY IF EXISTS operational_evidence_storage_update ON storage.objects;
CREATE POLICY operational_evidence_storage_update
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'operational-evidence'
    AND public.operational_evidence_storage_can_read(name, owner)
  )
  WITH CHECK (
    bucket_id = 'operational-evidence'
    AND public.operational_evidence_storage_can_insert(name)
  );

-- Allow admin/executive to remove orphaned objects; agents cannot delete storage objects.
DROP POLICY IF EXISTS operational_evidence_storage_delete ON storage.objects;
CREATE POLICY operational_evidence_storage_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'operational-evidence'
    AND public.is_admin_or_executive()
    AND public.tenant_id_matches(public.operational_evidence_path_tenant_id(name))
  );
