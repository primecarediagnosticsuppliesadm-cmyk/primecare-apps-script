# PrimeCare v1.0 — Operational Readiness Execution

| Field | Value |
|-------|-------|
| Gate | **ALLOWED** — ops / reliability / observability packaging only |
| Date | 2026-07-12 |
| Source audit | Production Readiness Audit (Founder) |
| Feature stance | Year-1 build **COMPLETE** — no new modules, screens, dashboards, or ERP features |

**Mission:** Prepare PrimeCare to operate a real diagnostics distribution business under supervised pilot conditions. Improve reliability, recoverability, observability, and operational readiness only.

---

## Executive Summary

PrimeCare already has substantial production-ops artifacts (RC1 checklists, Sprint 3A backup/restore runbooks, monitoring plan, env checklist, storage/PDF health checks, recovery checklists). The Production Readiness Audit gaps are mostly **unexecuted operator work** and a few **known by-design integrity limits** — not missing product features.

| Verdict | Scope |
|---------|--------|
| **CONDITIONAL GO** | Supervised first customer (single HQ, golden labs, trained ops) |
| **NO-GO** | Unrestricted production GA until Priority 1 operator gates below are complete |

**This pack does not change application workflows.** It maps audit risks → current evidence → remaining gaps → required work → effort, and points operators to existing runbooks.

---

## Current Production Readiness

| Area | Status | Primary evidence |
|------|--------|------------------|
| Supervised pilot (RC1) | **GO** | `docs/QA/RC1/RC1_GO_NO_GO.md` |
| Production readiness script | **CONDITIONAL** | `scripts/verify-rc1-production-readiness.mjs` |
| Auth / pilot roles | **Ready (QA)** | `rolePermissionMatrix.js`, `verify-agent-rc1-closure.mjs`, `verify-security-hardening.mjs` |
| RLS | **Ready (QA)** | `verify-hq-rls-reads.mjs`, `verify-pilot-hardening-sql.mjs` — **prod spot-check open** |
| Monitoring hooks | **Hooks yes / APM no** | `src/observability/monitoring.js`, `HQ_MONITORING_PLAN.md` |
| Logging | **Structured console** | `logStructured` / correlation ID |
| Error reporting | **UX strong / external weak** | ActionErrorSummary pattern; Sentry DSN placeholder only |
| Storage / Invoice PDF | **QA certified** | `HQ_STORAGE_HEALTH_CHECK.md`, `verify-invoice-phase3.mjs`, golden path GP-30–32 |
| Environment config | **Template exists** | `HQ_PRODUCTION_ENV_CHECKLIST.md` — **not yet executed for prod** |
| Backup & restore | **Runbooks exist** | `HQ_BACKUP_RECOVERY_RUNBOOK.md`, `Sprint3A_Restore_Verification_Checklist.md` — **DR drill open** |
| Production migrations | **Manifest exists** | `HQ_SQL_MIGRATION_MANIFEST.md` — **prod apply confirmation open** |
| Inventory / Purchase Gold | **CONDITIONAL** | Signed browser UAT pending |
| Email / SMS notifications | **Out of Year-1 scope** | Placeholders only — set customer expectations |

---

## Focus Area Review (10)

### 1. Production authentication

| | |
|--|--|
| **Current** | Supabase Auth; `AuthContext.jsx`; pilot launch roles; password reset edge fn; freeze policy |
| **Evidence** | `verify-security-hardening.mjs` SEC-03; RC1 agent login PASS; `HQ_PRODUCTION_ENV_CHECKLIST.md` S7–S8 |
| **Gap** | Prod Site URL / redirect URLs not filled; Founder countersign PENDING on RC1 GO |
| **Required work** | Execute env checklist Auth rows on prod; smoke founder/admin/lab/agent login |
| **Effort** | **0.5 day** (ops) |

### 2. RLS verification

