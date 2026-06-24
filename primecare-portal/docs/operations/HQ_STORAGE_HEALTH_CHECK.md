# HQ Storage Health Check

**Last updated:** 2026-06-24 (RC-9)  
**Owner:** HQ Engineering  
**Buckets:** `invoice-pdfs`, operational evidence (see `operational_evidence_storage_migration.sql`)

---

## `invoice-pdfs` bucket

| # | Check | Expected | Evidence / how to verify |
|---|-------|----------|--------------------------|
| ST1 | Bucket exists | `invoice-pdfs` in Supabase Storage | `invoice_system_phase1_migration.sql` |
| ST2 | Public access | **Private** — no public bucket policy | Dashboard → Storage → bucket settings |
| ST3 | RLS on `storage.objects` | `invoice_pdfs_storage_select` for `authenticated` | SQL in phase 1 migration |
| ST4 | Read guard function | `invoice_pdf_storage_can_read(name)` checks tenant + lab visibility | Phase 1 migration |
| ST5 | INSERT/UPDATE | **Service role only** (edge function worker) | Comment in migration; client cannot upload |
| ST6 | Signed URL creation | Client `createSignedUrl` after invoice SELECT + storage SELECT policy | `invoiceSupabaseApi.js` |
| ST7 | Signed URL expiry | Default Supabase signed URL TTL (typically 60s–1h per client call) | Verify download within session |
| ST8 | PDF upload path | `{tenant_id}/{invoice_id}.pdf` | `generate-invoice-pdf/index.ts` |
| ST9 | PDF download | Golden path GP-32 — byte length > 0 | `verify-primecare-production-golden-path.mjs` |
| ST10 | Orphan PDF handling | Re-run `generate-invoice-pdf` with `force: true` if `pdf_storage_path` set but object missing | Idempotent edge function |
| ST11 | File size limit | Supabase project default (50 MB free tier; check plan) | Dashboard → Storage settings |
| ST12 | MIME restriction | PDF bytes from `pdf-lib`; content-type `application/pdf` on upload | Edge function implementation |

**QA certification (2026-06-24):** GP-31 path set; GP-32 download **PASS** (1852 bytes).

---

## Operational evidence bucket

| # | Check | Expected |
|---|-------|----------|
| OE1 | Bucket created by migration | Per `operational_evidence_storage_migration.sql` |
| OE2 | Tenant-scoped SELECT/INSERT/UPDATE/DELETE | Policies on `storage.objects` + `operational_evidence` table |
| OE3 | Predator module | Operational Evidence **PASS** (7/0/0) |

---

## Smoke test sequence

```bash
cd primecare-portal
node scripts/verify-invoice-phase3.mjs --remote
node scripts/verify-primecare-production-golden-path.mjs   # GP-30–32
```

**Manual:** Executive → fulfilled order → Invoice Center → Download PDF (browser).

---

## Failure recovery

| Symptom | Action |
|---------|--------|
| 403 on signed URL | Re-apply `invoice_pdfs_storage_select` policy; verify `invoice_pdf_storage_can_read` |
| Missing object | Invoke `generate-invoice-pdf` with `force: true` |
| Wrong tenant path | Fix `invoices.pdf_storage_path`; regenerate PDF |

---

## RC-9 status

**Checklist document:** **PASS**  
**Production bucket verification:** **NOT EXECUTED**
