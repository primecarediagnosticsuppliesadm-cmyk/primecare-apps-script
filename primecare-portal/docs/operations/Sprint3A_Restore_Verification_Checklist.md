# Sprint 3A Restore Verification Checklist

**Owner:** Release Captain / SRE  
**Gate:** Execute on staging clone before Production promotion  
**Related:** `HQ_BACKUP_RECOVERY_RUNBOOK.md`

---

## Scope

Prove that a backup can restore HQ tenant operational data without code changes.

## Staging restore drill

1. [ ] Create disposable Supabase staging project (or use QA clone policy)
2. [ ] Restore latest logical dump OR use Supabase restore-to-new-project (if PITR enabled)
3. [ ] Apply migration manifest through release tag (Track A or B — not both)
4. [ ] Run `node scripts/verify-hq-rls-reads.mjs` — expect PASS
5. [ ] Run `node scripts/verify-primecare-production-golden-path.mjs` — expect PASS
6. [ ] Sign in Admin on restored project — Admin Dashboard loads with non-zero KPIs or explicit readFailed banner
7. [ ] Run `node scripts/rebuild-sprint2-phase2-projections.mjs` — expect PASS
8. [ ] Run `node scripts/run-projection-ops-certification.mjs` — expect GO

## Rollback of drill environment

- [ ] Delete staging project or mark for auto-expiry
- [ ] Document RTO observed (time from backup to golden path PASS)

## Pass criteria

| Metric | Target |
|--------|--------|
| RLS cert | PASS |
| Golden path | PASS |
| RTO (staging drill) | Document actual (target < 4h for Year 1) |

## Sign-off

| Role | Name | Date |
|------|------|------|
| SRE | | |
| Architect | | |
