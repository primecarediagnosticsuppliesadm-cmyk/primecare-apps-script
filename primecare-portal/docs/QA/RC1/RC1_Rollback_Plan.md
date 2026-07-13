# RC1 Rollback Plan

**Applies to:** PrimeCare RC1 deploy (Vercel + Supabase)  
**RTO target:** 30 minutes (app); 4 hours (data — depends on Supabase PITR)

---

## Triggers

- Golden path FAIL on production after deploy
- RLS breach or cross-tenant data exposure
- Payment allocation regression
- Auth/login outage affecting all pilot users
- Founder decision: pilot abort

---

## Application Rollback (Vercel)

1. Open Vercel project `primecare-portal` (or prod alias)
2. Deployments → select last known-good deployment (pre-RC1 tag)
3. Promote to Production
4. Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` unchanged
5. Smoke test: admin login, orders list, golden lab invoice read

**Evidence:** `docs/operations/Sprint3A_Deployment_Rollback_Verification.md`

---

## Database Rollback

RC1 introduces **no new schema** in this certification sprint. If a migration was applied separately:

1. Do **not** drop tables in production without founder approval
2. Prefer **forward fix** for data issues
3. For catastrophic migration failure:
   - Restore from Supabase backup (point-in-time if enabled)
   - Follow `docs/operations/Sprint3A_Restore_Verification_Checklist.md`

---

## Feature Flags

| Flag | Rollback action |
|---|---|
| Projection adapters | Keep OFF (`readProjectionFlags.js` shadow mode) |
| Predator / QA tools | Disable via `qaValidation.js` flags |
| Pilot launch roles | Revert `PILOT_LAUNCH_ROLES` only if auth lockout |

---

## Communication

1. Notify pilot customers within 15 minutes of rollback decision
2. Post incident channel: scope, ETA, workaround
3. Log root cause in `RC1_Known_Issues.md`

---

## Post-Rollback Verification

```bash
node scripts/verify-primecare-production-golden-path.mjs
node scripts/verify-financial-reconciliation.mjs
```

---

## Sign-Off

Rollback authority: Founder + Engineering Lead
