# 24 — Collections & Credit & Risk UI

Collections payment and follow-up interaction patterns for Agent Collections, HQ Collections, and Credit & Risk payment drawer.

**Scope:** UX feedback only. Write paths remain `createPaymentWrite` and `updateCollectionNotesWrite` — no API, schema, allocation, or AR calculation changes.

---

## Payment action surfaces

| Surface | Component | Roles |
|---------|-----------|-------|
| Agent payment drawer | `AgentCollectionPaymentDrawer` → `CollectionExpandedPanel` | Agent |
| Credit & Risk payment drawer | Same drawer shell | Executive, Admin |
| HQ expanded row | `CollectionExpandedPanel` inline | Executive, Admin |
| Lab collection tabs | `LabCollectionPanel` (payment / follow-up tabs) | Agent (embedded) |

---

## Sprint 1A — Action feedback standard

Mutation errors appear **where the action occurred** via `ActionErrorSummary` — not page-level error banners or toast-only failures.

| Rule | Detail |
|------|--------|
| **Error mapper** | `mapCollectionMutationError.js` — business-facing titles/messages for known API failures |
| **Error state** | `paymentMutationError` on `CollectionsPage` — passed through `formProps` |
| **Clear on retry** | Error cleared when opening payment drawer or starting a new save |
| **Drawer lifecycle** | Payment drawer closes **only on successful save**; stays open on failure |
| **Preserve values** | Amount, mode, notes, follow-up fields retained when mutation fails |
| **Loading labels** | `Recording payment…` when amount > 0; `Saving follow-up…` when notes-only; `Uploading proof…` during evidence upload |
| **Success toast** | Retained for successful payment / follow-up saves |
| **Proof upload warning** | Retained — payment succeeded but proof failed uses warning toast (non-blocking) |

### Mapped error families

- Missing lab / tenant context
- Invalid or zero payment amount
- AR read / row missing
- Invoice finalize / allocation drift
- Supabase unavailable / legacy write blocked
- Generic collection write failure

---

## Out of scope (Sprint 1A)

- Navigation, Command Center, workspace split, routing
- Payment allocation logic, AR calculations, RPCs, schema, RLS

---

## Sprint 1B — Agent work queue interaction

Improves agent daily collection workflow predictability without changing write paths, ownership rules, or route prioritization.

| Rule | Detail |
|------|--------|
| **Selected lab** | Queue card ring highlight + context strip when payment drawer open |
| **Debounced search** | 300ms (`localSearch` → `debouncedSearch`); HQ/non-agent paths unchanged |
| **Empty states** | Search-aware copy via `buildAgentCollectionsEmptyCopy` |
| **Refresh feedback** | Success toast "Work queue updated"; `ListSkeleton` during `listRefreshing`; re-hydrate open drawer |
| **Persistence** | `sessionStorage` for agent search + selected lab (cleared on drawer close / payment success) |
| **Evidence upload** | `uploadStatus` on `EvidenceUploadField`; progress % message; drawer stays open on proof failure after payment |
| **Duplicate guard** | `saveInflightRef` + early return when `saving` or `evidenceUploading` |

### Out of scope (Sprint 1B)

- Payment APIs, allocation, AR calculations, RPCs, schema, RLS
- Navigation architecture, HQ Command Center, routing, distributor embed
- Ownership filtering, Daily OS prioritization, route ordering

---

## Sprint 1C — Workspace separation

Each Collections persona renders in a dedicated workspace shell that answers **one primary business question**. `CollectionsPage` remains the data/mutation orchestrator; workspaces are presentational.

| Workspace | Component | Primary question |
|-----------|-----------|----------------|
| Agent | `AgentCollectionsWorkspace` | Who should I collect from today? |
| HQ Credit & Risk | `HqCreditRiskWorkspace` | Which labs need credit intervention? |
| HQ Receivables | `HqReceivablesWorkspace` | What is our outstanding receivables position? |
| Lab account | `LabAccountWorkspace` | What is my account health and payment activity? |

| Rule | Detail |
|------|--------|
| **Resolver** | `collectionsViewMode.js` — `resolveCollectionsWorkspace`, `getCollectionsWorkspaceMeta` |
| **Shell** | `CollectionsWorkspaceShell` — workspace label + primary question header |
| **Search chrome** | `CollectionsSearchBar` — shared filter UI (client-side only) |
| **Section boundaries** | Summary / find / act sections with `aria-label` per workspace |
| **Secondary detail** | Payment form in drawer (agent, credit) or expandable row (receivables); lab detail in timeline tabs |

### Out of scope (Sprint 1C)

- APIs, schema, RLS, RPCs, payment allocation, AR calculations, business rules
- Navigation routes, ownership filter, Daily OS ordering

---

## Verification

| Script | When |
|--------|------|
| `verify-collections-payment-action-feedback.mjs` | Sprint 1A UX gate |
| `verify-agent-collections-interaction-feedback.mjs` | Sprint 1B agent queue gate |
| `verify-collections-workspace-separation.mjs` | Sprint 1C workspace gate |
| `verify-credit-risk-admin-flow.mjs` | Credit & Risk regression |
| `verify-agent-collections-ownership-filter.mjs` | Agent scope regression |
| `verify-collection-inconsistencies.mjs` | AR hygiene |

---

## Related blueprint

- [05_order_invoice_payment_rules.md](./05_order_invoice_payment_rules.md) — payment creation & allocation rules
- [08_operations_center_rules.md](./08_operations_center_rules.md) — Credit & Risk drawer mention
- [04_role_access_matrix.md](./04_role_access_matrix.md) — role write permissions
