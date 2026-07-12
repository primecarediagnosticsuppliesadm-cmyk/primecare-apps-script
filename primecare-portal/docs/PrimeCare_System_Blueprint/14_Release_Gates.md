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
| Purchase / Reorder | **Architecture baseline Founder-finalized** — Bronze GO; Silver/Gold NO-GO; Sprint 1A UX-only ALLOWED — `docs/QA/modules/purchase/Architecture_Review_Certification_Baseline.md` |
| Full pilot | NO-GO — Agent E2E, manual UAT open |

Update after each certification run.

---

## Production promotion

Additional gates:
- `verify-scripts-readonly.mjs`
- `verify-primecare-production-golden-path.mjs`
- `verify-production-monitoring.mjs`
- `scripts/run-browser-certification.mjs` — prereq gate + browser checklist
- `docs/Certification_Framework/06_Release_Scorecard.md` filled (copy to `docs/QA/`)
- `docs/QA/Release_Certification.md` sign-off
- Migrations applied to target Supabase in documented order

---

## AI Architect completion checklist

- [ ] Blueprint files read listed in PR/task
- [ ] Impact analysis attached
- [ ] Implementation gate ALLOWED
- [ ] Build + verify output captured
- [ ] UAT checklist linked
- [ ] CHANGELOG updated if conflict/gap
- [ ] Commit message explains **why**
