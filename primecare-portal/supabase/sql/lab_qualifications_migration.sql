-- PrimeCare Qualification: lab_qualifications table + RLS (LAB / AGENT / ADMIN / EXECUTIVE).
-- Run after production_auth_rls_pilot_migration.sql (requires helper functions + profiles).
-- Idempotent — safe to re-run. No UI dependency.

-- ---------------------------------------------------------------------------
-- Table: one qualification profile per lab per tenant
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lab_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  lab_id text NOT NULL,
  lab_size text,
  monthly_consumables_estimate numeric(14, 2),
  current_supplier text,
  payment_terms text,
  decision_maker text,
  reagent_rental_potential text,
  lab_os_fit text,
  next_follow_up_date date,
  founder_review_status text NOT NULL DEFAULT 'pending',
  qualification_score numeric(5, 2),
  qualification_band text,
  agent_id text,
  agent_name text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_qualifications_tenant_lab_key UNIQUE (tenant_id, lab_id),
  CONSTRAINT lab_qualifications_founder_review_status_check CHECK (
    lower(founder_review_status) IN ('pending', 'approved', 'rejected', 'needs_info')
  ),
  CONSTRAINT lab_qualifications_qualification_band_check CHECK (
    qualification_band IS NULL
    OR lower(qualification_band) IN ('cold', 'warm', 'hot', 'qualified', 'disqualified')
  )
);

COMMENT ON TABLE public.lab_qualifications IS
  'Year-1 field qualification profile per lab; captured by agents, reviewed by founders/admins.';
COMMENT ON COLUMN public.lab_qualifications.lab_size IS
  'Estimated lab size tier or description (e.g. small, medium, large).';
COMMENT ON COLUMN public.lab_qualifications.monthly_consumables_estimate IS
  'Estimated monthly consumables spend in INR.';
COMMENT ON COLUMN public.lab_qualifications.current_supplier IS
  'Primary current supplier for reagents/consumables.';
COMMENT ON COLUMN public.lab_qualifications.payment_terms IS
  'Observed or agreed payment terms for this lab.';
COMMENT ON COLUMN public.lab_qualifications.decision_maker IS
  'Purchase decision maker name or role at the lab.';
COMMENT ON COLUMN public.lab_qualifications.reagent_rental_potential IS
  'Reagent rental potential assessment (e.g. low, medium, high).';
COMMENT ON COLUMN public.lab_qualifications.lab_os_fit IS
  'Lab OS product fit assessment.';
COMMENT ON COLUMN public.lab_qualifications.next_follow_up_date IS
  'Next qualification or sales follow-up date.';
COMMENT ON COLUMN public.lab_qualifications.founder_review_status IS
  'Founder review workflow: pending, approved, rejected, needs_info.';
COMMENT ON COLUMN public.lab_qualifications.qualification_score IS
  'Computed score (Phase C); nullable until scoring engine runs.';
COMMENT ON COLUMN public.lab_qualifications.qualification_band IS
  'Computed band (Phase C): cold, warm, hot, qualified, disqualified.';

CREATE INDEX IF NOT EXISTS idx_lab_qualifications_tenant_lab
  ON public.lab_qualifications (tenant_id, public.primecare_normalize_lab_id(lab_id));

CREATE INDEX IF NOT EXISTS idx_lab_qualifications_tenant_review
  ON public.lab_qualifications (tenant_id, lower(founder_review_status));

CREATE INDEX IF NOT EXISTS idx_lab_qualifications_tenant_follow_up
  ON public.lab_qualifications (tenant_id, next_follow_up_date);

-- Align with labs(tenant_id, lab_id) when labs table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'labs'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lab_qualifications_labs_tenant_lab_fkey'
  ) THEN
    ALTER TABLE public.lab_qualifications
      ADD CONSTRAINT lab_qualifications_labs_tenant_lab_fkey
      FOREIGN KEY (tenant_id, lab_id)
      REFERENCES public.labs (tenant_id, lab_id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'lab_qualifications: skipped labs FK (labs may lack tenant_id+lab_id unique): %', SQLERRM;
END $$;

DROP TRIGGER IF EXISTS lab_qualifications_set_updated_at ON public.lab_qualifications;
CREATE TRIGGER lab_qualifications_set_updated_at
  BEFORE UPDATE ON public.lab_qualifications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Remove any anon policies on lab_qualifications (defensive)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lab_qualifications'
      AND 'anon' = ANY (roles)
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );
  END LOOP;
END $$;

ALTER TABLE public.lab_qualifications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- RLS: same lab visibility model as orders / AR / agent_visits
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "lab_qualifications_select_by_role" ON public.lab_qualifications;
DROP POLICY IF EXISTS "lab_qualifications_insert_by_role" ON public.lab_qualifications;
DROP POLICY IF EXISTS "lab_qualifications_update_by_role" ON public.lab_qualifications;
DROP POLICY IF EXISTS "lab_qualifications_delete_by_role" ON public.lab_qualifications;

CREATE POLICY "lab_qualifications_select_by_role"
  ON public.lab_qualifications FOR SELECT TO authenticated
  USING (public.lab_record_is_visible_to_current_user(tenant_id, lab_id));

CREATE POLICY "lab_qualifications_insert_by_role"
  ON public.lab_qualifications FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  );

CREATE POLICY "lab_qualifications_update_by_role"
  ON public.lab_qualifications FOR UPDATE TO authenticated
  USING (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  )
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  );

CREATE POLICY "lab_qualifications_delete_by_role"
  ON public.lab_qualifications FOR DELETE TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- Validation queries (run manually after migration)
-- ---------------------------------------------------------------------------
-- SELECT column_name, udt_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'lab_qualifications'
-- ORDER BY ordinal_position;

-- SELECT tablename, policyname, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'lab_qualifications'
-- ORDER BY policyname;

-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'lab_qualifications' AND 'anon' = ANY (roles);
