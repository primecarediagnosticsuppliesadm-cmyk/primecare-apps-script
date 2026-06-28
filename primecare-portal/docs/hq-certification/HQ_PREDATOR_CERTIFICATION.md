# HQ Predator Certification

**Generated:** 2026-06-28T21:02:38.549Z
**Environment:** https://zipuzmfkwwucbchlphcj.supabase.co
**Actor:** qa.executive@primecare.test
**Duration:** 25479 ms

**Executive visibility:** VERIFIED INTENTIONAL — HQ Executive reads registered distributor tenants via RLS (`predatorChecks.executiveCrossTenantOpts`). Guntur in collections is expected when `787999b9-…` exists in `public.tenants`. Prior FAIL was certification harness without Vite session (empty tenant registry), not a loader defect.

## Result: FAIL

### Batch summary

- Status: FAIL
- Pass: 340
- Warn: 22
- Fail: 2
- Modules run: 32

### Required modules

| module | status | pass | warn | fail |
| --- | --- | --- | --- | --- |
| User Provisioning | PASS | 12 | 0 | 0 |
| Lab Ownership | PASS | 7 | 0 | 0 |
| Executive Action Queue | PASS | 8 | 0 | 0 |
| Tenant + Role Isolation | PASS | 72 | 0 | 0 |
| Revenue Funnel | PASS | 12 | 0 | 0 |
| Orders | PASS | 8 | 0 | 0 |
| Collections | WARN | 4 | 1 | 0 |
| Inventory Economics | PASS | 6 | 0 | 0 |

### Full module matrix

| module | status | pass | warn | fail |
| --- | --- | --- | --- | --- |
| Admin Dashboard | WARN | 5 | 1 | 0 |
| Collections | WARN | 4 | 1 | 0 |
| Lab Portal | FAIL | 2 | 1 | 2 |
| Qualification Analytics | WARN | 3 | 3 | 0 |
| Agent Visits | WARN | 5 | 1 | 0 |
| Tenant + Role Isolation | PASS | 72 | 0 | 0 |
| Notifications | PASS | 2 | 0 | 0 |
| Operational Evidence | PASS | 7 | 0 | 0 |
| Operations Center | PASS | 8 | 0 | 0 |
| Executive Intervention | WARN | 10 | 2 | 0 |
| Executive Action Queue | PASS | 8 | 0 | 0 |
| Operational Tasks | PASS | 4 | 0 | 0 |
| Operational Event Ledger | WARN | 7 | 1 | 0 |
| Executive Intelligence | PASS | 16 | 0 | 0 |
| Pilot Readiness | WARN | 12 | 1 | 0 |
| Founder Navigation | WARN | 9 | 1 | 0 |
| Founder Strategy | PASS | 12 | 0 | 0 |
| Founder Financial Intelligence | PASS | 7 | 0 | 0 |
| Tenant Foundation | WARN | 13 | 1 | 0 |
| Distributor Workspace | PASS | 13 | 0 | 0 |
| Distributor Provisioning | WARN | 22 | 2 | 0 |
| User Provisioning | PASS | 12 | 0 | 0 |
| Lab Ownership | PASS | 7 | 0 | 0 |
| Commission Engine | WARN | 12 | 2 | 0 |
| Lab Contract Engine | PASS | 19 | 0 | 0 |
| Distributor Billing | WARN | 10 | 5 | 0 |
| Inventory Economics | PASS | 6 | 0 | 0 |
| Inventory Tenant Safety | PASS | 3 | 0 | 0 |
| Distributor Profitability | PASS | 5 | 0 | 0 |
| QA Readiness | PASS | 5 | 0 | 0 |
| Revenue Funnel | PASS | 12 | 0 | 0 |
| Distributor OS | PASS | 8 | 0 | 0 |
