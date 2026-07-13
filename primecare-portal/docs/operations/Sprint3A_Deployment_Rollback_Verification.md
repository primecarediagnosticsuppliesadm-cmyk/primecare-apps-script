# Sprint 3A Deployment Rollback Verification

**Owner:** Release Captain  
**Related:** `HQ_PRODUCTION_ROLLBACK_PLAN.md`

---

## Pre-deploy

- [ ] Tag git: `hq-release-YYYY-MM-DD`
- [ ] Note current Vercel production deployment ID
- [ ] Confirm all `VITE_READ_ADAPTER_*` flags OFF in prod env
- [ ] Confirm `VITE_QA_*` and `VITE_PREDATOR_*` flags OFF in prod env

## Rollback rehearsal (QA or staging)

### UI rollback (fastest)

1. [ ] Deploy intentionally broken build to QA preview (or use prior deployment)
2. [ ] Promote previous known-good Vercel deployment
3. [ ] Verify build stamp reverts within 5 minutes
4. [ ] Run smoke: Admin login + Dashboard load

### Flag rollback (no redeploy)

1. [ ] Toggle `VITE_HQ_ADMIN_FROZEN=true` if write incident
2. [ ] Confirm write surfaces blocked in UI

### SQL forward-fix (preferred over destructive rollback)

1. [ ] Document forward-fix SQL path for Sprint 3A migration
2. [ ] Never drop projection tables in rollback — rebuild via `rebuild_projection_v1`

## Post-rollback verification

- [ ] `verify-hq-rls-reads.mjs` PASS
- [ ] `verify-financial-reconciliation.mjs` — document WARN only (no new FAIL)
- [ ] Customer comms template ready (see Production Runbook)

## Pass criteria

Rollback to prior Vercel deployment completes in **≤ 5 minutes** with golden path PASS on QA.
