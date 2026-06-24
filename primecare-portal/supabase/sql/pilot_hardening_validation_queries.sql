-- Pilot Hardening — post-migration validation queries
-- Run in Supabase SQL editor after applying the migration deployment checklist.

-- 1) Core tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'labs', 'lab_ownership', 'user_provisioning_events',
    'lab_contracts', 'commission_entries', 'orders', 'ar_credit_control',
    'inventory', 'lab_qualifications', 'tenants'
  )
ORDER BY table_name;

-- 2) No temp anon policies on critical tables (RLS active)
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname ILIKE 'temp_anon%'
  AND tablename IN (
    'orders', 'payments', 'inventory', 'inventory_ledger',
    'ar_credit_control', 'labs', 'lab_ownership'
  )
ORDER BY tablename, policyname;
-- Expected: 0 rows

-- 3) lab_ownership partial unique index (one ACTIVE per lab)
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'lab_ownership'
  AND indexname ILIKE '%active%';

-- 4) Ownership coverage for a distributor (replace tenant UUID)
-- SELECT
--   COUNT(*) FILTER (WHERE lo.status = 'ACTIVE') AS owned,
--   COUNT(DISTINCT l.lab_id) AS total_labs,
--   COUNT(DISTINCT l.lab_id) FILTER (
--     WHERE NOT EXISTS (
--       SELECT 1 FROM public.lab_ownership lo2
--       WHERE lo2.lab_id = l.lab_id
--         AND lo2.lab_tenant_id = l.tenant_id
--         AND lo2.status = 'ACTIVE'
--     )
--     AND COALESCE(l.assigned_agent_id, l.agent_id, '') = ''
--   ) AS unassigned
-- FROM public.labs l
-- LEFT JOIN public.lab_ownership lo
--   ON lo.lab_id = l.lab_id AND lo.lab_tenant_id = l.tenant_id AND lo.status = 'ACTIVE'
-- WHERE l.tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;

-- 5) Agent profiles with agent_id set (replace HQ tenant UUID)
-- SELECT user_id, role, agent_id, agent_name, active
-- FROM public.profiles
-- WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid
--   AND lower(role) = 'agent'
-- ORDER BY agent_name;

-- 6) Active contracts per distributor
-- SELECT distributor_id, COUNT(*) AS active_contracts
-- FROM public.lab_contracts
-- WHERE status = 'active'
-- GROUP BY distributor_id;

-- 7) Qualification pipeline ready labs
-- SELECT lab_id, pipeline_stage, status
-- FROM public.lab_qualifications
-- WHERE lower(pipeline_stage) IN ('qualified', 'won');

-- 8) Inventory availability (SKUs with stock)
-- SELECT COUNT(*) AS skus_in_stock
-- FROM public.inventory
-- WHERE COALESCE(current_stock, 0) > 0;

-- 9) Credit holds blocking orders
-- SELECT tenant_id, lab_id, credit_hold, outstanding
-- FROM public.ar_credit_control
-- WHERE credit_hold IS TRUE;

-- 10) Provisioning audit event types include ownership
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.user_provisioning_events'::regclass
  AND conname LIKE '%event_type%';
