# HQ Browser & Device UAT Checklist

**Last updated:** 2026-06-24 (RC-9)  
**Owner:** QA Lead  
**Scope:** HQ pilot roles only — Executive, Admin, Agent, Lab  
**Environment:** Staging/Production URL — fill before test execution  
**Status:** Template — **no browser matrix executed yet**

---

## Test matrix

Mark each cell: **PASS** / **FAIL** / **SKIP** / **NOT RUN**

### Browsers × Critical flows (Executive)

| Flow | Chrome | Edge | Safari | Firefox |
|------|--------|------|--------|---------|
| Login / logout | ☐ | ☐ | ☐ | ☐ |
| Executive Control Tower (dashboard) | ☐ | ☐ | ☐ | ☐ |
| Operations Command Center | ☐ | ☐ | ☐ | ☐ |
| Collections / Credit & Risk | ☐ | ☐ | ☐ | ☐ |
| Orders | ☐ | ☐ | ☐ | ☐ |
| Invoice download (lab invoice center or exec path) | ☐ | ☐ | ☐ | ☐ |
| Payment + allocation visibility | ☐ | ☐ | ☐ | ☐ |
| Notifications | ☐ | ☐ | ☐ | ☐ |
| Drawers / modals (ops lab drawer, action modals) | ☐ | ☐ | ☐ | ☐ |
| Responsive tables (Collections grid) | ☐ | ☐ | ☐ | ☐ |

### Devices × Role landing

| Role | Desktop | Tablet | Mobile |
|------|---------|--------|--------|
| Executive | ☐ | ☐ | ☐ |
| Admin | ☐ | ☐ | ☐ |
| Agent | ☐ | ☐ | ☐ |
| Lab | ☐ | ☐ | ☐ |

### Role-specific flows

| Role | Flow | Desktop | Mobile |
|------|------|---------|--------|
| Admin | Admin Dashboard KPIs | ☐ | ☐ |
| Admin | User provisioning panel | ☐ | ☐ |
| Admin | Purchase orders | ☐ | ☐ |
| Agent | Agent dashboard | ☐ | ☐ |
| Agent | Visit page | ☐ | ☐ |
| Agent | Assigned collections scope | ☐ | ☐ |
| Lab | Lab ordering | ☐ | ☐ |
| Lab | Lab invoice center + PDF download | ☐ | ☐ |
| Lab | Lab account (collections view) | ☐ | ☐ |

---

## Critical flow definitions

| Flow | Pass criteria |
|------|---------------|
| Login / logout | Supabase auth; lands on role default page; logout clears session |
| Dashboard | KPI tiles render; no fatal error boundary |
| Collections | AR grid or mobile cards; record payment succeeds |
| Orders | List loads; status update succeeds |
| Lab ordering | Cart + submit order |
| Invoice download | PDF opens or downloads; size > 0 |
| Payment | Payment recorded; allocation reflected |
| Notifications | Notification center loads |
| Drawers / modals | Open, close, keyboard Esc where applicable |
| Responsive tables | No horizontal overflow breaking layout on 375px width |

---

## Non-pilot roles (RC-9)

| Role | Expected behavior | Verified |
|------|-------------------|----------|
| `distributor_admin` | Login blocked on QA/PROD with message: "Your workspace is not enabled for this release. Contact HQ Admin." | ☐ |
| `distributor_manager` | Same | ☐ |
| `read_only_auditor` | Same | ☐ |

**Code reference:** `canAuthenticateRole()` in `rolePermissionMatrix.js`; `NonPilotReleaseScreen` in `App.jsx`.

---

## Automated pre-UAT (run before browser matrix)

```bash
npm run build
node scripts/run-hq-zero-dead-ends-audit.mjs
node scripts/verify-hq-rls-reads.mjs
node scripts/verify-primecare-production-golden-path.mjs
```

---

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| QA Lead | _________________ | _________ | ☐ Matrix complete |
| Release Captain | _________________ | _________ | ☐ Blockers logged |

---

## RC-9 status

**Checklist document:** **PASS**  
**Browser/device execution:** **NOT RUN** — human UAT required
