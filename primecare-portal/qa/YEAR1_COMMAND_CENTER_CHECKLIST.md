# PrimeCare Year-1 QA Command Center Checklist

**Sprint:** QA Hardening — End-to-End Business Validation  
**Scope:** Distributor Launch → Lab Ops → Contracts → Commissions → Isolation → Executive → Predator  
**Execution modes:** `CODE` = static/code review | `LIVE` = requires deployed QA + Supabase + executive login

## How to run

1. Deploy `qa` branch with `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` configured.
2. Run `durable_distributor_tenants_migration.sql` in Supabase if not applied.
3. Login as **EXECUTIVE** on QA tenant.
4. Open **Predator Debug Console** → Run Full Predator.
5. Work through scenarios below; record PASS / WARN / FAIL in the Status column.

---

## Phase 1 — Distributor Launch

| ID | Scenario | Steps | Expected | Status | Notes |
|----|----------|-------|----------|--------|-------|
| 1.1 | Create Distributor | Provisioning → New → complete wizard → save | Appears in Provisioning + Distributor Management; **Durable** badge; row in `public.tenants`; survives refresh | | Check Registry debug: local/durable/merged catalog flags |
| 1.2 | Registry merge | Refresh after create | `merged` row matches Supabase id; no duplicate names | | |
| 1.3 | Predator provisioning | Run Full Predator | `durableTenantStore.supabase_client_available` PASS; `registry.durable_supabase` PASS/WARN | | WARN if local-only fallback used |
| 2.1 | Launch readiness — admin | Edit admin if needed | `admin_user` gate PASS | | |
| 2.2 | Launch readiness — catalog | Tasks → Load catalog → Mark provisioned | `catalog_configured` PASS; Registry: local+durable+merged `productCatalogReady=true` | | |
| 2.3 | Launch readiness — isolation | Tasks → Verify isolation (or Tenant Mgmt isolation) | `isolation_verified` PASS for durable | | |
| 2.4 | Launch readiness — durable | Confirm Durable badge | `durable_tenant` gate PASS | | |
| 2.5 | 100% readiness | All activation gates PASS | Readiness % high; **Activate** enabled | | 100% not required if optional checks WARN |
| 3.1 | Activate | Click Activate | Status ACTIVE; lifecycle `activated` | | Updates Supabase `tenants.status` |
| 3.2 | Persist activation | Logout/login + refresh | Still ACTIVE in Provisioning + Management | | |

**Wizard gap (documented):** Create wizard = Company / Admin / Defaults / Review (4 steps). Catalog, Security, First Lab are **post-create tasks**, not wizard steps.

---

## Phase 2 — Lab Operations

| ID | Scenario | Steps | Expected | Status | Notes |
|----|----------|-------|----------|--------|-------|
| 4.1 | Create first lab | Add lab for distributor | Lab linked to `tenant_id`; visible Labs / Workspace / Contracts | | **No in-app lab create API** — seed via Supabase or external |
| 4.2 | Lab visibility | Open Labs, Distributor Workspace | Lab appears under correct distributor context | | PASS if lab exists in DB |
| 5.1 | Create order | Lab Ordering or Orders flow | Order visible; inventory adjusted; event logged | | `createOrderWrite` in `primecareSupabaseApi.js` |
| 6.1 | Record collection | Collections → record payment | Payment in `payments`; AR reduced; efficiency/health update on reload | | |

---

## Phase 3 — Contracts

| ID | Scenario | Steps | Expected | Status | Notes |
|----|----------|-------|----------|--------|-------|
| 7.1 | Create contract | Lab Contract Management → draft → activate | Readiness correct; active; in Workspace + dashboard | | Stored in **localStorage** `primecare_lab_contract_registry_v1:{tenantId}` |
| 8.1 | Renew contract | Renew/extend existing | Timeline event; end date updated; same contract id | | |

---

## Phase 4 — Commissions

| ID | Scenario | Steps | Expected | Status | Notes |
|----|----------|-------|----------|--------|-------|
| 9.1 | Collection attribution | Record collection → Commission Engine | Agent attributed; commission calculated from payments | | Payments = Supabase |
| 10.1 | Approve commission | Approve pending entry | pending → approved; ledger updated | | Ledger = localStorage |
| 11.1 | Record payout | Record payout for period | approved → paid; totals reconcile | | Re-run payout: verify no double-pay guard |
| 11.2 | Double payout guard | Attempt second payout same period | Should block or no-op | | **Known gap:** weak guard |

---

## Phase 5 — Tenant Isolation

| ID | Scenario | Steps | Expected | Status | Notes |
|----|----------|-------|----------|--------|-------|
| 12.1 | Two distributors | Create A and B | Separate registry + Supabase rows | | |
| 12.2 | Data isolation | Labs/orders/collections per tenant | No cross-tenant leakage | | Predator: Tenant + Role Isolation |
| 12.3 | Local stores | Contracts + commissions per `tenantId` | Browser-local only; not RLS-tested | | |

---

## Phase 6 — Executive Operations

| ID | Scenario | Steps | Expected | Status | Notes |
|----|----------|-------|----------|--------|-------|
| 13.1 | Control Tower KPIs | Executive Control Tower | Revenue, collections, visits, orders reconcile to ops payload | | |
| 13.2 | Portfolio KPIs | Distributor count, contracts, commissions | Match source records | | **Gap:** not all on Control Tower |
| 13.3 | Admin dashboard | Admin Dashboard layer checks | RLS/API/UI alignment | | Predator: Admin Dashboard |

---

## Phase 7 — Predator Full Run

| ID | Module | Expected | Status |
|----|--------|----------|--------|
| P.1 | Distributor Provisioning | No FAIL | |
| P.2 | Distributor Workspace | No FAIL; no dead actions | |
| P.3 | Tenant Foundation | No FAIL | |
| P.4 | Lab Contract Engine | No FAIL | |
| P.5 | Commission Engine | No FAIL | |
| P.6 | Tenant + Role Isolation | PASS when `VITE_QA_ISOLATION_VALIDATION=true` | |
| P.7 | Collections / Orders / Visits | No critical FAIL | |

---

## Critical blockers (fix before feature dev)

1. **S4 / S2 First Lab** — No portal lab-create write path (`add_lab` = Coming Soon).
2. **S2 Launch wizard** — Wizard shape ≠ business launch checklist (catalog/security/lab are tasks).
3. **S7/S8 Contracts** — localStorage only; not durable across devices.
4. **S11 Payout** — No hard double-payout prevention.
5. **S13 Executive** — Missing distributor/contract/commission reconciliation on Control Tower.
