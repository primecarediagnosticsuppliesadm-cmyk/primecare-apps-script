-- Operations Center: app-readable user identity on public.profiles.
-- Run after production_auth_rls_pilot_migration.sql. Idempotent.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (lower(email));

-- Backfill display_name from legacy agent_name where present.
UPDATE public.profiles
SET display_name = NULLIF(btrim(agent_name), '')
WHERE NULLIF(btrim(display_name), '') IS NULL
  AND NULLIF(btrim(agent_name), '') IS NOT NULL;

-- Backfill email from public.users directory rows linked by auth user id.
UPDATE public.profiles p
SET email = NULLIF(btrim(u.email), '')
FROM public.users u
WHERE u.tenant_id = p.tenant_id
  AND u.user_code = p.user_id::text
  AND NULLIF(btrim(p.email), '') IS NULL
  AND NULLIF(btrim(u.email), '') IS NOT NULL;

-- QA seed users (explicit auth user ids).
UPDATE public.profiles
SET
  display_name = v.display_name,
  email = v.email
FROM (
  VALUES
    ('7b1fa41c-ad14-44d4-a16a-d91073dc91e6'::uuid, 'QA Admin', 'qa.admin@primecare.test'),
    ('23377bff-d1c7-4195-8b8e-b87bbc50fb43'::uuid, 'QA Executive', 'qa.executive@primecare.test'),
    ('c8472ffd-6398-47b9-a087-3752a7490ff3'::uuid, 'QA Agent One', 'qa.agent@primecare.test'),
    ('2b4daada-03f4-4159-aed7-e7d6e9535d0c'::uuid, 'QA Lab', 'qa.lab@primecare.test'),
    ('79677d1c-fab4-418a-bca6-ff0db51a5346'::uuid, 'QA Lab Inactive', 'qa.lab.inactive@primecare.test')
) AS v(user_id, display_name, email)
WHERE public.profiles.user_id = v.user_id;
