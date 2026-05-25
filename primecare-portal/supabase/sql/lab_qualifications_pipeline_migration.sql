-- PrimeCare C2: qualification pipeline / funnel fields on lab_qualifications.
-- Run after lab_qualifications_migration.sql. Idempotent — safe to re-run. No RLS changes.

ALTER TABLE public.lab_qualifications
  ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS pipeline_stage_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipeline_stage_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pipeline_lost_reason text,
  ADD COLUMN IF NOT EXISTS pipeline_next_action text,
  ADD COLUMN IF NOT EXISTS pipeline_expected_value numeric(14, 2),
  ADD COLUMN IF NOT EXISTS pipeline_probability numeric(5, 2),
  ADD COLUMN IF NOT EXISTS pipeline_notes text;

COMMENT ON COLUMN public.lab_qualifications.pipeline_stage IS
  'Sales pipeline stage: new → contacted → qualified → … → won/lost/hold.';
COMMENT ON COLUMN public.lab_qualifications.pipeline_stage_updated_at IS
  'When pipeline_stage was last changed.';
COMMENT ON COLUMN public.lab_qualifications.pipeline_stage_updated_by IS
  'Auth user who last changed pipeline_stage.';
COMMENT ON COLUMN public.lab_qualifications.pipeline_lost_reason IS
  'Reason when pipeline_stage is lost.';
COMMENT ON COLUMN public.lab_qualifications.pipeline_next_action IS
  'Next operational action for this lab in the pipeline.';
COMMENT ON COLUMN public.lab_qualifications.pipeline_expected_value IS
  'Expected deal value in INR for pipeline tracking.';
COMMENT ON COLUMN public.lab_qualifications.pipeline_probability IS
  'Win probability percent 0–100.';
COMMENT ON COLUMN public.lab_qualifications.pipeline_notes IS
  'Founder/admin pipeline notes (separate from agent qualification notes).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lab_qualifications_pipeline_stage_check'
  ) THEN
    ALTER TABLE public.lab_qualifications
      ADD CONSTRAINT lab_qualifications_pipeline_stage_check CHECK (
        lower(pipeline_stage) IN (
          'new',
          'contacted',
          'qualified',
          'sample_sent',
          'negotiation',
          'reagent_rental_discussion',
          'won',
          'lost',
          'hold'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lab_qualifications_pipeline_probability_check'
  ) THEN
    ALTER TABLE public.lab_qualifications
      ADD CONSTRAINT lab_qualifications_pipeline_probability_check CHECK (
        pipeline_probability IS NULL
        OR (pipeline_probability >= 0 AND pipeline_probability <= 100)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lab_qualifications_tenant_pipeline_stage
  ON public.lab_qualifications (tenant_id, lower(pipeline_stage));

-- Backfill stage timestamp for rows that have stage but no timestamp
UPDATE public.lab_qualifications
SET pipeline_stage_updated_at = COALESCE(pipeline_stage_updated_at, updated_at, created_at)
WHERE pipeline_stage_updated_at IS NULL;
