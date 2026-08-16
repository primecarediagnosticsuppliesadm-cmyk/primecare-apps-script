-- Agent Visit console/grant parity.
-- Version-control authenticated grants for tables the Agent Visit wizard reads/writes.
-- Does not grant writes to anon. Does not change RLS policies.

REVOKE ALL ON TABLE public.agent_visits FROM PUBLIC;
REVOKE ALL ON TABLE public.agent_visits FROM anon;
REVOKE ALL ON TABLE public.lab_product_intelligence FROM PUBLIC;
REVOKE ALL ON TABLE public.lab_product_intelligence FROM anon;
REVOKE ALL ON TABLE public.lab_qualifications FROM PUBLIC;
REVOKE ALL ON TABLE public.lab_qualifications FROM anon;

GRANT SELECT, INSERT, UPDATE ON TABLE public.agent_visits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lab_product_intelligence TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.lab_qualifications TO authenticated;

-- Optional overlay reads used on Lab / Proof (not visit SoT).
DO $$
BEGIN
  IF to_regclass('public.v_labs_credit') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.v_labs_credit FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.v_labs_credit FROM anon';
    EXECUTE 'GRANT SELECT ON TABLE public.v_labs_credit TO authenticated';
  END IF;
  IF to_regclass('public.ar_credit_control') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.ar_credit_control FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.ar_credit_control FROM anon';
    EXECUTE 'GRANT SELECT ON TABLE public.ar_credit_control TO authenticated';
  END IF;
  IF to_regclass('public.lab_ownership') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.lab_ownership FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.lab_ownership FROM anon';
    EXECUTE 'GRANT SELECT ON TABLE public.lab_ownership TO authenticated';
  END IF;
  IF to_regclass('public.operational_evidence') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.operational_evidence FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.operational_evidence FROM anon';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.operational_evidence TO authenticated';
  END IF;
  IF to_regclass('public.notification_events') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.notification_events FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.notification_events FROM anon';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_events TO authenticated';
  END IF;
  IF to_regclass('public.notification_delivery_log') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.notification_delivery_log FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.notification_delivery_log FROM anon';
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.notification_delivery_log TO authenticated';
  END IF;
END
$$;
