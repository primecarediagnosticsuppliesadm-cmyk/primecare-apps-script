# RC1 Recovery Checklist

Use after incident, bad deploy, or data corruption event.

---

## Immediate (0–15 min)

- [ ] Stop further writes if finance integrity unknown (notify admins)
- [ ] Identify scope: tenant, labs, orders, invoices, payments affected
- [ ] Check Vercel deployment version vs last known-good
- [ ] Check Supabase status page

---

## Assessment (15–60 min)

- [ ] Run read-only: `verify-financial-reconciliation.mjs`
- [ ] Run read-only: `verify-ar-reconcile.mjs`
- [ ] Compare golden lab `QA_LAB_001` — must be clean
- [ ] Export affected invoice/payment IDs

---

## Recovery Options

### A — App-only rollback
- [ ] Follow `RC1_Rollback_Plan.md` Vercel section
- [ ] Re-run golden path on QA before prod retry

### B — Data fix (forward)
- [ ] Use app APIs / RPCs only — no ad-hoc SQL without approval
- [ ] Payment allocation: use `createPaymentWrite` compensating path
- [ ] Document fix in incident log

### C — Database restore
- [ ] Founder approval required
- [ ] Follow `Sprint3A_Restore_Verification_Checklist.md`
- [ ] Record restore point timestamp
- [ ] Re-apply migrations if needed (manifest order)

---

## Validation (post-recovery)

- [ ] `verify-primecare-production-golden-path.mjs` PASS
- [ ] `verify-financial-reconciliation.mjs` PASS/WARN only
- [ ] Admin + executive smoke login
- [ ] Pilot customer notified

---

## Post-Mortem

- [ ] Update `RC1_Known_Issues.md`
- [ ] Add verify script if gap found
- [ ] Schedule DR drill if restore was needed
