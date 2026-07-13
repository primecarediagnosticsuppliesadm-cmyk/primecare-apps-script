# Purchase Certification — Evidence Checklist

Complete before recommending Purchase **Gold**.

## Documentation (PUR-CERT-005)

- [x] Architecture baseline present
- [x] Sprint 1A / 1B / 1C pre-impl, parity, UAT packs present
- [x] Consolidated Closure UAT + sign-off template + evidence index present
- [x] Founder certification boundary documented
- [x] Blueprint 11 / 13 / 14 / CHANGELOG updated for Closure

## Automated verification (PUR-CERT-012)

Record results when Closure is executed:

| Script | Expected | Result |
|--------|----------|--------|
| `npm run build` | PASS | **PASS** (2026-07-12 Closure run) |
| `verify-purchase-certification-closure.mjs` | GO | **GO** |
| `verify-purchase-action-feedback.mjs` | GO | **GO** |
| `verify-purchase-navigation-context.mjs` | GO | **GO** |
| `verify-purchase-workspace-simplification.mjs` | GO | **GO** |
| `verify-rc1-procurement-lifecycle.mjs` | FAIL=0 | **PASS** |
| `verify-no-finance-mutation.mjs` | GO | **GO** |

## Known exclusions (not Purchase UX failures)

| Item | Classification |
|------|----------------|
| `verify-procurement-inventory-flow.mjs` fails under plain Node due to `@/` imports in dependency chain | **Pre-existing Node import limitation** — outside Purchase UX certification scope; do **not** fix in Closure; do **not** treat as Purchase UX FAIL |

## Manual signed browser UAT

- [ ] Sprint 1A checklist executed
- [ ] Sprint 1B checklist executed
- [ ] Sprint 1C checklist executed
- [ ] Closure UAT executed (`Certification_Closure_UAT_Checklist.md`)
- [ ] `Certification_Signoff_Template.md` signed (Admin/Executive + Engineering; Founder optional)

## Freeze after Gold approval

- [ ] Purchase frozen except bug fixes, security fixes, compliance updates
- [ ] Supplier certification **not** started from this Closure
- [ ] Explainability cards / Approvals / Supplier Master **not** required for this Gold
