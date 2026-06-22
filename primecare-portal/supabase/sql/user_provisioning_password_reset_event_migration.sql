-- User provisioning: allow password_reset audit events.
-- Run after user_provisioning_v1_migration.sql. Idempotent.

ALTER TABLE public.user_provisioning_events DROP CONSTRAINT IF EXISTS user_provisioning_events_event_type_check;

ALTER TABLE public.user_provisioning_events ADD CONSTRAINT user_provisioning_events_event_type_check
  CHECK (
    event_type IN (
      'created',
      'updated',
      'deactivated',
      'reactivated',
      'lab_transferred',
      'password_reset'
    )
  );

COMMENT ON TABLE public.user_provisioning_events IS
  'Append-only HQ user provisioning audit (created, updated, deactivated, reactivated, lab_transferred, password_reset).';