| | |
|--|--|
| **Current** | HQ RLS policies + pilot hardening SQL verified on QA |
| **Evidence** | `verify-hq-rls-reads.mjs` (MON-13), `verify-pilot-hardening-sql.mjs`, `RC1_Production_Readiness.md` |
| **Gap** | Prod RLS spot-check still open (`RC1_Production_Checklist.md`) |
| **Required work** | Run MON-13 against prod (or prod-like) with admin/agent/lab accounts; record results |
| **Effort** | **0.5–1 day** (ops) |

### 3. Monitoring

| | |
|--|--|
| **Current** | Vendor-neutral hooks (`VITE_SENTRY_DSN`, uptime URL, alert webhook); cert scripts MON-09–15 |
| **Evidence** | `monitoring.js`, `HQ_MONITORING_PLAN.md`, `HQ_ALERTING_RUNBOOK.md`, `verify-production-monitoring.mjs` |
| **Gap** | No Sentry package wired; MON-14/15 FAIL/WARN; alert webhook unused |
| **Required work** | **P1 (first customer):** capture error-rate baseline + halt-on-verify-fail discipline. **P2 (GA):** wire Sentry/uptime/webhook per plan (config only — no new screens) |
| **Effort** | P1 **0.5 day**; P2 **1–2 days** |

### 4. Logging

| | |
|--|--|
| **Current** | Structured client logs with correlation ID; ReadHealthBanner; edge function Supabase logs |
| **Evidence** | `logStructured`, `RC1_Production_Readiness.md` Logging PASS |
| **Gap** | No external log drain |
| **Required work** | Keep console + Supabase logs for pilot; drain optional at GA |
| **Effort** | Pilot **0**; GA optional **1 day** |

### 5. Error reporting

| | |
|--|--|
| **Current** | AppErrorBoundary; ActionErrorSummary on certified mutation paths; payment compensating rollback |
| **Evidence** | Orders/Collections/Purchase/Inventory action-feedback verifies; `verify-financial-reconciliation.mjs` |
| **Gap** | Unmapped PG noise; agent offline Partial; no Sentry |
| **Required work** | Operator use of Support Runbook; do **not** invent new mappers in this pack |
| **Effort** | **0** (process) |

### 6. Storage

| | |
|--|--|
| **Current** | Private `invoice-pdfs` + operational evidence buckets; tenant path; signed URLs |
| **Evidence** | `HQ_STORAGE_HEALTH_CHECK.md` QA PASS; policies in phase migrations |
| **Gap** | Prod storage checklist **NOT EXECUTED** |
| **Required work** | Run ST1–ST12 + OE1–OE3 on **prod**; fix 403/orphan via runbook |
| **Effort** | **0.5 day** |

### 7. Invoice PDF generation

| | |
|--|--|
| **Current** | Edge `generate-invoice-pdf`; idempotent `force: true`; client download path |
| **Evidence** | Golden path GP-30–32; `verify-invoice-phase3.mjs` |
| **Gap** | Prod edge deploy + download smoke open |
| **Required work** | Confirm edge deployed on prod; one fulfilled order → download PDF |
| **Effort** | **0.5 day** |

### 8. Environment configuration

| | |
|--|--|
| **Current** | Full Vercel + Supabase checklist template |
| **Evidence** | `HQ_PRODUCTION_ENV_CHECKLIST.md` |
| **Gap** | Template **Not yet executed** |
| **Required work** | Fill every `________` field; disable Predator/QA tools on prod; record tenant UUID |
| **Effort** | **1 day** |

### 9. Backup & Restore

| | |
|--|--|
| **Current** | Runbooks + Sprint 3A restore checklist; WAL-G noted; PITR historically **disabled** on QA ref |
| **Evidence** | `HQ_BACKUP_RECOVERY_RUNBOOK.md` (WARN), `Sprint3A_Restore_Verification_Checklist.md`, DR-01 open |
| **Gap** | **DR drill not executed**; PITR unconfirmed on prod |
| **Required work** | Confirm backups/PITR on prod dashboard; execute restore drill once; record RTO in runbook |
| **Effort** | **1–2 days** (+ Founder approval for restore target) |

