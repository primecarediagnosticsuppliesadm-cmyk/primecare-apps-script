-- Agent Resources: allow DOCX MIME on versions + private agent-resources bucket.
-- Idempotent. Does NOT edit AR-1A/1B/1C migrations.
-- Does NOT change RLS, publish RPC, or O2C tables.
-- Updates only this module's private bucket MIME allowlist.

ALTER TABLE public.agent_resource_versions
  DROP CONSTRAINT IF EXISTS agent_resource_versions_mime_check;

ALTER TABLE public.agent_resource_versions
  ADD CONSTRAINT agent_resource_versions_mime_check CHECK (
    mime_type IN (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  );

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]::text[]
WHERE id = 'agent-resources';
