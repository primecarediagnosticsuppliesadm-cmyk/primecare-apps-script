-- Backfill public.users directory rows for existing profiles.
-- Links auth user_id via users.user_code and stores display name + email for Operations Center.
-- QA tenant (qa-tenant-001) gets known qa.*@primecare.test emails from seed convention.
-- Run after operations_center_users_rls_migration.sql. Idempotent.

INSERT INTO public.users (tenant_id, user_code, user_name, email, role, active)
SELECT
  p.tenant_id,
  p.user_id::text AS user_code,
  COALESCE(
    NULLIF(btrim(p.agent_name), ''),
    CASE lower(p.role)
      WHEN 'admin' THEN 'QA Admin'
      WHEN 'executive' THEN 'QA Executive'
      WHEN 'agent' THEN 'QA Agent One'
      WHEN 'lab' THEN 'QA Lab User'
      ELSE initcap(lower(p.role)) || ' User'
    END
  ) AS user_name,
  CASE
    WHEN t.tenant_code = 'qa-tenant-001' THEN
      CASE lower(p.role)
        WHEN 'admin' THEN 'qa.admin@primecare.test'
        WHEN 'executive' THEN 'qa.executive@primecare.test'
        WHEN 'agent' THEN 'qa.agent@primecare.test'
        WHEN 'lab' THEN 'qa.lab@primecare.test'
        ELSE NULL
      END
    ELSE NULL
  END AS email,
  CASE lower(p.role)
    WHEN 'admin' THEN 'ADMIN'
    WHEN 'executive' THEN 'EXECUTIVE'
    WHEN 'agent' THEN 'AGENT'
    WHEN 'lab' THEN 'LAB'
    ELSE upper(p.role)
  END AS role,
  p.active
FROM public.profiles p
JOIN public.tenants t ON t.id = p.tenant_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.users u
  WHERE u.tenant_id = p.tenant_id
    AND u.user_code = p.user_id::text
);

UPDATE public.users u
SET
  user_name = COALESCE(NULLIF(btrim(u.user_name), ''), src.user_name),
  email = COALESCE(NULLIF(btrim(u.email), ''), src.email),
  role = COALESCE(NULLIF(btrim(u.role), ''), src.role),
  active = src.active
FROM (
  SELECT
    p.tenant_id,
    p.user_id::text AS user_code,
    COALESCE(
      NULLIF(btrim(p.agent_name), ''),
      CASE lower(p.role)
        WHEN 'admin' THEN 'QA Admin'
        WHEN 'executive' THEN 'QA Executive'
        WHEN 'agent' THEN 'QA Agent One'
        WHEN 'lab' THEN 'QA Lab User'
        ELSE initcap(lower(p.role)) || ' User'
      END
    ) AS user_name,
    CASE
      WHEN t.tenant_code = 'qa-tenant-001' THEN
        CASE lower(p.role)
          WHEN 'admin' THEN 'qa.admin@primecare.test'
          WHEN 'executive' THEN 'qa.executive@primecare.test'
          WHEN 'agent' THEN 'qa.agent@primecare.test'
          WHEN 'lab' THEN 'qa.lab@primecare.test'
          ELSE NULL
        END
      ELSE NULL
    END AS email,
    CASE lower(p.role)
      WHEN 'admin' THEN 'ADMIN'
      WHEN 'executive' THEN 'EXECUTIVE'
      WHEN 'agent' THEN 'AGENT'
      WHEN 'lab' THEN 'LAB'
      ELSE upper(p.role)
    END AS role,
    p.active
  FROM public.profiles p
  JOIN public.tenants t ON t.id = p.tenant_id
) src
WHERE u.tenant_id = src.tenant_id
  AND u.user_code = src.user_code
  AND (
    NULLIF(btrim(u.user_name), '') IS NULL
    OR NULLIF(btrim(u.email), '') IS NULL
  );
