# 14 — Release Gates

Criteria before recommending commit, merge, or production promotion.

---

## Per-feature gates

| Gate | Requirement |
|------|-------------|
| **Blueprint** | Relevant 00–15 docs updated; CHANGELOG if gap/conflict |
| **Impact analysis** | `templates/Feature_Impact_Assessment_Template.md` completed |
| **Build** | `npm run build` passes |
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
- Blueprint not updated for schema/rule changes

---

## QA release gates (from docs/QA)

| Area | Status (2026-06-28 cert) |
|------|--------------------------|
| Orders admin | GO (verify script) |
| Labs admin | GO |
| Credit & Risk | GO |
| Ops Center | GO |
| Inventory/catalog/procurement | CONDITIONAL GO |
| Full pilot | NO-GO — Agent E2E, manual UAT open |

Update after each certification run.

---

## Production promotion

Additional gates:
- `verify-primecare-production-golden-path.mjs`
- `verify-production-monitoring.mjs`
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
