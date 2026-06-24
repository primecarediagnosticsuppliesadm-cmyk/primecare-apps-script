# HQ Production Rollback Plan

**Last updated:** 2026-06-24  
**Scope:** PrimeCare HQ Web Portal (`primecare-portal`) + Supabase QA/Prod  
**Owner:** HQ Engineering / Release Captain

---

## 1. Release branch & artifacts

| Item | Value |
|------|--------|
| Release branch | `main` (or tagged release branch at deploy time) |
| Build command | `npm run build` |
| Deploy target | Vercel (or current static host) |
| Supabase project (QA) | `zipuzmfkwwucbchlphcj` |
| HQ pilot tenant | `f168b98f-47a6-42c3-b788-24c00436fac2` |
| Guntur tenant (do not mutate on rollback) | `787999b9-72f5-4163-a860-551c12ce3414` |

**Pre-deploy tag:** Create a git tag before each production promotion, e.g. `hq-release-2026-06-24`.

---

## 2. Vercel rollback (fastest UI recovery)

1. Open Vercel project → **Deployments**.
2. Identify last known-good deployment (green CI + browser cert).
3. Click **⋯ → Promote to Production** on the prior deployment.
4. Confirm `VITE_APP_ENV=prod` and production Supabase env vars unchanged.
5. Hard-refresh browser; verify login for Executive + Admin.

**Expected recovery time:** 2–5 minutes.

---

## 3. Feature flag rollback (no redeploy)

Disable debug/QA surfaces via environment variables:

| Flag | Production default | Rollback action |
|------|-------------------|-----------------|
| `VITE_PREDATOR_DEBUG` | `false` | Set `false` (or unset) |
| `VITE_QA_COMMAND_CENTER` | `false` | Set `false` |
| `VITE_QA_VALIDATION_LAYER` | `false` | Set `false` |
| `VITE_HQ_DEBUG_LOG` | unset / `false` | Set `false` |
| `VITE_PERF_LOG` | unset / `false` | Set `false` |
| `VITE_ENABLE_EXPERIMENTAL_MODULES` | `false` | Set `false` |

Redeploy or trigger Vercel env refresh after changing flags.

---

## 4. Supabase migration rollback

**Policy:** Prefer forward-fix migrations over destructive rollback.

### If a migration causes read/write failure

1. Identify failing migration in `primecare-portal/supabase/sql/`.
2. Apply a **forward rollback SQL** (drop policy / restore prior policy) via Supabase SQL editor or `supabase db push` with a corrective file.
3. Do **not** delete HQ or Guntur tenant data during rollback.

### Critical migrations (HQ GREEN)

- `hq_profiles_rls_tenant_scope_migration.sql`
- `hq_orders_date_index_migration.sql`
- `user_provisioning_phase3a/3b/3c` + `pilot_hardening_agent_ownership_rls_migration.sql`

### Rollback notes

- RLS policy rollback: restore prior `profiles` policies from migration history; re-run `verify-hq-rls-reads.mjs`.
- Index rollback: `DROP INDEX CONCURRENTLY IF EXISTS idx_orders_tenant_order_date;` only if query planner regression confirmed.

---

## 5. Edge functions rollback

Functions: `provision-platform-user`, `reset-platform-user-password`

```bash
cd primecare-portal
npm run supabase:functions:deploy:qa   # redeploy known-good bundle from git tag
```

Verify with admin password reset on a test user (not production executives).

---

## 6. Emergency disable steps

| Severity | Action |
|----------|--------|
| P0 data leak | Disable Supabase anon key rotation + revoke sessions; promote prior Vercel build |
| P0 auth broken | Roll back edge functions + verify `profiles` RLS |
| P0 UI crash | Vercel promote prior deployment |
| P1 perf regression | Isolate PERF tenant; run `perf-scale-cleanup.mjs` if PERF pollution affects HQ reads |
| P1 agent login | Admin reset via Operations Center → Reset Pwd (QA: `qa.test.agent1@primecare.test`) |

**Do not** run `perf-scale-cleanup` on HQ or Guntur tenants.

---

## 7. Post-rollback validation checklist

Run in order:

1. `npm run build` on rollback commit
2. `node scripts/verify-hq-rls-reads.mjs`
3. `node scripts/run-hq-predator-certification.mjs` (HQ tenant only; PERF isolated)
4. Browser smoke: Executive dashboard, Admin Operations Center, Agent dashboard, Lab ordering
5. Confirm no `VITE_HQ_DEBUG_LOG` / `VITE_PERF_LOG` in production env

---

## 8. Owner checklist

- [ ] Release captain identified
- [ ] Last-good Vercel deployment ID recorded
- [ ] Git tag created pre-deploy
- [ ] Supabase migration log archived
- [ ] QA credentials documented in `docs/supabase-functions-deploy.md` (not in repo secrets)
- [ ] Guntur + HQ pilot data untouched during rollback
- [ ] Post-rollback validation suite green

---

## 9. Certification archive

Related docs in `docs/hq-certification/`:

- `HQ_RELEASE_GREEN_REPORT.md`
- `HQ_RLS_CERTIFICATION.md`
- `HQ_PREDATOR_CERTIFICATION.md`
- `HQ_PERFORMANCE_CERTIFICATION.md`
- `HQ_PILOT_HARDENING_CERTIFICATION.md`
- `HQ_GOLDEN_PATH_CERTIFICATION.md`
