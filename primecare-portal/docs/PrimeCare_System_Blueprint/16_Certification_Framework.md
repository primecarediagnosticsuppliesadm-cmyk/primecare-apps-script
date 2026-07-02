# 16 — Certification Framework (Phase 2)

**Living index for release certification — objects, screens, dependencies, browser paths, scorecards, and performance gates.**

This blueprint doc defines **what** must be certified. Implementation lives in `docs/Certification_Framework/`.

---

## Purpose

Phase 2 moves PrimeCare from ad-hoc verify scripts to a **repeatable certification system** where every business object and screen has documented ownership, dependencies, verification, and performance targets.

**Scope:** Documentation and orchestration only. No schema, RLS, or business-logic changes.

---

## Framework components

| # | Artifact | Path |
|---|----------|------|
| 1 | Object Source-of-Truth Catalog | [../Certification_Framework/01_Object_Source_of_Truth_Catalog.md](../Certification_Framework/01_Object_Source_of_Truth_Catalog.md) |
| 2 | Screen Ownership Catalog | [../Certification_Framework/02_Screen_Ownership_Catalog.md](../Certification_Framework/02_Screen_Ownership_Catalog.md) |
| 3 | Object Dependency Graph | [../Certification_Framework/03_Object_Dependency_Graph.md](../Certification_Framework/03_Object_Dependency_Graph.md) |
| 4 | Browser Golden Path | [../Certification_Framework/04_Browser_Golden_Path.md](../Certification_Framework/04_Browser_Golden_Path.md) |
| 5 | Browser Regression Framework | [../Certification_Framework/05_Browser_Regression_Framework.md](../Certification_Framework/05_Browser_Regression_Framework.md) |
| 6 | Release Scorecard | [../Certification_Framework/06_Release_Scorecard.md](../Certification_Framework/06_Release_Scorecard.md) |
| 7 | Performance Certification Matrix | [../Certification_Framework/07_Performance_Certification_Matrix.md](../Certification_Framework/07_Performance_Certification_Matrix.md) |

**Orchestration:**
- Manifest: `docs/Certification_Framework/browser-regression-manifest.json`
- Runner: `scripts/run-browser-certification.mjs`

---

## Object catalog template

Every cataloged object documents:

| Field | Description |
|-------|-------------|
| **Source of truth** | Table/view/RPC that owns authoritative state |
| **Lifecycle** | States and transitions |
| **APIs** | Read/write functions in `primecareSupabaseApi.js` or module APIs |
| **Screens** | Pages/components that consume or mutate the object |
| **Verify scripts** | Automated checks that cover this object |
| **Dependencies** | Upstream objects required before this object is valid |
| **Known gaps** | GAP-BP-* or QA gaps affecting certification |

---

## Screen catalog template

Every cataloged screen documents:

| Field | Description |
|-------|-------------|
| **Reads** | API calls on load and refresh |
| **Writes** | Mutations triggered from UI |
| **Users** | Roles with access (`rolePermissionMatrix.js`) |
| **APIs** | Canonical read/write entry points |
| **Verification** | verify scripts + browser golden-path step IDs |
| **Performance target** | Cold-load API budget (ms) from perf matrix |

---

## Certification workflow (Phase 2)

```
1. Read Blueprint 00–16 + affected object/screen catalog entries
2. Run API regression bundle (13_Verification_Matrix.md)
3. Run run-browser-certification.mjs (prereq gate + checklist output)
4. Execute Browser Golden Path (04) manually or via future automation
5. Fill Release Scorecard (06) — PASS/FAIL per domain
6. Run Performance Certification Matrix (07) on PERF tenant
7. GO / NO-GO per 14_Release_Gates.md
```

---

## Relationship to existing docs

| Doc | Role |
|-----|------|
| [13_Verification_Matrix.md](./13_Verification_Matrix.md) | API/script regression index |
| [14_Release_Gates.md](./14_Release_Gates.md) | Commit and promotion gates |
| `docs/QA/Release_Certification.md` | Environment-specific sign-off record |
| `docs/hq-certification/*` | Historical certification evidence |
| `docs/operations/HQ_BROWSER_DEVICE_UAT_CHECKLIST.md` | Device/browser matrix (superseded for O2C by 04/05) |

---

## Migration impact

**None.** Framework is documentation + a non-mutating orchestration script. No `supabase/migrations/` changes.

---

## Maintenance rules

1. **Object change** → update `01_Object_Source_of_Truth_Catalog.md` + `03_Object_Dependency_Graph.md` + relevant verify script row in `13`.
2. **Screen change** → update `02_Screen_Ownership_Catalog.md` + `browser-regression-manifest.json`.
3. **New verify script** → add to object + screen entries and `13_Verification_Matrix.md`.
4. **Perf regression** → update `07_Performance_Certification_Matrix.md` baseline after investigation.
5. **Release** → copy `06_Release_Scorecard.md` template into `docs/QA/` with dated filename.
