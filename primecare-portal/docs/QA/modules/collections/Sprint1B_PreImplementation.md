# Sprint 1B — Agent Collections Pre-Implementation Gate

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1B |
| Module | Collections → Agent work queue |
| Date | 2026-07-11 |
| Gate | **APPROVED** |

---

## 1. Feature Inventory

| Feature | Current surface | Sprint 1B change |
|---------|-----------------|------------------|
| Agent work queue | `AgentCollectionWorkQueueRow` cards, route-ordered | Selected-lab highlight, refresh overlay |
| Lab selection | `paymentDrawerLabId` + drawer | Persist in `sessionStorage`; restore on load; selected-lab strip |
| Search | Immediate `search` filter | 300ms debounce (`localSearch` → `debouncedSearch`) |
| Filters | Search-only for agents | Unchanged (ownership filter untouched) |
| Queue refresh | `handleRefresh` → silent `loadCollections` | Success toast, re-hydrate open drawer, preserve search/selection |
| Payment drawer launch | `openCollectionPanel(labId, "payment")` | Unchanged path; clear evidence status on open |
| Evidence upload | Post-payment `uploadOperationalEvidence` | `uploadStatus` on field, progress %, inline failure |
| Empty state | Generic `EmptyState` | Search-aware copy for agent |
| Selected lab visibility | None in queue | Ring highlight + context strip |
| Payment feedback | Sprint 1A `ActionErrorSummary` | Retained; proof-failure inline |
| Duplicate submit | Button `disabled` only | In-flight ref + early return |
| Loading | Initial `PageSkeleton` only | Queue skeleton during `listRefreshing` |

**Out of scope:** payment APIs, allocation, AR, navigation architecture, HQ Command Center, routing, schema, RLS, distributor embed, ownership filtering, route ordering, Daily OS prioritization.

---

## 2. Files Affected

| File | Change |
|------|--------|
| `src/collections/agentCollectionsUi.js` | **New** — debounce constant, empty copy, session keys |
| `src/pages/CollectionsPage.jsx` | **Primary** — agent queue UX, debounce, persistence, refresh, evidence status |
| `src/collections/collectionsPaymentUi.js` | Evidence progress message helper |
| `scripts/verify-agent-collections-interaction-feedback.mjs` | **New** — static Sprint 1B gate |
| `docs/PrimeCare_System_Blueprint/24_Collections_Credit_Risk.md` | Sprint 1B section |
| `docs/PrimeCare_System_Blueprint/13_Verification_Matrix.md` | Register verify script |
| `docs/PrimeCare_System_Blueprint/CHANGELOG.md` | Sprint 1B entry |
| `docs/QA/modules/collections/Sprint1B_Functional_Parity_Report.md` | **New** |
| `docs/QA/modules/collections/Sprint1B_UAT_Checklist.md` | **New** |

**Unchanged:** `accessFilters.js`, `labOwnershipApi.js`, `AgentCollectionPaymentDrawer.jsx`, `HqCreditRiskCommandCenter.jsx`, APIs/RPCs.

---

## 3. Functional Parity Report

See `Sprint1B_Functional_Parity_Report.md` (produced pre-implementation; verdict **PASS** pending verify).

---

## 4. Verification Plan

| Script | Purpose | Gate |
|--------|---------|------|
| `verify-agent-collections-interaction-feedback.mjs` | Debounce, highlight, persistence, save guard, evidence status | **Sprint 1B** |
| `verify-agent-collections-ownership-filter.mjs` | Ownership scope regression | Required |
| `verify-credit-risk-admin-flow.mjs` | HQ Credit & Risk regression | Required |
| `verify-no-finance-mutation.mjs` | Finance boundary | Required |
| `npm run build` | Compile + import safety | Required |

---

## 5. Manual UAT

See `Sprint1B_UAT_Checklist.md`.

---

## Implementation gate

**ALLOWED** — Sprint 1A certified; scope is agent UX only; no forbidden domains touched.
