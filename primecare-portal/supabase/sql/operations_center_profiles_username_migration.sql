-- Operations Center: app-readable login username on public.profiles.
-- Run after operations_center_profiles_identity_migration.sql. Idempotent.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_idx
  ON public.profiles (lower(username))
  WHERE NULLIF(btrim(username), '') IS NOT NULL;

-- Resolve username or email to auth email for sign-in (no auth.users query from client).
CREATE OR REPLACE FUNCTION public.resolve_login_email(identifier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ident text := lower(btrim(identifier));
BEGIN
  IF ident IS NULL OR ident = '' THEN
    RETURN NULL;
  END IF;

  IF position('@' IN ident) > 0 THEN
    RETURN btrim(identifier);
  END IF;

  RETURN (
    SELECT NULLIF(btrim(p.email), '')
    FROM public.profiles p
    WHERE lower(p.username) = ident
    LIMIT 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;

-- QA seed usernames (preserve existing emails).
UPDATE public.profiles
SET username = v.username
FROM (
  VALUES
    ('7b1fa41c-ad14-44d4-a16a-d91073dc91e6'::uuid, 'qa_admin'),
    ('23377bff-d1c7-4195-8b8e-b87bbc50fb43'::uuid, 'qa_executive'),
    ('c8472ffd-6398-47b9-a087-3752a7490ff3'::uuid, 'qa_agent'),
    ('2b4daada-03f4-4159-aed7-e7d6e9535d0c'::uuid, 'qa_lab')
) AS v(user_id, username)
WHERE public.profiles.user_id = v.user_id
  AND NULLIF(btrim(public.profiles.username), '') IS NULL;
