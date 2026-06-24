-- PrimeCare Invoice System — Phase 1 foundation (schema + RLS + RPC stubs).
-- Run after production_auth_rls_pilot_migration.sql and payment_write_migration.sql.
-- Idempotent. Does NOT generate PDFs, wire fulfillment, or mutate existing business data.
--
-- Locked rules:
--   • one fulfilled order → one invoice (UNIQUE tenant_id + order_id)
--   • orders.invoice_id only (no orders.invoice_status)
--   • no payments.invoice_id — use invoice_payment_allocations
--   • invoice_line_items immutable (RPC-only writes in Phase 2+)
--   • overdue computed at read time (not stored)

-- ---------------------------------------------------------------------------
-- Table: public.invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lab_id text NOT NULL,
  order_id text NOT NULL,
  invoice_number text NOT NULL,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL,
  subtotal numeric(12, 2) NOT NULL DEFAULT 0,
  tax_amount numeric(12, 2) NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  pdf_storage_path text,
  pdf_generated_at timestamptz,
  sent_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  generation_attempts smallint NOT NULL DEFAULT 0,
  last_generation_error text,
  lab_name_snapshot text,
  payment_terms_days_snapshot integer,
  created_by text,
  created_source text,
  pdf_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_subtotal_nonneg CHECK (subtotal >= 0),
  CONSTRAINT invoices_tax_amount_nonneg CHECK (tax_amount >= 0),
  CONSTRAINT invoices_total_amount_nonneg CHECK (total_amount >= 0),
  CONSTRAINT invoices_total_matches_components CHECK (total_amount = subtotal + tax_amount),
  CONSTRAINT invoices_status_check CHECK (
    status IN ('draft', 'sent', 'paid', 'cancelled', 'failed')
  ),
  CONSTRAINT invoices_paid_requires_timestamp CHECK (
    status <> 'paid' OR paid_at IS NOT NULL
  ),
  CONSTRAINT invoices_sent_paid_requires_pdf CHECK (
    status NOT IN ('sent', 'paid') OR pdf_storage_path IS NOT NULL
  ),
  CONSTRAINT invoices_pdf_version_positive CHECK (pdf_version >= 1)
);

COMMENT ON TABLE public.invoices IS
  'Lab billing documents (one per fulfilled order). PDF generation is async (Phase 2+).';

CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_order_uidx
  ON public.invoices (tenant_id, order_id);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_number_uidx
  ON public.invoices (tenant_id, invoice_number);

CREATE INDEX IF NOT EXISTS invoices_tenant_lab_date_idx
  ON public.invoices (tenant_id, lab_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS invoices_tenant_status_idx
  ON public.invoices (tenant_id, status);

CREATE INDEX IF NOT EXISTS invoices_order_id_idx
  ON public.invoices (order_id);

CREATE INDEX IF NOT EXISTS invoices_pdf_storage_path_idx
  ON public.invoices (pdf_storage_path)
  WHERE pdf_storage_path IS NOT NULL;

DROP TRIGGER IF EXISTS invoices_set_updated_at ON public.invoices;
CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Table: public.invoice_line_items (immutable snapshot)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE RESTRICT,
  line_number smallint NOT NULL,
  order_id text NOT NULL,
  product_id text,
  product_name text NOT NULL,
  quantity numeric(12, 2) NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  tax_rate numeric(8, 4) NOT NULL DEFAULT 0,
  tax_amount numeric(12, 2) NOT NULL DEFAULT 0,
  line_total numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_line_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT invoice_line_items_unit_price_nonneg CHECK (unit_price >= 0),
  CONSTRAINT invoice_line_items_tax_amount_nonneg CHECK (tax_amount >= 0),
  CONSTRAINT invoice_line_items_line_total_nonneg CHECK (line_total >= 0),
  CONSTRAINT invoice_line_items_line_total_gte_tax CHECK (line_total >= tax_amount),
  CONSTRAINT invoice_line_items_invoice_line_number_key UNIQUE (invoice_id, line_number)
);

COMMENT ON TABLE public.invoice_line_items IS
  'Immutable invoice line snapshot at generation time. RPC-only writes.';

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx
  ON public.invoice_line_items (invoice_id);

CREATE INDEX IF NOT EXISTS invoice_line_items_tenant_invoice_idx
  ON public.invoice_line_items (tenant_id, invoice_id);

