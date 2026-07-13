# RC1 Production Checklist

Use before promoting RC1 to **production** Supabase + Vercel prod alias.

---

## Pre-Deploy

- [ ] `npm run build` PASS
- [ ] `node scripts/audit-rc1-certification.mjs` PASS or CONDITIONAL GO with waivers documented
- [ ] Human UAT matrix ≥90% PASS (or waivers signed)
- [ ] `RC1_Known_Issues.md` reviewed by Product + Founder
- [ ] Production env vars verified (no `/rest/v1` in URL)
- [ ] Sprint 3A hardening migration applied on prod
- [ ] RLS policies spot-checked on prod (admin, agent, lab)
- [ ] Backup enabled; PITR confirmed with Supabase
- [ ] Restore drill executed once (document date in runbook)

---

## Deploy

- [ ] Deploy Vercel production from signed RC1 commit/tag
- [ ] Smoke: executive login → Founder OS loads
- [ ] Smoke: admin login → orders + inventory
- [ ] Smoke: golden path script on prod (or read-only recon if writes disallowed)
- [ ] Monitoring: error rate baseline captured

---

## Post-Deploy (24h)

- [ ] No new Critical gaps in support channel
- [ ] Financial reconciliation WARN only (no FAIL on golden labs)
- [ ] Payroll/compensation still read-only (no GL posts)
- [ ] Predator hidden from prod navigation
- [ ] Update `RC1_GO_NO_GO.md` with production sign-off

---

## Rollback Ready

- [ ] Previous Vercel deployment ID recorded
- [ ] `RC1_Rollback_Plan.md` accessible to on-call
- [ ] `RC1_Recovery_Checklist.md` printed or bookmarked

---

## Owners

| Area | Owner |
|---|---|
| Deploy | Engineering |
| UAT sign-off | Product |
| Finance cert | Founder / Finance |
| Support | Operations |
