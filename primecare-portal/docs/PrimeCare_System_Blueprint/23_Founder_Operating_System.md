# 23 — Founder Operating System (Phase 9.2)

Single Founder/CEO operating cockpit — **not another dashboard**.

Every card answers: **"What decision do I need to make today?"**

Orchestrates existing modules. **Never duplicates business logic.**

---

## Architecture

| Layer | Responsibility |
|-------|----------------|
| `founderWorkspaceRead.js` | Parallel compose reads (ops, commercial, compensation) |
| `founderWorkspaceModel.js` | Section derivations (today, revenue, collections, …) |
| `founderDecisionQueueEngine.js` | Decision queue from action queue + approvals + priority cards |
| `founderInsightsEngine.js` | Rule-based insights (no AI/ML) |
| `founderPrioritiesEngine.js` | Top 5 priorities |
| `founderGlobalSearchModel.js` | Search index over read bundle |
| `FounderOperatingSystemPage.jsx` | UI shell |

Page key: `founderOperatingSystem`  
Legacy alias: `founderNavigation` → same page.

---

## Modules (workspace sections)

| Module | Source reads | Deep-link |
|--------|--------------|-----------|
| Today's Business | `buildExecutiveDailySnapshot`, commercial KPIs, compensation period | — |
| Decision Queue | `executiveActionQueueEngine`, `buildApprovalInbox`, `buildHqPriorityCards` | Per item |
| Revenue | Commercial + EFI proxy | `executiveFinancialIntelligence`, `commercialCrm` |
| Collections | `summarizeCollectionsList` | `risk` |
| Operations | Ops payload orders/PO/inventory | `operationsCenter`, `orders` |
| People | `buildExecutiveCompensationModel` | `compensationPayroll` |
| Inventory | Stock rows from ops read | `inventory` |
| Growth | `buildCommercialWorkspace` | `commercialCrm` |
| Risks | Insights + high-severity decisions | Per item |
| Forecast | `buildCommercialForecast` | `commercialCrm` |
| Approvals | `buildApprovalInbox` | `compensationPayroll` |
| Insights | `founderInsightsEngine` | Per insight |
| Search | `founderGlobalSearchModel` | Per result |

---

## Founder Decision Matrix (audit)

| Existing module | Founder decisions supported |
|-----------------|----------------------------|
| Revenue Funnel | Post-qual conversion integrity (deep-link; not duplicated in OS) |
| EFI | Cash/revenue executive view (deep-link) |
| Commercial | Pipeline, growth, contracts, forecast |
| Operations Center | Action queue, provisioning backlog |
| People Ops | Payroll approve/lock/export, plan activation |
| Inventory | Low stock, reorder |
| Collections / Credit & Risk | Overdue, high-risk labs |
| Architecture Readiness | Dev gates (not in Founder OS) |

---

## Explicitly out of scope

- Finance / payroll / compensation engine changes
- Schema / RLS / API mutations
- New workflow engines
- AI / ML insights
- Duplicate KPI calculations (compose labels only)

---

## Verification

| Script | Checks |
|--------|--------|
| `verify-founder-workspace.mjs` | Read compose + model sections |
| `verify-founder-decision-queue.mjs` | Queue from existing engines |
| `verify-founder-priorities.mjs` | Top 5 rule-based |
| `verify-founder-insights.mjs` | No AI; rules only |
| `verify-founder-approvals.mjs` | Reuses buildApprovalInbox |
| `verify-founder-navigation.mjs` | Menu + routing |
| `audit-phase-9-2-certification.mjs` | Bundle + boundaries + build |

---

## Navigation (Phase 9.2)

Executive sidebar **FOUNDER** section:

```
FOUNDER → founderOperatingSystem (Founder OS)
```

`founderNavigation` URL aliases redirect to Founder OS (legacy).
