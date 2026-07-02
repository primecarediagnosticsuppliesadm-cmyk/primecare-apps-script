# PrimeCare Certification Framework

**Phase 2 — Release certification system for Year-1 PrimeCare.**

Blueprint index: [16_Certification_Framework.md](../PrimeCare_System_Blueprint/16_Certification_Framework.md)

---

## What this is

A **documentation-first certification system** that maps every business object and UI screen to its source of truth, APIs, verify scripts, dependencies, and performance targets. It does not change application behavior.

---

## Artifacts

| # | Document | Purpose |
|---|----------|---------|
| 01 | [Object Source-of-Truth Catalog](./01_Object_Source_of_Truth_Catalog.md) | Authoritative tables, lifecycles, APIs per object |
| 02 | [Screen Ownership Catalog](./02_Screen_Ownership_Catalog.md) | Page reads/writes, roles, verification, perf targets |
| 03 | [Object Dependency Graph](./03_Object_Dependency_Graph.md) | Upstream/downstream relationships for O2C |
| 04 | [Browser Golden Path](./04_Browser_Golden_Path.md) | Manual O2C walkthrough with step IDs |
| 05 | [Browser Regression Framework](./05_Browser_Regression_Framework.md) | Manifest, tiers, orchestration, sign-off |
| 06 | [Release Scorecard](./06_Release_Scorecard.md) | PASS/FAIL matrix template for releases |
| 07 | [Performance Certification Matrix](./07_Performance_Certification_Matrix.md) | Surface budgets, measurement commands, baselines |

---

## Quick start — certification run

```bash
cd primecare-portal

# 1. Build
npm run build

# 2. API regression (O2C bundle)
node scripts/verify-lab-ordering-flow.mjs
node scripts/verify-orders-admin-flow.mjs
node scripts/verify-logistics-dispatch-flow.mjs
node scripts/verify-financial-reconciliation.mjs
node scripts/verify-payment-allocation-flow.mjs
node scripts/verify-primecare-production-golden-path.mjs
node scripts/verify-hq-rls-reads.mjs

# 3. Browser prereq gate + checklist
node scripts/run-browser-certification.mjs

# 4. Performance (isolated PERF tenant)
PERF_SKIP_SEED=1 node scripts/run-hq-performance-certification.mjs

# 5. Fill scorecard
# Copy 06_Release_Scorecard.md → docs/QA/Release_Scorecard_YYYY-MM-DD.md
```

---

## QA accounts (reference)

| Role | Email | Password |
|------|-------|----------|
| Admin | `qa.admin@primecare.test` | `1234` |
| Executive | `qa.executive@primecare.test` | `1234` |
| Lab | `qa.lab@primecare.test` | `1234` |
| Agent | `qa.agent@primecare.test` | `1234` |

**HQ tenant:** `f168b98f-47a6-42c3-b788-24c00436fac2` · **Lab:** `QA_LAB_001`

---

## Maintenance

When adding a feature (post-certification): update catalog entries **before** merge. See Blueprint §16 maintenance rules.
