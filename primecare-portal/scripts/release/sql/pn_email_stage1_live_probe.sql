-- PN-EMAIL Stage 1 live object probe. SELECT only. No DML/DDL.
-- Target must be Production alxhrnotnvwpblsiadxj. Never run against QA via --linked.

SELECT jsonb_build_object(
  'ledger', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('version', version) ORDER BY version), '[]'::jsonb)
    FROM supabase_migrations.schema_migrations
    WHERE version IN (
      '20260912200000',
      '20260913010000',
      '20260913020000'
    )
  ),
  'pn1a', jsonb_build_object(
    'emit_fn', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'emit_prospect_in_app_notification'
        AND pg_get_function_identity_arguments(p.oid) = 'p_tenant_id uuid, p_event_type text, p_source_id text, p_actor_user_id uuid, p_target_role text, p_target_user_id uuid, p_payload jsonb'
    ),
    'unique_index', EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'notification_events_prospect_lifecycle_uidx'
    ),
    'server_only_fn', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'notification_events_prospect_server_only'
    ),
    'server_only_trg', EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'notification_events'
        AND t.tgname = 'notification_events_prospect_server_only_trg'
        AND NOT t.tgisinternal
    ),
    'create_prospect_sig', (
      SELECT pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_prospect_lab'
      LIMIT 1
    ),
    'activate_prospect_sig', (
      SELECT pg_get_function_identity_arguments(p.oid)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'activate_prospect_lab'
      LIMIT 1
    ),
    'create_hook', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'create_prospect_lab'
        AND pg_get_functiondef(p.oid) ILIKE '%emit_prospect_in_app_notification%'
    ),
    'activate_hook', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'activate_prospect_lab'
        AND pg_get_functiondef(p.oid) ILIKE '%emit_prospect_in_app_notification%'
    )
  ),
  'pn1b1', jsonb_build_object(
    'queue_columns', (
      SELECT coalesce(jsonb_agg(column_name ORDER BY column_name), '[]'::jsonb)
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification_delivery_log'
        AND column_name IN (
          'recipient_user_id','recipient_email','provider','attempt_count',
          'last_attempt_at','next_attempt_at','sent_at','failed_at','error_code','error_summary'
        )
    ),
    'email_indexes', (
      SELECT coalesce(jsonb_agg(indexname ORDER BY indexname), '[]'::jsonb)
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'notification_delivery_log_email_recipient_uidx',
          'notification_delivery_log_email_null_recipient_uidx',
          'idx_notification_delivery_log_email_dispatch'
        )
    ),
    'enqueue_fn', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'enqueue_prospect_email_deliveries'
    ),
    'after_insert_trg', EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'notification_events'
        AND t.tgname = 'notification_events_enqueue_prospect_email_trg'
        AND NOT t.tgisinternal
    ),
    'email_write_guard_fn', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'notification_delivery_log_email_server_only'
    ),
    'channel_allows_email', EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.notification_delivery_log'::regclass
        AND conname = 'notification_delivery_log_channel_check'
        AND pg_get_constraintdef(oid) ILIKE '%''email''%'
    ),
    'status_allows_queued', EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.notification_delivery_log'::regclass
        AND conname = 'notification_delivery_log_status_check'
        AND pg_get_constraintdef(oid) ILIKE '%queued%'
        AND pg_get_constraintdef(oid) ILIKE '%processing%'
        AND pg_get_constraintdef(oid) ILIKE '%sent%'
        AND pg_get_constraintdef(oid) ILIKE '%failed%'
        AND pg_get_constraintdef(oid) ILIKE '%skipped%'
    ),
    'email_row_stats', (
      SELECT jsonb_build_object(
        'queued', count(*) FILTER (WHERE channel = 'email' AND status = 'queued'),
        'processing', count(*) FILTER (WHERE channel = 'email' AND status = 'processing'),
        'sent', count(*) FILTER (WHERE channel = 'email' AND status = 'sent')
      )
      FROM public.notification_delivery_log
    )
  ),
  'pn1b2', jsonb_build_object(
    'provider_recipient', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification_delivery_log'
        AND column_name = 'provider_recipient'
    ),
    'claim_fn', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'claim_notification_email_deliveries'
    ),
    'finalize_fn', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'finalize_notification_email_delivery'
    ),
    'claim_grants', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type)), '[]'::jsonb)
      FROM information_schema.role_routine_grants
      WHERE routine_schema = 'public'
        AND routine_name = 'claim_notification_email_deliveries'
        AND privilege_type = 'EXECUTE'
    ),
    'finalize_grants', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('grantee', grantee, 'privilege', privilege_type)), '[]'::jsonb)
      FROM information_schema.role_routine_grants
      WHERE routine_schema = 'public'
        AND routine_name = 'finalize_notification_email_delivery'
        AND privilege_type = 'EXECUTE'
    )
  )
) AS probe;
