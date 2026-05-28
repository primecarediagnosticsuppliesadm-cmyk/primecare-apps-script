# Operational Evidence Storage — Durable V1

## Deploy steps (Supabase SQL Editor)

1. Run migrations in order:
   - `supabase/sql/production_auth_rls_pilot_migration.sql`
   - `supabase/sql/operational_evidence_storage_migration.sql`

2. Confirm bucket in Dashboard → Storage:
   - **Name:** `operational-evidence`
   - **Public:** OFF
   - **File size limit:** 8MB
   - **Allowed MIME:** JPEG, PNG, WebP, HEIC

3. Confirm policies on `storage.objects` and RLS on `public.operational_evidence`.

## Path format

```
{tenant_id}/{evidence_type}/{record_id}/{evidence_id}-{file_name}
```

| Segment | Example |
|---------|---------|
| `tenant_id` | UUID tenant |
| `evidence_type` | `visit_photo`, `collection_receipt`, `collection_proof` |
| `record_id` | `visit_id` or `payment_id` |
| `file_name` | Sanitized original name |

## Access model

| Role | Upload | View |
|------|--------|------|
| Agent | Own tenant path | Own uploads (+ storage owner) |
| Admin / Executive | Tenant path | All tenant evidence |
| Lab | Denied | Denied |

- Previews use **signed URLs** (1 hour TTL), never public bucket URLs.
- Metadata lives in `public.operational_evidence` (durable across browsers).
- **Local index fallback** remains when bucket/DB unavailable (<500KB embed).

## Client API

- `uploadOperationalEvidence` — storage upload → DB row → signed URL; retries ×3; optional `onProgress`
- `listOperationalEvidence` — async; DB first, merge local fallback
- `resolveEvidencePreviewUrl` — refresh signed URL
- `checkOperationalEvidenceBucket` — Predator / health probe

## QA checklist

- [ ] Run SQL migration on target Supabase project
- [ ] Agent: complete visit with photo → refresh → proof still visible
- [ ] Admin: same tenant, different browser → sees visit proof
- [ ] Lab user: no proof button / empty evidence list
- [ ] Collection payment + receipt → proof in history
- [ ] Storage object not public; signed URL expires
- [ ] Upload >8MB rejected with clear error
- [ ] Bucket missing: visit still saves; warning + local fallback if small
- [ ] Predator → Operational Evidence: bucket + signed URL steps
