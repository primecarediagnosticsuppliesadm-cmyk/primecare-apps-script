# 16 — Certification Framework (Phase 2)

**Living index for release certification — objects, screens, dependencies, browser paths, scorecards, performance gates, module UX certification taxonomy, and Bronze / Silver / Gold tiers.**

This blueprint doc defines **what** must be certified. Implementation lives in `docs/Certification_Framework/`. Module UX baselines live under `docs/QA/modules/<module>/`.

---

## Purpose

Phase 2 moves PrimeCare from ad-hoc verify scripts to a **repeatable certification system** where every business object and screen has documented ownership, dependencies, verification, and performance targets.

**Scope:** Documentation and orchestration only. No schema, RLS, or business-logic changes.

---

## Module UX certification methodology

Use the same staged process successfully applied to People Operations, Collections / Credit & Risk, HQ Orders, Inventory, and **Purchase / Reorder**:

1. **Architecture review only** — feature inventory, functional parity baseline, workspace boundaries, page-by-page evaluation, defect registry, sprint roadmap, verification + Manual UAT plan. **No implementation.**
2. **Founder finalization** — refine defect wording, taxonomy, Sprint **action-oriented** Start Here rules, tier definitions.
3. **Sprint 1A / 1B / 1C** — UI/UX only; one workflow per sprint; independently releasable; functional parity preserved; no schema/API/RLS/business-rule changes unless explicitly approved.
4. **Certification Closure** — High Sprint UX defects closed + QA module pack + signed **browser** Manual UAT → Gold.

Engineering file decomposition (LOC / god-file splits) is **RC2** unless the Founder marks it as a certification blocker. Certification defects must be **user-centric** (operational complexity, discoverability, trust) — not LOC counts. Combining logical jobs in one workspace is an **Architecture / Page Budget** user issue when cited — not an engineering-structure defect by default.

---

## Standard certification taxonomy

**Every future module certification review must classify each defect under exactly one primary category** (secondary tags allowed in notes):

| Category | Use when the defect is about… |
|----------|-------------------------------|
| **Architecture** | Workspace boundaries, SoT ownership, deferred structural debt (not implementation size alone) |
| **Discoverability** | Can the operator find the next correct action in seconds? |
| **Context** | Is orientation preserved across filters, selection, and cross-page workflows? |
| **Explainability** | Can the operator see **why** the system recommends or labels something? |
| **Trust** | Mutation feedback, honesty of labels, no fake confidence metrics |
| **Page Budget** | Cognitive load: too many jobs, competing primary surfaces, analytics over ops |
| **Functional Parity** | Capability that must not be removed by UX work |
| **Verification** | Missing or insufficient automated verify gates |
| **Manual UAT** | Missing role-scoped signed checklist |

### Trust & Explainability (module recommendations)

When a module recommends statuses or actions (e.g. Critical / Reorder / Healthy / Receive / Supplier), future recommendation cards should expose:

- Current Stock · Minimum Stock · Forecast (or Reorder Level / Recent Consumption as domain-appropriate)
- Supplier (when procurement)
- Business Rule · Reason for recommendation
- Trust Level: **High / Medium / Low**

**No fake percentages.** Document as Explainability defects when missing (e.g. INV-CERT-012, PUR-CERT-015); schedule outside Sprint 1 unless Founder marks as blocker. **Not a Gold blocker** unless Founder elevates.

---

## Module certification tiers

| Tier | Definition | Exit criteria (examples) |
|------|------------|--------------------------|
| **Bronze** | **Domain Integrity** | SoT clear; ledger/lifecycle rules enforced; automated integrity verifies PASS |
| **Silver** | **Operational Workspace** | Primary actions clear; **action-oriented** Start Here (not stats-only); context preserved; cognitive load managed |
| **Gold** | **Certified UX + Verification + Signed Browser Manual UAT** | Silver + High Sprint UX defects closed + module QA pack + signed browser UAT |

Action-oriented Start Here examples:

- Inventory: Receive Purchase Order · Create Purchase Order · Review Critical Stock · Investigate Stock Risk
- Purchase: **Create Purchase Orders** · **Receive Pending Deliveries** · **Review Critical Reorders** · **Investigate Blocked Purchase Orders**
- Collections: Record Payment · Review Next Order

### Module UX baselines

| Module | Baseline | Status |
|--------|----------|--------|
| Inventory | `docs/QA/modules/inventory/Architecture_Review_Certification_Baseline.md` | Founder-finalized; Closure CONDITIONAL Gold |
| **Purchase / Reorder** | `docs/QA/modules/purchase/Architecture_Review_Certification_Baseline.md` | Founder-finalized; Closure **CONDITIONAL Gold** (signed browser UAT pending) |

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
1. Read Blueprint 00–19 + affected object/screen catalog entries
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
| [11_Inventory_Rules.md](./11_Inventory_Rules.md) | Inventory domain + Inventory UX cert + **Purchase module UX cert roadmap** |
| `docs/QA/modules/inventory/Architecture_Review_Certification_Baseline.md` | Inventory module UX certification baseline (Founder-finalized) |
| `docs/QA/modules/purchase/Architecture_Review_Certification_Baseline.md` | Purchase / Reorder module UX certification baseline (Founder-finalized 2026-07-12) |
| `docs/QA/modules/*/` | Per-module Sprint / Closure packs (Orders, Collections, Inventory, Purchase, …) |
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
6. **Module UX certification** → classify defects with the standard taxonomy above; update module baseline under `docs/QA/modules/<module>/`; record Bronze/Silver/Gold status and CHANGELOG entry; do not treat LOC/file size as a certification defect.
