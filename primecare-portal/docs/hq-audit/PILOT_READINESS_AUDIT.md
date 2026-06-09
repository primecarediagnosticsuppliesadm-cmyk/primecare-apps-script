# Pilot Readiness Audit — PrimeCare HQ Stabilization Sprint

**Date:** 2026-05-28  
**Engine:** `src/readiness/pilotReadinessEngine.js`  
**Loader:** `loadPilotReadinessData`  
**UI:** `src/pages/PilotReadinessPage.jsx`

---

## Scoring Model

| Concept | Formula |
|---------|---------|
| Check status | PASS / WARN / FAIL |
| Gate status | Any FAIL → FAIL; else any WARN → WARN; else PASS |
| Gate score | PASS=100, WARN=60, FAIL=0 |
| Distributor score | `avg(9 gate scores)` clamped 0–100 |
| Band | ≥90 READY FOR PILOT; ≥75 CONDITIONAL; ≥60 NOT READY; else BLOCKED |

---

## Gate Audit

### 1. Foundation

| Check | Source | Formula | Expected | Risk |
|-------|--------|---------|----------|------|
| exists | distributor registry | Always PASS | Distributor row present | — |
| active | lifecycle engine | `ACTIVE && canOperate` | Active distributor | Draft → FAIL |
| durable | tenant row | `durable` or `DURABLE` status | Supabase persisted | SYNC_FAILED → FAIL |
| isolation | labs/orders/collections | `detectHqLeakage` sum = 0 | No HQ rows in scoped set | Only checks already-scoped rows |

### 2. Catalog

| Check | Source | Formula | Expected | Risk |
|-------|--------|---------|----------|------|
| assigned | `distributor.config` | catalog items or flag | Metadata assigned | Config-only, not mirror |
| saved | catalog items | `items.length > 0` | Items in metadata | — |
| mirror | `catalogMirrorSummary` | SYNC_FAILED → FAIL; no mirror + items → WARN | products/inventory exist | Missing diagnostics → WARN |

### 3. Labs

| Check | Source | Formula | Expected | Risk |
|-------|--------|---------|----------|------|
| first_lab | metrics | `labs > 0` | `v_labs_credit` scoped | — |
| qualified_lab | qualifications | `isQualificationPipelineReady` count > 0 | Pipeline qualified/won | Same as Revenue Funnel |
| onboarding | qualifications | pending = not qualified, not lost | 0 PASS; ≤2 WARN | Differs from RF blockers |

### 4. Contracts

| Check | Source | Formula | Expected | Risk |
|-------|--------|---------|----------|------|
| active_contract | `lab_contracts` | active count > 0 | At least one ACTIVE | — |
| expiry_risk | contracts + renewal | CRITICAL expiry → FAIL | No critical expiry | — |
| qualification_alignment | contracts + quals | `activeCount > qualifiedCount` → **WARN** | Aligned counts | WARN only; RF can be Broken |

### 5. Billing

| Check | Source | Formula | Expected | Risk |
|-------|--------|---------|----------|------|
| configured | `config.billingModel` | model set, no warnings | Billing model valid | — |
| calculations | billing row | `amountDueMatchesBreakdown` | Math within ₹0.01 | Ledger fallback masks issues |

### 6. Collections

| Check | Source | Formula | Expected | Risk |
|-------|--------|---------|----------|------|
| healthy | metrics | `collections > 0` | AR rows exist | — |
| recovery | FI `recoveryPct` | portfolio-level recovery | **Same % for all distributors** ⚠️ |

### 7. Financial

| Check | Source | Formula | Expected | Risk |
|-------|--------|---------|----------|------|
| fi_loaded | FI model | billing + contracts + HQ snapshot ok | Shared across distributors | — |
| profitability | profitability model | row exists → PASS | Per-distributor | — |
| risk | profitability | AT_RISK → FAIL; WATCH → WARN | Score thresholds | — |

### 8. Operations (portfolio-level)

| Check | Source | Formula | Expected | Risk |
|-------|--------|---------|----------|------|
| ops_center | ops payload | dashboard or collections present | — | Same gate on every distributor row |
| exec_intelligence | signals | intelligence built, not stale | — | Uses **home tenantId** for ledger |
| event_ledger | local ledger | events > 0 → PASS | — | Not durable DB |

### 9. Quality (portfolio-level)

| Check | Source | Formula | Expected | Risk |
|-------|--------|---------|----------|------|
| qa_score | QA model | ≥75 PASS | Predator-derived | Same for all distributors |
| predator | predator health | fail count = 0 | — | Depends on prior runs |
| defects | defect registry | critical = 0 | — | — |

---

## Structural Issues

| Issue | Impact |
|-------|--------|
| Operations + Quality gates reused | 2/9 gates identical on every distributor row |
| Collections recovery | Portfolio metric applied per-distributor |
| Gate breakdown UI | Non-ops gates show checks from `distributorRows[0]` only |
| Score vs FAIL mismatch | CONDITIONAL band possible with individual FAIL gates |
| Catalog gate ignores stock | Revenue Funnel checks inventory; Pilot Readiness catalog gate does not |

---

## Alignment with Revenue Funnel

| Topic | Revenue Funnel | Pilot Readiness |
|-------|----------------|-----------------|
| Qualified definition | pipeline qualified/won | Same ✅ |
| Contract-qual gap | Broken/Warning integrity | WARN on active > qualified only |
| Inventory | Drives Ready to Order | Catalog gate only (no stock) |
| Fulfillment | Order status substring | Nested in ops signals only |

---

## Recommendations

1. Scope collections recovery and operations ledger per distributor.
2. Elevate qualification_alignment to FAIL when integrity is Broken (missing qual rows).
3. Add inventory stock check to Catalog gate or separate Inventory gate.
4. Split portfolio gates from per-distributor score or label them clearly in UI.
