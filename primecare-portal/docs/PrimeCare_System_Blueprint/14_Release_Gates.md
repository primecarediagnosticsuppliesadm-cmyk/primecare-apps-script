# 14 — Release Gates

Criteria before recommending commit, merge, or production promotion.

---

## Per-feature gates

| Gate | Requirement |
|------|-------------|
| **Blueprint** | Relevant 00–19 docs updated; CHANGELOG if gap/conflict |
| **Cert framework** | Object + screen catalog entries updated when SoT or UI changes ([16_Certification_Framework.md](./16_Certification_Framework.md)) |
| **Impact analysis** | `templates/Feature_Impact_Assessment_Template.md` completed |
| **Build** | `npm run build` passes |
| **Read-only verification guard** | `node scripts/verify-scripts-readonly.mjs` passes before any verify bundle |
| **Verify** | Module scripts from [13_Verification_Matrix.md](./13_Verification_Matrix.md) pass |
| **UAT** | Manual checklist written and executed for affected roles |
| **Regression** | No new FAIL in unrelated verify scripts |
| **Never-break** | [15_Do_Not_Break_Rules.md](./15_Do_Not_Break_Rules.md) respected or approved |

---

## Commit recommendation

Recommend commit **only when all per-feature gates pass**.

Do not recommend commit when:
- Implementation gate = BLOCKED
- RLS/finance change without approval
- Verify FAIL unresolved
- `verify-scripts-readonly.mjs` fails or any verification script mutates without explicit `--apply` / `CONFIRM_MUTATION=true`
- Blueprint not updated for schema/rule changes

---

## QA release gates (from docs/QA)

| Area | Status (2026-06-28 cert) |
|------|--------------------------|
| Orders admin | GO (verify script) |
| Labs admin | GO |
| Credit & Risk | GO |
| Ops Center | GO |
| Inventory/catalog | **CONDITIONAL GO (Gold pending signed UAT)** — Closure pack + Sprint 1A–1C complete; sign `docs/QA/modules/inventory/Certification_Signoff_Template.md` |
| Purchase / Reorder | **CONDITIONAL GO (Gold pending signed browser UAT)** — Closure pack + Sprint 1A–1C complete; sign `docs/QA/modules/purchase/Certification_Signoff_Template.md`; freeze after Gold except bugs/security/compliance |
| **First customer / ops** | **CONDITIONAL GO** — execute `docs/operations/V1_First_Customer_Operational_Gate.md` (DR, prod env, RLS, storage/PDF, golden labs); pack: `V1_Operational_Readiness_Execution.md` |
| **Feature freeze** | **IN EFFECT** — Year-1 build complete; see `docs/operations/V1_Operational_Freeze.md` (bugs/security/compliance only) |
| **Production deploy** | **CONDITIONAL GO (prep)** / **NO-GO (cutover)** until blockers closed — `docs/operations/V1_Production_Deployment.md` |
| Full pilot | NO-GO — Agent E2E, manual UAT open |

Update after each certification run.

---

## Production promotion

Additional gates:
- `verify-scripts-readonly.mjs`
- `npm run certify:release` (or `certify:release:quick` during iteration)
- `npm run db:qa:check` / `npm run db:prod:check` before any Supabase CLI work
- `verify-primecare-production-golden-path.mjs`
- `verify-production-monitoring.mjs`
- `scripts/run-browser-certification.mjs` — prereq gate + browser checklist
- `docs/operations/Release_Hardening_Runbook.md` STOP conditions respected
- `docs/Certification_Framework/06_Release_Scorecard.md` filled (copy to `docs/QA/`)
- `docs/QA/Release_Certification.md` sign-off
- Migrations applied to target Supabase in documented order after dry-run

### Production identity STOP gate (before UAT / smoke)

A tester must prove all of the following on the **same** browser tab. If **A, B, C, or D** fails: **STOP VERIFICATION**. Do not debug mappers, React state, formatters, races, or Date parsing until identity is corrected.

| # | Proof |
|---|---|
| **A** | Address bar is `https://app.primecarediagnostics.in` — **not** an old `*.vercel.app` deployment |
| **B** | Visible environment is Production (Operations Center build identity line) |
| **C** | Visible SHA matches the certified/deployed git SHA (`window.__PRIMECARE_BUILD__.commit` or the Ops Center line) |
| **D** | Network host is `alxhrnotnvwpblsiadxj.supabase.co` |
| **E** | The visible business outcome for this release works (example: a profile with populated `last_login_at` must not show Last Login `Never`) |

---

## AI Architect completion checklist

- [ ] Blueprint files read listed in PR/task
- [ ] Impact analysis attached
- [ ] Implementation gate ALLOWED
- [ ] Build + verify output captured
- [ ] UAT checklist linked
- [ ] CHANGELOG updated if conflict/gap
- [ ] Commit message explains **why**
