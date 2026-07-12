# PrimeCare v1.0 — Production Deployment Pack

| Field | Value |
|-------|-------|
| Date | 2026-07-12 |
| Gate | **ALLOWED** — deployment prep / docs only |
| Feature freeze | **IN EFFECT** — no app/schema/API/RLS/UI/business-rule changes |
| Candidate commit | `qa` @ `7019bde` (`docs(ops): declare v1 operational feature freeze`) |

**Mission:** Prepare the first production release for a real customer. Do not modify application code.

---

## Executive Summary

PrimeCare **builds cleanly** and has **certified QA golden-path + RC1 pilot GO**. It is **not ready to promote to unrestricted production today** because:

1. **`qa` is not clean for release** — unpushed commits; unrelated dirty/untracked files  
2. **`main` is ~82 commits behind `qa`** — no release tag exists  
3. **Production environment checklist is a blank template** — not executed  
4. **DR restore drill (DR-01) not executed**  
5. **Post-deploy smoke on production cannot be certified in this prep session** (no prod project values filled; live Supabase not exercised here)

| Audience | Verdict |
|----------|---------|
| Deploy to **new/empty Production** after completing this checklist | **CONDITIONAL GO** |
| Deploy **now** without closing blockers | **NO-GO** |
| Keep serving **QA supervised pilot** | **GO** (RC1) |

### Overall launch recommendation

# **CONDITIONAL GO** — proceed only after Blocking Issues below are closed

---

## Source control status (2026-07-12)

| Check | Status | Detail |
|-------|--------|--------|
| Current branch | `qa` | HEAD `7019bde` |
| vs `origin/qa` | **Ahead 2** | Must `git push origin qa` before cutover |
| Working tree | **Not clean** | Dirty: `.DS_Store`, `RC1_Closure_Evidence.json`, `Sprint3A_Migration_Manifest.*`; untracked: `V1_Business_Simulation_Report.md` |
| `main` vs `qa` | **`qa` +82** | `main` has **0** unique commits not in `qa` (rev-list); promote by merging/ff `qa` → `main` after clean |
| Release tags | **None** | No `v1.0.0` / rollback tags present |
| Rollback tag | **Missing** | Create before deploy |

### Required release hygiene (no app code)

```bash
# 1) Clean or intentionally exclude dirty files from release
git status
# Do NOT commit secrets. Leave Sprint3A/RC1 noise out of the release commit unless reviewed.

# 2) Push qa
git push origin qa

# 3) Create release + rollback tags on the deploy commit
git tag -a v1.0.0-rc1 <DEPLOY_SHA> -m "PrimeCare v1.0 production candidate"
git tag -a v1.0.0-rollback-base <PREVIOUS_PROD_SHA> -m "Rollback base before v1.0.0"
git push origin v1.0.0-rc1 v1.0.0-rollback-base

# 4) Promote to main (ff or PR — Founder choice)
git checkout main && git merge --ff-only qa && git push origin main
```

**Vercel production branch:** prefer `main` (or pinned tag deploy). Record in `HQ_PRODUCTION_ENV_CHECKLIST.md` V2.

---

## Build verification (executed this session)

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** (2026-07-12) |
| Bundle warning | `predator-tools` ~1.3 MB — **must stay out of prod nav** |
| `verify-scripts-readonly.mjs` | **GO** |
| `verify-operational-readiness-pack.mjs` | **GO** |

Asset output: `primecare-portal/dist/` (Vercel output directory).

---

## Database

| Topic | Guidance |
|-------|----------|
| **Track** | Choose **one**: Track A (manual `HQ_SQL_MIGRATION_MANIFEST.md`) **or** Track B (`supabase/migrations`). **Do not mix.** QA certified on Track A. |
| **Order** | Apply manifest §1 top → bottom; then Sprint 3A hardening `20260702170000_sprint3a_production_safety_hardening.sql` + later dated migrations required for payroll/comp if Track B |
| **Pending on prod** | **Unknown until prod project exists** — operator must diff remote vs manifest |
| **Seed exclusions** | Do **not** seed Predator/perf pollution tenants; do **not** copy QA legacy AR labs into prod KPI scope |
| **Rollback** | Prefer forward fix; catastrophic → Supabase backup/PITR + `Sprint3A_Restore_Verification_Checklist.md` |
| **Safety** | No ad-hoc DROP; Founder approval for restore; no `SELECT *` expansion in app (freeze) |

