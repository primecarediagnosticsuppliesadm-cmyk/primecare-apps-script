# RC1 Golden Path Certification Results

**Certified:** 2026-07-08  
**Script:** `scripts/verify-golden-path-complete.mjs`  
**Primary chain:** `scripts/verify-primecare-production-golden-path.mjs`

---

## Chain Under Test

```
Prospect → Qualification → Visit → Contract → Lab Activation
    → Order → Inventory (ORDER_OUT) → Shipment
    → Invoice → PDF → Payment → Allocation → Collections
    → Payroll (commission read) → Founder Reporting
```

---

## Live QA Results (2026-07-08)

| Step | ID | Result | Detail |
|---|---|---|---|
| Qualification | GP-10 | PASS | Disposable qual record created |
| Contract | GP-20 | PASS | Contract linked to golden lab |
| Order | GP-25 | PASS | `ORD-GP-PROD-*` |
| Fulfill / Inventory | GP-28 | PASS | ORDER_OUT ledger |
| Invoice | GP-30 | PASS | Draft → finalized path |
| PDF | GP-31–32 | PASS | Storage path + download OK |
| Payment | GP-40 | PASS | `PAY-GP-PROD-*` with order linkage |
| Allocation | GP-41–42 | PASS | Auto-allocate; open balance ₹0 |
| Executive KPI | GP-50 | PASS | RPC OK |
| Commission | GP-45 | PASS | 2 entries; payments read OK |
| Tenant isolation | GP-90 | PASS | Guntur read-only confirmed |

**Summary:** PASS=14 FAIL=0 — **RESULT: PASS**

---

## Downstream Reconciliation

| Check | Script | Result |
|---|---|---|
| Tenant financial reconciliation | `verify-financial-reconciliation.mjs` | PASS (1 WARN legacy drift) |
| Order/payment sync | `verify-order-payment-sync.mjs` | PASS |
| AR reconcile | `verify-ar-reconcile.mjs` | PASS/WARN (legacy labs) |
| Transaction integrity RPCs | `verify-transaction-integrity-rpcs.mjs` | PASS |
| Invoice account status | `verify-invoice-account-status.mjs` | PASS |
| Cash-only commission | `verify-cash-only-commission.mjs` | PASS |
| Founder snapshot | `verify-founder-snapshot.mjs` | PASS |

---

## Reconciliation Gap Analysis

| Gap Type | Status |
|---|---|
| Missing writes on golden path | **None detected** |
| Stale reads on golden labs | **None on GP chain** |
| Duplicate calculations | **None on allocation/AR for golden invoice** |
| Legacy lab drift | **Documented** — 22–51 inactive AR rows on non-golden labs |

---

## Verdict

**Golden path: CERTIFIED** for QA tenant golden labs (`QA_LAB_*`).  
Pilot must restrict finance certification to golden labs until legacy AR backfill is scheduled.
