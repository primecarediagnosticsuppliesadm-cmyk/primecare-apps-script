# Sprint 1C — Collections Workspace Separation Pre-Implementation Gate

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1C |
| Module | Collections — workspace separation |
| Date | 2026-07-11 |
| Gate | **APPROVED** (UI/UX only) |

---

## 1. Feature Inventory

| Persona | Primary business question | Current surface | Sprint 1C workspace |
|---------|---------------------------|-----------------|---------------------|
| Agent | Who should I collect from today? | Work queue + drawer | `AgentCollectionsWorkspace` |
| HQ Credit & Risk | Which labs need credit intervention? | Command center + drawer | `HqCreditRiskWorkspace` |
| HQ Receivables | What is our outstanding position? | KPIs + accordion rows | `HqReceivablesWorkspace` |
| Lab account | What is my account health? | KPIs + timeline tabs | `LabAccountWorkspace` |
| Distributor embed | Scoped credit exposure? | Same as HQ Credit & Risk | `HqCreditRiskWorkspace` (embedded) |

**Secondary information (unchanged placement, clearer boundaries):**
- Payment form → drawer (agent, credit & risk) or expandable row (receivables)
- Lab finance detail → timeline tabs / invoice drawers
- HQ intervention detail → command center panels

---

## 2. Page Responsibility Matrix

| Responsibility | Before (god page) | After |
|----------------|-------------------|-------|
| Data fetch / mutations | `CollectionsPage` | `CollectionsPage` (unchanged) |
| Persona detection | Inline `isAgentView` / `isHqCreditRisk` / `isLabAccount` | `resolveCollectionsWorkspace()` |
| Visual workspace framing | Mixed in one return tree | `CollectionsWorkspaceShell` per persona |
| Agent queue UI | Inline JSX | `AgentCollectionsWorkspace` |
| Credit & Risk UI | Inline + `HqCreditRiskCommandCenter` | `HqCreditRiskWorkspace` |
| Receivables UI | Inline accordion | `HqReceivablesWorkspace` |
| Lab account UI | Inline timeline | `LabAccountWorkspace` |
| Shared search chrome | Inline sticky bar | `CollectionsSearchBar` |

---

## 3. Functional Parity Report

See `Sprint1C_Functional_Parity_Report.md`.

---

## 4. Files Affected

| File | Change |
|------|--------|
| `src/collections/collectionsViewMode.js` | **New** — workspace resolution + metadata |
| `src/components/collections/CollectionsWorkspaceShell.jsx` | **New** — visual workspace frame |
| `src/components/collections/CollectionsSearchBar.jsx` | **New** — shared search chrome |
| `src/components/collections/workspaces/AgentCollectionsWorkspace.jsx` | **New** |
| `src/components/collections/workspaces/HqCreditRiskWorkspace.jsx` | **New** |
| `src/components/collections/workspaces/HqReceivablesWorkspace.jsx` | **New** |
| `src/components/collections/workspaces/LabAccountWorkspace.jsx` | **New** |
| `src/pages/CollectionsPage.jsx` | Delegate render to workspaces |
| Blueprint + verify + QA docs | Updated |

**Unchanged:** APIs, schema, RLS, routing, `HqCreditRiskCommandCenter` logic, payment handlers.

---

## 5. Verification Plan

| Script | Purpose |
|--------|---------|
| `verify-collections-workspace-separation.mjs` | Sprint 1C gate |
| `verify-credit-risk-admin-flow.mjs` | Credit & Risk regression |
| `verify-no-finance-mutation.mjs` | Finance boundary |
| `npm run build` | Compile gate |

---

## 6. Manual UAT

See `Sprint1C_UAT_Checklist.md`.

---

## Implementation gate

**ALLOWED** — UI/UX only; orchestration stays in `CollectionsPage`; all actions preserved.
