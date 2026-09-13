# PN-EMAIL Stage 1 auto-release runner

Automation for the certified Production candidate **only**. Founder browser UAT is **not** part of this runner.

| Pin | Value |
|-----|--------|
| Immutable candidate | `1141e617246fac15a5daa7318d0ec1cb54659062` (`release/pn-email-prod-candidate`) |
| Pre-release Product baseline | `f0d18efceab0d83d55526d842f6535916587e8c8` |
| Production Supabase | `alxhrnotnvwpblsiadxj` |
| Reject QA | `zipuzmfkwwucbchlphcj` |
| Canonical host | `https://app.primecarediagnostics.in` |

**This commit does not run Production deployment.** Schedule remains commented out.

## Architecture

Existing CI is not a Production cutover pipeline. This runner wraps `scripts/release/pn-email-stage1-auto-release.mjs`.

Deploy always uses the pinned candidate SHA via `git show` / detached worktree. Automation-branch HEAD is never deployed.

GitHub registers `workflow_dispatch` only after the workflow file exists on the **default branch**. Until then, `pull_request` DRY_RUN is the certification path.

## Main baseline model

`origin/main` is **not** required to equal the historical baseline forever. After the automation bootstrap is merged, main SHA will change.

The runner proves:

1. Candidate SHA is still `1141e617246fac15a5daa7318d0ec1cb54659062`.
2. That candidate is based on Product baseline `f0d18efceab0d83d55526d842f6535916587e8c8`.
3. `PRE_RELEASE_PRODUCT_BASELINE_SHA..origin/main` is `AUTOMATION_ONLY` (not `PRODUCT_DRIFT`).

Allowed automation-only paths:

- `.github/workflows/pn-email-stage1-auto-release.yml`
- `primecare-portal/scripts/release/**`
- `primecare-portal/docs/operations/PN_EMAIL_STAGE1_AUTO_RELEASE.md`
- `primecare-portal/package.json` **only** for `release:pn-email-stage1:dry-run`

Any other post-baseline Product change (`src/`, migrations, Edge Functions, dependency/version edits) is `PRODUCT_DRIFT` → HOLD.

## Triggers

- `pull_request` to `main` (same repository, relevant paths) — DRY_RUN only.
- `workflow_dispatch` — DRY_RUN only in this commit (`PN_EMAIL_STAGE1_CI_FORCE_DRY_RUN=true`).
- Scheduled: **disabled**. Recommended later: `45 10 * * *`.

`GITHUB_EVENT_NAME=pull_request` refuses `--execute-prod` in code even if env/argv are tampered with.

## Gates (order)

1. Immutable candidate SHA + ancestry on Product baseline.
2. Main classifier `AUTOMATION_ONLY`.
3. Production identity: project ref + host; refuse QA; `--linked` forbidden.
4. Backup: latest Production physical backup `COMPLETED`, same UTC day, age ≤ 2 hours. No restore/PITR/logical dump.
5. Allowlist file hashes vs candidate SHA.
6. Live ledger + object classification (`not_applied` / `already_correct` / `partial_or_mismatch`). SELECT only.
7. Execute only (later): apply exact files, keep `EMAIL_ENABLED=false`, deploy function + Vercel from candidate SHA.
8. Re-check main is still `AUTOMATION_ONLY`.
9. Stop before founder UAT.

## CI secrets (do not auto-create; never QA)

| Name | DRY_RUN | Execute |
|------|---------|---------|
| `SUPABASE_ACCESS_TOKEN` | yes (backup + Edge list) | yes |
| `PROD_SUPABASE_DB_URL` | yes (live SELECT classification) | yes |
| `VERCEL_TOKEN` | no | yes |
| `VERCEL_ORG_ID` | no | yes |
| `VERCEL_PROJECT_ID` | no | yes |
| `PROD_EMAIL_DISPATCH_CRON_SECRET` | no | yes |

Missing `PROD_SUPABASE_DB_URL` during DRY_RUN → explicit HOLD on live classification (no writes).

`PROD_SUPABASE_DB_URL` must contain `alxhrnotnvwpblsiadxj` and must not contain `zipuzmfkwwucbchlphcj`.

## DRY_RUN

```bash
cd primecare-portal
node scripts/release/pnEmailMainDrift.test.mjs
npm run release:pn-email-stage1:dry-run
```

## Execute locks (unused until a later gate)

`--execute-prod` **and** `PRIMECARE_CONFIRM_PROD=YES` **and** `APPLY_PN_EMAIL_STAGE1=YES` **and** `PN_EMAIL_STAGE1_ALLOW_EXECUTE=true`. Forbidden when `GITHUB_EVENT_NAME=pull_request` or `PN_EMAIL_STAGE1_CI_FORCE_DRY_RUN=true`.

## Enablement (later)

Do not uncomment the schedule until: workflow on default branch, DRY_RUN certified, Production-scoped secrets placed, identity verified, and an explicit later instruction to enable.
