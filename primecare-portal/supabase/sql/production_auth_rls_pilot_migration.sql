-- PrimeCare Pilot Security: Supabase Auth profiles, helper functions, RLS policies, and audits.
-- Run after the existing schema/migration files. This replaces temporary open anon policies
-- on pilot-critical tables with authenticated, tenant/role scoped access.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.primecare_normalize_lab_id(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN raw IS NULL OR btrim(raw) = '' THEN NULL
    ELSE upper(btrim(raw))
  END;
$$;

-- ---------------------------------------------------------------------------
-- Profiles: production identity bridge from Supabase Auth to PrimeCare roles.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  role text NOT NULL CHECK (lower(role) IN ('admin', 'executive', 'agent', 'lab')),
  lab_id text,
  agent_id text,
  agent_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_tenant_role ON public.profiles (tenant_id, lower(role));
CREATE INDEX IF NOT EXISTS idx_profiles_lab_id ON public.profiles (public.primecare_normalize_lab_id(lab_id));
CREATE INDEX IF NOT EXISTS idx_profiles_agent_id ON public.profiles (agent_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Common pilot security columns. Existing data should be backfilled before pilot.
ALTER TABLE public.labs ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.labs ADD COLUMN IF NOT EXISTS agent_id text;
ALTER TABLE public.labs ADD COLUMN IF NOT EXISTS agent_name text;
ALTER TABLE public.labs ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS agent_id text;

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS lab_id text;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS agent_id text;

ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.ar_credit_control ADD COLUMN IF NOT EXISTS agent_id text;

ALTER TABLE public.agent_visits ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.agent_visits ADD COLUMN IF NOT EXISTS agent_id text;

ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.inventory_ledger ADD COLUMN IF NOT EXISTS reference_type text;
ALTER TABLE public.inventory_ledger ADD COLUMN IF NOT EXISTS reference_id text;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS tenant_id text;
ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS tenant_id text;

CREATE INDEX IF NOT EXISTS idx_labs_tenant_lab ON public.labs (tenant_id, public.primecare_normalize_lab_id(lab_id));
CREATE INDEX IF NOT EXISTS idx_labs_tenant_agent ON public.labs (tenant_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_lab ON public.orders (tenant_id, public.primecare_normalize_lab_id(lab_id));
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_order ON public.order_items (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_lab ON public.payments (tenant_id, public.primecare_normalize_lab_id(lab_id));
CREATE INDEX IF NOT EXISTS idx_ar_credit_tenant_lab ON public.ar_credit_control (tenant_id, public.primecare_normalize_lab_id(lab_id));
CREATE INDEX IF NOT EXISTS idx_agent_visits_tenant_lab ON public.agent_visits (tenant_id, public.primecare_normalize_lab_id(lab_id));
CREATE INDEX IF NOT EXISTS idx_agent_visits_tenant_agent ON public.agent_visits (tenant_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_inventory_tenant_product ON public.inventory (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_tenant_product ON public.inventory_ledger (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_po ON public.purchase_orders (tenant_id, po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_tenant_po ON public.purchase_order_items (tenant_id, po_id);

-- ---------------------------------------------------------------------------
-- Helper functions required by RLS.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_profile()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (public.current_profile()).tenant_id;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower((public.current_profile()).role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_executive()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_role() IN ('admin', 'executive');
$$;

CREATE OR REPLACE FUNCTION public.current_profile_lab_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.primecare_normalize_lab_id((public.current_profile()).lab_id);
$$;

CREATE OR REPLACE FUNCTION public.current_profile_agent_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nullif(btrim((public.current_profile()).agent_id), '');
$$;

CREATE OR REPLACE FUNCTION public.current_profile_agent_name()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(nullif(btrim((public.current_profile()).agent_name), ''));
$$;

CREATE OR REPLACE FUNCTION public.lab_is_visible_to_current_user(row_tenant_id text, row_lab_id text, row_agent_id text DEFAULT NULL, row_agent_name text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND row_tenant_id IS NOT NULL
    AND row_tenant_id = public.current_tenant_id()
    AND (
      public.is_admin_or_executive()
      OR (
        public.current_user_role() = 'lab'
        AND public.primecare_normalize_lab_id(row_lab_id) = public.current_profile_lab_id()
      )
      OR (
        public.current_user_role() = 'agent'
        AND (
          nullif(btrim(row_agent_id), '') = public.current_profile_agent_id()
          OR lower(nullif(btrim(row_agent_name), '')) = public.current_profile_agent_name()
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.lab_record_is_visible_to_current_user(row_tenant_id text, row_lab_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND row_tenant_id IS NOT NULL
    AND row_tenant_id = public.current_tenant_id()
    AND (
      public.is_admin_or_executive()
      OR (
        public.current_user_role() = 'lab'
        AND public.primecare_normalize_lab_id(row_lab_id) = public.current_profile_lab_id()
      )
      OR (
        public.current_user_role() = 'agent'
        AND EXISTS (
          SELECT 1
          FROM public.labs l
          WHERE l.tenant_id = row_tenant_id
            AND public.primecare_normalize_lab_id(l.lab_id) = public.primecare_normalize_lab_id(row_lab_id)
            AND (
              nullif(btrim(l.agent_id), '') = public.current_profile_agent_id()
              OR lower(nullif(btrim(l.agent_name), '')) = public.current_profile_agent_name()
            )
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_write_ops_for_tenant(row_tenant_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND row_tenant_id IS NOT NULL
    AND row_tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'executive');
$$;

CREATE OR REPLACE FUNCTION public.can_write_agent_work(row_tenant_id text, row_agent_id text DEFAULT NULL, row_agent_name text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND row_tenant_id IS NOT NULL
    AND row_tenant_id = public.current_tenant_id()
    AND (
      public.is_admin_or_executive()
      OR (
        public.current_user_role() = 'agent'
        AND (
          nullif(btrim(row_agent_id), '') = public.current_profile_agent_id()
          OR lower(nullif(btrim(row_agent_name), '')) = public.current_profile_agent_name()
        )
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.current_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_executive() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_lab_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_agent_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lab_is_visible_to_current_user(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lab_record_is_visible_to_current_user(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_ops_for_tenant(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_agent_work(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Remove temporary open anon policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "temp_anon_orders_select" ON public.orders;
DROP POLICY IF EXISTS "temp_anon_orders_insert" ON public.orders;
DROP POLICY IF EXISTS "temp_anon_orders_update" ON public.orders;
DROP POLICY IF EXISTS "temp_anon_order_items_select" ON public.order_items;
DROP POLICY IF EXISTS "temp_anon_order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "temp_anon_payments_select" ON public.payments;
DROP POLICY IF EXISTS "temp_anon_payments_insert" ON public.payments;
DROP POLICY IF EXISTS "temp_anon_ar_credit_select" ON public.ar_credit_control;
DROP POLICY IF EXISTS "temp_anon_ar_credit_update" ON public.ar_credit_control;
DROP POLICY IF EXISTS "temp_anon_inventory_ledger_select" ON public.inventory_ledger;
DROP POLICY IF EXISTS "temp_anon_inventory_ledger_insert" ON public.inventory_ledger;
DROP POLICY IF EXISTS "temp_anon_inventory_select" ON public.inventory;
DROP POLICY IF EXISTS "temp_anon_inventory_update" ON public.inventory;
DROP POLICY IF EXISTS "temp_anon_purchase_orders_select" ON public.purchase_orders;
DROP POLICY IF EXISTS "temp_anon_purchase_orders_insert" ON public.purchase_orders;
DROP POLICY IF EXISTS "temp_anon_purchase_orders_update" ON public.purchase_orders;
DROP POLICY IF EXISTS "temp_anon_purchase_order_items_select" ON public.purchase_order_items;
DROP POLICY IF EXISTS "temp_anon_purchase_order_items_insert" ON public.purchase_order_items;
DROP POLICY IF EXISTS "temp_anon_purchase_order_items_update" ON public.purchase_order_items;

-- ---------------------------------------------------------------------------
-- Enable RLS on all pilot-critical tables.
-- ---------------------------------------------------------------------------
ALTER TABLE public.labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ar_credit_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Production policies.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_write" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_or_executive());
CREATE POLICY "profiles_admin_write"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin_or_executive())
  WITH CHECK (public.is_admin_or_executive());

DROP POLICY IF EXISTS "labs_select_by_role" ON public.labs;
DROP POLICY IF EXISTS "labs_admin_write" ON public.labs;
CREATE POLICY "labs_select_by_role"
  ON public.labs FOR SELECT TO authenticated
  USING (public.lab_is_visible_to_current_user(tenant_id, lab_id, agent_id, agent_name));
CREATE POLICY "labs_admin_write"
  ON public.labs FOR ALL TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS "orders_select_by_role" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_by_role" ON public.orders;
DROP POLICY IF EXISTS "orders_update_by_role" ON public.orders;
CREATE POLICY "orders_select_by_role"
  ON public.orders FOR SELECT TO authenticated
  USING (public.lab_record_is_visible_to_current_user(tenant_id, lab_id));
CREATE POLICY "orders_insert_by_role"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'lab'
      AND tenant_id = public.current_tenant_id()
      AND public.primecare_normalize_lab_id(lab_id) = public.current_profile_lab_id()
    )
  );
CREATE POLICY "orders_update_by_role"
  ON public.orders FOR UPDATE TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS "order_items_select_by_role" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_by_role" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update_by_role" ON public.order_items;
CREATE POLICY "order_items_select_by_role"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.order_id = order_items.order_id
        AND public.lab_record_is_visible_to_current_user(o.tenant_id, o.lab_id)
    )
  );
CREATE POLICY "order_items_insert_by_role"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.order_id = order_items.order_id
        AND o.tenant_id = public.current_tenant_id()
        AND public.current_user_role() = 'lab'
        AND public.primecare_normalize_lab_id(o.lab_id) = public.current_profile_lab_id()
    )
  );
CREATE POLICY "order_items_update_by_role"
  ON public.order_items FOR UPDATE TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS "payments_select_by_role" ON public.payments;
DROP POLICY IF EXISTS "payments_insert_by_role" ON public.payments;
CREATE POLICY "payments_select_by_role"
  ON public.payments FOR SELECT TO authenticated
  USING (public.lab_record_is_visible_to_current_user(tenant_id, lab_id));
CREATE POLICY "payments_insert_by_role"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (
    public.can_write_ops_for_tenant(tenant_id)
    OR (
      public.current_user_role() = 'agent'
      AND public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    )
  );

DROP POLICY IF EXISTS "ar_credit_select_by_role" ON public.ar_credit_control;
DROP POLICY IF EXISTS "ar_credit_update_by_role" ON public.ar_credit_control;
CREATE POLICY "ar_credit_select_by_role"
  ON public.ar_credit_control FOR SELECT TO authenticated
  USING (public.lab_record_is_visible_to_current_user(tenant_id, lab_id));
CREATE POLICY "ar_credit_update_by_role"
  ON public.ar_credit_control FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS "agent_visits_select_by_role" ON public.agent_visits;
DROP POLICY IF EXISTS "agent_visits_insert_by_role" ON public.agent_visits;
DROP POLICY IF EXISTS "agent_visits_update_by_role" ON public.agent_visits;
CREATE POLICY "agent_visits_select_by_role"
  ON public.agent_visits FOR SELECT TO authenticated
  USING (
    public.lab_record_is_visible_to_current_user(tenant_id, lab_id)
    OR public.can_write_agent_work(tenant_id, agent_id, agent_name)
  );
CREATE POLICY "agent_visits_insert_by_role"
  ON public.agent_visits FOR INSERT TO authenticated
  WITH CHECK (public.can_write_agent_work(tenant_id, agent_id, agent_name));
CREATE POLICY "agent_visits_update_by_role"
  ON public.agent_visits FOR UPDATE TO authenticated
  USING (public.can_write_agent_work(tenant_id, agent_id, agent_name))
  WITH CHECK (public.can_write_agent_work(tenant_id, agent_id, agent_name));

DROP POLICY IF EXISTS "inventory_select_by_role" ON public.inventory;
DROP POLICY IF EXISTS "inventory_admin_write" ON public.inventory;
CREATE POLICY "inventory_select_by_role"
  ON public.inventory FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'executive', 'lab')
  );
CREATE POLICY "inventory_admin_write"
  ON public.inventory FOR ALL TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS "inventory_ledger_select_by_role" ON public.inventory_ledger;
DROP POLICY IF EXISTS "inventory_ledger_insert_by_role" ON public.inventory_ledger;
CREATE POLICY "inventory_ledger_select_by_role"
  ON public.inventory_ledger FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'executive')
  );
CREATE POLICY "inventory_ledger_insert_by_role"
  ON public.inventory_ledger FOR INSERT TO authenticated
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS "purchase_orders_select_by_role" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_admin_write" ON public.purchase_orders;
CREATE POLICY "purchase_orders_select_by_role"
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'executive')
  );
CREATE POLICY "purchase_orders_admin_write"
  ON public.purchase_orders FOR ALL TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

DROP POLICY IF EXISTS "purchase_order_items_select_by_role" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_admin_write" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_select_by_role"
  ON public.purchase_order_items FOR SELECT TO authenticated
  USING (
    tenant_id = public.current_tenant_id()
    AND public.current_user_role() IN ('admin', 'executive')
  );
CREATE POLICY "purchase_order_items_admin_write"
  ON public.purchase_order_items FOR ALL TO authenticated
  USING (public.can_write_ops_for_tenant(tenant_id))
  WITH CHECK (public.can_write_ops_for_tenant(tenant_id));

-- ---------------------------------------------------------------------------
-- Policy audit queries for pilot validation.
-- ---------------------------------------------------------------------------
-- 1) Policies still allowing anon:
-- SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND 'anon' = ANY (roles)
-- ORDER BY tablename, policyname;

-- 2) Policies using literal true:
-- SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND (qual ~* '(^|[^a-z_])true([^a-z_]|$)' OR with_check ~* '(^|[^a-z_])true([^a-z_]|$)')
-- ORDER BY tablename, policyname;

-- 3) Pilot-critical tables without RLS enabled:
-- WITH critical(table_name) AS (
--   VALUES
--     ('profiles'), ('labs'), ('orders'), ('order_items'), ('payments'),
--     ('ar_credit_control'), ('agent_visits'), ('inventory'), ('inventory_ledger'),
--     ('purchase_orders'), ('purchase_order_items')
-- )
-- SELECT c.table_name, COALESCE(cls.relrowsecurity, false) AS rls_enabled
-- FROM critical c
-- LEFT JOIN pg_class cls ON cls.relname = c.table_name
-- LEFT JOIN pg_namespace ns ON ns.oid = cls.relnamespace AND ns.nspname = 'public'
-- WHERE COALESCE(cls.relrowsecurity, false) = false
-- ORDER BY c.table_name;

-- 4) Active policies on pilot-critical tables:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'profiles', 'labs', 'orders', 'order_items', 'payments', 'ar_credit_control',
--     'agent_visits', 'inventory', 'inventory_ledger', 'purchase_orders',
--     'purchase_order_items'
--   )
-- ORDER BY tablename, policyname;
