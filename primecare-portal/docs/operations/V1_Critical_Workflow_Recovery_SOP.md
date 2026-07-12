# PrimeCare v1.0 — Critical Workflow Recovery SOP

| Field | Value |
|-------|-------|
| Purpose | Operator recovery for known Year-1 integrity edges |
| Parent | `V1_Operational_Readiness_Execution.md` |
| Code changes | **None** — do not invent rollback RPCs or new screens |

Related: `docs/QA/RC1/RC1_Recovery_Checklist.md`, `RC1_Support_Runbook.md`, `RC1_Rollback_Plan.md`

---

## 1. Order → Fulfill → Inventory (strong path)

| | |
|--|--|
| **Happy path** | Fulfill triggers ORDER_OUT via idempotent inventory flag/RPC |
| **Duplicate protection** | `orders.inventory_updated` / RPC idempotency |
| **On failure** | Re-try fulfill only if order not Fulfilled; if Fulfilled, do not re-fulfill |
| **Verify** | `verify-transaction-integrity-rpcs.mjs`, stock on-hand + ledger |

---

## 2. Fulfill → Invoice / Shipment (non-atomic — by design)

**Policy (Blueprint):** Invoice/shipment failures **do not roll back** fulfill (`05_Order_Lifecycle.md`).

| Symptom | Immediate action | Recovery | Do not |
|---------|------------------|----------|--------|
| Order Fulfilled, stock down, **no invoice** | Stop duplicate fulfill; notify Finance/Ops | Finalize/create invoice via Invoice Center; regenerate PDF if needed | Ad-hoc SQL; invent reverse ORDER_OUT |
| Order Fulfilled, **no shipment** | Check shipment unique constraint / column drift (GAP-BP-004) | Manual dispatch; confirm migration columns | Re-fulfill |
| Invoice Draft stuck | Use certified finalize path | Follow invoice phase runbooks | Allocate against Draft |

**Incident log:** Order ID, tenant, lab, timestamp, who fulfilled, screenshot of Invoice Center.

---

## 3. Purchase → Receive → Stock (UI-guarded; multi-step write)

**Known limit (CERT-004):** Receive is multi-step JS (inventory → ledger → PO). No PURCHASE_IN idempotency RPC yet.

| Symptom | Immediate action | Recovery | Do not |
|---------|------------------|----------|--------|
| Click Receive, error mid-way | **Do not click Receive again** | Compare PO remaining qty vs Inventory Movements (`PURCHASE_IN`) vs on-hand | Blind re-receive |
| Suspected double receive | Freeze further receives on that PO | Founder-approved reconciliation; support ticket | Manual ledger delete |
| Wrong SKU blocked | Expected | Fix catalog/SKU; retry once | Bypass UI |

**Discipline:** One operator, one PO, wait for success toast + silent refresh before next action.

---

## 4. Invoice → Collection → Payment

| | |
|--|--|
| **Duplicate protection** | Allocation RPCs + UI inflight refs |
| **Failure** | Compensating reverse AR + delete payment path; drawer stays open |
| **Proof upload** | Non-blocking after pay — missing proof is a **ticket**, not AR corruption |
| **Verify** | `verify-financial-reconciliation.mjs`, `verify-partial-payment-sync.mjs` |
| **Scope** | Executive KPI sign-off = **golden labs only** (AR-LEGACY / MON-15) |

---

## 5. Payment → Commission → Payroll

| | |
|--|--|
| **Integrity** | Cash collected × rate; attribution snapshot required |
| **Failure** | Missing snapshot → manual review (no silent ownership swap) |
| **Boundary** | Payroll `paid` ≠ bank disbursement / GL (Year-1 by design) |
| **Verify** | `verify-no-finance-mutation.mjs`, payroll audit verifies |

---

## 6. Network / offline (Agent)

| | |
|--|--|
| **Gap** | No offline action queue |
| **SOP** | Prefer online; after reconnect, confirm visit/collection not already posted before re-submit |
| **Escalation** | Duplicate payment suspicion → Collections + Finance; do not delete rows |

---

## Escalation ladder

1. Ops uses this SOP + `RC1_Recovery_Checklist.md`  
2. Engineering runs read-only verifies (recon, golden path)  
3. Founder approval for any database restore (`Sprint3A_Restore_Verification_Checklist.md`)  
4. Update `RC1_Known_Issues.md` after incident  

**STOP.** No feature work from this SOP.
