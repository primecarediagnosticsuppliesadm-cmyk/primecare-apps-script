# Supabase Edge Functions — Deploy Guide

PrimeCare HQ user provisioning uses two Edge Functions:

- `supabase/functions/provision-platform-user/index.ts` — create users (auth + profile + directory + audit)
- `supabase/functions/reset-platform-user-password/index.ts` — admin temp-password reset (no email delivery)

SQL for provisioning audit/history is **not** managed by `supabase db push`. Apply files under `supabase/sql/` manually in the Supabase SQL editor (see below).

**QA project ref:** `zipuzmfkwwucbchlphcj`

---

## Prerequisites

1. **Supabase CLI** installed
2. **Logged in** to Supabase (`supabase login`)
3. **Project linked** from `primecare-portal/` directory
4. **SQL migrations applied** in QA before first provision/reset test
5. **Secrets** in `.env.functions.local` (copy from `.env.functions.example`) — never commit secrets

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Project API URL |
| `SUPABASE_ANON_KEY` | Verify caller JWT in the function |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side `auth.admin.createUser`, `auth.admin.updateUserById`, and profile writes |

On **deployed** functions, Supabase usually injects these automatically. For **local serve**, set them in `.env.functions.local`.

---

## 1. Install Supabase CLI

### macOS (Homebrew)

```bash
brew install supabase/tap/supabase
supabase --version
```

### Other platforms

See [Supabase CLI install docs](https://supabase.com/docs/guides/cli/getting-started).

---

## 2. Login and link project

Run from the portal root:

```bash
cd primecare-portal

supabase login

supabase link --project-ref zipuzmfkwwucbchlphcj
```

Link stores project metadata under `supabase/.temp/` (gitignored). Do not commit link artifacts.

---

## 3. Apply SQL migrations (manual)

Before testing provisioning or password reset, run in **Supabase Dashboard → SQL Editor**:

1. `supabase/sql/user_provisioning_v1_migration.sql`
2. `supabase/sql/user_provisioning_password_reset_event_migration.sql` — adds `password_reset` to audit `event_type` CHECK

Also ensure prior Operations Center migrations are applied if not already:

- `operations_center_profiles_identity_migration.sql`
- `operations_center_profiles_username_migration.sql`
- `operations_center_users_rls_migration.sql`
- `operations_center_agent_distributor_assignments_migration.sql`

---

## 4. Local serve (optional smoke test)

```bash
cd primecare-portal

cp .env.functions.example .env.functions.local
# Edit .env.functions.local with real keys from Dashboard → API

npm run supabase:functions:serve
```

Function URLs (local):

- `http://127.0.0.1:54321/functions/v1/provision-platform-user`
- `http://127.0.0.1:54321/functions/v1/reset-platform-user-password`

---

## 5. Deploy to QA

**Do not run until migrations are applied and local smoke test passes.**

```bash
cd primecare-portal

npm run supabase:functions:deploy:qa
```

Or deploy individually:

```bash
supabase functions deploy provision-platform-user --project-ref zipuzmfkwwucbchlphcj
supabase functions deploy reset-platform-user-password --project-ref zipuzmfkwwucbchlphcj
```

---

## 6. Smoke-test curl (after deploy)

Replace placeholders with real values:

- `<anon-key>` — Dashboard → API → anon public key
- `<hq-admin-access-token>` — JWT from logged-in `qa.admin@primecare.test` session
- `<hq-tenant-uuid>` — QA HQ tenant id (e.g. from profiles.tenant_id)
- `<subject-user-uuid>` — target user's `profiles.user_id`

### Provision user

```bash
curl -i -X POST \
  "https://zipuzmfkwwucbchlphcj.supabase.co/functions/v1/provision-platform-user" \
  -H "Authorization: Bearer <hq-admin-access-token>" \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "<hq-tenant-uuid>",
    "displayName": "QA Smoke Agent",
    "email": "qa.smoke.agent@primecare.test",
    "username": "qa_smoke_agent",
    "role": "agent",
    "agentId": "QA_SMOKE_AGENT"
  }'
```

Expected: `200` with `"success": true` and `userId` in response.

### Reset password (admin temp password)

```bash
curl -i -X POST \
  "https://zipuzmfkwwucbchlphcj.supabase.co/functions/v1/reset-platform-user-password" \
  -H "Authorization: Bearer <hq-admin-access-token>" \
  -H "apikey: <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "<hq-tenant-uuid>",
    "subjectUserId": "<subject-user-uuid>"
  }'
```

Expected: `200` with `"success": true`, `temporaryPassword` in response (shown once).

Alternative lookup by email:

```json
{ "tenantId": "<hq-tenant-uuid>", "email": "qa.test.agent1@primecare.test" }
```

### Verify distributor_admin (login blocked)

Create with `"role": "distributor_admin"` and `"distributorId": "<distributor-tenant-uuid>"`. User should appear in Operations Center directory; login must fail with role not authorized (AuthContext unchanged). Password reset must return `400` for distributor_admin.

---

## 7. QA reset password flow (UI)

## Canonical QA credentials (browser certification)

| Role | Email | Password |
|------|-------|----------|
| HQ Executive | `qa.executive@primecare.test` | `1234` |
| HQ Admin | `qa.admin@primecare.test` | `1234` |
| Field Agent | `qa.test.agent1@primecare.test` | `115f4ce25fa0Aa1!` |
| Lab User | `qa.lab@primecare.test` | `1234` |

Agent password is set via Operations Center **Reset Pwd** when rotated. Do not commit live passwords outside this QA doc.

1. Apply `user_provisioning_password_reset_event_migration.sql` in QA SQL editor.
2. Deploy both Edge Functions (`npm run supabase:functions:deploy:qa`).
3. Log in as HQ Admin: `qa.admin@primecare.test` / `1234`.
4. Open **Operations Center → User & Access → User Directory**.
5. Find the target user (e.g. `qa.test.agent1@primecare.test`).
6. Click **Reset Pwd**.
7. Copy the temporary password from the modal (shown once). Use **Copy** button.
8. Log out and sign in as the target user with their email + temp password.
9. Confirm audit tab shows `password_reset` event for that user.

**Notes:**

- Works for fake `@primecare.test` addresses — no email delivery required.
- `email_confirm: true` is set server-side so unconfirmed QA accounts can log in immediately.
- Only HQ **admin** or **executive** can reset; service role never leaves the Edge Function.

---

## 8. List deployed functions

```bash
supabase functions list --project-ref zipuzmfkwwucbchlphcj
```

---

## Repository layout

```
primecare-portal/
  supabase/
    config.toml                                    # CLI config (verify_jwt for both functions)
    functions/
      provision-platform-user/
        index.ts                                   # Provision Edge Function
      reset-platform-user-password/
        index.ts                                   # Admin temp-password reset
    sql/
      user_provisioning_v1_migration.sql           # Apply manually
      user_provisioning_password_reset_event_migration.sql
      ...                                          # Other SQL migrations
  .env.functions.example                           # Template for local serve
  .env.functions.local                             # Gitignored — your real keys
  docs/supabase-functions-deploy.md                # This guide
```

---

## Security notes

- Never commit `SUPABASE_SERVICE_ROLE_KEY` or `.env.functions.local`
- Service role is used **only** inside Edge Function runtime, not in the Vite frontend
- Frontend calls functions with the user's JWT via `userProvisioningApi.js`
- `reset-platform-user-password` enforces caller role `admin` or `executive` before using service role
- Temporary password is returned once in the API response; UI warns and does not persist it
- `distributor_admin` users are directory-only; reset is blocked with a clear error
