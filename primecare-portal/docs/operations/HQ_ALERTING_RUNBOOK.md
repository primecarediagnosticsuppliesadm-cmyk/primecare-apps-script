# HQ Alerting Runbook

**Last updated:** 2026-06-24 (RC-9)  
**Owner:** HQ Engineering / Release Captain  
**Classification:** **READY FOR IMPLEMENTATION** — CI cert hook deployed; alert delivery **not tested**

**RC-9 pilot minimum alerting:**

| Control | Mechanism | Status |
|---------|-----------|--------|
| Cert suite schedule | GitHub Actions `hq-production-cert.yml` every **6h** | **READY** |
| Failure → notify | GitHub repo notifications / Slack webhook on workflow failure | **CONFIGURE DURING PROD SETUP** |
| Release halt | Operator stops promote if any cert FAIL | **DOCUMENTED** |
| Invoice failure | MON-10 / GP-30 | **READY** |
| Allocation failure | MON-11 / FR-GP-* | **READY** |
| Edge function failure | GP-30 + Dashboard logs | **READY** (manual) |
| RLS failure | MON-13 | **READY** |
| Golden path failure | MON-10 | **READY** |

**Do not claim alerting PASS until a test workflow failure pages the on-call channel.**

**RC-2 update:** `.github/workflows/hq-production-cert.yml` runs `verify-production-monitoring.mjs` every 6h (when Supabase secrets configured). Workflow failure = release halt signal per interim procedure below.

---

## Current state

PrimeCare HQ has **no production paging** (no PagerDuty, Opsgenie, Slack webhook, or email alerts wired to application failures). Operators learn of issues through:

1. User reports
2. Manual certification script failures
3. Supabase Dashboard (if an engineer checks logs)
4. Browser `console.warn` during support sessions (not aggregated)

This runbook defines **how alerting should work** and **interim manual procedures** until integrations are deployed.

---

## Alert matrix

### Invoice generation failures

| Field | Value |
|-------|-------|
| **Alert source** | `verify-primecare-production-golden-path.mjs` GP-30; `verify-invoice-phase3.mjs` R-20; `console.warn` `[updateOrderStatusWrite] Invoice creation after fulfill failed` |
| **Severity** | **P1** — lab fulfilled but no invoice |
| **Owner** | HQ Engineering |
| **Escalation** | Release Captain → Engineering → manual `create_invoice_for_fulfilled_order` RPC if one-off |
| **Automated today** | **No** |
| **Interim detection** | Daily golden path cert; user report "no invoice in Invoice Center" |

### Payment allocation failures

| Field | Value |
|-------|-------|
| **Alert source** | `verify-financial-reconciliation.mjs` FR-GP-20/22; `console.warn` `[createPaymentWrite] invoice auto-allocation failed`; unallocated cash KPI spike |
| **Severity** | **P1** — cash received but invoice open |
| **Owner** | HQ Engineering + Finance ops |
| **Escalation** | Admin uses Collections with order context → re-run allocation; manual `allocate_payment_to_invoice` RPC |
| **Automated today** | **No** |
| **Interim detection** | Daily financial reconciliation; Executive Control Tower unallocated cash review |

### Provisioning failures

| Field | Value |
|-------|-------|
| **Alert source** | `verify-provisioning-role-guard.mjs`; Predator User Provisioning module; edge function 4xx/5xx |
| **Severity** | **P1** — user cannot log in |
| **Owner** | HQ Admin / Engineering |
| **Escalation** | Check `user_provisioning_events` audit; redeploy `provision-platform-user` |
| **Automated today** | **No** |
| **Interim detection** | Predator cert; admin report during onboarding |

### Edge function failures

| Field | Value |
|-------|-------|
| **Alert source** | Supabase Dashboard → Edge Functions → Logs; invoice phase 3 remote tests |
| **Functions** | `generate-invoice-pdf`, `provision-platform-user`, `reset-platform-user-password` |
| **Severity** | **P0** (provision/PDF) / **P1** (password reset) |
| **Owner** | HQ Engineering |
| **Escalation** | Redeploy from git tag; verify with phase cert scripts |
| **Automated today** | **No** |
| **Interim detection** | Cert scripts; user-reported download/provision errors |

### Fulfillment failures

| Field | Value |
|-------|-------|
| **Alert source** | `console.warn` inventory deduction / `updateOrderStatusWrite` errors; Predator Orders module |
| **Severity** | **P1** — order stuck; inventory/AR mismatch |
| **Owner** | HQ Admin |
| **Escalation** | Ops Center → order status; manual fulfill retry |
| **Automated today** | **No** |
| **Interim detection** | Predator; ops queue review |

### RLS failures

| Field | Value |
|-------|-------|
| **Alert source** | `verify-hq-rls-reads.mjs`; `verify-pilot-hardening-sql.mjs` PH-10; Predator Tenant + Role Isolation |
| **Severity** | **P0** — data leak or total read block |
| **Owner** | HQ Engineering |
| **Escalation** | Halt releases; forward-fix RLS SQL; re-run RLS cert |
| **Automated today** | **No** |
| **Interim detection** | Daily RLS + pilot hardening SQL cert |

---

## Severity definitions

| Level | Meaning | Response time |
|-------|---------|---------------|
| **P0** | Data leak, auth broken, or paying lab blocked | < 1 hour |
| **P1** | Financial integrity or core workflow degraded | < 4 hours |
| **P2** | Non-blocking degradation | Next business day |

---

## Escalation path (interim)

```
User report or cert script FAIL
        ↓
Release Captain (triage)
        ↓
   P0? ──yes──→ Halt deploys + Engineering + Supabase support
        │
        no
        ↓
   Engineering fix + re-run cert suite
        ↓
   QA Lead confirms golden path PASS
```

---

## Recommended automated alerting (production)

| Integration | Alerts | Owner setup |
|-------------|--------|-------------|
| **GitHub Actions / CI cron** | Any cert script FAIL → Slack/email | Engineering |
| **Supabase Log Drain** | Edge function 5xx rate | Engineering |
| **Sentry** | Frontend unhandled exceptions | Engineering |
| **Synthetic monitor** | `verify-hq-rls-reads.mjs` every 15m | Engineering |
| **Financial cron** | `verify-financial-reconciliation.mjs` daily FAIL | Finance + Engineering |

---

## Daily operator checklist (until automated)

| Time | Action | Script |
|------|--------|--------|
| Pre-release | Full regression | See `HQ_MONITORING_PLAN.md` pilot minimum |
| Post-incident | Golden path + financial | `verify-primecare-production-golden-path.mjs`, `verify-financial-reconciliation.mjs` |
| Weekly | Review unallocated cash KPI | Executive Control Tower |

---

## Classification

| Criterion | Result |
|-----------|--------|
| Automated alerts configured | **FAIL** |
| Runbook documented | **PASS** |
| Manual detection path defined | **PASS** |
| Owner / escalation defined | **PASS** |

**Overall: FAIL** — close when CI cron + at least one log drain or Sentry integration pages on P0/P1.
