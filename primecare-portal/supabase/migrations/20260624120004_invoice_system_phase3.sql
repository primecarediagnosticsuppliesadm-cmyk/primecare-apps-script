-- Invoice Phase 3 — PDF generation & signed download (edge worker + storage path).
-- Portal: generate-invoice-pdf edge function uploads via service role.
-- Client: createSignedUrl on invoice-pdfs after RLS invoice read + storage SELECT policy.

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
