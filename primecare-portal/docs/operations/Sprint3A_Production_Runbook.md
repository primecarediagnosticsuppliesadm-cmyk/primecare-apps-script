# Sprint 3A Production Runbook

**Version:** 2026-07-02  
**Scope:** PrimeCare HQ Portal — first paying customer cutover  
**Sprint 3A closes:** P0 security, reliability UX, migration manifest, observability framework, DR checklists

---

## 1. Release train

| Step | Action | Script / doc |
|------|--------|--------------|
| 1 | Merge `qa` → release branch | Git |
| 2 | Apply SQL Track A or B (one track only) | `Sprint3A_Migration_Manifest.md` |
| 3 | Apply Sprint 3A security migration | `20260702170000_sprint3a_production_safety_hardening.sql` |
| 4 | Deploy edge functions | `docs/supabase-functions-deploy.md` |
| 5 | Rebuild projections | `rebuild-sprint2-phase2-projections.mjs` |
| 6 | Run full cert bundle | §3 below |
| 7 | Deploy Vercel production | `HQ_PRODUCTION_ENV_CHECKLIST.md` |
| 8 | Human UAT sign-off | `HQ_UAT_SIGNOFF.md` |

---

## 2. Environment invariants (Production)

| Variable | Required value |
|----------|----------------|
| `VITE_APP_ENV` | `prod` |
| `VITE_ENABLE_LEGACY_APPS_SCRIPT` | `false` |
| `VITE_READ_ADAPTER_*` | **unset or false** (all OFF) |
| `VITE_QA_*` | **false** |
| `VITE_PREDATOR_*` | **false** |
| `VITE_SENTRY_DSN` | set when vendor wired (placeholder OK for pilot with manual ops) |

---

## 3. Certification bundle (must PASS)

```bash
cd primecare-portal
npm run build
node scripts/verify-hq-rls-reads.mjs
node scripts/verify-security-hardening.mjs
node scripts/verify-projection-parity.mjs
node scripts/verify-dashboard-projection-parity.mjs
node scripts/verify-executive-projection-parity.mjs
node scripts/verify-projection-staleness.mjs
node scripts/verify-financial-reconciliation.mjs
node scripts/verify-logistics-dispatch-flow.mjs
node scripts/verify-orders-admin-flow.mjs
node scripts/verify-payment-allocation-flow.mjs
node scripts/run-projection-ops-certification.mjs
node scripts/verify-migration-integrity.mjs
node scripts/verify-observability.mjs
node scripts/verify-production-readiness.mjs
```

---

## 4. Incident response

| Severity | Action |
|----------|--------|
| P0 security | Disable affected edge function; rotate service role; forward-fix SQL |
| P0 data | Initiate restore drill checklist; comms within 1h |
| P1 perf | Keep adapter flags OFF; rebuild projections; monitor staleness |
| P2 drift | Run financial recon; document in QA Gap Register |

**Rollback:** `Sprint3A_Deployment_Rollback_Verification.md`

---

## 5. Monitoring (Sprint 3A framework)

- Client health payload: `src/observability/healthEndpoint.js`
- Structured logs: `logStructured()` with correlation ID
- Projection ops: Projection Operations Center (Executive, QA flag)
- External vendor wiring: `HQ_MONITORING_PLAN.md` (Sentry, uptime probe — post-Sprint 3A)

---

## 6. Open items after Sprint 3A (not P0)

- Production Supabase project provisioning
- Signed UAT + launch checklist
- Sentry + paging live test
- PITR enablement on Production plan
- 14-day projection shadow before adapter flag flip

---

## 7. Contacts

| Role | Responsibility |
|------|----------------|
| Release Captain | Go/No-Go |
| Architect | Schema + cert exceptions |
| SRE | Backup/restore + monitoring |
