# 08 — Operations Center Rules

HQ user provisioning, lab ownership, agent assignment, audit, and release freeze policy.

---

## Surfaces

| Surface | Audience | Purpose |
|---------|----------|---------|
| **Operations Command Center** | Executive, Admin | Runtime ops dashboard, attention queue, tasks |
| **Operations Center Admin** | Admin, Executive, Distributor roles, Auditor (read) | User directory, lab ownership, bulk assignment, pilot import |
| **Access Audit** | Admin, Executive, Auditor | Provisioning event compliance view |

---

## Users & profiles

| Rule | Detail |
|------|--------|
| **Auth SoT** | Supabase `auth.users` |
| **App identity** | `profiles` row per user |
| **Legacy** | `users` table — directory backfill only for new work |
| **Provision API** | `provisionPlatformUserWrite`, `createOperationsPlatformUserWrite` |
| **Role assignment** | Must respect `PROVISION_RULES_BY_ACTOR` |
| **Admin cannot create executive** | Enforced in matrix + verify script |
| **Password reset** | Audited in `user_provisioning_events` |

### Profile fields (critical)
- `role`, `tenant_id`, `lab_id` (lab users), `agent_id` (agents), `distributor_id` (distributor roles), `active`

---

## Lab ownership

| Rule | Detail |
|------|--------|
| **Table** | `lab_ownership` |
| **Cardinality** | One ACTIVE row per `(tenant_id, lab_id)` |
| **Slots** | `primary_agent_id`, `secondary_agent_id`, `manager_id` |
| **API** | `assignPrimaryLabOwnerWrite`, `getLabOwnershipRead` |
| **Downstream** | Agent collections filter, ops ownership metrics, executive action queue |
| **Audit** | `user_provisioning_events`, `lab_assignment_history` |

---

## Agent assignment

| Mechanism | Detail |
|-----------|--------|
| **Lab ownership** | Primary owner in `lab_ownership` |
| **Legacy field** | `labs.assigned_agent_id` — kept in sync where applicable |
| **Bulk assignment** | Operations Center Admin tab |
| **Distributor assignment** | `agent_distributor_assignments` — agent ↔ distributor tenant |
| **Transfer API** | `updateLabAgentAssignmentWrite` |

---

## Probe / QA user classification

| Rule | Detail |
|------|--------|
| **Pattern** | Emails like `qa.*@primecare.test` |
| **Script** | `verify-operations-user-directory-integrity.mjs` |
| **Purpose** | Distinguish automation users from production customers in directory health |
| **Golden labs** | `QA_LAB_001`, etc. — used in certification scripts |

---

## Production vs QA visibility

| Environment | Notes |
|-------------|-------|
| **QA Supabase** | `zipuzmfkwwucbchlphcj` — full certification target |
| **Production** | Separate project (`alxhrnotnvwpblsiadxj` per Release_Certification.md) |
| **Guntur tenant** | Certified read-only — mutation scripts must skip |
| **PERF tenant** | Scale testing via `.perf-scale-tenant.json` |

Scripts must not mutate cross-environment or certified tenants without explicit flag.

---

## HQ freeze policy

Source: `src/config/hqReleasePolicy.js`

### Blocked during freeze
- Order status mutations (fulfill/cancel from HQ)
- Structural user provisioning writes
- Structural catalog writes
- Procurement writes (when `VITE_HQ_PROCUREMENT_FROZEN=true`)

### Allowed during freeze (daily operations)
- View orders, labs, inventory (read)
- Record payments / collections
- Download invoices
- Credit & Risk payment drawer
- Review order details
- Monitoring dashboards

**Intent:** Freeze stops structural change, not cash collection or customer service.

Verified: `verify-hq-freeze-policy.mjs`

---

## Operations Command Center data load

Parallel bounded reads:
- Admin dashboard, collections, stock, orders, reorder, POs, qualifications, notifications, evidence, inventory economics, ownership, founder snapshot

### Derived panels
- Executive daily snapshot
- Attention queue (credit holds, overdue, delayed orders, low stock, ownership gaps)
- Operations feed, inventory risk, agent operations, financial pressure
- Risk labs scoring, ownership coverage metrics

### Executive action queue
- Sources: qualification pipeline, contract renewals, pending commissions, ownership risk
- Workflow: NEW → RESOLVED / snooze

### Operational tasks
- Types: collection follow-up, qualification review, fulfillment follow-up, missing visit proof, risk escalation
- States: OPEN → COMPLETED (escalation/reopen supported)

---

## Operations Center Admin tabs

| Tab | Capability |
|-----|------------|
| User Directory | List/create/update users; role assignment; activate/deactivate |
| Assigned Laboratories | Primary ownership assignment |
| Pilot Onboarding | CSV import (`pilotOnboardingCsvEngine.js`) |
| Bulk Laboratory Assignment | Agent ↔ lab |
| Bulk Distributor Assignment | Agent ↔ distributor tenant |

---

## Access audit

- Engine: `accessAuditEngine.js`
- Source: `user_provisioning_events` enriched
- Audience: Admin, Executive, Read Only Auditor

---

## Distributor operations

- `distributor_admin` / `distributor_manager` — scoped via `profiles.distributor_id`
- Distributor OS page for multi-tenant distributor context
- Lab create in distributor context must target correct `tenant_id` (Predator validation)

---

## Do-not-break (operations)

| # | Rule |
|---|------|
| 1 | Do not weaken RLS when changing provisioning |
| 2 | Do not assign executive role via admin actor |
| 3 | Do not delete provisioning audit events |
| 4 | Freeze guards must remain on structural writes |
| 5 | Probe/QA users must remain classifiable in directory integrity |

---

## Verification scripts

- `verify-operations-center-admin-flow.mjs`
- `verify-operations-user-directory-integrity.mjs`
- `verify-provisioning-role-guard.mjs`
- `verify-labs-admin-flow.mjs` (ownership sync)
- `verify-hq-freeze-policy.mjs`

---

## Key files

| Path | Purpose |
|------|---------|
| `src/operations/operationsCenterAdminEngine.js` | Admin tabs model |
| `src/operations/operationsCommandCenterLoader.js` | Command center data bundle |
| `src/operations/userProvisioningEngine.js` | Provisioning rules |
| `src/operations/labOwnershipEngine.js` | Ownership logic |
| `src/api/userProvisioningApi.js` | Provision HTTP/edge calls |
| `src/config/hqReleasePolicy.js` | Freeze policy |
