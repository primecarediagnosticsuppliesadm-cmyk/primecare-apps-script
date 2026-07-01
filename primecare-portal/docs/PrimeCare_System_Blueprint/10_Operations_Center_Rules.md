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

---

## Lab ownership

- `lab_ownership` — one ACTIVE row per lab
- Drives agent collections filter + ops metrics
- API: `assignPrimaryLabOwnerWrite`

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

See [04_Role_Access_Matrix.md](./04_Role_Access_Matrix.md).

---

## Verification

- `verify-operations-center-admin-flow.mjs`
- `verify-operations-user-directory-integrity.mjs`
- `verify-provisioning-role-guard.mjs`
- `verify-hq-freeze-policy.mjs`