---

## Environment

Fill and sign: `docs/operations/HQ_PRODUCTION_ENV_CHECKLIST.md` (**currently Not yet executed**).

| Area | Required |
|------|----------|
| Vercel | `VITE_APP_ENV=prod`, Supabase URL + anon key, Predator/QA flags **false**, legacy Apps Script **false** |
| Supabase | Prod project ref ≠ QA `zipuzmfkwwucbchlphcj`; Auth Site URL = prod domain |
| Service role | Edge secrets only — **never** Vercel client env / git |
| Storage | `invoice-pdfs` private; operational evidence bucket |
| Email | **None in Year-1** — document customer handoff (WhatsApp/PDF); do not invent SMTP |
| Uploads | Collection proof / operational evidence per existing storage policies |
| Optional | `VITE_SENTRY_DSN`, `VITE_ALERT_WEBHOOK_URL`, `VITE_UPTIME_PROBE_URL` |

Edge deploy (prod project ref):  
`provision-platform-user`, `reset-platform-user-password`, `generate-invoice-pdf`  
(QA script targets QA ref only — use prod ref explicitly.)

---

## Authentication / RLS / Storage / Monitoring (deploy gates)

| Area | Pre-prod action | Verify |
|------|-----------------|--------|
| Login / session / logout | Smoke all four roles on **prod** | Browser |
| Password reset | Edge fn deployed; Auth redirects | Reset flow |
| Role permissions | Pilot roles only | Matrix unchanged (freeze) |
| RLS | Run against **prod** | `verify-hq-rls-reads.mjs` |
| Invoice PDF | Bucket + edge + download | `HQ_STORAGE_HEALTH_CHECK.md` |
| Monitoring | Hooks present; APM optional for pilot | `monitoring.js`; halt on verify FAIL |

---

## Deployment Checklist

### Phase 0 — Blockers (must close)

| # | Item | Done |
|---|------|------|
| 0.1 | Working tree clean or dirty files explicitly waived | ☐ |
| 0.2 | `git push origin qa` | ☐ |
| 0.3 | Tag `v1.0.0-rc1` + `v1.0.0-rollback-base` | ☐ |
| 0.4 | Promote `qa` → `main` (or pin tag) | ☐ |
| 0.5 | Production Supabase project provisioned | ☐ |
| 0.6 | `HQ_PRODUCTION_ENV_CHECKLIST.md` 100% filled | ☐ |
| 0.7 | Migrations applied (one track) + hardening | ☐ |
| 0.8 | Edge functions on **prod** | ☐ |
| 0.9 | Backups confirmed; DR drill **or** Founder waiver | ☐ |
| 0.10 | Inventory + Purchase sign-off **or** Founder waiver | ☐ |

### Phase 1 — Pre-deploy cert (QA or staging)

```bash
cd primecare-portal
npm run build
node scripts/verify-scripts-readonly.mjs
node scripts/verify-operational-readiness-pack.mjs
node scripts/verify-rc1-production-readiness.mjs   # allow documented MON-14/15 WARN
node scripts/verify-no-finance-mutation.mjs
# With network + credentials targeting intended env:
node scripts/verify-hq-rls-reads.mjs
node scripts/verify-primecare-production-golden-path.mjs
```

### Phase 2 — Deploy order

1. Database migrations (Track A **or** B)  
2. Edge functions  
3. Vercel production deploy from tagged commit  
4. Auth URL / redirect confirmation  
5. Smoke test (§ below)  
6. 24h watch — recon WARN only on golden labs  

### Phase 3 — Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Engineering | | | ☐ GO ☐ CONDITIONAL ☐ NO-GO |
| Operations | | | ☐ GO ☐ CONDITIONAL ☐ NO-GO |
| Founder | | | ☐ GO ☐ CONDITIONAL ☐ NO-GO |

---

## Production Risks

