# PrimeCare HQ Production Readiness Report

**Date:** 2026-05-28  
**Sprint:** HQ Stabilization (audit only — no new features)  
**Branch:** `qa` (commit `7968a9a` + prior hardening commits)  
**Overall readiness:** **65%** — not QA sign-off ready

---

## Readiness Scores

| Area | Score | Status | Summary |
|------|-------|--------|---------|
| Authentication | **78%** | ⚠️ Conditional | Supabase auth + active profile gate works; inactive profile edge cases need QA |
| Authorization | **80%** | ⚠️ Conditional | Menu/role permissions solid; admin over-broad on tenants/contracts |
| RLS | **52%** | ❌ Not ready | Cross-tenant gaps, migration apply unknown, legacy anon risk |
| Qualification | **72%** | ⚠️ Conditional | Pipeline ownership complete; executive write RLS blocks HQ-operated distributors |
| Contracts | **70%** | ⚠️ Conditional | Activation gate enforced; legacy ACTIVE rows; admin read leakage |
| Orders | **58%** | ❌ Not ready | No executive cross-tenant; fulfillment coupled to status strings |
| Inventory | **64%** | ⚠️ Conditional | Catalog RLS fix exists (`f9d110e`) — apply status unconfirmed |
| Collections | **60%** | ❌ Not ready | No payment UPDATE; AR/payment coupling; executive cross-tenant gap |
| Revenue Funnel | **66%** | ⚠️ Conditional | Functional but metric semantics mismatches |
| Pilot Readiness | **63%** | ⚠️ Conditional | Portfolio gates skew per-distributor scores |
| Predator | **55%** | ❌ Not ready | Batch gaps, snapshot FN risk, mutating commission probe |
| Executive Portal | **68%** | ⚠️ Conditional | Nav and modules present; blocked by RLS/mirror/invoice gaps |

**Weighted overall: 65%**

---

## Audit Deliverables

| Phase | Report | Location |
|-------|--------|----------|
| 1 — RLS | RLS Audit | [`RLS_AUDIT_REPORT.md`](./RLS_AUDIT_REPORT.md) |
| 2 — E2E | HQ E2E Validation | [`HQ_E2E_VALIDATION_REPORT.md`](./HQ_E2E_VALIDATION_REPORT.md) |
| 3 — Revenue Funnel | Revenue Funnel Audit | [`REVENUE_FUNNEL_AUDIT.md`](./REVENUE_FUNNEL_AUDIT.md) |
| 4 — Pilot Readiness | Pilot Readiness Audit | [`PILOT_READINESS_AUDIT.md`](./PILOT_READINESS_AUDIT.md) |
| 5 — Predator | Predator Audit | [`PREDATOR_AUDIT.md`](./PREDATOR_AUDIT.md) |
| 6 — QA Plan | 100 test cases | [`HQ_QA_TEST_PLAN.md`](./HQ_QA_TEST_PLAN.md) |

---

## Top 20 Defects (Pre–QA Sign-Off)

