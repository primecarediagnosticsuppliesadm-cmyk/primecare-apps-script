# HQ Backup & Recovery Runbook

**Last updated:** 2026-06-24  
**Owner:** HQ Engineering / Release Captain  
**Classification:** **WARN** — platform backups assumed; PITR off; restore not tested

---

## Environment

| Item | Value |
|------|--------|
| Supabase project | `primecare-qa` |
| Project ref | `zipuzmfkwwucbchlphcj` |
| API URL | `https://zipuzmfkwwucbchlphcj.supabase.co` |
| Region | `us-west-1` |
| Postgres | 17.6.1 (GA channel) |
| Status (2026-06-24) | `ACTIVE_HEALTHY` |
| HQ pilot tenant | `f168b98f-47a6-42c3-b788-24c00436fac2` |
| Guntur tenant (read-only in DR) | `787999b9-72f5-4163-a860-551c12ce3414` |
| Frontend | Vercel static deploy (`npm run build`) |
| Edge functions | `provision-platform-user`, `reset-platform-user-password`, `generate-invoice-pdf` |
| Storage buckets | `invoice-pdfs`, operational evidence (see `docs/OPERATIONAL_EVIDENCE_STORAGE.md`) |

---

## Backup method

### Database (Supabase-managed)

**Evidence (2026-06-24 CLI):**

```bash
supabase backups list --project-ref zipuzmfkwwucbchlphcj
```

```json
{
  "region": "us-west-1",
  "walg_enabled": true,
  "pitr_enabled": false,
  "backups": [],
  "physical_backup_data": {}
}
```

| Capability | Status | Evidence |
|------------|--------|----------|
| **PITR** | **Disabled** | `pitr_enabled: false` |
| **WAL-G** | Enabled | `walg_enabled: true` |
| **Physical backup list (CLI)** | Empty | `backups: []` |
| **Daily backups (Pro plan default)** | **Unverified** | Not listed via CLI; confirm in Dashboard → Database → Backups |

