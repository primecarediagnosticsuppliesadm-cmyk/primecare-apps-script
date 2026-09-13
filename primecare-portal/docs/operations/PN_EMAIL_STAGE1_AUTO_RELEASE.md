# PN-EMAIL Stage 1 auto-release runner

Automation for the certified Production candidate **only**. Founder browser UAT is **not** part of this runner.

| Pin | Value |
|-----|--------|
| Immutable candidate | `1141e617246fac15a5daa7318d0ec1cb54659062` (`release/pn-email-prod-candidate`) |
| Production `main` must remain | `f0d18efceab0d83d55526d842f6535916587e8c8` |
| Production Supabase | `alxhrnotnvwpblsiadxj` |
| Reject QA | `zipuzmfkwwucbchlphcj` |
| Canonical host | `https://app.primecarediagnostics.in` |

**This commit does not run Production deployment.** The GitHub workflow is `workflow_dispatch` only, always `--dry-run`, schedule commented out.

## Architecture

Existing CI (architecture enforcement, HQ production cert probes) is **not** a Production cutover pipeline. `docs/operations/Release_Hardening_Runbook.md` is a **human** dry-run → apply sequence and must not be auto-applied.

This runner is a new GitHub Actions workflow wrapping `scripts/release/pn-email-stage1-auto-release.mjs`.

Deploy always uses the pinned candidate SHA via `git show` / detached worktree. The automation branch HEAD is never deployed.

## Triggers

- Manual: `workflow_dispatch` (this commit).
- Scheduled: **disabled**. Recommended later: `45 10 * * *` (after ~10:30 UTC). Clock passing is **not** proof of backup success.

## Gates (order)

1. Immutable SHA: `origin/release/pn-email-prod-candidate` and `origin/main`.
2. Production identity: project ref + host; refuse QA; `--linked` forbidden.
3. Backup: latest Production physical backup `COMPLETED`, same UTC calendar day, age ≤ 2 hours. No restore, no PITR, no logical dump substitute.
4. Allowlist file hashes vs candidate SHA.
5. Live ledger + object classification (`not_applied` / `already_correct` / `partial_or_mismatch`).
6. Execute only (later): apply exact files, re-probe, set `EMAIL_ENABLED=false`, deploy function + Vercel from candidate SHA, technical smoke.
7. Confirm `origin/main` unchanged.
8. Stop before founder UAT.

Backup fail banner: `PN-EMAIL AUTO DEPLOY HOLD — fresh physical backup unavailable`

Success banner (execute only): `PN-EMAIL STAGE 1 AUTO DEPLOY COMPLETE — READY FOR FOUNDER UAT`

## Migration allowlist (exact files only)

- `20260912200000_pn1a_prospect_in_app_notifications.sql`
- `20260913010000_pn1b1_prospect_email_delivery_queue.sql`
- `20260913020000_pn1b2_email_dispatch_claim.sql`

No `supabase db push`, no glob, no apply-all. SQL is executed with `supabase db query --db-url $PROD_SUPABASE_DB_URL --file <extracted candidate bytes>` then a ledger insert of the 14-digit version.

Idempotency:

| Live state | Action |
|------------|--------|
| `already_correct` | skip apply |
| `not_applied` | apply exact file |
| `partial_or_mismatch` or `objects_present_ledger_missing` | HOLD — do not rerun SQL |

## Stage 1 email config (execute)

`APP_ENV=prod` · `EMAIL_QA_MODE=false` · `EMAIL_ENABLED=false` · `APP_PUBLIC_URL=https://app.primecarediagnostics.in` · `EMAIL_FROM_NAME=PrimeCare`

Provider key / from / reply-to are **not** required. Never copy QA `EMAIL_PROVIDER_API_KEY`. Never enable sending or cron.

## DRY_RUN

```bash
cd primecare-portal
npm run release:pn-email-stage1:dry-run
```

Runs identity, SHA, backup inspect, hash, live read-only probe, Edge list, `npm run build`, notification/1b1/1b2, Flow 2A/2B/2C/2E, Flow 1A/1B/1C/1F/1H, Flow 3A static, homepage/auth health. No `--apply`. No Flow 3B.

## Execute locks (must remain unused until a later gate)

`--execute-prod` **and** `PRIMECARE_CONFIRM_PROD=YES` **and** `APPLY_PN_EMAIL_STAGE1=YES` **and** `PN_EMAIL_STAGE1_ALLOW_EXECUTE=true`. GitHub workflow sets `PN_EMAIL_STAGE1_CI_FORCE_DRY_RUN=true` so CI cannot execute in this commit.

## Failure / recovery

Stop at the first failed gate. Report completed gates.

| Situation | Recovery |
|-----------|----------|
| DB migrated, app not promoted | Do **not** destructively roll back SQL. Retry Edge/Vercel from the candidate SHA. Keep `EMAIL_ENABLED=false`. |
| App deployed, verification fail | Keep email disabled. Rollback target is the previous READY Vercel deployment on the canonical host. Do not roll back DB. |

Concurrency group: `primecare-production-release` with `cancel-in-progress: false`.

## GitHub environment protection

This workflow does **not** attach `environment: production`. `gh` was not available to audit whether a Production environment already requires reviewers. Attaching it without audit could add a founder click-gate; omitting it does not remove an existing certified control on other workflows. Founder must place Production-scoped secrets for **this** workflow without using QA credentials.

## CI secret names (values never in git)

`SUPABASE_ACCESS_TOKEN` · `PROD_SUPABASE_DB_URL` · `VERCEL_TOKEN` · `VERCEL_ORG_ID` · `VERCEL_PROJECT_ID` · `PROD_EMAIL_DISPATCH_CRON_SECRET`

`PROD_SUPABASE_DB_URL` must contain `alxhrnotnvwpblsiadxj` and must not contain `zipuzmfkwwucbchlphcj`.

## Enablement (later, not this commit)

Do not uncomment the schedule until: workflow review, DRY_RUN PASS, secret placement confirmed, Production identity verified, no destructive commands, concurrency verified, failure paths verified, and an explicit later instruction to enable.
