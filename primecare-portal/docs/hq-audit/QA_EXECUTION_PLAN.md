# QA Execution Plan — PrimeCare HQ Remediation Sprint

**Date:** 2026-05-28  
**Source:** `HQ_QA_TEST_PLAN.md` (100 cases)  
**Environment:** Staging Supabase + `qa` branch build

---

## Executive Summary

| Category | Count | % |
|----------|-------|---|
| **Ready** (can run after migration apply) | 72 | 72% |
| **Blocked** (requires migration or seed) | 18 | 18% |
| **Missing setup** | 8 | 8% |
| **Missing seed data** | 2 | 2% |

**Go/No-Go for QA execution:** **GO** after applying RLS migrations (see prerequisites). Do not start P0 until migrations confirmed.

---

## Prerequisites (Blocking)

| # | Prerequisite | Unblocks |
|---|--------------|----------|
| 1 | `production_auth_rls_pilot_migration.sql` applied | P0-004, P0-005, all RLS tests |
| 2 | `executive_distributor_catalog_inventory_rls.sql` applied | P0-014, P0-015, P0-016, P1-008 |
| 3 | `executive_distributor_ops_rls_migration.sql` applied | P0-007, P0-008, P0-018, P1-015 |
| 4 | Guntur golden path seed (qual + contract + mirror) | P0-034, P0-024, P0-025, P0-030 |
| 5 | QA auth users seeded | P0-001 through P0-003, P0-036, P0-037 |
| 6 | `npm run build` on latest `qa` | P0-039 |

---

## P0 Test Classification (40 cases)

### Ready (28) — run immediately after prerequisites

| ID | Notes |
|----|-------|
| P0-001 | Executive login |
| P0-002 | Inactive profile user required in seed |
| P0-003 | Lab role route guard |
| P0-006 | Lab insert (existing migration) |
| P0-009 | Pipeline qualified |
| P0-010 | Contract gate block |
| P0-011 | Contract activate with qual |
| P0-012 | Contract cross-tenant |
| P0-013 | Admin contract scope (post ops RLS) |
| P0-017 | Lab order |
| P0-019 | Fulfillment status |
| P0-020 | AR create |
| P0-021 | Payment record |
| P0-022–P0-028 | RF + Pilot metrics |
| P0-029 | Predator batch |
| P0-031 | HQ leakage |
| P0-032 | Nav Qualification Analytics |
| P0-033 | Distributor OS Qual tab |
| P0-036 | Agent scope |
| P0-037 | Lab scope |
| P0-038 | Ops center load |
| P0-039 | Build |
| P0-040 | Logout session |

### Blocked (8) — require migration apply first

| ID | Blocker |
|----|---------|
| P0-004 | Pilot migration |
| P0-005 | Pilot migration |
| P0-007 | Ops RLS migration |
| P0-008 | Ops RLS migration |
| P0-014 | Catalog RLS migration |
| P0-015 | Catalog RLS + mirror sync |
| P0-016 | Catalog RLS migration |
| P0-018 | Ops RLS migration |

### Missing setup (3)

| ID | Setup needed |
|----|--------------|
| P0-002 | `qa.inactive@primecare.test` user + inactive profile |
| P0-034 | Full Guntur E2E data path |
| P0-035 | Admin on HQ tenant attempting foreign tenant UPDATE |

### Missing seed data (1)

| ID | Seed needed |
|----|-------------|
| P0-030 | Guntur qual row + active contract alignment |

---

## P1 Test Classification (35 cases)

| Status | Count | Examples |
|--------|-------|----------|
| Ready | 26 | P1-001–P1-007, P1-011–P1-014, P1-016–P1-030 |
| Blocked | 6 | P1-008 (mirror), P1-009 (inventory), P1-015 (pre-fix rejection → post-fix PASS) |
| Missing setup | 3 | P1-027–P1-029 (Predator page visits), P1-005 (expiry contract seed) |

**Note:** P1-015 expected result **changes** after remediation — payment UPDATE should **PASS** for executive/admin.

---

## P2 Test Classification (25 cases)

| Status | Count |
|--------|-------|
| Ready | 22 |
| Missing setup | 3 (P2-011 invoice N/A doc, P2-018 predator prior run, P2-025 perf baseline) |

---

## Recommended Execution Order

### Phase A — Infrastructure (Day 1)

1. Apply all 6 SQL migrations in Supabase
2. Run anon policy audit (expect 0 rows)
3. P0-004, P0-005, P0-039
4. P0-001, P0-003

### Phase B — Guntur Golden Path (Day 1–2)

1. Execute `GUNTUR_GOLDEN_PATH_REPORT.md` steps
2. P0-006 → P0-021, P0-034
3. P0-022 → P0-030, P0-031

### Phase C — Metrics + Predator (Day 2)

1. Visit required pages (Distributor OS, RF, Pilot, Collections, Qual Analytics)
2. P0-029, P0-038
3. P1 Predator cases P1-026–P1-030

### Phase D — Regression (Day 3)

1. P1 remaining (32 target pass)
2. P2 suite (20 target pass)
3. Sign-off review

---

## Pass Criteria for QA Sign-Off

| Gate | Threshold |
|------|-----------|
| P0 | 100% (40/40) |
| P1 | ≥ 90% (32/35) |
| P2 | ≥ 80% (20/25) |
| Predator batch | PASS (executive role) |
| Guntur golden path | Complete with `pathComplete = true` |

---

## Test Environment Seed Checklist

| Data | Guntur tenant | QA tenant |
|------|---------------|-----------|
| Distributor row | ✅ Exists | — |
| Lab(s) | ≥ 1 | QA_LAB_001–003 |
| Qualification row | Create in test | Optional |
| Active contract | Create/activate | Optional |
| Catalog assigned | Metadata | Seed products |
| Inventory mirror | Sync required | Seed inventory |
| Executive profile | HQ tenant | qa-tenant-001 |
| Lab profile | Guntur lab | QA_LAB_001 |
| Agent profile | — | QA_AGENT_001 |
