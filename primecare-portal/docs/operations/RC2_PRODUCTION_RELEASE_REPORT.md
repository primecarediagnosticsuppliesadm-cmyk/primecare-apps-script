# RC-2 Production Release Closure Report

**Date:** 2026-06-24  
**Environment:** QA Supabase `zipuzmfkwwucbchlphcj` · HQ tenant `f168b98f-47a6-42c3-b788-24c00436fac2`  
**Verdict:** **NOT GREEN**

---

## Executive summary

RC-2 closed multiple RC-1 P1 code blockers (bundle split, placeholder elimination, agent notifications menu, commission in golden path, notification schema resilience, console gating in hot paths, CI monitoring orchestrator). All automated certification probes **PASS**. Production operations blockers (monitoring integrations, backup restore drill, production environment, human UAT signatures) remain open.

---

## Certification evidence (2026-06-24 RC-2 run)

| Probe | Result | Evidence |
|-------|--------|----------|
| Build | **PASS** | `npm run build` — `PrimeCareWebPortal` chunk **13.1 kB** (was ~1.9 MB monolith) |
| Golden Path | **PASS** | 14/14 incl. GP-45 commission engine |
| Financial Recon | **WARN** | FR-50 legacy drift; golden path FR-GP-* PASS |
| Pilot Hardening | **PASS** | PH-00–PH-17, temp_anon=0 |
| RLS Reads | **PASS** | 4/4 roles |
| Performance | **PASS** | 5 bounded surfaces; slowest Admin Dashboard 1043ms |
| Predator | **PASS** | Fail=0 |
| Monitoring orchestrator | **PASS** | `verify-production-monitoring.mjs` 7/7 |

**Golden path chain:** `ORD-GP-PROD-1782333151898` → `INV-2026-000017` → PDF 1850 bytes → `PAY-GP-PROD-1782333151898` → allocation → open balance 0 → commission engine 1 entry.

---

## P0 status

| ID | Blocker | RC-2 status | Remediation |
|----|---------|-------------|-------------|
| P0-1 | Production monitoring missing | **PARTIAL** | `verify-production-monitoring.mjs` + `.github/workflows/hq-production-cert.yml`; no Sentry/Datadog |
| P0-2 | Production alerting missing | **PARTIAL** | CI fail = alert hook documented; no paging |
| P0-3 | Backup/restore not validated | **OPEN** | `HQ_BACKUP_RECOVERY_RUNBOOK.md` — PITR disabled; restore drill not executed |
| P0-4 | Legacy financial reconciliation drift | **WARN ACCEPTED** | ₹9,135 unallocated cash; 21 `ar_row_no_activity` (not golden-lab); golden path clean |
| P0-5 | Production environment not certified | **OPEN** | QA certified only; no prod Supabase/Vercel |
| P0-6 | Formal UAT signoff incomplete | **PARTIAL** | Automated matrix PASS; human signatures blank |
| P0-7 | Notification schema drift | **MITIGATED** | Code fallback for missing `provider_response`/`error_message`; apply `notifications_foundation_migration.sql` on prod |

---

## P1 status

| ID | Blocker | RC-2 status |
|----|---------|-------------|
| P1-1 | 2MB bundle | **CLOSED** | Lazy routes + manualChunks; portal shell 13 kB |
| P1-2 | Performance placeholder route | **CLOSED** | Redirects to dashboard |
| P1-3 | Commission not in golden path | **CLOSED** | GP-45 added |
| P1-4 | Agent notification discoverability | **CLOSED** | `notifications` in `AGENT_MENU_ORDER` |
| P1-5 | Agent task completion disabled | **OPEN** | Requires Supabase `agent_tasks`; Apps Script gated off in QA/PROD |
| P1-6 | Collections placeholders | **CLOSED** | Removed "coming soon" copy; hidden disabled task UI |
| P1-7 | Distributor Provisioning "Coming Soon" | **CLOSED** | Copy → "Activation prerequisite" |
| P1-8 | Scale certification gaps | **PARTIAL** | 100k perf tenant PASS; invoice center not separately benchmarked |
| P1-9 | Apps Script fallback paths | **PARTIAL** | `ALLOW_LEGACY_APPS_SCRIPT` false in QA/PROD; dev proxy remains |
| P1-10 | AI Insights migration | **CLOSED** | Supabase `getAdminDashboardRead` in QA/PROD |
| P1-11 | Console cleanup | **PARTIAL** | `primecareSupabaseApi.js` gated (~107 statements); ~90 remain in other files |

---

## P2 / P3 (non-blocking)