### 10. Production migrations

| | |
|--|--|
| **Current** | Track A manifest + Sprint 3A hardening SQL |
| **Evidence** | `HQ_SQL_MIGRATION_MANIFEST.md`, `20260702170000_sprint3a_production_safety_hardening.sql` |
| **Gap** | Prod apply confirmation open; shipment column drift risk (GAP-BP-004) |
| **Required work** | Diff prod schema vs manifest; apply missing migrations in order; re-run RLS + golden path |
| **Effort** | **1 day** |

---

## Critical Workflow Integrity (no redesign)

| Transition | Duplicate protection | Retry / recovery | Failure handling | Ops gap |
|------------|----------------------|------------------|------------------|---------|
| Order create | `client_request_id` (client 90s window) | Cart retain / read-back | Soft fail | Watch slow networks (GAP-BP-016) |
| Fulfill → Inventory | `orders.inventory_updated` / ORDER_OUT RPC | Idempotent RPC | Strong | — |
| Fulfill → Invoice/Shipment | Invoice RPC + shipment unique | Manual | **No fulfill rollback** if invoice/shipment fails | **SOP required** (below) |
| Purchase → Receive | Status + qty UI guards | Manual cancel/edit before receive | **Multi-step JS; no PURCHASE_IN idempotency RPC** | **SOP + single-click discipline**; RPC is P2/P3 engineering — not this pack |
| Collection → Payment | Allocation RPCs + UI inflight | Compensating reverse AR | Strong on golden path | Golden labs only for KPI |
| Payment → Payroll | Preview idempotent; lock immutable | New version on reopen | Domain `paid` only (no bank) | By design |

### Operator SOPs (use existing recovery docs)

1. **Fulfill without invoice/shipment** — Stop further fulfill on same order; create/finalize invoice via Invoice Center; dispatch shipment manually; log incident (`RC1_Recovery_Checklist.md`). Do **not** invent rollback RPCs here (Do-Not-Break F7).
2. **PO receive interrupted** — Do not re-click Receive until stock/ledger/PO status reconciled; use Inventory Movements + PO History; escalate before second receive (`RC1_Support_Runbook.md`).
3. **Payment failure mid-post** — Leave drawer open; rely on compensating path; re-run `verify-financial-reconciliation.mjs`.

---

## Remaining Critical Risks (mapped)

| Audit ID | Risk | Gap type | Priority |
|----------|------|----------|----------|
| P1-1 DR-01 | Restore drill unproven | **Operator** | **P1** |
| P1-2 Fulfill non-atomic | By-design lifecycle | **SOP / train** (no code in this pack) | **P1** (ops) |
| P1-3 PO receive non-transactional | CERT-004 | **SOP** now; transactional RPC = later eng | **P1** (ops) / **P2** (eng) |
| P1-4 Monitoring incomplete | APM not wired | **Config** | **P1** baseline / **P2** Sentry |
| P1-5 Inventory/Purchase unsigned Gold | Human UAT | **Operator** | **P1** |
| P1-6 AR-LEGACY / MON-15 | Non-golden labs | **Scope control** | **P1** |
| P1-7 Prod migrations / RLS / storage | Unexecuted checklists | **Operator** | **P1** |
| MON-14 scale | Perf at 100k | Accept for pilot volume | **P2** |
| Agent offline | No queue | Accept for pilot / later | **P2** |
| No email | By design Year-1 | Customer expectation | **P2** (comms) |
| Procurement `@/` verify | Tooling | CI hygiene | **P3** |

---

## Implementation Plan

### Priority 1 — Must complete before first customer