| # | Priority | Area | Defect | Impact |
|---|----------|------|--------|--------|
| 1 | **P0** | RLS | `production_auth_rls_pilot_migration.sql` apply status unknown — schema snapshot shows anon policies | Full data exposure if unapplied |
| 2 | **P0** | RLS | Executive cannot CRUD `lab_qualifications` cross-tenant | HQ cannot qualify Guntur labs from HQ profile |
| 3 | **P0** | RLS | Executive cannot read/write `orders`/`payments` cross-tenant | Distributor E2E broken from HQ |
| 4 | **P0** | Inventory | `executive_distributor_catalog_inventory_rls.sql` may be unapplied | Catalog mirror FAIL (Products=0) |
| 5 | **P0** | E2E | Invoice step not implemented | Workflow gap; AR substitutes |
| 6 | **P0** | Contract | Legacy ACTIVE contracts without qualification rows | Predator FAIL; RF integrity Broken |
| 7 | **P0** | Qual | Guntur remediation requires manual qual + mirror sync | Blocks pilot path |
| 8 | **P1** | RLS | Admin SELECT all `lab_contracts` and `tenants` | Cross-tenant metadata leakage |
| 9 | **P1** | RLS | No `payments` UPDATE policy | Cannot correct payment errors |
| 10 | **P1** | RLS | No `orders` DELETE policy | Cannot remove bad orders via RLS |
| 11 | **P1** | RLS | Executive lab UPDATE blocked cross-tenant | Cannot edit distributor labs from HQ |
| 12 | **P1** | RF | Portfolio "Orders" = row count vs stage "Ordered" = lab count | Operator confusion |
| 13 | **P1** | RF | "Paid" column shows lab count not currency | Misleading dashboard |
| 14 | **P1** | RF | `pathComplete` requires payments > 0 not AR alone | False incomplete path |
| 15 | **P1** | RF | Ready-to-order uses distributor-wide inventory | One SKU enables all labs |
| 16 | **P1** | Pilot | Collections recovery % portfolio-wide on all distributor rows | Incorrect per-distributor score |
| 17 | **P1** | Pilot | Operations + Quality gates shared across distributors | Skewed readiness bands |
| 18 | **P1** | Predator | Distributor OS + PrimeCare OS excluded from batch | Coverage gap in QA Command Center |
| 19 | **P1** | Predator | Qualification store name mismatch (Review vs Analytics) | Stale/missing snapshots |
| 20 | **P1** | Predator | Commission Engine mutates Supabase during validation | Side effects in QA runs |

---

## What Passed (Recent Hardening)

- Qualification ownership moved to Distributor OS pipeline (`7968a9a`)
- Contract activation gate requires pipeline `qualified`/`won` (`5ba6f26`)
- Qualification Analytics exposed in executive/admin nav (`dc03533`)
- Founder review decoupled from activation; pipeline-based alerts
- Catalog/inventory executive RLS SQL authored (`f9d110e`)
- `npm run build` passes on `qa`

---

## Production Sign-Off Gates

| Gate | Required | Current |
|------|----------|---------|
| All P0 QA tests pass | 40/40 | Not executed |
| RLS migrations confirmed in Supabase | Yes | **Unconfirmed** |
| Guntur E2E path complete | Yes | **Blocked** (qual + mirror) |
| Predator batch PASS | Yes | **Expected FAIL** until remediation |
| No open P0 defects | 0 | **7 P0 defects** |
| Overall readiness ≥ 85% | Yes | **65%** |

---

## Recommended Remediation Sequence

1. **Apply SQL migrations** in Supabase (pilot RLS → catalog inventory RLS → qual/contracts)
2. **Guntur data remediation** — qual row → contract activate → catalog mirror resync
3. **RLS policy additions** — executive cross-tenant for qualifications, orders, payments (mirror lab_contracts pattern)
4. **Scope admin reads** — tenants and lab_contracts to own tenant
5. **Add payments UPDATE** policy for admin/executive corrections
6. **Execute HQ_QA_TEST_PLAN.md** P0 suite (40 cases)
7. **Re-run Predator** batch + on-demand Distributor OS
8. **Re-score** — target ≥85% overall before production cutover

---

## Tenant Reference

| Tenant | UUID |
|--------|------|
| PrimeCare HQ | `f168b98f-47a6-42c3-b788-24c00436fac2` |
| Guntur Distributor | `787999b9-72f5-4163-a860-551c12ce3414` |

---

## Verdict

PrimeCare HQ is **not production-ready** for full distributor-operated pilot at 65% readiness. Core business logic (qualification gate, contract activation, funnel/readiness engines) is substantially improved on `qa`, but **RLS migration confirmation**, **executive cross-tenant ops gaps**, and **catalog mirror application** block sign-off. Execute the 100-case QA plan after P0 remediation; target 85%+ weighted score before go-live.
