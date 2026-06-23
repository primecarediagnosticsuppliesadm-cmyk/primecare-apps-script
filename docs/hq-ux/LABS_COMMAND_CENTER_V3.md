# HQ Labs Command Center V3

**Date:** 2026-06-23  
**Scope:** HQ Admin / Executive Labs page (`/labs`) — UX-only, no schema/RLS/auth/API changes.

---

## Architecture Summary

```
LabsPage.jsx
├── Agent view          → AgentMyLabCard grid (unchanged)
├── HQ Admin/Executive  → HqLabsAdminView (NEW path)
│   ├── labsHqEngine.js           attention cards + portfolio + filters
│   ├── getLabsCredit()             lab directory rows (existing)
│   ├── summarizeLabsCreditPortfolio summary KPIs (existing)
│   └── OperationalLabDrawer      tabbed review workspace
│       └── loadOperationsCommandCenterData()  collections/orders/visits (existing reads)
└── Distributor OS / legacy → original KPI wall + directory (unchanged)
```

**Data flow**

1. `LabsPage` loads labs via `getLabsCredit()` (unchanged).
2. For HQ admin/executive (non–Distributor OS), renders `HqLabsAdminView` instead of the 10-card KPI wall.
3. Attention cards are derived client-side from visible lab rows (`labsHqEngine.js`).
4. **Review Lab** opens `OperationalLabDrawer`, which lazy-loads `loadOperationsCommandCenterData()` for orders/collections/visits and `getLabQualificationRead()` for qualification tab.
5. CTAs navigate to existing pages (`collections`, `orders`, `visits`, `operationsCenter`, `distributorOs`).

---

## Before vs After

| Before | After |
|--------|-------|
| 10 KPI stat cards for 3 labs | 4 attention cards + 4 portfolio KPIs |
| No operational priority queue | “Labs Requiring Attention” with severity + action text + CTA |
| Directory rows with `-` placeholders | Compact cards; null fields hidden |
| No review workflow | **Review Lab** → tabbed drawer (6 tabs) |
| Low scanability | First screen answers: *Which lab needs my attention today?* |

---

## Files Changed

| File | Change |
|------|--------|
| `src/pages/LabsPage.jsx` | Route HQ admin/executive to `HqLabsAdminView` |
| `src/components/hq/HqLabsAdminView.jsx` | Attention queue, portfolio strip, directory, drawer wiring |
| `src/operations/labsHqEngine.js` | Attention cards, filters, date/currency helpers |
| `src/components/operations/OperationalLabDrawer.jsx` | Tabbed HQ lab workspace (Overview, Collections, Orders, Visits, Qualification, Agent) |

---

## Build Output

```
✓ 2607 modules transformed.
✓ built in 2.23s
PrimeCareWebPortal-B_YQP_Xa.js  1,912 kB
```

---

## QA Checklist

### Labs Command Center
- [ ] Login as `qa.admin@primecare.test` → **Labs** in OPERATIONS nav
- [ ] Page shows **4 attention cards** (not 10 KPI wall)
- [ ] Portfolio strip shows **4 KPIs**: Total Labs, Active Labs, Revenue, Outstanding
- [ ] Lab directory cards show name, status, stage, outstanding, revenue, agent, last visit
- [ ] No `-` placeholders for empty owner/phone/area/territory
- [ ] **Review Lab** opens right drawer with 6 tabs
- [ ] Drawer Overview shows risk + outstanding
- [ ] Drawer Collections / Orders / Visits tabs show data or empty state (no dashes)
- [ ] **Open in Distributor OS** only for non-HQ tenant labs
- [ ] Attention card CTAs filter directory or navigate to Collections / Visits / Operations Center
- [ ] Agent view and Distributor OS labs view unchanged

### Lab assignment ↔ Operations Center
- [ ] Labs → Review Lab → Assigned Agent → **Manage in Operations Center** navigates to User & Access
- [ ] Assigned agent row is highlighted; assignment drawer opens when agent is known
- [ ] Lab from review is highlighted in assignment drawer list
- [ ] Assign → Save with no changes → neutral info: *No changes to save — assignments are already up to date.*
- [ ] Check unassigned lab → Save → assigns via `updateLabAgentAssignmentWrite` + audit
- [ ] Check lab assigned to another agent → Save → confirmation + reason → reassigns
- [ ] Uncheck assigned lab → Save → confirmation + reason → unassigns
- [ ] Directory **Assigned Labs** count refreshes after save

---

## Reproduce

```bash
cd primecare-portal
npm run dev
# Login QA admin → Labs
```