CREATE INDEX IF NOT EXISTS invoice_line_items_tenant_order_idx
  ON public.invoice_line_items (tenant_id, order_id);

-- ---------------------------------------------------------------------------
-- Table: public.invoice_payment_allocations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  payment_id text NOT NULL,
  invoice_id uuid NOT NULL REFERENCES public.invoices (id) ON DELETE RESTRICT,
  allocated_amount numeric(12, 2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  CONSTRAINT invoice_payment_allocations_amount_positive CHECK (allocated_amount > 0),
  CONSTRAINT invoice_payment_allocations_tenant_payment_invoice_key
    UNIQUE (tenant_id, payment_id, invoice_id)
);

COMMENT ON TABLE public.invoice_payment_allocations IS
  'Links payments to invoices. Invoice paid status is allocation-based only.';

CREATE INDEX IF NOT EXISTS invoice_payment_allocations_tenant_payment_idx
  ON public.invoice_payment_allocations (tenant_id, payment_id);

CREATE INDEX IF NOT EXISTS invoice_payment_allocations_invoice_idx
  ON public.invoice_payment_allocations (invoice_id);

CREATE INDEX IF NOT EXISTS invoice_payment_allocations_tenant_invoice_idx
  ON public.invoice_payment_allocations (tenant_id, invoice_id);

-- ---------------------------------------------------------------------------
-- Allocation safety trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoice_payment_allocations_enforce_cap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_amount numeric(12, 2);
  v_payment_tenant uuid;
  v_payment_lab text;
  v_invoice_tenant uuid;
  v_invoice_lab text;
  v_invoice_status text;
  v_existing_sum numeric(12, 2);
  v_new_total numeric(12, 2);
BEGIN
  SELECT p.amount_received, p.tenant_id, p.lab_id
  INTO v_payment_amount, v_payment_tenant, v_payment_lab
  FROM public.payments p
  WHERE p.payment_id = NEW.payment_id
    AND p.tenant_id = NEW.tenant_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM v_payment_tenant THEN
    RAISE EXCEPTION 'payment_tenant_mismatch';
  END IF;

  SELECT i.tenant_id, i.lab_id, i.status
  INTO v_invoice_tenant, v_invoice_lab, v_invoice_status
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice_not_found';
  END IF;

  IF NEW.tenant_id IS DISTINCT FROM v_invoice_tenant THEN
    RAISE EXCEPTION 'invoice_tenant_mismatch';
  END IF;

  IF v_payment_lab IS NOT NULL
    AND v_invoice_lab IS NOT NULL
    AND public.primecare_normalize_lab_id(v_payment_lab)
      IS DISTINCT FROM public.primecare_normalize_lab_id(v_invoice_lab) THEN
    RAISE EXCEPTION 'payment_invoice_lab_mismatch';
  END IF;

  IF TG_OP = 'INSERT' AND v_invoice_status <> 'sent' THEN
    RAISE EXCEPTION 'invoice_not_allocatable';
  END IF;

  SELECT COALESCE(SUM(a.allocated_amount), 0)
  INTO v_existing_sum
  FROM public.invoice_payment_allocations a
  WHERE a.tenant_id = NEW.tenant_id
    AND a.payment_id = NEW.payment_id
    AND a.id IS DISTINCT FROM COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_new_total := v_existing_sum + NEW.allocated_amount;

  IF v_new_total > v_payment_amount THEN
    RAISE EXCEPTION 'allocation_exceeds_payment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoice_payment_allocations_enforce_cap_trg
  ON public.invoice_payment_allocations;
CREATE TRIGGER invoice_payment_allocations_enforce_cap_trg
  BEFORE INSERT OR UPDATE OF tenant_id, payment_id, invoice_id, allocated_amount
  ON public.invoice_payment_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.invoice_payment_allocations_enforce_cap();