| # | Work | Owner | Effort | Deliverable |
|---|------|-------|--------|-------------|
| 1 | Execute `HQ_PRODUCTION_ENV_CHECKLIST.md` on prod | Eng | 1d | Filled checklist |
| 2 | Confirm backups + run `Sprint3A_Restore_Verification_Checklist.md` | Eng + Founder | 1–2d | Dated DR evidence in backup runbook |
| 3 | Prod RLS smoke (`verify-hq-rls-reads.mjs`) + migration manifest confirm | Eng | 1d | Pass log attached |
| 4 | Prod storage + invoice PDF smoke (`HQ_STORAGE_HEALTH_CHECK.md`) | Eng | 0.5d | ST/OE + one PDF download |
| 5 | Sign Inventory + Purchase browser UAT / sign-off templates | Product + Eng | 0.5–1d | Signed Gold or explicit waiver |
| 6 | Golden-lab-only KPI rule + customer “no email” expectation brief | Ops + Founder | 0.25d | Written pilot scope |
| 7 | Brief ops on fulfill/receive SOPs + `RC1_Recovery_Checklist.md` | Ops | 0.25d | Training complete |
| 8 | Capture monitoring baseline (verify scripts + console); document halt rule | Eng | 0.5d | Baseline note |

**No application feature commits required for P1.**

### Priority 2 — Recommended before production GA

| # | Work | Effort |
|---|------|--------|
| Wire `VITE_SENTRY_DSN` / uptime / alert webhook per `HQ_MONITORING_PLAN.md` | 1–2d |
| MON-14/15 waive or fix | Sprint |
| Enable PITR if plan allows | Vendor + cost |
| Lab checkout server-side idempotency TTL (GAP-BP-016) | Eng (API — Founder approval) |
| PURCHASE_IN transactional RPC (CERT-004) | Eng (schema/RPC — Founder approval) |
| Agent offline queue | Eng (feature — deferred unless elevated) |

### Priority 3 — After launch

| # | Work |
|---|------|
| Fix `verify-procurement-inventory-flow.mjs` `@/` Node import (tooling) |
| External log drain |
| Universal audit coverage gaps |
| Explainability cards / Supplier Master / Distributor OS — **explicitly out of scope** |

---

## Files Affected (this execution pack)

| Path | Change |
|------|--------|
| `docs/operations/V1_Operational_Readiness_Execution.md` | **This document** |
| `docs/operations/V1_First_Customer_Operational_Gate.md` | Executable P1 checklist |
| `docs/operations/V1_Critical_Workflow_Recovery_SOP.md` | Fulfill / receive / payment recovery |
| `scripts/verify-operational-readiness-pack.mjs` | Static evidence pack gate |
| Blueprint `14_Release_Gates.md`, `CHANGELOG.md` | Pointer + status |

**Application source:** unchanged.

---

## Verification Plan

```bash
cd primecare-portal
npm run build
node scripts/verify-operational-readiness-pack.mjs
node scripts/verify-rc1-production-readiness.mjs
node scripts/verify-production-monitoring.mjs   # expect MON-14/15 WARN/FAIL known
node scripts/verify-hq-rls-reads.mjs            # on target env
node scripts/verify-invoice-phase3.mjs --remote # when targeting remote
node scripts/verify-primecare-production-golden-path.mjs
node scripts/verify-no-finance-mutation.mjs
```

**Known exclusions (not failures of this pack):**

- `verify-procurement-inventory-flow.mjs` `@/` Node import — pre-existing tooling
- MON-14 / MON-15 — documented pilot waivers with golden-lab scope

---

## Manual Validation Checklist

See companion: [`V1_First_Customer_Operational_Gate.md`](./V1_First_Customer_Operational_Gate.md).

---

## Explicit Non-Goals

- No new modules, ERP pages, dashboards  
- No Supplier Management / Distributor OS / CRM expansion  
- No UI refactor  
- No change to fulfill rollback policy, PURCHASE_IN semantics, or finance posting without Founder approval + blueprint update  

---

## Certification / Launch Recommendation

| Audience | Verdict |
|----------|---------|
| Supervised first customer | **CONDITIONAL GO** after Priority 1 gate checklist signed |
| Unrestricted GA | **NO-GO** until DR + monitoring GA items + MON-14/15 |

**STOP.** Execute operator gates. Do not resume feature development.
