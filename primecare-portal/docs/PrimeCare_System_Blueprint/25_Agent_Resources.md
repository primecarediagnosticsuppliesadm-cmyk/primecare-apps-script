# 25 — Agent Resources

**Canonical product and architecture source of truth for PrimeCare Agent Resources V1.**

Status: **AR-1C agent consumption** (Agent Resources page + acknowledgement on QA). Publisher remains AR-1B. AR-1A schema/RLS/storage/RPC unchanged.

Blueprint owner: this document. Not People Operations. Not operational evidence. Not invoice PDFs. Not Employee 360 Documents. Not an LMS.

---

## Purpose

PrimeCare OS is the canonical library for approved field material (playbooks, SOPs, cheat sheets, policies, training guides).

Admin and Executive publish versions. Authorized agents see **only the current published version**. WhatsApp may notify humans that a new guide exists in PrimeCare → Resources; WhatsApp is **not** the SoT.

---

## Ownership

| Layer | Owner |
|-------|--------|
| Product / rules | This document |
| Module family | Agent / field operations (same family as visits and collections) |
| Identity | `profiles.user_id` = `auth.uid()` |
| Storage | Dedicated private bucket `agent-resources` |
| People Operations | **Does not own this product** |

**Not this product**

| Confusion | Actual SoT |
|-----------|------------|
| Visit / collection photos | `operational_evidence` + bucket `operational-evidence` |
| Customer invoice PDFs | `invoices.pdf_storage_path` + bucket `invoice-pdfs` |
| Employee KYC / offer letters | Not implemented; Employee 360 Documents remain gated off |
| LMS / quizzes / Drive | Out of scope |

---

## Roles (V1)

| Capability | Executive | Admin | Agent | Lab | HR |
|------------|-----------|-------|-------|-----|-----|
| Create resource / upload version | Yes | Yes | No | No | No |
| Edit metadata | Yes | Yes | No | No | No |
| Publish / archive | Yes | Yes | No | No | No |
| View all tenant history / drafts / acks | Yes | Yes | No | No | No |
| View current published if authorized | Yes | Yes | Yes | No | No |
| Open/download authorized published | Yes | Yes | Yes | No | No |
| Acknowledge (self) | — | — | Yes | No | No |

Publishers = `is_admin_or_executive()` (admin + executive only). **HR is not a publisher.** Distributor roles are not in V1.

---

## Lifecycle

Logical resource has many versions. **At most one `published` version** per resource.

```
draft → (RPC publish_agent_resource_version) → published → archived
```

Publishing V3 while V2 is current, in one transaction:

1. V2 `published` → `archived` (`archived_at` set)
2. V3 `draft` → `published` (`published_by`, `published_at`)
3. `agent_resources.current_published_version_id` = V3

Bytes of V2 are **not** deleted. Acknowledgements on V2 remain. Required reading on V3 is a **new** acknowledgement.

Clients must not set `status` or `current_published_version_id` directly. Only the RPC may publish.

Retire the whole resource with `archived_at` on `agent_resources`. Agents no longer see it.

---

## Data model

Tables (see also `01_Database_Schema.md`):

| Table | Purpose |
|-------|---------|
| `agent_resources` | Logical document (title, category, audience, required reading, current published pointer) |
| `agent_resource_versions` | One file version; storage path; draft/published/archived |
| `agent_resource_audiences` | Named agent `profile_user_id` rows |
| `agent_resource_acknowledgements` | Durable read receipt per version + user |

**Tenant integrity:** children use composite FK `(resource_id, tenant_id)` → `agent_resources (id, tenant_id)`. Current published pointer uses composite FK `(current_published_version_id, id, tenant_id)` → `agent_resource_versions (id, resource_id, tenant_id)` so the pointer cannot reference another resource or tenant. Audience/ack `profile_user_id` tenant must match via trigger (cannot add composite FK to `profiles` without altering that table).

Categories: `start_here`, `products_services`, `field_sales`, `lab_os`, `sops`, `policies`, `training`, `other`.

Audience types: `all_agents`, `named_agents`.

Version status: `draft`, `published`, `archived`.

`version_number` is a **positive integer** (not `v1` strings). Unique per `(resource_id, version_number)`.

Partial unique index: one `published` row per `resource_id`.

---

## Audience

| Type | Meaning |
|------|---------|
| `all_agents` | Any active agent in the tenant |
| `named_agents` | Only rows in `agent_resource_audiences` (`profile_user_id` = `auth.uid()`) |

Named publish requires ≥ 1 audience row. Empty named list is visible to **nobody**.

Do not use `agent_id` as the access key.

---

## Acknowledgements

First-class table. Unique `(tenant_id, version_id, profile_user_id)`.

- Agent INSERT only as self, only for the **currently authorized published** version
- No UPDATE/DELETE
- Do not copy acks when publishing a new version
- Do not treat `notification_events.status` or localStorage as read proof
- Do not auto-ack because a signed URL was created (API/UI rule in AR-1C)

---

## Storage

