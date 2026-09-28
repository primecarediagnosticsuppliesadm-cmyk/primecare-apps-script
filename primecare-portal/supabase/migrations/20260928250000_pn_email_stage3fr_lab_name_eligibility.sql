-- PN-EMAIL Stage 3F-R — exact-row lab-name eligibility for Stage 3F certification.
-- Additive. Does not send email. No cron. Does not rewrite forensic rows.
-- Does not remove Stage 3E prefix protection.
-- Does not enable Production batch claim.

CREATE OR REPLACE FUNCTION public.pn_email_stage3e_lab_name_eligible(p_lab_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    btrim(COALESCE(p_lab_name, '')) ILIKE 'PN EMAIL STAGE3E REAL RECIPIENT CERT%'
    OR btrim(COALESCE(p_lab_name, '')) ILIKE 'PN EMAIL STAGE3F REAL RECIPIENT CERT%';
$$;

ALTER FUNCTION public.pn_email_stage3e_lab_name_eligible(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.pn_email_stage3e_lab_name_eligible(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pn_email_stage3e_lab_name_eligible(text) FROM anon;
REVOKE ALL ON FUNCTION public.pn_email_stage3e_lab_name_eligible(text) FROM authenticated;
REVOKE ALL ON FUNCTION public.pn_email_stage3e_lab_name_eligible(text) FROM service_role;

COMMENT ON FUNCTION public.pn_email_stage3e_lab_name_eligible(text) IS
  'PN-EMAIL 3E/3F-R: explicit synthetic certification lab-name prefixes only. Does not send.';
