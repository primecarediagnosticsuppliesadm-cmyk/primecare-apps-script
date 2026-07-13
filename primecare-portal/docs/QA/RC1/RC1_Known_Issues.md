# RC1 Known Issues

**Release:** PrimeCare RC1 (Release Candidate 1)  
**Updated:** 2026-07-08 (Closure Sprint)

---

## Resolved (Closure Sprint)

| ID | Issue | Resolution | Evidence |
|---|---|---|---|
| UAT-AGENT-01 | Agent login invalid credentials | Password repaired via `reset-platform-user-password` | `verify-agent-rc1-closure.mjs` |
| UAT-ADMIN-01 | Create lab UAT open | `createLabWrite` HQ validation certified | `verify-labs-admin-flow.mjs` |
| UAT-ADMIN-02 | Record payment UAT open | Strict lifecycle + partial payment sync | `verify-partial-payment-sync.mjs` |
| UAT-PAY-01 | Partial payment lifecycle | PPS-30 PASS on INV-2026-000047 | `verify-partial-payment-sync.mjs` |
| UAT-PO-01 | PO cancel/edit UAT open | API + UI wired | `verify-rc1-procurement-lifecycle.mjs` |
| UAT-LAB-01 | Lab ordering modes | Governance gates certified | `verify-lab-ordering-flow.mjs` |
| UAT-AGENT-02 | Agent visits + mobile | Visit create + responsive shell | `verify-agent-rc1-closure.mjs --apply` |

---

## Open (Non-Blocking for Supervised Pilot)

| ID | Issue | Workaround | Target |
|---|---|---|---|
| OPS-BOUNDED | Provisioning events exceed 200-row read cap | Does not affect pilot ops | RC1.1 |
| MON-15 | Predator legacy collection rows on non-golden labs | Restrict KPI sign-off to golden labs | RC1.1 |
| MON-14 | Perf scale — orders/payments unbounded at 100k | Single-HQ pilot volume low | RC1.1 |
| DR-01 | Backup restore drill not executed on prod | QA golden path only until drill | Pre-prod GA |
| GAP-008 | Legacy Apps Script error logging | Ignore console noise | Post-pilot |
| AR-LEGACY | Legacy AR drift on non-golden labs | Exclude from executive KPI sign-off | Backfill sprint |
| LOGISTICS | Route planning not in pilot scope | HQ manual dispatch | Phase 10 |

---

## Waived (Pilot Scope)

- Distributor OS (Year-1 HQ)
- Logistics route planning UI (supervised manual dispatch)
- Enterprise multi-tenant executive cross-reads

---

## Reporting Defects

1. Log in QA with repro steps
2. Tag `RC1` + module area
3. Attach verify script output
4. Update this file and `RC1_Human_UAT_Matrix.md`
