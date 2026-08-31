# 04 — Role Access Matrix

Runtime: `src/config/rolePermissionMatrix.js`, `menuConfig.js`, `pageRouting.js`.  
Database: RLS in `supabase/sql/production_auth_rls_pilot_migration.sql` + patches.

**Pilot QA/PROD login:** `executive`, `admin`, `hr`, `agent`, `lab` only. `hr` is an HQ payroll support role enabled for Phase 3A foundation metadata, provisioning, placeholder navigation, and compensation RLS only.

**Note on "operations":** There is no `operations` role slug. **HQ operations** = `admin` + `executive` (+ distributor ops roles in dev). Operations Center Admin is permission-gated, not a separate DB role.

---

## executive

| Dimension | Access |
|-----------|--------|
| **Visible modules** | Full founder suite, EFI, orders, logistics, risk, inventory, catalog, purchase, ops center, access audit, qualification, commission, contracts, tenant/distributor mgmt (some hidden in pilot sidebar), **Agent Resources publisher** |
| **Read** | Cross-tenant profiles; tenant ops data; all pilot tables via RLS |
| **Write** | All roles provisionable; structural ops; fulfill; create orders on behalf of eligible active labs; payments; logistics; catalog; lab lifecycle status transitions with confirmation and reason; compensation/payroll approval, lock, payout authorization, and export when implemented; **Agent Resources publish** |
| **Blocked** | — |
| **Freeze** | Structural writes blocked; payments/collections allowed |

---

## hr (HQ Payroll Support)

| Dimension | Access |
|-----------|--------|
| **Visible modules** | Compensation / Payroll foundation placeholder only until payroll screens are explicitly implemented |
| **Read** | Payroll periods, plan assignments, payroll previews, own-tenant compensation records needed for payroll support |
| **Write** | Generate preview and submit payroll runs; create adjustment requests. Cannot approve, lock, export, mark paid, or reopen locked payroll. |
| **Blocked** | Cannot approve payouts, approve commission changes, lock payroll runs, authorize exports, mutate finance records, or create accounting entries. **No Agent Resources access in V1.** |
| **Freeze** | Payroll preview support only; no payout authorization |

`hr` must be implemented as an HQ role with explicit RLS. It is not a distributor role and does not grant Distributor OS payroll ownership.

---

## admin (HQ Admin)

| Dimension | Access |
|-----------|--------|
| **Visible modules** | dashboard, labs, orders, logistics, risk, catalog, inventory, purchase, ops center, access audit, qualification, **Agent Resources publisher** |
| **Read** | Tenant-scoped all ops tables |
| **Write** | Fulfill/cancel orders; **create orders on behalf of eligible active labs**; set `labs.ordering_mode`; lab lifecycle status transitions with confirmation and reason; payments; inventory; catalog; provision users (**not executive role**); logistics; lab ownership; **Agent Resources publish (same as executive)** |
| **Blocked** | Founder-only pages; cannot assign executive role; compensation/payroll approval, lock, payout authorization, and export |
| **Freeze** | Order status mutations blocked; record payment allowed |

---

## agent (Field Agent)

| Dimension | Access |
|-----------|--------|
| **Visible modules** | dashboard, visits, **Resources**, labs, collections |
| **Read** | Assigned/visible labs; orders via lab visibility; own visits; own locked/exported compensation history when payroll self-view is implemented; **Agent Resources: current published versions authorized by audience** |
| **Write** | Collections (payments); visits; shipment updates when assigned; **Agent Resources acknowledgements (self only)** |
| **Blocked** | HQ orders fulfill; catalog; logistics board; provisioning; compensation/payroll edits; Agent Resources upload/publish/archive; drafts/archived versions |
| **Freeze** | Collections/payments typically allowed (daily ops) |

---

## lab (Lab User)

| Dimension | Access |
|-----------|--------|
| **Visible modules** | labOrders, labInvoices, labAccount only |
| **Read** | Own lab orders, invoices, AR, catalog, own `labs.ordering_mode` |
| **Write** | Place orders when `ordering_mode` ∈ {`hybrid`, `self_service`} + credit eligible; delivery snapshot via `persist_order_delivery_snapshot` RPC only |
| **Blocked** | Order initiation when `ordering_mode` ∈ {`hq_managed`, `suspended`}; direct `UPDATE` on `orders`; HQ logistics, ops center, fulfill, other labs' data; **Agent Resources (no metadata, no storage)** |
| **Freeze** | Lab ordering allowed per `ordering_mode` unless credit hold |

### Lab ordering permissions by `ordering_mode`

| Mode | Create order | Track orders | View invoices | View payments | Reorder history |
|------|--------------|--------------|---------------|---------------|-----------------|
| HQ Managed | ✖ | ✔ | ✔ | ✔ | ✔ (view only; cannot checkout) |
| Hybrid | ✔ | ✔ | ✔ | ✔ | ✔ |
| Self Service | ✔ | ✔ | ✔ | ✔ | ✔ |
| Suspended | ✖ | ✔ | ✔ | ✔ | ✔ (view only; cannot checkout) |

**Admin on-behalf ordering:** `admin` / `executive` may create orders on behalf of an `ACTIVE` lab when `ordering_mode` is `hq_managed`, `hybrid`, or `self_service`. On-behalf order creation is blocked when `labs.status = INACTIVE` or `ordering_mode = suspended`.

