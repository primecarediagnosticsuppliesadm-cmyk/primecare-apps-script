-- Invoice Phase 3 — PDF generation & signed download (edge worker + storage path).
-- Portal: generate-invoice-pdf edge function uploads via service role.
-- Client: createSignedUrl on invoice-pdfs after RLS invoice read + storage SELECT policy.

-- No schema changes required beyond Phase 1/2.
-- Re-assert bucket MIME + storage read policy idempotency.

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

COMMENT ON COLUMN public.invoices.pdf_storage_path IS
  'Relative path in invoice-pdfs bucket: {tenant_id}/{invoice_id}.pdf';

-- Edge function generate-invoice-pdf: user JWT RLS gate; service_role for PDF data reads.
GRANT SELECT ON TABLE public.invoices TO service_role;
GRANT UPDATE ON TABLE public.invoices TO service_role;
GRANT SELECT ON TABLE public.invoice_line_items TO service_role;
GRANT SELECT ON TABLE public.labs TO service_role;
GRANT SELECT ON TABLE public.orders TO service_role;
GRANT SELECT ON TABLE public.order_items TO service_role;
GRANT SELECT ON TABLE public.order_lines TO service_role;
