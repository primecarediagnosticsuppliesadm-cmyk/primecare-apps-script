# 10 — Operations Center Rules

HQ user provisioning, lab ownership, agent assignment, audit, freeze.

---

## Surfaces

| Surface | Roles |
|---------|-------|
| Operations Command Center | executive, admin |
| Operations Center Admin | admin, executive, distributor_*, read_only_auditor (read) |
| Access Audit | admin, executive, read_only_auditor |

---

## Users & profiles

- Auth: Supabase → `profiles` (SoT)
- Legacy `users` — backfill only
- **Admin cannot provision `executive` role**
- Audit: `user_provisioning_events`

## Operations Center agent list (read model)

`loadOperationsCenterAdminBundle` merges profile-derived agents with operational `users`-table agents.

- **Canonical identity:** `profiles.agent_id` (exposed as `agentId`). Never replace it with `users.user_code`.
- **Canonical auth user:** `profiles.user_id` (exposed as `userId`).
- **Operational backfill identity:** `users.user_code` is preserved as `userId` on the users-derived row. It is **not** the business owner key when a profile agent already exists for that auth user.
- **Merge (`mergeAgentsByAgentId`):** start with profile-derived agents. Skip an operational row when its `agentId` matches an existing agent, **or** when its auth-user identity (`userId`) matches a profile-derived agent. Name/email/username are not dedupe keys.
- Ownership writes continue to persist the selected `agentId` (`lab_ownership.primary_agent_id` / `labs.assigned_agent_id`). This merge does not rewrite stored ownership.

---

## Lab ownership

- **Canonical SoT:** `lab_ownership` — one ACTIVE row per lab
- Drives agent collections filter + ops metrics + People Ops Business Ownership read façade (Phase 8.4)
- Write API: `assignPrimaryLabOwnerWrite` / `assignLabOwnership` (Operations Center only)
- People Ops must **not** invent a second ownership store — see `20_People_Operations.md` Phase 8.4

---

## Agent assignment

- Bulk lab assignment tab
- Distributor assignment tab
- `updateLabAgentAssignmentWrite`

---

## Probe / QA users

- Pattern: `qa.*@primecare.test`
- Classified in `verify-operations-user-directory-integrity.mjs`
- Golden labs: `QA_LAB_001` etc.

---

## Production vs QA

| Env | Supabase project |
|-----|------------------|
| QA | zipuzmfkwwucbchlphcj |
| Prod | alxhrnotnvwpblsiadxj (per Release_Certification.md) |

**Guntur tenant:** read-only for golden scripts.

---

## HQ freeze

**Blocks:** order status mutations, structural provisioning, catalog structural writes, optional procurement.

**Allows:** record payment, invoice download, review orders, credit & risk drawer, daily collections.

HQ Admin/Executive Operations Center may show a compact build identity (`Production · <sha> · <branch>`) from existing Vite `getAppBuildStamp()` values. It is not a user-facing product surface.

See [04_Role_Access_Matrix.md](./04_Role_Access_Matrix.md).

---

## Verification

- `verify-operations-center-admin-flow.mjs`
- `verify-operations-center-agent-merge.mjs`
- `verify-operations-user-directory-integrity.mjs`
- `verify-provisioning-role-guard.mjs`
- `verify-hq-freeze-policy.mjs`
