# PrimeCare HQ 85% Readiness Plan

**Date:** 2026-05-28  
**Sprint:** HQ Remediation  
**Baseline:** 65% (stabilization audit)  
**Target:** 85%+ QA sign-off readiness

---

## Readiness Scorecard

| Area | Baseline | After code fixes | After SQL apply + golden path | Target |
|------|----------|------------------|-------------------------------|--------|
| Authentication | 78% | 78% | 80% | 85% |
| Authorization | 80% | 82% | 85% | 85% |
| **RLS** | 52% | 82%* | **88%** | 85% ✅ |
| Qualification | 72% | 85%* | **88%** | 85% ✅ |
| Contracts | 70% | 82%* | **86%** | 85% ✅ |
| Orders | 58% | 80%* | **84%** | 85% |
| Inventory | 64% | 82%* | **86%** | 85% ✅ |
| Collections | 60% | 78%* | **83%** | 85% |
| Revenue Funnel | 66% | 68% | **78%** | 80% |
| Pilot Readiness | 63% | 65% | **76%** | 80% |
| **Predator** | 55% | **78%** | **85%** | 85% ✅ |
| Executive Portal | 68% | 75% | **86%** | 85% ✅ |

\*Requires `executive_distributor_ops_rls_migration.sql` + `executive_distributor_catalog_inventory_rls.sql` applied in Supabase.

**Estimated overall after full remediation: 84–87%** (weighted)

---

## Remediation Delivered (This Sprint)

### Code changes

| Change | File |
|--------|------|
| Executive cross-tenant ops RLS | `supabase/sql/executive_distributor_ops_rls_migration.sql` |
| Distributor OS in Predator batch | `src/predator/runPredatorValidation.js` |
| Distributor OS snapshot persistence | `src/predator/runPredatorValidation.js` |
| Qualification store name fix | `src/predator/runPredatorValidation.js` |
| `DISTRIBUTOR_OS_MODULE` constant | `src/predator/moduleUiSnapshot.js` |
| Revenue Funnel batch destructuring fix | `src/predator/runPredatorValidation.js` |

### Reports

| Report | Path |
|--------|------|
| RLS Remediation | `docs/hq-audit/RLS_REMEDIATION_REPORT.md` |
| Guntur Golden Path | `docs/hq-audit/GUNTUR_GOLDEN_PATH_REPORT.md` |
| Predator Coverage | `docs/hq-audit/PREDATOR_COVERAGE_REPORT.md` |
| QA Execution Plan | `docs/hq-audit/QA_EXECUTION_PLAN.md` |

---

## Remaining Blockers

| # | Priority | Blocker | Owner | ETA |
|---|----------|---------|-------|-----|
| 1 | **P0** | Apply 6 SQL migrations in Supabase staging | DevOps/QA | Day 0 |
| 2 | **P0** | Execute Guntur golden path manually | QA | Day 1 |
| 3 | **P1** | Legacy ACTIVE contracts without qual rows | Data hygiene | Day 1 |
| 4 | **P1** | RF metric semantics (Orders vs Ordered, Paid column) | Product (doc only) | Post-pilot |
| 5 | **P1** | Pilot Readiness portfolio gates skew | Engineering backlog | Post-pilot |
| 6 | **P2** | Invoice entity not implemented | Roadmap | Out of scope |
| 7 | **P2** | Commission Engine mutating Predator probe | Engineering | Post-pilot |
| 8 | **P2** | Admin global `tenants` R/W | Security backlog | Post-pilot |

---

## Go / No-Go for QA Execution

| Criterion | Decision |
|-----------|----------|
| RLS migration SQL authored | ✅ GO |
| Predator batch coverage complete | ✅ GO |
| Build passes | ✅ GO (`npm run build`) |
| Migrations applied in staging | ⏳ **NO-GO until confirmed** |
| Guntur seed data present | ⏳ **NO-GO until golden path prep** |

### Recommendation

**CONDITIONAL GO** — Begin QA Phase A (infrastructure tests) immediately after applying migrations in staging. Full 100-case execution is **GO** once:

1. All 6 migrations applied and verified
2. Guntur qual + contract + catalog mirror synced
3. Executive QA user active

---

## Path to 85%+ Sign-Off

```
Day 0: Apply SQL migrations → verify anon audit = 0
Day 1: Guntur golden path → P0 suite (40 cases)
Day 2: Predator batch PASS → P1 suite (target 32/35)
Day 3: P2 regression → sign-off review
```

### Sign-off gates

- [ ] P0: 40/40 PASS
- [ ] P1: ≥ 32/35 PASS
- [ ] Predator batch: PASS (executive)
- [ ] Guntur `pathComplete = true`
- [ ] No open P0 defects
- [ ] Weighted readiness ≥ 85%

---

## Migration Apply Order (Copy-Paste Checklist)

1. [ ] `production_auth_rls_pilot_migration.sql`
2. [ ] `executive_distributor_lab_create_migration.sql`
3. [ ] `lab_qualifications_migration.sql`
4. [ ] `lab_qualifications_pipeline_migration.sql` (if separate)
5. [ ] `lab_contracts_migration.sql`
6. [ ] `executive_distributor_catalog_inventory_rls.sql`
7. [ ] `executive_distributor_ops_rls_migration.sql` **← NEW**

---

## Verdict

PrimeCare HQ can reach **85%+ readiness** within 3 QA days after migration apply and Guntur golden path execution. Code remediation is complete; remaining work is **operational** (SQL apply + manual QA), not feature development.

**Current state:** Code-ready, staging-blocked.  
**Next action:** Apply migrations in Supabase → execute `QA_EXECUTION_PLAN.md` Phase A.
