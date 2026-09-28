-- PN-EMAIL Stage 3B-R — durable notification_events.event_id identity.
-- Additive. Does not send email. No cron. EMAIL_ENABLED must remain false.
-- Does not backfill historical rows. Does not rewrite customer data.
-- Does not force event_id = id (Production already has id <> event_id on populated rows).
--
-- ADR:
--   CANONICAL EVENT IDENTITY = event_id
--   why = foundation PK, delivery_log FK, enqueue/claim/dispatcher/certification all use event_id
--   compatibility = Production also has legacy GAP-006 physical PK `id`; client inserts supply event_id
--   migration = BEFORE INSERT assigns event_id from id (or gen_random_uuid) only when omitted

CREATE OR REPLACE FUNCTION public.notification_events_assign_event_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.event_id IS NULL THEN
    NEW.event_id := COALESCE(NEW.id, gen_random_uuid());
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.notification_events_assign_event_id() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.notification_events_assign_event_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_events_assign_event_id() FROM anon;
REVOKE ALL ON FUNCTION public.notification_events_assign_event_id() FROM authenticated;
REVOKE ALL ON FUNCTION public.notification_events_assign_event_id() FROM service_role;

DROP TRIGGER IF EXISTS notification_events_assign_event_id_trg
  ON public.notification_events;
CREATE TRIGGER notification_events_assign_event_id_trg
  BEFORE INSERT ON public.notification_events
  FOR EACH ROW
  EXECUTE FUNCTION public.notification_events_assign_event_id();

COMMENT ON FUNCTION public.notification_events_assign_event_id() IS
  'PN-EMAIL 3B-R: BEFORE INSERT fills omitted event_id from legacy id. Canonical identity remains event_id. Does not enforce event_id = id.';

COMMENT ON COLUMN public.notification_events.event_id IS
  'Canonical notification event identity (foundation PK / delivery_log FK / enqueue). On Production, legacy id remains the physical PK and may differ. BEFORE INSERT assigns event_id from id when omitted.';