Bucket **`agent-resources`**: `public = false`, 10 MiB, MIME `application/pdf`, `image/jpeg`, `image/png` only.

Path: `{tenant_id}/{resource_id}/{version_id}/{random_object_key}`

Original filename lives on the version row only. No `getPublicUrl`. No authenticated DELETE in V1. No agent/lab/HR upload.

Signed URLs (AR-1B/C): after metadata SELECT, `createSignedUrl` TTL **300 seconds**. Storage SELECT still requires metadata authorization.

**V1 publish format is PDF** (JPEG/PNG allowed for simple sheets). DOCX is not allowed.

---

## RLS (summary)

- Enable RLS on all four tables.
- Publisher: `is_admin_or_executive()` AND `tenant_id_matches`.
- Agent SELECT resource/version only if active (`(current_profile()).user_id IS NOT NULL` — do not use composite `IS NOT NULL`, which is false when nullable profile columns are null), tenant match, resource not archived, version `published` **and** `id = current_published_version_id`, and audience allows.
- Lab / HR / other roles: no matching policy.
- Acknowledgements: agent INSERT self + currently visible published; SELECT own or publisher tenant-wide.
- Storage SELECT: EXISTS matching version row the caller is allowed to SELECT. Path knowledge alone is insufficient.
- Storage INSERT: publisher + path matches a **draft** version `storage_path`.

---

## Publish RPC

`publish_agent_resource_version(p_version_id uuid) RETURNS uuid`

SECURITY DEFINER, `search_path = public`. Validates publisher + tenant + draft + named audience. Locks resource. Archives previous published. Sets pointer. `GRANT EXECUTE` to `authenticated` only.

Supabase default privileges grant ALL on new public tables to `authenticated`. AR-1A therefore **REVOKE ALL FROM authenticated** on the four tables, then re-GRANTs SELECT/INSERT (and column UPDATE on resource metadata excluding `current_published_version_id`). Follow-up: `agent_resources_v1_privilege_lockdown.sql` / `20260831201000_agent_resources_v1_privilege_lockdown.sql`.

---

## Navigation

| Role | Placement |
|------|-----------|
| Admin | Sidebar **OPERATIONS → Agent Resources** (`agentResources`). Publisher page. |
| Executive | Same key and publisher page, **OPERATIONS** section. |
| Agent | Sidebar **Resources** (`agentResources`). Consumer page `AgentResourcesPage`. No publisher actions. |
| Lab / HR | No menu. Direct URL denied by `PERMISSION_BY_KEY`. RLS remains authoritative. |

Do **not** put this under Employee 360. `PEOPLE_OPS_HR_MODULE_ENABLED` remains `false`.

---

## Publisher API (AR-1B)

`src/api/agentResourceSupabaseApi.js` — bounded columns from `hqReadBounds.js`. No `SELECT *`. Bucket `agent-resources` only. Publish **only** via `publish_agent_resource_version`. Signed URLs TTL **300 seconds**; never `getPublicUrl`.

### Audience switch

| Change | Behavior |
|--------|----------|
| `named_agents` → `all_agents` | Update `audience_type` first (access becomes all active tenant agents). Then delete leftover named rows (they no longer affect access). |
| `all_agents` → `named_agents` | Insert named rows first, then set `audience_type`. API requires ≥ 1 active tenant Agent. Publish RPC still rejects empty named lists. |
| Replace named set | Insert desired rows, then delete rows not in the set, then keep `named_agents`. Never opens all-agents access. |

Named picker: `profiles.user_id`, `role = agent`, `active = true`, same tenant. No Admin/Executive/HR/Lab/inactive.

### Partial upload failure

If metadata insert succeeds and storage upload fails, the row stays **draft** (no published pointer change). Retry upload is not a new publish. Publisher creates a new draft version if the failed object cannot be reused. Never fake Published.

### Next version number

`max(version_number)+1` with retry on unique conflict `(resource_id, version_number)` (up to 5). Does not overwrite bytes. Does not move `current_published_version_id`.

---

## Publisher UI (AR-1B)

One page: `AgentResourcesPublisherPage`. List + detail. Actions: New Resource, Open, New Version, Manage, Publish, Archive. No agent Mark as Read. No KPI grid. No search infrastructure (optional title filter only).

### Nested views and Back navigation

Manage and New Resource are **internal views** on the same page key (`agentResources` / `/agent-resources`). They do not change the portal page, Labs routing, or `setActivePage`.

- In-page control: **← Back to Agent Resources** returns to the publisher list.
- Opening Manage or New Resource pushes a same-path `history.pushState` so browser Back returns to the list while `activePage` stays `agentResources`.
- A further browser Back from the list uses the existing portal popstate handler (the previous portal page, which may be Labs only if that is where the user came from).

Do not hardcode Labs (or any other module) as the Manage/create back target.

Archive sets `archived_at`. No Restore in V1. Versions and acknowledgements are retained.

Read status on the list (`n / d read`) only for **required reading** + current published version. Denominator = named active agents, or all active tenant agents. Roster in detail is the SoT if the aggregate is unavailable.

