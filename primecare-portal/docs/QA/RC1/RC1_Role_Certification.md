# RC1 Role Certification

**Date:** 2026-07-08  
**Script:** `scripts/verify-role-certification.mjs`  
**Source of truth:** `src/config/rolePermissionMatrix.js`, `src/config/menuConfig.js`

---

## Pilot Launch Roles

`PILOT_LAUNCH_ROLES`: executive, admin, hr, agent, lab

Distributor roles exist in matrix but are **not** in pilot launch set (Year-1 HQ mode).

---

## Role Matrix

| Role | Navigation | Permissions | RLS | CRUD | Workflows | Reports | Dashboards | Cert Status |
|---|---|---|---|---|---|---|---|---|
| **Founder (Executive)** | PASS | PASS | PASS | Read-compose | PASS | PASS | Founder OS + FI | **GO** (automated) |
| **Executive** | PASS | PASS | PASS | Read-compose | PASS | PASS | Control tower | **GO** (automated) |
| **Admin** | PASS | PASS | PASS | PASS (core) | PASS | PASS | Admin dashboard | **CONDITIONAL** — manual UAT gaps |
| **HR** | PASS | PASS | PASS | Payroll preview | PASS | Partial | People Ops | **GO** (automated) |
| **Agent** | WARN | PASS | PASS | Visits/collections | WARN | PASS | Agent dashboard | **FAIL** — login UAT open |
| **Lab** | PASS | PASS | PASS | Order/checkout | WARN | PASS | Lab portal | **CONDITIONAL** — ordering modes |
| **Distributor** | N/A | Declared | Scoped | Read | N/A | Partial | Distributor OS | **WAIVED** (not pilot) |

---

## Automated Evidence by Role

### Executive / Founder
- `verify-founder-workspace.mjs` — GO
- `verify-founder-navigation.mjs` — GO
- `verify-executive-financial-intelligence.mjs` — GO
- `verify-commercial-dashboard.mjs` — GO

### Admin
- `verify-orders-admin-flow.mjs` — PASS
- `verify-labs-admin-flow.mjs` — PASS (6 WARN)
- `verify-credit-risk-admin-flow.mjs` — PASS
- `verify-operations-center-admin-flow.mjs` — PASS

### HR
- `verify-payroll-rbac.mjs` — PASS
- `verify-people-operations-shell.mjs` — GO
- `verify-compensation-role-access.mjs` — PASS

### Agent
- `verify-agent-collections-ownership-filter.mjs` — PASS
- `verify-agent-compensation-profile.mjs` — PASS
- **Manual:** login, assigned labs only, no admin routes — **OPEN**

### Lab
- `verify-lab-ordering-flow.mjs` — PASS
- `verify-lab-account-fallback.mjs` — PASS
- **Manual:** ordering mode matrix — **OPEN**

### Distributor
- `verify-business-ownership.mjs` — PASS
- **Pilot:** WAIVED for Year-1 HQ

### Cross-role RLS
- `verify-hq-rls-reads.mjs` — PASS

---

## Manual UAT Required

See `RC1_Human_UAT_Matrix.md` for role-scoped scenarios with PASS/FAIL/WAIVED.

---

## Verdict

**Automated role certification: CONDITIONAL GO**  
**Pilot role sign-off: NO-GO** until Agent + Admin manual rows complete.
