# HQ Monitoring Plan

**Last updated:** 2026-06-24 (RC-9)  
**Owner:** HQ Engineering  
**Classification:** **READY FOR IMPLEMENTATION** (pilot minimum) / **FAIL** (production unattended)

---

## RC-9 pilot minimum (implement before Production traffic)

| # | Control | Implementation | Status |
|---|---------|----------------|--------|
| M1 | Scheduled cert suite every **6 hours** | `.github/workflows/hq-production-cert.yml` — cron `0 */6 * * *` | **READY** — workflow exists |
| M2 | Failure notification target | Configure GitHub Actions failure → email/Slack (repo settings) | **NOT CONFIGURED** |
| M3 | Invoice generation failure | `verify-primecare-production-golden-path.mjs` GP-30 | **READY** — in cert suite |
| M4 | Payment allocation failure | `verify-financial-reconciliation.mjs` FR-GP-* | **READY** — in cert suite |
| M5 | Edge function failure | GP-30 PDF + `verify-invoice-phase3.mjs --remote` | **READY** — manual/CI |
| M6 | RLS failure | `verify-hq-rls-reads.mjs` MON-13 | **READY** |
| M7 | Golden path failure | MON-10 full chain | **READY** |
| M8 | Predator regression | MON-15 Fail=0 | **READY** |
| M9 | Performance regression | MON-14 bounded reads | **READY** |
| M10 | Alert delivery tested | Send test failure notification | **NOT TESTED** |

**Operator rule:** Any cert script exit non-zero → **halt releases** (`HQ_ALERTING_RUNBOOK.md`).

**Do not claim monitoring PASS until M2 + M10 verified.**

---

## Purpose

Define how PrimeCare HQ detects runtime failures across frontend, backend, and database layers. This sprint is **inventory + minimum pilot coverage** only — no new monitoring integrations were deployed.

---

## Current coverage

### Frontend (Vercel / React SPA)

| Signal | Implemented | Evidence |
|--------|-------------|----------|
| Runtime JS exceptions | **No** | No Sentry/LogRocket/Bugsnag in `package.json` |
| Crash reporting | **No** | — |
| User-facing error banners | **Partial** | `role="alert"` on Orders/Admin/Notification pages |
| Build failures | **Yes** | `npm run build` in cert suite |
| Client API warnings | **Partial** | `console.warn` in `primecareSupabaseApi.js` (dev console only) |
| Predator module validation | **Yes** | `run-hq-predator-certification.mjs` (manual/scheduled) |

### Backend (Supabase Edge Functions)

| Function | Logging | External monitor |
|----------|---------|----------------|
| `provision-platform-user` | Supabase Dashboard → Edge Functions → Logs | **No** |
| `reset-platform-user-password` | Same | **No** |
| `generate-invoice-pdf` | Same | **No** |

Edge function failures surface to users as API errors; no automated paging.

### Backend (PostgREST / RPC)

| Signal | Implemented | Evidence |
|--------|-------------|----------|
| RPC failures (`allocate_payment_to_invoice`, etc.) | **Partial** | Caught in cert scripts; `console.warn` in app |
| API 4xx/5xx aggregate | **No** | No APM |
| Auth failures | **Partial** | `verify-hq-rls-reads.mjs` |

### Database (Postgres / RLS)

| Signal | Implemented | Evidence |
|--------|-------------|----------|
| Failed queries (42501 RLS) | **Partial** | Predator + RLS cert scripts |
| Slow queries | **Partial** | `run-hq-performance-certification.mjs` (bounded read benchmarks) |
| `temp_anon` policy drift | **Yes** | `verify-pilot-hardening-sql.mjs` PH-10 |
| Connection / availability | **No** | No synthetic uptime check |
| Supabase Dashboard → Reports | **Available** | Not wired to alerts |

### Financial integrity

| Signal | Implemented | Evidence |
|--------|-------------|----------|
| AR / invoice drift | **Yes** | `verify-financial-reconciliation.mjs` (manual) |
| Golden path end-to-end | **Yes** | `verify-primecare-production-golden-path.mjs` |
| Unallocated cash KPI | **Yes** | `get_invoice_tenant_financial_kpis` RPC + Executive Control Tower |