Per [Supabase backup docs](https://supabase.com/docs/guides/platform/backups): Pro/Team/Enterprise projects receive **daily logical backups** (7-day retention on Pro). PITR is a **paid add-on** (~$100/mo per 7-day window) and replaces daily backups when enabled.

### Application-level exports (manual)

| Asset | Method | Frequency | Owner |
|-------|--------|-----------|-------|
| Schema + RLS SQL | Git repo `primecare-portal/supabase/sql/` | Every commit | Engineering |
| Migration history | `supabase/migrations/` + `supabase db push` | Per release | Engineering |
| Certification state | `docs/hq-certification/*.md` | Per cert run | Engineering |
| Tenant data export | `supabase db dump --linked` (service role) | Before major migration | Release Captain |
| Invoice PDFs | Supabase Storage `invoice-pdfs/{tenant_id}/` | Continuous | Supabase Storage |

### Off-site recommendation (first paying lab)

Before production cutover, run and archive:

```bash
cd primecare-portal
supabase db dump --linked -f backups/hq-schema-$(date +%Y%m%d).sql --schema-only
supabase db dump --linked -f backups/hq-data-$(date +%Y%m%d).sql --data-only --use-copy
```

Store dumps outside Supabase (encrypted S3/GCS). **Not yet executed or archived in this sprint.**

---

## Retention

| Layer | Retention | Verified |
|-------|-----------|----------|
| Supabase daily backups (Pro) | 7 days (platform default) | **No** — confirm in Dashboard |
| PITR | N/A (disabled) | **Yes** — CLI |
| Supabase logs | 7 days (Pro default) | **No** |
| Git release tags | Indefinite | **Yes** — policy in rollback plan |
| Manual `db dump` | Owner-defined | **No** |

---

## RPO / RTO targets

| Scenario | RPO (data loss) | RTO (recovery time) | Current capability |
|----------|-----------------|---------------------|-------------------|
| Accidental row delete (single table) | Up to 24h without PITR | 1–4h (restore from daily backup) | **Unverified** |
| Full DB corruption | Up to 24h | 2–6h (Supabase restore + validation) | **Unverified** |
| Bad migration | 0 if caught pre-promote | 15–60m (forward-fix SQL or Vercel rollback) | **Documented** — `HQ_PRODUCTION_ROLLBACK_PLAN.md` |
| UI-only regression | 0 | 2–5m (Vercel promote prior deployment) | **Documented** |
| Storage bucket loss (PDFs) | Regenerate from invoice snapshots | 30–120m (`generate-invoice-pdf` batch) | **Partial** — edge function exists |
| Supabase region outage | Platform-dependent | Hours | **No DR region** |

**Pilot minimum (first paying lab):** RPO ≤ 24h, RTO ≤ 4h with documented restore drill.  
**Production recommendation:** Enable PITR (7-day) or prove daily backup restore before go-live.

---

## Restore steps

### A. UI / Vercel rollback (no DB touch)

See `docs/hq-certification/HQ_PRODUCTION_ROLLBACK_PLAN.md` §2–3.

1. Promote last-known-good Vercel deployment.
2. Run post-rollback validation suite (build, RLS, Predator, smoke login).

**Expected RTO:** 2–5 minutes.

### B. Supabase daily backup restore

**Prerequisite:** Confirm backup exists in Dashboard → Database → Backups.

1. Release Captain opens Supabase Dashboard → `primecare-qa` → Database → Backups.
2. Select restore point **≤ 24h before incident**.
3. Restore to **new project** (recommended) or in-place per Supabase wizard.
4. Update Vercel env vars if project ref changes (`VITE_SUPABASE_URL`, keys).
5. Re-deploy edge functions from git tag.
6. Run validation suite:
   - `node scripts/verify-hq-rls-reads.mjs`
   - `node scripts/verify-primecare-production-golden-path.mjs`
   - `node scripts/verify-financial-reconciliation.mjs`
7. **Do not** overwrite Guntur certified tenant without explicit approval.

**Expected RTO:** 2–6 hours (includes validation).  
**Status:** **Not tested** in this sprint.

### C. PITR restore (if enabled later)

```bash
supabase backups restore --project-ref zipuzmfkwwucbchlphcj --timestamp "2026-06-24T12:00:00Z"
```

Requires `pitr_enabled: true`. Currently **not available**.

### D. Forward-fix migration rollback

Prefer corrective SQL over destructive restore. See rollback plan §4.

### E. Invoice PDF recovery

1. Confirm `invoices.pdf_storage_path` populated.
2. Re-invoke `generate-invoice-pdf` per invoice (idempotent).
3. Verify with `node scripts/verify-invoice-phase3.mjs --remote`.

---

## Failure scenarios

| Scenario | Detection | Recovery | Owner |
|----------|-----------|----------|-------|
| Bad deploy (UI) | User report / Vercel alert | Vercel promote | Release Captain |
| Bad RLS migration | `verify-hq-rls-reads.mjs` FAIL | Forward-fix SQL + redeploy | DBA / Engineering |
| Data corruption | Reconciliation FAIL / user report | Daily backup restore (untested) | Release Captain + Supabase support |
| Edge function failure | Payment/PDF/provision errors | Redeploy functions from tag | Engineering |
| `invoice-pdfs` bucket policy break | PDF download FAIL in phase 3 cert | Fix storage RLS; regenerate PDFs | Engineering |
| Accidental tenant delete | Predator / manual audit | Restore from backup | Release Captain |

---

## Recovery ownership

| Role | Responsibility |
|------|----------------|
| **Release Captain** | Declares incident, runs Vercel rollback, coordinates Supabase restore |
| **HQ Engineering** | Forward-fix migrations, edge function redeploy, cert suite |
| **Supabase Support** | Platform restore, PITR enablement, backup confirmation |
| **QA Lead** | Post-restore golden path + financial reconciliation sign-off |

---

## Certification checklist

| Check | Result | Date |
|-------|--------|------|
| PITR enabled | **FAIL** — `pitr_enabled: false` | 2026-06-24 |
| Daily backups visible in Dashboard | **NOT VERIFIED** | — |
| Restore procedure documented | **PASS** — this runbook | 2026-06-24 |
| Restore drill executed | **FAIL** — not performed | — |
| Off-site `db dump` archived | **FAIL** — not performed | — |
| Guntur data protected in DR plan | **PASS** — documented | 2026-06-24 |

**Overall classification: WARN**

Close to **PASS** when: (1) Dashboard confirms daily backups, (2) restore drill to staging project succeeds, (3) off-site dump archived pre-cutover.

---

## RC-9 — Restore drill procedure (exact steps)

**Status:** **READY FOR DRILL** — procedure documented; **not executed** in RC-9.  
**Do not claim restore PASS until drill sign-off below is complete.**

### Prerequisites

- Release Captain + HQ Engineering available (2–4 hour window)
- Supabase CLI logged in; access to Dashboard backups
- Git tag of current release: `hq-release-YYYYMMDD`
- **Do not run against Production in-place** without explicit approval — prefer **new staging project**

### Drill steps

| Step | Action | Owner | Record |
|------|--------|-------|--------|
| D1 | **Create backup/export** | Engineering | ☐ Timestamp: _________ |
| | `supabase db dump --linked -f backups/hq-schema-$(date +%Y%m%d).sql --schema-only` | | |
| | `supabase db dump --linked -f backups/hq-data-$(date +%Y%m%d).sql --data-only --use-copy` | | |
| | Archive to encrypted off-site storage | | |
| D2 | **Restore to staging / temp project** | Release Captain | ☐ New project ref: _________ |
| | Dashboard → Backups → Restore to new project **OR** import dumps to fresh project | | |
| D3 | **Apply env vars** | Engineering | ☐ |
| | Create `.env.local` with new `VITE_SUPABASE_URL` + anon key | | |
| | Update Vercel preview env **or** local only for drill | | |
| D4 | **Deploy edge functions** | Engineering | ☐ |
| | `supabase functions deploy provision-platform-user reset-platform-user-password generate-invoice-pdf --project-ref <DRILL_REF>` | | |
| D5 | **Verify storage** | Engineering | ☐ |
| | Confirm `invoice-pdfs` bucket + policies; run `verify-invoice-phase3.mjs --remote` | | |
| D6 | **Run golden path** | Engineering | ☐ |
| | `node scripts/verify-primecare-production-golden-path.mjs` — expect 14/14 | | |
| D7 | **Run RLS** | Engineering | ☐ |
| | `node scripts/verify-hq-rls-reads.mjs` — expect 20/20 | | |
| D8 | **Run invoice PDF** | Engineering | ☐ |
| | Golden path GP-30–32 or phase 3 remote | | |
| D9 | **Run financial reconciliation** | Engineering | ☐ |
| | `node scripts/verify-financial-reconciliation.mjs` — golden PASS | | |
| D10 | **Record RPO / RTO** | Release Captain | ☐ |
| | Actual data loss window (RPO): _________ | | |
| | Actual recovery time (RTO): _________ | | |
| D11 | **Sign off** | QA Lead + Release Captain | ☐ |

### Drill pass criteria

- Golden path 14/14 on restored project
- RLS 20/20
- PDF download succeeds
- Financial recon golden checks PASS
- **Guntur tenant data** (`787999b9-72f5-4163-a860-551c12ce3414`) unchanged if copied — document if excluded from drill dump

### Drill sign-off (blank until executed)

| Role | Name | Date | Restore drill |
|------|------|------|---------------|
| Release Captain | _________________ | _________ | ☐ PASS / ☐ FAIL |
| QA Lead | _________________ | _________ | ☐ PASS / ☐ FAIL |
