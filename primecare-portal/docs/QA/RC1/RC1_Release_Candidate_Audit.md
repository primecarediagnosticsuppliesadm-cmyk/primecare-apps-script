# PrimeCare Release Candidate 1 — Module Audit

**Date:** 2026-07-08  
**Branch:** `qa` (uncommitted RC1 work)  
**Environment:** QA Supabase `f168b98f-47a6-42c3-b788-24c00436fac2`  
**Scope:** RC1 certification — no new features/modules/schema/business logic  

---

## Executive Summary

PrimeCare RC1 is a **feature-frozen** release candidate for a **single-HQ supervised pilot**. Automated certification is strong on the O2C golden path, admin module flows, platform consolidation (9.1), and Founder OS (9.2). **Human UAT remains incomplete** for agent login, lab ordering modes, PO lifecycle UI, payment record UI, and create-lab UI. **Production hardening gaps** include legacy AR drift on non-golden labs, Predator validation failures on legacy rows, performance scale limits on orders/payments reads, and DR/monitoring drills not executed on production.

**Pilot readiness:** **CONDITIONAL GO** (supervised, single tenant, golden labs only)  
**Production readiness:** **NO-GO** (unrestricted multi-lab go-live)

---

## Module Certification Matrix

| Module | Production Ready | Pilot Ready | Known Defects | Risk |
|---|---|---|---|---|
| **Commercial (CRM workspace)** | Medium | Yes (read-compose) | No transactional CRM writes; compose-only over qual/visits/contracts | Low |
| **Qualification** | High | Yes | Golden path PASS; legacy lab PROSPECT status on some QA labs | Low |
| **Contracts** | High | Yes | Contract engine read-only in commercial workspace | Low |
| **Visits** | Medium | Conditional | `AgentVisitPage.jsx` ~3,082 LOC; mobile maturity ~28% | High (field) |
| **Orders** | High | Yes | `verify-orders-admin-flow.mjs` PASS; fulfillment idempotency RPC wired | Low |
| **Inventory** | High | Yes | GAP-001 deferred (catalog creates stock row); ledger reconciliation not scheduled | Medium |
| **Procurement** | Medium | Conditional | PO cancel/edit/receive automated; **manual PO UI UAT open** | Medium |
| **Logistics** | Medium | Conditional | Dispatch flow verified; route planning **manual UAT open** | Medium |
| **Finance (Invoices/AR)** | High | Yes (golden) | Legacy drift 22–51 rows on non-golden labs; golden labs clean | Medium |
| **Collections** | Medium | Conditional | `CollectionsPage.jsx` ~3,243 LOC; golden allocation PASS | Medium |
| **People Operations** | Medium | Yes (HQ) | Shell + dashboard verified; enterprise UX partial | Low |
| **Payroll** | High | Yes (preview) | No finance mutation; approval/export paths verified | Low |
| **Compensation** | High | Yes (preview) | Read-only preview; no GL/bank disbursement | Low |
| **Founder OS** | High | Yes | Phase 9.2 GO; compose-only decision cockpit | Low |
| **Business Ownership** | Medium | Yes | Territory/lab ownership verified; distributor pilot rows | Medium |
| **Executive** | High | Yes | Financial intelligence + projection shadow mode | Low |
| **Operations Center** | High | Yes | 35/35 automated PASS; role escalation blocked | Low |
| **Lab Portal** | Medium | Conditional | Ordering flow PASS; **ordering mode UAT open** | Medium |
| **Distributor** | Low | No (Year-1 HQ) | Distributor OS present; not pilot launch role | Low |
| **Platform / RC Dashboard** | High | Yes | Phase 9.1 GO; nav consolidation | Low |

---

## Cross-Cutting Risks

| Area | Status | Evidence |
|---|---|---|
| Golden path O2C | **PASS** | `verify-primecare-production-golden-path.mjs` 14/14 |
| Financial reconciliation | **WARN** | `verify-financial-reconciliation.mjs` — legacy drift documented |
| RLS | **PASS** (QA) | `verify-hq-rls-reads.mjs`; prod migration apply unconfirmed |
| Projections | **Shadow** | `readProjectionFlags.js` opt-in; GAP-BP-020–023 open |
| Schema drift | **Medium** | 13 migrations vs 52 SQL scripts (GAP-BP-001) |
| DR / Backup | **Not executed** | Sprint 3A checklists exist; restore drill not run |
| Monitoring | **Partial** | MON-14 perf scale FAIL; MON-15 Predator legacy FAIL |
| Mobile / Agent | **High risk** | Large god pages; agent login manual UAT open |

---

## Automated Certification (RC1 Run)

| Bundle | Result |
|---|---|
| `verify-release-candidate.mjs` | Run via `audit-rc1-certification.mjs` |
| `verify-golden-path-complete.mjs` | PASS/WARN |
| `verify-role-certification.mjs` | PASS/WARN |
| `verify-rc1-production-readiness.mjs` | CONDITIONAL GO |
| `audit-phase-9-1-certification.mjs` | GO |
| `audit-phase-9-2-certification.mjs` | GO |
| `npm run build` | PASS |

---

## Launch-Blocking Gaps (Pilot)

1. Complete Human UAT matrix (`RC1_Human_UAT_Matrix.md`) — no UNKNOWN rows
2. Agent login smoke test + assigned-lab scope
3. Admin: create lab UI, record payment UI, PO lifecycle UI
4. Lab ordering mode matrix (HQ Managed / Hybrid / Self Service / Suspended)
5. Partial payment strict lifecycle UAT (GAP-021 follow-up)
6. Production Supabase: confirm pilot hardening migration applied
7. DR: execute backup restore drill once before prod pilot
8. Accept legacy AR drift scope OR schedule backfill for non-golden labs
9. Predator: triage 6 FAIL on legacy collection rows (waive or fix)
10. Performance: seed perf tenant or bound orders/payments reads in scale path

---

## Scores (RC1 Assessment)

| Dimension | Score | Target |
|---|---|---|
| Enterprise readiness | ~64% | ≥85% |
| Production readiness | ~58% | ≥85% |
| Automated certification | ~82% | ≥90% |
| Human UAT completion | ~45% | 100% |

---

## References

- `docs/QA/Admin_Final_Certification.md`
- `docs/QA/QA_Gap_Register.md`
- `docs/QA/UAT_Checklist.md`
- `docs/PrimeCare_System_Blueprint/13_Verification_Matrix.md`
