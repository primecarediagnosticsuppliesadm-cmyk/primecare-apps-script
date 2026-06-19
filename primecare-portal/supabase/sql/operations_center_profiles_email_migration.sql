-- Operations Center: store contact email on profiles for app-readable user directory.
-- Run after production_auth_rls_pilot_migration.sql. Idempotent.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill from public.users directory rows linked by auth user id.
UPDATE public.profiles p
SET email = NULLIF(btrim(u.email), '')
FROM public.users u
WHERE u.tenant_id = p.tenant_id
  AND u.user_code = p.user_id::text
  AND NULLIF(btrim(p.email), '') IS NULL
  AND NULLIF(btrim(u.email), '') IS NOT NULL;

-- QA tenant: seed known contact emails and display names from role convention.
UPDATE public.profiles p
SET
  email = COALESCE(NULLIF(btrim(p.email), ''), src.email),
  agent_name = COALESCE(NULLIF(btrim(p.agent_name), ''), src.agent_name)
FROM (
  SELECT
    p2.user_id,
    CASE lower(p2.role)
      WHEN 'admin' THEN 'qa.admin@primecare.test'
      WHEN 'executive' THEN 'qa.executive@primecare.test'
      WHEN 'agent' THEN 'qa.agent@primecare.test'
      WHEN 'lab' THEN 'qa.lab@primecare.test'
      ELSE NULL
    END AS email,
    CASE lower(p2.role)
      WHEN 'admin' THEN 'QA Admin'
      WHEN 'executive' THEN 'QA Executive'
      WHEN 'agent' THEN 'QA Agent One'
      WHEN 'lab' THEN 'QA Lab User'
      ELSE NULL
    END AS agent_name
  FROM public.profiles p2
  JOIN public.tenants t ON t.id = p2.tenant_id
  WHERE t.tenant_code = 'qa-tenant-001'
) src
WHERE p.user_id = src.user_id
  AND (
    NULLIF(btrim(p.email), '') IS NULL
    OR NULLIF(btrim(p.agent_name), '') IS NULL
  );