| Priority | Item |
|----------|------|
| P2 | Predator WARN modules (Tenant Foundation, Distributor Provisioning, Commission, Lab Contract, Billing) |
| P2 | `runPredatorValidation` chunk 717 kB — lazy-load only on Predator debug page |
| P2 | Commission upsert RLS WARN in cert logs (admin session) |
| P3 | Apply `collections_notes_migration.sql` for `collected_by` column |
| P3 | PERF tenant pollution in agent workspace reads |

---

## Files changed (RC-2)

| Area | Files |
|------|-------|
| Notifications | `src/notifications/createNotificationEvent.js` |
| Agent UX | `src/config/menuConfig.js` |
| Placeholders | `src/PrimeCareWebPortal.jsx`, Collections components, Distributor pages |
| Bundle | `vite.config.js`, lazy imports in `PrimeCareWebPortal.jsx` |
| Console | `src/api/primecareSupabaseApi.js`, `src/commission/commissionData.js` |
| AI Insights | `src/pages/AIInsightsPage.jsx` |
| Certs | `scripts/verify-primecare-production-golden-path.mjs`, `verify-production-monitoring.mjs`, `verify-collection-inconsistencies.mjs` |
| CI | `.github/workflows/hq-production-cert.yml` |
| Ops docs | `HQ_MONITORING_PLAN.md`, this report |

---

## Performance

| Surface | ms | Target | Status |
|---------|-----|--------|--------|
| Collections (bounded) | 286 | <500 | PASS |
| Revenue Funnel probe | 407 | <500 | PASS |
| Operations Center | 819 | <1500 | PASS |
| Orders (bounded) | 885 | <1500 | PASS |
| Admin Dashboard | 1043 | <1500 | PASS |

Initial JS load (gzip): index ~114 kB + react-vendor ~87 kB + supabase ~52 kB ≈ **253 kB** critical path (excluding on-demand route chunks).

---

## Financial reconciliation

| Metric | Value | Classification |
|--------|-------|----------------|
| Unallocated cash | ₹9,135 | Historical pre-allocation payments |
| AR vs invoice drift | ~₹4,054 | Dual-ledger legacy |
| Collection inconsistencies | 21 (`ar_row_no_activity`) | Empty AR rows — not golden-lab |
| Golden lab QA_LAB_001 | 0 issues | **Production-safe for first lab** |

---

## Console cleanup

| Metric | Count |
|--------|-------|
| Before (RC-1 audit) | ~200 |
| After RC-2 (`primecareSupabaseApi` + commission gated) | ~93 remaining across `src/` |
| Intentional | `hqDebugLog.js`, Predator debug, migration trace (dev-only) |

---

## UX score (automated + static review)

| Area | Score | Notes |
|------|-------|-------|
| Agent portal | 8/10 | Notifications in menu; task completion hidden when disabled |
| Collections | 8/10 | No "coming soon" strings |
| Executive | 9/10 | Performance deep-link redirects |
| Distributor provisioning | 7/10 | Prerequisite copy; full launch still gated |
| Default unmapped pages | 6/10 | Still shows "not mapped yet" for invalid deep links |

**Overall UX:** 7.5/10

---

## Production confidence estimates

| Dimension | Estimate |
|-----------|----------|
| Production confidence | **62%** (QA technical PASS; ops gaps) |
| Supportability | **55%** (no crash reporting / log drain) |
| First paying lab readiness | **70%** on QA with manual ops; **40%** for unattended prod |

---

## Final verdict: NOT GREEN

### Remaining blockers for GREEN

1. **P0-3** — Execute backup restore drill; enable PITR or document RPO acceptance
2. **P0-5** — Certify production Supabase + Vercel environment
3. **P0-1/2** — Deploy Sentry + Supabase log drain + paging
4. **P0-6** — QA Lead / Architect signatures on `HQ_UAT_SIGNOFF.md`
5. **P1-5** — Supabase `agent_tasks` path or formally classify out-of-scope
6. **P1-11** — Gate remaining ~93 console statements
7. **P0-7** — Apply notification migration on target DB (code fallback is interim)
8. Browser walkthrough per `HQ_LAUNCH_CHECKLIST.md` (not recorded)

### What passed

- Golden Path **PASS** (incl. commission)
- Predator **PASS** (0 FAIL)
- Pilot Hardening **PASS**
- RLS **PASS**
- Performance **PASS** (bounded)
- Monitoring probe orchestrator **PASS**
- Bundle **PASS** (<500 kB per route chunk; no 2 MB monolith)
