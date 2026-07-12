# Collections Certification Closure — Pre-Implementation

| Field | Value |
|-------|-------|
| Gate | UI/UX ONLY |
| Date | 2026-07-11 |
| Scope | COL-CERT-011, COL-CERT-003, COL-CERT-004 |

## Feature Inventory

| Defect | Surface | Change |
|--------|---------|--------|
| COL-CERT-011 | `HqCreditRiskCommandCenter` | Promote High-Risk Interventions to top “Start here” queue; primary CTA = Record Payment |
| COL-CERT-003 | All Collections workspaces | `CollectionsContextStrip` — workspace, filter, selected lab, deep-link focus |
| COL-CERT-004 | Agent Visits / Labs exit paths | Persist return path `collections`; Back to Collections CTA on Visits + Labs |

## Out of scope (RC2)

- God-page orchestrator refactor
- Duplicate headers / hero metrics / search polish / accordion hints
- APIs, schema, RLS, routing, allocation, business rules

## Files affected

| File | Change |
|------|--------|
| `src/components/hq/HqCreditRiskCommandCenter.jsx` | Intervention discoverability |
| `src/components/collections/CollectionsContextStrip.jsx` | **New** |
| `src/collections/collectionsContextUi.js` | **New** — context part builders |
| `src/pages/CollectionsPage.jsx` | Context strip + return-path wiring |
| `src/pages/agentVisitContext.js` | `returnPath` override + peek helper |
| `src/pages/AgentVisitPage.jsx` | Back to Collections continuity |
| `src/pages/LabsPage.jsx` | Back to Collections banner (agent) |
| `scripts/verify-collections-certification-closure.mjs` | **New** |
| Blueprint + QA docs | Updated |

## Implementation gate

**ALLOWED** — UI/UX only; no finance/API/routing changes.
