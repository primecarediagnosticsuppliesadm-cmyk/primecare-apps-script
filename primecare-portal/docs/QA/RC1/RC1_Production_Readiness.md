# RC1 Production Readiness

**Date:** 2026-07-08  
**Script:** `scripts/verify-rc1-production-readiness.mjs`

---

## Checklist

| Area | Status | Evidence |
|---|---|---|
| **Projection engine** | Shadow / opt-in | `readProjectionFlags.js` — `isProjectionShadowMode`; flags OFF by default |
| **RLS** | PASS (QA) | `verify-hq-rls-reads.mjs`, `verify-pilot-hardening-sql.mjs` |
| **Performance** | WARN | MON-14: orders/payments unbounded at 100k in perf tenant |
| **Caching** | PASS | Session caches documented; tenant key gaps noted (low risk admin) |
| **Monitoring hooks** | PASS | `src/observability/monitoring.js` present |
| **Logging** | PASS | Structured console + read health banner |
| **Retry paths** | PASS | Payment compensating rollback (`verify-financial-reconciliation.mjs`) |
| **Error boundaries** | PASS | ReadHealthBanner; dashboard `readFailed` invariant |
| **Offline failures** | Partial | No offline queue for agent; mobile risk |
| **Deployment** | CONDITIONAL | Vercel + Supabase; Sprint 3A runbook exists |
| **Environment variables** | PASS | `.env.local` required; GAP-002–007 fixed on prod |
| **Secrets** | PASS | No secrets in repo; edge functions for password reset |

---

## Sprint 3A Artifacts (P0)

| Artifact | Status |
|---|---|
| Backup validation checklist | Present |
| Restore verification checklist | Present |
| Deployment rollback verification | Present |
| Production runbook | Present |
| Migration manifest | Present |
| `20260702170000_sprint3a_production_safety_hardening.sql` | Present |

---

## Monitoring Certification

`verify-production-monitoring.mjs` (2026-07-08):

| Check | Result |
|---|---|
| MON-09 Bounded reads | PASS |
| MON-10 Golden path | PASS |
| MON-11 Financial reconciliation | PASS |
| MON-11b Inventory reconciliation | PASS |
| MON-11c Transaction integrity RPCs | PASS |
| MON-12 Pilot hardening SQL | PASS |
| MON-13 HQ RLS reads | PASS |
| MON-14 Performance scale | **FAIL** |
| MON-15 Predator validation | **FAIL** (legacy rows) |
| MON-20 Monitoring plan | PASS |

---

## Production Environment Gaps

1. **DR drill not executed** on production Supabase (`alxhrnotnvwpblsiadxj`)
2. **PITR** — confirm enabled with Supabase support
3. **Prod migration apply** — verify sprint3a hardening applied
4. **Predator legacy drift** — waive for pilot scope or backfill AR

---

## Verdict

**CONDITIONAL GO** for QA/supervised pilot environment.  
**NO-GO** for unrestricted production until DR drill + MON-14/15 resolved or waived with sign-off.
