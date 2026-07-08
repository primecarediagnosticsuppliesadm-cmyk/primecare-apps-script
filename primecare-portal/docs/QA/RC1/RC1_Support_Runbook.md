# RC1 Support Runbook

**On-call:** Engineering + HQ Admin  
**Environments:** QA `primecare-portal.vercel.app` | Prod aliases per `QA_Gap_Register.md`

---

## Severity Definitions

| Level | Examples | Response |
|---|---|---|
| S1 | Login down, payment mis-allocated, cross-tenant leak | Immediate rollback eval |
| S2 | Order fulfill fail, invoice PDF fail, agent cannot collect | Fix within 4h |
| S3 | UI glitch, stale KPI, non-golden lab AR drift | Next business day |

---

## Common Issues

### Admin cannot login
1. Check `VITE_SUPABASE_URL` (no `/rest/v1`)
2. Verify `resolve_login_email` RPC on DB (GAP-003)
3. Check `profiles` grants (GAP-005)
4. Reset via `reset-platform-user-password` edge function

### Payment recorded but AR wrong
1. Check invoice status (draft vs sent) — GAP-021
2. Run `node scripts/verify-financial-reconciliation.mjs`
3. Verify `invoice_payment_allocations` row exists
4. Do **not** manual SQL update without founder approval

### Order fulfilled but stock wrong
1. Check `ORDER_OUT` ledger via `verify-orders-admin-flow.mjs`
2. Re-fulfill blocked if already fulfilled (idempotent RPC)

### Agent sees wrong labs
1. Verify `lab_ownership` ACTIVE rows
2. Run `verify-agent-collections-ownership-filter.mjs`

### Executive KPI mismatch
1. Restrict check to golden labs
2. Run `verify-credit-risk-admin-flow.mjs`
3. Legacy drift: see `verify-collection-inconsistencies.mjs`

### Payroll export concern
1. Confirm preview-only — no bank disbursement
2. Run `verify-payroll-no-finance-mutation.mjs`

---

## Diagnostic Commands

```bash
cd primecare-portal
npm run build
node scripts/verify-primecare-production-golden-path.mjs
node scripts/verify-financial-reconciliation.mjs
node scripts/audit-rc1-certification.mjs
```

Requires `.env.local` with QA credentials.

---

## Escalation

1. Capture: tenant ID, user role, lab ID, order/invoice ID, timestamp
2. Attach verify script output
3. Engineering → Founder for finance/RLS changes

---

## References

- `docs/operations/Sprint3A_Production_Runbook.md`
- `docs/QA/RC1/RC1_Known_Issues.md`
- `docs/QA/RC1/RC1_Rollback_Plan.md`
- `docs/QA/RC1/RC1_Recovery_Checklist.md`