| ID | Risk | Severity |
|----|------|----------|
| DEP-R1 | Promote dirty/`main` lag without tags | Deploy chaos |
| DEP-R2 | Mix Track A + B migrations | Schema corruption |
| DEP-R3 | Service role in client env | Security breach |
| DEP-R4 | Predator/QA flags on in prod | Tooling exposure |
| DEP-R5 | DR-01 unproven | Data loss on outage |
| DEP-R6 | Receive double-click / fulfill without invoice | Integrity (SOP) |
| DEP-R7 | KPI on non-golden labs | False finance trust |
| DEP-R8 | No email | Customer expectation mismatch |
| DEP-R9 | MON-14 at scale | Latency if volume explodes |

---

## Blocking Issues (NO-GO if open)

| # | Blocker |
|---|---------|
| B1 | Production env checklist not executed |
| B2 | No release/rollback tags; `qa` unpushed / unclean |
| B3 | Prod migrations not confirmed applied |
| B4 | DR drill not done and no Founder waiver |
| B5 | Post-deploy smoke not PASS on **production** |
| B6 | RLS verify not PASS on **production** |

---

## Rollback Plan

Primary doc: `docs/QA/RC1/RC1_Rollback_Plan.md`  
Also: `Sprint3A_Deployment_Rollback_Verification.md`, `Sprint3A_Restore_Verification_Checklist.md`

| Layer | Action |
|-------|--------|
| **App** | Vercel → promote previous deployment / redeploy `v1.0.0-rollback-base` |
| **Config** | Keep Supabase URL/keys unchanged during app rollback |
| **Data** | Forward-fix preferred; PITR/restore only with Founder approval |
| **Flags** | Projection adapters OFF; Predator/QA OFF |
| **Comms** | Notify customer ≤15 min |
| **Verify** | Golden path + financial reconciliation after rollback |

**Rollback authority:** Founder + Engineering Lead

---

## Smoke Test Checklist (post-deploy — production)

**Status this session:** **NOT EXECUTED on production** (prod project values blank; prepare only).

Execute in order on **production**. Record PASS/FAIL. Stop on first FAIL → rollback decision.

| # | Step | Role | Expected | Result |
|---|------|------|----------|--------|
| SM01 | Admin Login | Admin | Workspace loads | ☐ |
| SM02 | Executive Login | Executive | Founder OS / EFI loads | ☐ |
| SM03 | Lab Login | Lab | Portal + ordering mode gates | ☐ |
| SM04 | Agent Login | Agent | Assigned labs only | ☐ |
| SM05 | Create Order | Admin/Lab | Order created | ☐ |
| SM06 | Purchase (if needed) | Admin | PO Draft/Ordered | ☐ |
| SM07 | Receive | Admin | Stock↑ / PURCHASE_IN; **single click** | ☐ |
| SM08 | Fulfill | Admin | ORDER_OUT; status Fulfilled | ☐ |
| SM09 | Invoice | Admin | Finalize + PDF download | ☐ |
| SM10 | Collection | Admin | Open AR visible | ☐ |
| SM11 | Payment | Admin | Allocate; balance updates | ☐ |
| SM12 | Commission | HR | Cash-based entry visible | ☐ |
| SM13 | Payroll | HR | Preview/approve; **no GL/bank** | ☐ |
| SM14 | Executive Dashboard | Executive | KPIs on **golden labs only** | ☐ |
| SM15 | Logout / session | Any | Session cleared | ☐ |
| SM16 | Password reset | Admin target | Edge reset works | ☐ |

Optional automated assist (prod credentials):  
`node scripts/verify-primecare-production-golden-path.mjs`

---

## Launch Recommendation

| Decision | When |
|----------|------|
| **GO** | All Blocking Issues closed + smoke PASS on prod + Founder sign-off |
| **CONDITIONAL GO** | Deploy to prod for **supervised** first customer while DR waiver + golden-lab KPI lock documented |
| **NO-GO** | Any of B1–B6 open without waiver |

### Verdict now (2026-07-12 prep)

# **CONDITIONAL GO** to continue deployment **preparation**  
# **NO-GO** to cut over traffic until Blocking Issues B1–B6 are closed

---

## Explicit non-actions

- No application code changes  
- No schema / API / RLS / business-rule changes  
- No UI redesign  
- No new features or modules  

**STOP.** Execute the checklist on production infrastructure. Do not implement features.
