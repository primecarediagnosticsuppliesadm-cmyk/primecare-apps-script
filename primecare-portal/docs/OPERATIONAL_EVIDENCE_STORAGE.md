# Operational Evidence Storage (V1)

## Bucket

Create a **private** Supabase Storage bucket:

- Name: `operational-evidence`
- Public: **false**
- Path pattern: `{tenant_id}/{lab_id}/{kind}/{evidenceId}-{filename}`

## RLS / policies (recommended)

- **Agent**: insert + read objects under tenant where `uploaded_by` matches JWT claim (or restrict via Edge Function).
- **Admin / Executive**: read all objects for `tenant_id` on JWT.
- **Lab**: no access.

V1 pilot also persists a **tenant-scoped local index** (`localStorage`) and embeds small images when Storage is unavailable (<500KB).

## Future table (optional)

```sql
-- operational_evidence (future migration — not required for V1 pilot index)
-- evidence_id, tenant_id, lab_id, visit_id, payment_id, kind, storage_path, uploaded_by, uploaded_at, gps_json, remarks
```

No core Postgres RLS changes were made in V1.