-- ---------------------------------------------------------------------------
-- Table: public.invoice_number_sequences (RPC-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_number_sequences (
  tenant_id uuid NOT NULL,
  seq_date date NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  CONSTRAINT invoice_number_sequences_last_seq_nonneg CHECK (last_seq >= 0),
  PRIMARY KEY (tenant_id, seq_date)
);

COMMENT ON TABLE public.invoice_number_sequences IS
  'Per-tenant daily invoice number sequence. Mutated only by create_invoice_for_fulfilled_order RPC.';

-- ---------------------------------------------------------------------------
-- orders.invoice_id (no invoice_status)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS orders_invoice_id_idx
  ON public.orders (invoice_id)
  WHERE invoice_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Read helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invoice_open_balance(p_invoice_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    GREATEST(
      0::numeric,
      i.total_amount - COALESCE(
        (
          SELECT SUM(a.allocated_amount)
          FROM public.invoice_payment_allocations a
          WHERE a.invoice_id = i.id
        ),
        0::numeric
      )
    ),
    0::numeric
  )
  FROM public.invoices i
  WHERE i.id = p_invoice_id;
$$;

CREATE OR REPLACE FUNCTION public.mark_invoice_paid_if_fully_allocated(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric(12, 2);
  v_allocated numeric(12, 2);
  v_status text;
BEGIN
  SELECT i.total_amount, i.status
  INTO v_total, v_status
  FROM public.invoices i
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT COALESCE(SUM(a.allocated_amount), 0)
  INTO v_allocated
  FROM public.invoice_payment_allocations a
  WHERE a.invoice_id = p_invoice_id;

  IF v_status = 'sent' AND v_allocated >= v_total THEN
    UPDATE public.invoices
    SET
      status = 'paid',
      paid_at = COALESCE(paid_at, now()),
      updated_at = now()
    WHERE id = p_invoice_id
      AND status = 'sent';
    RETURN FOUND;
  END IF;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- Phase 2+ RPC stubs (exist but not implemented)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice_for_fulfilled_order(
  p_tenant_id uuid,
  p_order_id text,
  p_actor_id text DEFAULT NULL,
  p_created_source text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'not_implemented_phase_1';
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_payment_to_invoice(
  p_tenant_id uuid,
  p_payment_id text,
  p_invoice_id uuid,
  p_allocated_amount numeric,
  p_actor_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'not_implemented_phase_1';
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_number_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_select_by_role ON public.invoices;
CREATE POLICY invoices_select_by_role
  ON public.invoices
  FOR SELECT
  TO authenticated
  USING (public.lab_record_is_visible_to_current_user(tenant_id, lab_id));

-- No INSERT / UPDATE / DELETE policies for authenticated — RPC / service role only.

DROP POLICY IF EXISTS invoice_line_items_select_by_role ON public.invoice_line_items;
CREATE POLICY invoice_line_items_select_by_role
  ON public.invoice_line_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
        AND public.lab_record_is_visible_to_current_user(i.tenant_id, i.lab_id)
    )
  );

DROP POLICY IF EXISTS invoice_payment_allocations_select_by_role ON public.invoice_payment_allocations;
CREATE POLICY invoice_payment_allocations_select_by_role
  ON public.invoice_payment_allocations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.id = invoice_payment_allocations.invoice_id
        AND public.lab_record_is_visible_to_current_user(i.tenant_id, i.lab_id)
    )
  );

-- invoice_number_sequences: RLS enabled, no policies → deny authenticated access.

REVOKE ALL ON TABLE public.invoice_number_sequences FROM authenticated;
REVOKE ALL ON TABLE public.invoice_number_sequences FROM anon;

-- ---------------------------------------------------------------------------
-- Storage bucket skeleton: invoice-pdfs (no upload in Phase 1)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-pdfs',
  'invoice-pdfs',
  false,
  5242880,
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.invoice_pdf_storage_can_read(object_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    object_path IS NOT NULL
    AND btrim(object_path) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.invoices i
      WHERE i.pdf_storage_path = object_path
        AND public.lab_record_is_visible_to_current_user(i.tenant_id, i.lab_id)
    );
$$;

DROP POLICY IF EXISTS invoice_pdfs_storage_select ON storage.objects;
CREATE POLICY invoice_pdfs_storage_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-pdfs'
    AND public.invoice_pdf_storage_can_read(name)
  );

-- INSERT/UPDATE reserved for service role (edge PDF worker in Phase 2).

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON TABLE public.invoices TO authenticated;
GRANT SELECT ON TABLE public.invoice_line_items TO authenticated;
GRANT SELECT ON TABLE public.invoice_payment_allocations TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_invoice_open_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_for_fulfilled_order(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_payment_to_invoice(uuid, text, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_invoice_paid_if_fully_allocated(uuid) TO service_role;
