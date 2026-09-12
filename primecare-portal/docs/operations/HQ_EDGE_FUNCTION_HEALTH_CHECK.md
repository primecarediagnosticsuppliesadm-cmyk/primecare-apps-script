# HQ Edge Function Health Check

**Last updated:** 2026-06-24 (RC-9)  
**Owner:** HQ Engineering  
**Functions:** `provision-platform-user`, `reset-platform-user-password`, `generate-invoice-pdf`

---

## Shared prerequisites

| Item | Value |
|------|--------|
| Deploy from | `primecare-portal/` |
| QA project ref | `zipuzmfkwwucbchlphcj` |
| Auth model | Caller `Authorization: Bearer <user JWT>` validated via `supabase.auth.getUser()` |
| Service role | `SUPABASE_SERVICE_ROLE_KEY` — Deno env only, never exposed to browser |
| CORS | `provision-platform-user` / `reset-platform-user-password`: `Access-Control-Allow-Origin: *`. `generate-invoice-pdf`: explicit origin allowlist (`corsHeadersFor`); includes canonical Production `https://app.primecarediagnostics.in`, Vercel hosts, and localhost. Unlisted origins do not receive `Access-Control-Allow-Origin`. JWT/RLS authorization is separate from CORS. |
| Logs | Supabase Dashboard → Edge Functions → [function] → Logs |

**Deploy all three (QA):**

```bash
npm run supabase:functions:deploy:qa
# or:
supabase functions deploy provision-platform-user reset-platform-user-password generate-invoice-pdf --project-ref zipuzmfkwwucbchlphcj
```

---

## 1. `provision-platform-user`

| Field | Detail |
|-------|--------|
| **Purpose** | Create auth user + profile + directory + audit event |
| **Method** | POST only |
| **Required secrets** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Authorized callers** | `admin`, `executive`, `distributor_admin` (profile role) |
| **Success response** | `{ "success": true, "userId": "...", ... }` HTTP 200 |
| **Failure responses** | 401 missing/invalid JWT; 403 unauthorized role or inactive profile; 400 validation; 500 server config |

**Smoke test:**

```bash
# As executive JWT (from QA login):
curl -s -X POST \
  -H "Authorization: Bearer $EXEC_JWT" \
  -H "Content-Type: application/json" \
  -d '{"tenantId":"f168b98f-47a6-42c3-b788-24c00436fac2","email":"test+ef@primecare.test","role":"agent","displayName":"EF Smoke"}' \
  "https://zipuzmfkwwucbchlphcj.supabase.co/functions/v1/provision-platform-user"
```

**Certification:** `node scripts/verify-provisioning-role-guard.mjs`  
**Rollback:** Redeploy prior git tag version — `HQ_PRODUCTION_ROLLBACK_PLAN.md` §5

---

## 2. `reset-platform-user-password`

| Field | Detail |
|-------|--------|
| **Purpose** | Admin temp password reset (no email delivery) |
| **Method** | POST only |
| **Required secrets** | Same as above |
| **Authorized callers** | `admin`, `executive` |
| **Success response** | `{ "success": true }` HTTP 200 |
| **Failure responses** | 401/403 auth; 404 user not found; 500 config |

**Smoke test:** Admin provisions test user → reset password via Operations Center UI or curl with admin JWT.

**Rollback:** Redeploy from git tag.

---

## 3. `generate-invoice-pdf`

| Field | Detail |
|-------|--------|
| **Purpose** | Build PDF from invoice snapshot; upload to `invoice-pdfs` bucket |
| **Method** | POST |
| **Body** | `{ "invoiceId": "<uuid>", "force": false }` |
| **Required secrets** | `SUPABASE_SERVICE_ROLE_KEY` (+ auto-injected Supabase vars) |
| **Auth model** | Validates caller JWT; uses service role for storage upload |
| **Success response** | `{ "success": true, "storagePath": "{tenant_id}/{invoice_id}.pdf" }` |
| **Failure responses** | 401/403; 404 invoice; 500 PDF build/upload failure |

**Smoke test:**

```bash
node scripts/verify-invoice-phase3.mjs --remote
node scripts/verify-primecare-production-golden-path.mjs   # GP-30–32
```

**Golden path evidence (QA 2026-06-24):** PDF 1852 bytes, path `f168b98f-.../{invoice_id}.pdf`

**Rollback:** Redeploy function; re-invoke `force: true` per invoice if storage policy broken.

---

## 4. `dispatch-notification-email` (PN-1B2, QA only)

| Field | Detail |
|-------|--------|
| **Purpose** | Claim queued `channel=email` rows and send via Resend with QA rewrite/suppression |
| **Method** | POST |
| **Auth** | `Authorization: Bearer EMAIL_DISPATCH_CRON_SECRET` only. User JWT is **not** sufficient |
| **verify_jwt** | `false` (gateway must not reject the cron secret) |
| **Open relay** | Caller `to` / `subject` / `body` / `html` are ignored |
| **EMAIL_ENABLED=false** | Returns `{ disabled: true, claimed: 0 }` — no claim, no provider call |
| **Production** | Do not deploy. Do not set Production secrets |

Manual invoke only in PN-1B2. No cron / pg_cron / GitHub Actions.

```bash
supabase functions deploy dispatch-notification-email --project-ref zipuzmfkwwucbchlphcj
```

Not included in `npm run supabase:functions:deploy:qa`.

---

## Health checklist (per environment)

| # | Check | QA | Production |
|---|-------|-----|------------|
| E1 | `supabase functions list` shows ACTIVE | ☐ | ☐ |
| E2 | Secrets configured | ☐ | ☐ |
| E3 | Provision smoke (role guard script) | ☐ | ☐ |
| E4 | PDF smoke (phase 3 / golden path) | ☑ 2026-06-24 | ☐ |
| E5 | Logs accessible in Dashboard | ☐ | ☐ |
| E6 | Rollback tag recorded | ☐ | ☐ |

---

## RC-9 status

**Checklist document:** **PASS**  
**Production deploy:** **NOT EXECUTED**