---

## Missing coverage (production gaps)

| Gap | Risk | Priority |
|-----|------|----------|
| No frontend crash reporting | Silent user failures | P0 |
| No edge function error alerts | Invoice PDF / provision failures undetected | P0 |
| No synthetic uptime probe | Supabase outage discovered by users | P0 |
| No log drain (Datadog/Sentry) | Cannot triage production incidents | P1 |
| No slow-query alerting on Postgres | Performance regression undetected | P1 |
| No allocation-failure metric | Payments stay unallocated silently | P1 |
| Console-only `console.warn` | Not visible in production | P1 |

---

## Pilot minimum coverage (acceptable for first paying lab **with manual ops**)

Run **daily** (or pre-release) from `primecare-portal/`:

```bash
npm run build
node scripts/verify-hq-rls-reads.mjs
node scripts/verify-primecare-production-golden-path.mjs
node scripts/verify-financial-reconciliation.mjs
node scripts/run-hq-predator-certification.mjs
PERF_SKIP_SEED=1 node scripts/run-hq-performance-certification.mjs
node scripts/verify-pilot-hardening-sql.mjs
node scripts/verify-production-monitoring.mjs
```

Scheduled probe orchestrator: `scripts/verify-production-monitoring.mjs` (also wired in `.github/workflows/hq-production-cert.yml` — **every 6 hours** when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` GitHub secrets set).

| Probe ID | Script | Alert on FAIL |
|----------|--------|---------------|
| MON-10 | `verify-primecare-production-golden-path.mjs` | Invoice/payment/allocation chain broken |
| MON-11 | `verify-financial-reconciliation.mjs` | AR/invoice drift or golden-path FAIL |
| MON-12 | `verify-pilot-hardening-sql.mjs` | RLS policy drift (`temp_anon`) |
| MON-13 | `verify-hq-rls-reads.mjs` | Role isolation regression |
| MON-14 | `run-hq-performance-certification.mjs` | Unbounded read surfaces |
| MON-15 | `run-hq-predator-certification.mjs` | Module validation FAIL |
| MON-20 | Ops docs present | Monitoring plan missing |

| Check | Pass criteria | Last run |
|-------|---------------|----------|
| Build | Exit 0 | 2026-06-24 PASS |
| RLS reads | 4/4 roles | 2026-06-24 PASS |
| Golden path | 13/13 steps | 2026-06-24 PASS |
| Financial recon | Golden PASS; legacy WARN | 2026-06-24 WARN |
| Predator | Fail = 0 | 2026-06-24 PASS |
| Performance | 0 unbounded surfaces | 2026-06-24 PASS |
| Pilot hardening SQL | PH-10 temp_anon = 0 | 2026-06-24 PASS |

**Operator action:** If any script exits non-zero, **halt releases** and follow `HQ_ALERTING_RUNBOOK.md`.

---

## Production recommendation (optional — post-pilot)

| Layer | Recommendation | Est. effort | Status |
|-------|----------------|-------------|--------|
| Frontend | Sentry with `VITE_SENTRY_DSN` | 0.5 day | **NOT IMPLEMENTED** |
| Edge functions | Supabase Log Drain → Datadog/Sentry | 1 day | **NOT IMPLEMENTED** |
| Database | Supabase report email; weekly slow-query review | 0.5 day | **NOT IMPLEMENTED** |
| Synthetic | External uptime ping (e.g. Better Stack) | 0.5 day | **NOT IMPLEMENTED** |
| Financial | Schedule recon; alert on FAIL | 0.25 day | **PARTIAL** — CI only |

**Target:** Pilot minimum **READY FOR IMPLEMENTATION** → **PASS** after M2/M10 + optional Sentry.

---

## Classification

| Audience | Status | Rationale |
|----------|--------|-----------|
| **Production (unattended)** | **FAIL** | No crash reporting, no automated alerts, no uptime probes |
| **Pilot (manual cert + on-call engineer)** | **WARN** | Comprehensive manual cert suite; operator must run scripts |
| **After recommended integrations** | **PASS** (projected) | Pending implementation |
