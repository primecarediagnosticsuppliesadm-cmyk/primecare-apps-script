# PrimeCare Release Hardening Runbook

Make the next QA → Production release boring and deterministic.

**Do not apply migrations from this document automatically.** Humans run dry-run → apply.

---

## Canonical environment refs

| Env | Project ref |
|-----|-------------|
| QA | `zipuzmfkwwucbchlphcj` |
| PRODUCTION | `alxhrnotnvwpblsiadxj` |

```bash
cd primecare-portal
npm run db:qa:check
npm run db:prod:check
```

**STOP** if the printed ENV / PROJECT REF is unexpected.

---

## Canonical release flow

1. **Feature branch** — implement + blueprint updates as required.
2. **Local certification**
   ```bash
   CERTIFY_ALLOW_DIRTY=1 npm run certify:release:quick   # while iterating
   npm run certify:release                               # before promote
   ```
3. **Merge feature → `qa`** (no unresolved MERGE_HEAD).
4. **Verify QA project ref** — `npm run db:qa:check`
5. **QA migration dry-run** — `npm run db:qa:dry-run`
6. **QA migrations** — only after dry-run review (`supabase db push` manually).
7. **QA browser UAT** — role-scoped smoke (Agent Visit, notifications console clean).
8. **QA certification GREEN** — re-run `npm run certify:release` on clean tree.
9. **Production backup** — operator-owned.
10. **Verify PROD project ref** — `npm run db:prod:check`
11. **PROD dry-run** — `npm run db:prod:dry-run` (requires `PRIMECARE_CONFIRM_PROD=YES`)
12. **Schema/RLS/grant parity** — `npm run verify:db-foundation` (+ `--live` when linked)
13. **Merge exact tested `qa` → `main`** — no cherry-pick drift.
14. **Production Vercel Ready** — confirm `VITE_APP_COMMIT_HASH` matches `origin/main`.
15. **Production smoke** — Agent Visit + notification side effects.
16. **RELEASE GREEN**

---

## STOP conditions

Stop the release if any of the following are true:

- Linked Supabase project ref is unexpected
- Migration list / history mismatch vs dry-run expectation
- Dry-run contains unexpected migrations
- `verify-db-foundation` / notification contract / legacy gate FAIL
- Unresolved Git merge (`MERGE_HEAD`) or conflicted files
- Dirty tracked files at promote time
- Critical untracked migrations under `supabase/migrations/`
- Browser commit hash does not match expected `origin/qa` or `origin/main`
- QA browser UAT incomplete

---

## Package commands

| Command | Purpose |
|---------|---------|
| `npm run db:qa:check` / `db:prod:check` | Environment identity |
| `npm run db:qa:dry-run` / `db:prod:dry-run` | Assert env + migration list + `db push --dry-run` |
| `npm run verify:db-foundation` | Static foundation tables/functions/grants |
| `npm run verify:notification-contract` | Notification payload/client/RETURNING contract |
| `npm run verify:legacy-deps` | Apps Script not required on critical paths |
| `npm run verify:git-release` | Merge/dirty/untracked migration guards |
| `npm run verify:qa-prod-parity` | Shared versioned artifacts for both envs |
| `npm run certify:release` | Full orchestrated certification |
| `npm run certify:release:quick` | Core gates only |

---

## Full certification notes

`npm run certify:release` (non-quick) also runs zero-dead-ends, HQ RLS reads, Predator, performance, and golden path.

Known environment-dependent stops (not fixed by this hardening layer):

- **Performance** — `PERF_SKIP_SEED=1` fails if the PERF scale tenant lacks seeded orders/payments. Re-seed or omit `PERF_SKIP_SEED`.
- **Predator** — may FAIL on pre-existing module checks (e.g. Revenue Funnel / Lab Portal) unrelated to Agent Visit release.
- **Live foundation** — `node scripts/verify-db-foundation.mjs --live --expect=qa|prod` requires correct linked project.

Use `certify:release:quick` for deterministic local/core gates; run full suite on a clean tree with QA credentials before promote.

---

## Human UAT still required

Automated gates do **not** replace:

- Role-scoped browser smoke (agent / admin / executive as relevant)
- Visual confirmation of success screens
- Network tab confirmation that notification POSTs are 2xx (or intentional fire-and-forget warnings only)
- Production backup verification before migrate
- Confirming QA/Prod browser `VITE_APP_COMMIT_HASH` matches the expected git tip
