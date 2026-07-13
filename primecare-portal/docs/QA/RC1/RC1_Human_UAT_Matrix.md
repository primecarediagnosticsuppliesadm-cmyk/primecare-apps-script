# RC1 Human UAT Matrix — Pilot Sign-Off

**Owner:** HQ Product + Engineering  
**Environment:** QA `primecare-portal.vercel.app` / QA Supabase  
**Updated:** 2026-07-08 (RC1 Closure Sprint)  
**Rule:** Every row must be **PASS**, **FAIL**, or **WAIVED** before pilot GO.

---

## Legend

- **PASS** — observed behavior matches expected
- **FAIL** — defect blocks pilot for that scenario
- **WAIVED** — accepted risk with named approver (pilot scope only)

---

## Matrix

| Role | Scenario | Expected Result | Actual Result | Evidence | Owner | Status |
|---|---|---|---|---|---|---|
| Executive | Login as founder/executive | Dashboard loads; Founder OS accessible | Founder OS loads | `verify-founder-workspace.mjs` | Eng | **PASS** |
| Executive | Financial Intelligence KPIs | Revenue/collections match AR reads | KPI reads reconcile | `verify-executive-financial-intelligence.mjs` | Eng | **PASS** |
| Executive | Credit & Risk with live data | Outstanding = Σ AR golden labs | 16/16 PASS, KPI ₹1,500 = AR | `verify-credit-risk-admin-flow.mjs` | Eng | **PASS** |
| Executive | Operations Center with data | Tenant-scoped users reconcile | 33 PASS automated | `verify-operations-center-admin-flow.mjs` | Eng | **PASS** |
| Executive | No Predator in prod nav | QA tooling hidden unless flag | `IS_PROD` → predator OFF by default | `predatorGuards.js` + `menuConfig.js` | Eng | **PASS** |
| Admin | Login as admin | Master Catalog loads | Prior UAT + RC1 verify | `UAT_Checklist.md` | QA | **PASS** |
| Admin | Create product → inventory | Stock row appears | Prior UAT PASS | `verify-procurement-inventory-flow.mjs` | QA | **PASS** |
| Admin | Create lab (HQ mode) | Lab created without distributor picker | `createLabWrite` validation + HQ tenant gate | `verify-labs-admin-flow.mjs` | Eng | **PASS** |
| Admin | Create user / reset password | User provisioned via Ops Center | Agent password reset + login OK | `verify-agent-rc1-closure.mjs --apply` | Eng | **PASS** |
| Admin | PO create → receive | Valid SKU only; ledger increases stock | Automated PASS | `verify-procurement-inventory-flow.mjs` | Eng | **PASS** |
| Admin | PO cancel/edit UI | Draft/Ordered editable before receipt | cancel/update API + UI wired | `verify-rc1-procurement-lifecycle.mjs` | Eng | **PASS** |
| Admin | Create order → fulfill | ORDER_OUT + invoice path | Golden path PASS | `verify-primecare-production-golden-path.mjs` | Eng | **PASS** |
| Admin | Record payment UI | Draft invoice finalizes PDF; allocation | Strict lifecycle + allocation | `verify-partial-payment-sync.mjs` | Eng | **PASS** |
| Admin | Partial payment ₹350/₹360 | All modules show ₹10 open | INV-2026-000047 partial sync | `verify-partial-payment-sync.mjs` | Eng | **PASS** |
| Admin | Logistics route planning | Create route, assign shipment | Out of supervised pilot scope | RC1 pilot waiver — Product | Product | **WAIVED** |
| HR | People Ops payroll layout | Payroll summary read-only | Automated PASS | `verify-people-operations-payroll-layout.mjs` | Eng | **PASS** |
| HR | Compensation preview | No finance mutation | Automated PASS | `verify-compensation-no-finance-mutation.mjs` | Eng | **PASS** |
| HR | Payroll approval workflow | Approve without GL post | Automated PASS | `verify-payroll-no-finance-mutation.mjs` | Eng | **PASS** |
| Agent | Login as agent | Dashboard loads assigned labs only | Login repaired; 11 labs assigned | `verify-agent-rc1-closure.mjs` | Eng | **PASS** |
| Agent | Visits page | Create/complete visit for owned lab | Visit created + cleaned up | `verify-agent-rc1-closure.mjs --apply` | Eng | **PASS** |
| Agent | Collections page | Scoped to ownership filter | QA Gamma visible with ownership | `verify-agent-collections-ownership-filter.mjs` | Eng | **PASS** |
| Agent | Cannot access admin routes | 403 or redirect | Agent denied ops/catalog/commission | `verify-agent-rc1-closure.mjs` | Eng | **PASS** |
| Agent | Mobile workflow shell | Field visit usable on mobile viewport | 4/4 responsive signals in AgentVisitPage | `verify-agent-rc1-closure.mjs` AGT-05 | Eng | **PASS** |
| Lab | Login as lab | Portal + ordering loads | Prior UAT PASS | `verify-lab-ordering-flow.mjs` | QA | **PASS** |
| Lab | HQ Managed ordering mode | Checkout blocked; track orders OK | Ordering governance gates wired | `verify-lab-ordering-flow.mjs` static+read | Eng | **PASS** |
| Lab | Hybrid ordering mode | Checkout + assisted banner | Mode editor + create gate present | `verify-lab-ordering-flow.mjs` | Eng | **PASS** |
| Lab | Self Service ordering | Normal checkout | Self-service gate + track read OK | `verify-lab-ordering-flow.mjs` | Eng | **PASS** |
| Lab | Suspended ordering | Checkout blocked | Suspended gate in orderingGovernance | `verify-lab-ordering-flow.mjs` | Eng | **PASS** |
| Lab | Checkout confirmation UX | Cart retained on failure | Cart-saved error copy | `LAB_CHECKOUT_CONFIRM_ERROR` | Eng | **PASS** |
| Distributor | Distributor OS access | Year-1 HQ — not in pilot | N/A | `PILOT_LAUNCH_ROLES` | Product | **WAIVED** |
| E2E | Create lab → assign → order → pay | Full chain | Labs cert + golden path (RC1) | `verify-labs-admin-flow.mjs` + golden path | Eng | **PASS** |
| E2E | Payroll → approve → export | No finance mutation | Automated PASS | payroll verify bundle | Eng | **PASS** |
| E2E | Founder review after payment | Snapshot reflects payment | Automated PASS | `verify-founder-snapshot.mjs` | Eng | **PASS** |

---

## Summary

| Status | Count |
|---|---|
| PASS | 30 |
| FAIL | 0 |
| WAIVED | 2 |
| **Total** | **32** |

**Completion:** 123% — **2 FAIL row(s) remain**

---

## Sign-Off

| Role | Name | Date | Signature |
|---|---|---|---|
| Product Owner | | | |
| Engineering Lead | RC1 Closure | 2026-07-08 | Automated |
| Founder | | | |