| Customer lab state | Admin / executive on-behalf order | Requirement |
|--------------------|-----------------------------------|-------------|
| `ACTIVE` + `hq_managed` | ✔ | Use explicit `adminOnBehalf` flow; selected lab remains customer |
| `ACTIVE` + `hybrid` | ✔ | Use explicit `adminOnBehalf` flow; selected lab remains customer |
| `ACTIVE` + `self_service` | ✔ | Use explicit `adminOnBehalf` flow; selected lab remains customer |
| `ACTIVE` + `suspended` | ✖ | Ordering Mode blocks new order initiation |
| `INACTIVE` | ✖ | Lifecycle status blocks new order initiation |

The authenticated HQ user remains the actor. The flow must not impersonate a lab user and must identify `source = admin_on_behalf` in order/audit metadata.

### Lab lifecycle permissions

Only `admin` and `executive` may change `labs.status`. Agents and lab users cannot change lab lifecycle status.

| Lifecycle status | Lab login | Create order / checkout | Track orders | View invoices | View payments | View history |
|------------------|-----------|-------------------------|--------------|---------------|---------------|--------------|
| `PROSPECT` | If provisioned | Governed by `ordering_mode` and credit eligibility | ✔ | ✔ | ✔ | ✔ |
| `ACTIVE` | If provisioned | Governed by `ordering_mode` and credit eligibility | ✔ | ✔ | ✔ | ✔ |
| `INACTIVE` | If provisioned | ✖ (`ordering_mode` must be `suspended`) | ✔ | ✔ | ✔ | ✔ |

`ACTIVE -> INACTIVE` requires confirmation and reason and must force `ordering_mode = suspended`. `INACTIVE -> ACTIVE` requires confirmation and reason but must not restore prior ordering mode. Lifecycle status must never hide AR, invoices, payments, allocations, orders, shipments, Track Order, audit history, reporting, or authorized HQ visibility.

---

## read_only_auditor (dev / non-pilot)

| Dimension | Access |
|-----------|--------|
| **Visible modules** | dashboard, labs, orders, logistics, risk, collections (read), qualification, ops center, access audit |
| **Read** | Tenant-scoped per RLS |
| **Write** | None in UI |
| **Blocked** | All writes |
| **Freeze** | N/A — read-only |

---

## distributor_admin / distributor_manager (dev / non-pilot)

| Dimension | Access |
|-----------|--------|
| **Scope** | `profiles.distributor_id` |
| **Modules** | distributorOs, operationsCenter, labs (+ visits/collections for manager) |
| **Write** | Limited provisioning per `PROVISION_RULES_BY_ACTOR` |

---

## Module permission keys (summary)

| Key | Roles |
|-----|-------|
| orders, logisticsDelivery, risk | admin, executive, read_only_auditor |
| collections | agent, admin, read_only_auditor |
| labOrders, labInvoices, labAccount | lab |
| operationsCenter | admin, executive, distributor_*, read_only_auditor |
| founder*, executiveFinancialIntelligence | executive |
| masterCatalog, inventory, purchase | admin, executive |
| executiveCompensation / payroll | executive full workflow; hr preview/submit/support; admin view/recommend only; agent own locked/exported/paid self-view |

Full map: `PERMISSION_BY_KEY` in `rolePermissionMatrix.js`.

---

## HQ freeze behavior (`hqReleasePolicy.js`)

| Action | Frozen? |
|--------|---------|
| Order status change (fulfill/cancel) | **Blocked** |
| User provisioning structural | **Blocked** |
| Catalog structural writes | **Blocked** |
| Procurement (optional) | **Blocked** if flag set |
| Record payment | **Allowed** |
| Invoice download | **Allowed** |
| Agent Resources publish | **Allowed** (not O2C/inventory structural) |
| Review order details | **Allowed** |
| Credit & Risk drawer | **Allowed** |

Verified: `verify-hq-freeze-policy.mjs`

---

## RLS summary by role

| Table | lab | agent | admin | hr | executive |
|-------|-----|-------|-------|--------------|-----------|
| orders | own lab (SELECT, INSERT); delivery snapshot via RPC only — **no direct UPDATE** | visible labs | tenant ops | no payroll dependency | tenant ops |
| invoices | own lab | — | tenant | no payroll mutation | tenant |
| payments | own lab | agent + lab | tenant | read only via bounded payroll derivation after approval | tenant |
| order_shipments | — | assigned | tenant ops | — | tenant ops |
| compensation/payroll tables | — | own locked/exported/paid lines only | view only | preview/submit/support only; no approval/lock/export/pay/reopen | full compensation workflow |
| profiles | self | self | tenant | payroll-scoped agent profile reads | cross-tenant read patterns |
| agent_resources / versions | — | current published + audience | tenant (publish) | — | tenant (publish) |
| agent_resource_acknowledgements | — | INSERT/SELECT own | tenant SELECT | — | tenant SELECT |

**Never weaken RLS without approval** — run `verify-hq-rls-reads.mjs`.

---

## Lab portal provisioning note

Lab portal is **not default Day-1 for all labs**. Access requires lab user provisioned in Operations Center. Default commercial mode: **HQ Managed** until onboarding enables self-service (see `09_Lab_Portal_Rules.md`).
