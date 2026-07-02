# Sprint 3A Backup Validation Checklist

**Owner:** Release Captain / SRE  
**Gate:** Execute before first paying customer Production cutover  
**Related:** `HQ_BACKUP_RECOVERY_RUNBOOK.md`

---

## Pre-validation

- [ ] Production Supabase project provisioned (separate from QA `zipuzmfkwwucbchlphcj`)
- [ ] Supabase plan supports daily backups (document plan tier)
- [ ] Off-site dump destination configured (encrypted object storage)
- [ ] Runbook owner assigned for restore drill

## Backup configuration checks

- [ ] Confirm `pitr_enabled` status documented (enable on Production if budget allows)
- [ ] Confirm WAL archiving / WAL-G status via Supabase dashboard
- [ ] Export schema snapshot from git tag (`supabase/migrations/` + manifest Track A list)
- [ ] Archive `.env` **names only** (never commit secrets) for prod project ref

## Validation steps

1. [ ] List backups via Supabase CLI or dashboard — record latest backup timestamp
2. [ ] Trigger manual logical dump of `public` schema to off-site storage
3. [ ] Verify dump file size > 0 and gzip integrity (`gzip -t`)
4. [ ] Record SHA-256 of dump artifact in release evidence folder
5. [ ] Confirm edge function secrets backed up in team vault (not in git)

## Evidence to archive

| Field | Value |
|-------|-------|
| Date | |
| Operator | |
| Project ref | |
| Backup timestamp | |
| Dump path | |
| SHA-256 | |
| PITR enabled | Y/N |

## Pass criteria

- At least one verified restorable backup artifact exists off-site
- Schema in git matches deployed migration manifest for the release tag
