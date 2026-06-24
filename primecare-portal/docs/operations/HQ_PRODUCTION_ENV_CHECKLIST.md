# HQ Production Environment Checklist

**Last updated:** 2026-06-24 (RC-9)  
**Owner:** Release Captain  
**Purpose:** Explicit Production setup checklist before first paying customer.  
**Status:** Template — fill `________` fields during Production provisioning. **Not yet executed.**

---

## Vercel

| # | Item | Production value | Verified |
|---|------|------------------|----------|
| V1 | Project name | `________` | ☐ |
| V2 | Production branch | `main` (or release tag branch) | ☐ |
| V3 | Custom domain | `________` | ☐ |
| V4 | Build command | `npm run build` (from `primecare-portal/`) | ☐ |
| V5 | Output directory | `dist` | ☐ |
| V6 | `VITE_APP_ENV` | `prod` | ☐ |
| V7 | `VITE_SUPABASE_URL` | `https://________.supabase.co` | ☐ |
| V8 | `VITE_SUPABASE_ANON_KEY` | Set in Vercel env (never commit) | ☐ |
| V9 | Legacy Apps Script disabled | `VITE_ENABLE_LEGACY_APPS_SCRIPT` **unset or false** | ☐ |
| V10 | QA tools hidden | `VITE_PREDATOR_DEBUG=false`, `VITE_QA_COMMAND_CENTER=false`, `VITE_QA_VALIDATION_LAYER=false` | ☐ |
| V11 | Debug logging off | `VITE_HQ_DEBUG_LOG` unset; `VITE_PERF_LOG` unset | ☐ |
| V12 | Deployment verification | App loads; Executive login; no "Supabase not configured" | ☐ |

**Deploy script reference:** `vercel.json` — SPA rewrites only.

---

## Supabase

| # | Item | Production value | Verified |
|---|------|------------------|----------|
| S1 | Project name | `________` | ☐ |
| S2 | Project ref | `________` | ☐ |
| S3 | API URL | `https://________.supabase.co` | ☐ |
| S4 | Anon key | Vercel `VITE_SUPABASE_ANON_KEY` | ☐ |
| S5 | Service role key | **Supabase Dashboard → Edge Function secrets only** — never in Vercel or git | ☐ |
| S6 | Region | `________` | ☐ |
| S7 | Auth — Site URL | Production Vercel domain | ☐ |
| S8 | Auth — Redirect URLs | `https://________/**`, `/reset-password` | ☐ |
| S9 | Storage — `invoice-pdfs` | Bucket exists, private | ☐ |
| S10 | Storage — operational evidence | Bucket exists per `operational_evidence_storage_migration.sql` | ☐ |
| S11 | Edge functions deployed | `provision-platform-user`, `reset-platform-user-password`, `generate-invoice-pdf` | ☐ |
| S12 | RLS enabled on all pilot tables | `verify-hq-rls-reads.mjs` PASS | ☐ |
| S13 | Migrations applied | Track A manifest — `HQ_SQL_MIGRATION_MANIFEST.md` §1 | ☐ |
| S14 | Backups | Dashboard → Database → Backups confirmed | ☐ |
| S15 | HQ tenant UUID | `________` (record after seed) | ☐ |

**QA reference (do not use in Production):** `zipuzmfkwwucbchlphcj`

---

## Feature flags

| Flag | QA value | PROD value | Risk if wrong in PROD |
|------|----------|------------|------------------------|
| `VITE_APP_ENV` | `qa` | `prod` | Wrong telemetry / env guards |
| `VITE_ENABLE_LEGACY_APPS_SCRIPT` | `false` | `false` | Apps Script overwrite of Supabase KPIs |
| `VITE_ENABLE_EXPERIMENTAL_MODULES` | `false` | `false` | Unfinished modules exposed |
| `VITE_PREDATOR_DEBUG` | `true` (staging) | `false` | Debug console exposed to users |
| `VITE_QA_COMMAND_CENTER` | `true` (staging) | `false` | QA tools in customer build |
| `VITE_QA_VALIDATION_LAYER` | `true` (staging) | `false` | Validation panels in UI |
| `VITE_HQ_DEBUG_LOG` | optional `true` | unset / `false` | Verbose console logging |
| `VITE_PERF_LOG` | optional `true` | unset / `false` | Performance noise in console |

**Code defaults:** `src/config/environment.js`, `predatorGuards.js`, `qaValidation.js`

---

## Post-setup verification

```bash
cd primecare-portal
npm run build
node scripts/verify-hq-rls-reads.mjs
node scripts/verify-primecare-production-golden-path.mjs
node scripts/run-hq-zero-dead-ends-audit.mjs
```

| Check | Pass criteria |
|-------|---------------|
| Build | Exit 0 |
| RLS | 20/20 PASS |
| Golden path | 14/14 PASS |
| Dead ends | 0 forbidden patterns |

---

## RC-9 status

**Checklist document:** **PASS** — explicit and complete.  
**Production environment:** **NOT PROVISIONED** — operator must fill and verify.
