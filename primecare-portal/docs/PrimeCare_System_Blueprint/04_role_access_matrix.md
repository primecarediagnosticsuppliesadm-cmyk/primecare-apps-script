# 04 — Role Access Matrix

Runtime: `src/config/rolePermissionMatrix.js`, `menuConfig.js`, `pageRouting.js`.  
Database: RLS in `supabase/sql/production_auth_rls_pilot_migration.sql` + patches.

**Pilot QA/PROD login:** `executive`, `admin`, `agent`, `lab` only.

**Note on "operations":** There is no `operations` role slug. **HQ operations** = `admin` + `executive` (+ distributor ops roles in dev). Operations Center Admin is permission-gated, not a separate DB role.

---

## executive

| Dimension | Access |
|-----------|--------|
| **Visible modules** | Full founder suite, EFI, orders, logistics, risk, inventory, catalog, purchase, ops center, access audit, qualification, commission, contracts, tenant/distributor mgmt (some hidden in pilot sidebar) |
| **Read** | Cross-tenant profiles; tenant ops data; all pilot tables via RLS |
| **Write** | All roles provisionable; structural ops; fulfill; payments; logistics; catalog |
| **Blocked** | — |
| **Freeze** | Structural writes blocked; payments/collections allowed |

---

## admin (HQ Admin)

| Dimension | Access |
|-----------|--------|
| **Visible modules** | dashboard, labs, orders, logistics, risk, catalog, inventory, purchase, ops center, access audit, qualification |
| **Read** | Tenant-scoped all ops tables |
| **Write** | Fulfill/cancel orders; payments; inventory; catalog; provision users (**not executive role**); logistics; lab ownership |
| **Blocked** | Founder-only pages; cannot assign executive role |
| **Freeze** | Order status mutations blocked; record payment allowed |

---

## agent (Field Agent)

| Dimension | Access |
|-----------|--------|
| **Visible modules** | dashboard, collections, visits, labs |
| **Read** | Assigned/visible labs; orders via lab visibility; own visits |
| **Write** | Collections (payments); visits; shipment updates when assigned |
| **Blocked** | HQ orders fulfill; catalog; logistics board; provisioning |
| **Freeze** | Collections/payments typically allowed (daily ops) |

---

## lab (Lab User)

| Dimension | Access |
|-----------|--------|
| **Visible modules** | labOrders, labInvoices, labAccount only |
| **Read** | Own lab orders, invoices, AR, catalog |
| **Write** | Place orders (if provisioned + credit eligible) |
| **Blocked** | HQ logistics, ops center, fulfill, other labs' data |
| **Freeze** | Lab ordering generally allowed unless credit hold |

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
| Review order details | **Allowed** |
| Credit & Risk drawer | **Allowed** |

Verified: `verify-hq-freeze-policy.mjs`

---

## RLS summary by role

| Table | lab | agent | admin | executive |
|-------|-----|-------|-------|-----------|
| orders | own lab | visible labs | tenant ops | tenant ops |
| invoices | own lab | — | tenant | tenant |
| payments | own lab | agent + lab | tenant | tenant |
| order_shipments | — | assigned | tenant ops | tenant ops |
| profiles | self | self | tenant | cross-tenant read patterns |

**Never weaken RLS without approval** — run `verify-hq-rls-reads.mjs`.

---

## Lab portal provisioning note

Lab portal is **not default Day-1 for all labs**. Access requires lab user provisioned in Operations Center. Default commercial mode: **HQ Managed** until onboarding enables self-service (see `09_Lab_Portal_Rules.md`).
