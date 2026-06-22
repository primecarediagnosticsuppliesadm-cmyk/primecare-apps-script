# Supabase Edge Functions — Deploy Guide

PrimeCare HQ user provisioning uses one Edge Function:

- `supabase/functions/provision-platform-user/index.ts`

SQL for provisioning audit/history is **not** managed by `supabase db push`. Apply files under `supabase/sql/` manually in the Supabase SQL editor (see below).

**QA project ref:** `zipuzmfkwwucbchlphcj`

---

## Prerequisites

1. **Supabase CLI** installed
2. **Logged in** to Supabase (`supabase login`)
3. **Project linked** from `primecare-portal/` directory
4. **SQL migration applied** in QA before first provision test
5. **Secrets** in `.env.functions.local` (copy from `.env.functions.example`) — never commit secrets

### Required environment variables

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Project API URL |
| `SUPABASE_ANON_KEY` | Verify caller JWT in the function |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side `auth.admin.createUser` and profile writes |

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

## 3. Apply SQL migration (manual)

Before testing provisioning, run in **Supabase Dashboard → SQL Editor**:

```
supabase/sql/user_provisioning_v1_migration.sql
```

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

Function URL (local): `http://127.0.0.1:54321/functions/v1/provision-platform-user`

---

## 5. Deploy to QA

**Do not run until migrations are applied and local smoke test passes.**

```bash
cd primecare-portal

npm run supabase:functions:deploy:qa
```

Or directly:

```bash
supabase functions deploy provision-platform-user --project-ref zipuzmfkwwucbchlphcj
```

---

## 6. Smoke-test curl (after deploy)

Replace placeholders with real values:

- `<anon-key>` — Dashboard → API → anon public key
- `<hq-admin-access-token>` — JWT from logged-in `qa.admin@primecare.test` session
- `<hq-tenant-uuid>` — QA HQ tenant id (e.g. from profiles.tenant_id)

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

### Verify distributor_admin (login blocked)

Create with `"role": "distributor_admin"` and `"distributorId": "<distributor-tenant-uuid>"`. User should appear in Operations Center directory; login must fail with role not authorized (AuthContext unchanged).

---

## 7. List deployed functions

```bash
supabase functions list --project-ref zipuzmfkwwucbchlphcj
```

---

## Repository layout

```
primecare-portal/
  supabase/
    config.toml                          # CLI config (this file enables deploy)
    functions/
      provision-platform-user/
        index.ts                         # Edge Function (do not put secrets here)
    sql/
      user_provisioning_v1_migration.sql # Apply manually
      ...                                # Other SQL migrations
  .env.functions.example                 # Template for local serve
  .env.functions.local                   # Gitignored — your real keys
  docs/supabase-functions-deploy.md      # This guide
```

---

## Security notes

- Never commit `SUPABASE_SERVICE_ROLE_KEY` or `.env.functions.local`
- Service role is used **only** inside the Edge Function runtime, not in the Vite frontend
- Frontend calls the function with the user's JWT via `userProvisioningApi.js`
