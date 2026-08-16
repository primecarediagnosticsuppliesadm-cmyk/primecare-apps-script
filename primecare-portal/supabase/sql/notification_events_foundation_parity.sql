-- Mirror of supabase/migrations/20260816140000_notification_events_foundation_parity.sql
-- Align legacy Production notification_events (GAP-006 stub) with foundation schema.

ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS target_role text,
  ADD COLUMN IF NOT EXISTS target_user_id uuid,
  ADD COLUMN IF NOT EXISTS target_lab_id text,
  ADD COLUMN IF NOT EXISTS payload_json jsonb;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notification_events'
      AND column_name = 'id'
  ) THEN
    EXECUTE $q$
      UPDATE public.notification_events
      SET event_id = id::uuid
      WHERE event_id IS NULL
        AND id IS NOT NULL
    $q$;
  END IF;
EXCEPTION
  WHEN others THEN
    NULL;
END
$$;

UPDATE public.notification_events
SET event_id = gen_random_uuid()
WHERE event_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_events_event_id_uidx
  ON public.notification_events (event_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notification_events'
      AND column_name = 'payload'
  ) THEN
    EXECUTE $q$
      UPDATE public.notification_events
      SET payload_json = COALESCE(payload_json, payload, '{}'::jsonb)
      WHERE payload_json IS NULL
    $q$;
  END IF;
END
$$;

UPDATE public.notification_events
SET payload_json = '{}'::jsonb
WHERE payload_json IS NULL;

ALTER TABLE public.notification_events
  ALTER COLUMN payload_json SET DEFAULT '{}'::jsonb;

UPDATE public.notification_events
SET source_module = COALESCE(NULLIF(trim(source_module), ''), 'system')
WHERE source_module IS NULL OR trim(source_module) = '';

ALTER TABLE public.notification_events
  ALTER COLUMN source_module SET DEFAULT 'system';

REVOKE ALL ON TABLE public.notification_events FROM PUBLIC;
REVOKE ALL ON TABLE public.notification_events FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_events TO authenticated;

COMMENT ON COLUMN public.notification_events.event_id IS
  'Foundation primary event key; backfilled from legacy id when present.';
COMMENT ON COLUMN public.notification_events.source_module IS
  'Foundation source module (agent_visits, orders, collections, …).';
COMMENT ON COLUMN public.notification_events.payload_json IS
  'Foundation JSON payload; legacy `payload` column retained if present.';
