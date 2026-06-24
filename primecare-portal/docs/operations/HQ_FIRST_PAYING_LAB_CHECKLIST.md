# HQ First Paying Lab Checklist

**Last updated:** 2026-06-24  
**Purpose:** Pre-go-live verification for onboarding the **first real paying lab** on PrimeCare HQ.  
**Reference lab (QA golden):** `QA_LAB_001` / QA Alpha Diagnostics  
**Certification script:** `node scripts/verify-primecare-production-golden-path.mjs`

---

## How to use

| Column | Meaning |
|--------|---------|
| **Verified** | Proven in QA with cited evidence |
| **Not Verified** | Not proven or requires production-specific steps |

---

## Onboarding & access

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 1 | Lab user provisioned with `role=lab` | **Verified** | User Provisioning Predator PASS; `qa.lab@primecare.test` RLS 5/5 |
| 2 | Lab scoped to correct tenant | **Verified** | `verify-hq-rls-reads.mjs` — lab sees 1 lab, 0 foreign rows |
| 3 | Lab can log in | **Verified** | RLS cert lab auth PASS |
| 4 | Agent assigned (if field-supported) | **Verified** | `verify-pilot-hardening-sql.mjs` PH-16 ownership ACTIVE |

---

## Commercial readiness

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 5 | Qualification `won` or `qualified` | **Verified** | Golden path GP-10 `00b40bf2-d673-4cb0-b169-d9b9654319c1` |
| 6 | Active contract on file | **Verified** | Golden path GP-11 `CNT-GOLDEN-001` |
| 7 | Credit limit / AR row exists | **Verified** | Fulfillment posts AR; collections read PASS |

---

## Catalog & ordering

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 8 | Catalog access (products in stock) | **Verified** | `v_stock_dashboard` QA_SKU_001 stock=100; golden path GP-12 |
| 9 | Lab can place order | **Verified** | Golden path GP-20 `createOrderWrite` |
| 10 | Lab can track order status | **Verified** | Lab orders RLS scoped; Predator Lab Portal WARN-only |

---

## Fulfillment & invoicing

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 11 | Admin can fulfill order | **Verified** | Golden path GP-21 `updateOrderStatusWrite` → Fulfilled |
| 12 | Inventory deducted on fulfill | **Verified** | Golden path log INVENTORY AFTER UPDATE stock 100→99 |
| 13 | AR outstanding increased | **Verified** | Golden path AR POSTED FOR ORDER |
| 14 | Invoice auto-created on fulfill | **Verified** | Golden path GP-22 `INV-2026-000013` |
| 15 | Invoice line snapshot immutable | **Verified** | `verify-invoice-phase2.mjs` R-40 |
| 16 | PDF generated | **Verified** | Golden path GP-30–31 |
| 17 | Lab can download PDF | **Verified** | Golden path GP-32 (1849 bytes); phase 3 cross-lab denial PASS |
| 18 | Lab Invoice Center lists invoices | **Verified** | `verify-invoice-phase4.mjs` — admin 10 invoices; lab list RLS OK |

---

## Payments & collections

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 19 | Payment recorded | **Verified** | Golden path GP-40 `createPaymentWrite` |
| 20 | Payment linked to order | **Verified** | P0 fix — `orderId` passed; GP-40 |
| 21 | Payment allocated to invoice | **Verified** | Golden path GP-41 allocation_id present |
| 22 | Invoice open balance → 0 | **Verified** | Golden path GP-42 |
| 23 | AR updated on payment | **Verified** | `createPaymentWrite` AR patch; compensating rollback on failure |
| 24 | Collections UI allocation from invoice context | **Verified** | CollectionsPage `paymentOrderId` + invoice Record Payment |
| 25 | Lab-level payment without invoice stays unallocated | **Verified** | By design when no orderId — phase 5 cert |

---

## Executive visibility

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 26 | Revenue / order KPIs | **Verified** | Predator Admin Dashboard WARN-only; perf cert |
| 27 | Outstanding collections | **Verified** | Executive collections RLS read PASS |
| 28 | Collection % + unallocated cash | **Verified** | Invoice phase 5 + golden GP-50 |
| 29 | Contract / lab health signals | **Verified** | Executive Action Queue Predator PASS |

---

## Production-specific (not yet verified on prod)

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 30 | Production Supabase project configured | **Not Verified** | QA only (`primecare-qa`) |
| 31 | Production Vercel env vars | **Not Verified** | — |
| 32 | Production backup restore drill | **Not Verified** | `HQ_BACKUP_RECOVERY_RUNBOOK.md` — restore untested |
| 33 | Production monitoring / alerting | **Not Verified** | `HQ_MONITORING_PLAN.md` — FAIL |
| 34 | Real lab legal/commercial onboarding | **Not Verified** | Business process outside portal |
| 35 | Legacy unallocated cash cleared | **Not Verified** | FR-50 WARN — ₹9,135 pre-golden payments |

---

## Summary

| Category | Verified | Not Verified |
|----------|----------|--------------|
| QA technical path (items 1–29) | **29** | **0** |
| Production / ops (items 30–35) | **0** | **6** |

**First paying lab — technical path: Verified on QA.**  
**First paying lab — production promotion: Not Verified** until prod env, backup drill, and monitoring are closed.

---

## Pre-go-live command

```bash
cd primecare-portal
node scripts/verify-primecare-production-golden-path.mjs
node scripts/verify-financial-reconciliation.mjs
```

Both must PASS (reconciliation may WARN on legacy drift only).