---

## Agent consumer API (AR-1C)

`listAgentResourcesAgentRead` — bounded current published resources the caller is allowed to SELECT. Own acknowledgement for the **current** version only. Does not return `storage_path`, audience rows, other agents' acks, drafts, or archived versions.

`getAgentResourceSignedUrl` — reused. RLS SELECT on the version governs access. TTL 300s. Opening does **not** acknowledge.

`acknowledgeAgentResourceVersionWrite` — inserts self (`auth.uid()`) only. Duplicate unique `(tenant_id, version_id, profile_user_id)` is treated as success (idempotent). V1 ack does not satisfy V2.

---

## Agent consumer UI (AR-1C)

Page title **Resources**. Category sections in certified order; empty categories hidden. Required unread count is inline text (required + no ack on **current** version). Cards: title, Version N, Required badge, Read/Unread, published date, Open, Mark as Read when unread.

Agent cannot see publisher controls, version history, audience, ack roster, or non-current versions.

---

## Inactive agents

`current_profile()` requires `active = true`. AuthContext refuses inactive profiles before any page shell. RLS remains the authority if a session somehow reaches the API.

---

## Security requirements

- Tenant isolation; no public objects; no filename in path
- Draft/archived not agent-visible; named isolation; no cross-tenant
- Guessed storage path denied
- MIME and size enforced in table CHECK and bucket
- Do not reuse `operational-evidence` or `invoice-pdfs`
- Do not broaden `is_admin_or_executive()` or evidence insert helpers

---

## Non-goals

Employee Document Vault, Aadhaar/PAN, e-sign, ATS, LMS, quizzes, comments, collaborative editing, Drive/SharePoint, WhatsApp/SMS/email send, DOCX publish, folder ACLs, reminders, AI, approval chains, distributor-role publishers.

---

## Release / certification

AR-1A: schema + storage + RLS + RPC + verify scripts.

AR-1B: publisher API + Admin/Executive page (`agentResources`).

AR-1C: Agent Resources consumer page + acknowledgement. Same permission key; role-specific page component.

Verify: `verify-agent-resources-schema.mjs`, `verify-agent-resources-rls.mjs`, `verify-agent-resources-storage.mjs`, `verify-agent-resources-publisher.mjs`, `verify-agent-resources-agent-access.mjs`, `verify-agent-resources-acknowledgement.mjs`.

Regression: invoice PDF, operational evidence, Employee 360 HR gate (`PEOPLE_OPS_HR_MODULE_ENABLED` remains `false`).

**Do not apply Agent Resources migrations to Production from AR-1A/AR-1B/AR-1C.**

Sprints: AR-1D security/UAT/release certification.

---

## Manual QA UAT (AR-1B)

Run on QA only. Do not use Production.

### Executive

1. Open Agent Resources.
2. Create **PrimeCare Field Executive Playbook**.
3. Category: Start Here.
4. Required Reading: Yes.
5. Audience: All Agents.
6. Upload an approved PDF.
7. Confirm the resource is Draft (no published version).
8. Confirm no Published version.
9. Publish V1.
10. Confirm Published.
11. Open the PDF (signed URL; expires in 300s).
12. Upload V2.
13. Confirm V1 remains current before publish.
14. Publish V2.
15. Confirm V1 Archived / V2 Published.
16. Inspect history.

### Named

17. Create a Named Agents resource.
18. Select Vishwak (or the canonical QA agent) only.
19. Publish.
20. Verify the named audience persists.

### Admin

21. Open the same publisher page.
22. View resources.
22a. Manage a resource.
22b. **Back to Agent Resources** returns to the publisher list (not Labs).
22c. Browser Back from Manage also returns to the publisher list.
22d. Labs still opens when selected from the sidebar.
23. Create a draft.
24. Publish.
25. Archive.

### Denial

26. Agent direct URL `/agent-resources` denied or redirected.
27. Lab denied.
28. HR denied.
29. Cross-tenant publisher data absent.

### File validation

30. DOCX rejected.
31. File larger than 10 MiB rejected.
32. PNG accepted.
33. Original filename is not used in the storage path.

---

## Manual QA UAT (AR-1C)

Run on QA only.

### Agent A

1. Login.
2. See **Resources** in the sidebar.
3. Open Resources.
4. See current published resources.
5. Required unread shown when applicable.
6. Open the PDF.
7. Return to the page; confirm still Unread.
8. Mark as Read → Read ✓.
9. Refresh; Read persists.

### Agent B

10. All Agents resource visible.
11. Named-for-A resource absent.

### New version

12. Publisher publishes V2 of a required resource.
13. Agent A refresh: Version 2 Unread.
14. Mark V2 Read.

### Archive

15. Publisher archives the resource.
16. Agent refresh: it disappears.

### Mobile

17. 390px viewport: no horizontal overflow; Open and Mark as Read tappable.

### Denial

18. Lab / HR: no menu; direct `/agent-resources` denied.
