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

- Navigation, Command Center, Agent Queue, workspace split, routing
- Payment allocation logic, AR calculations, RPCs, schema, RLS
- God-page decomposition (Sprint 1B+)

---

## Verification

| Script | When |
|--------|------|
| `verify-collections-payment-action-feedback.mjs` | Sprint 1A UX gate |
| `verify-credit-risk-admin-flow.mjs` | Credit & Risk regression |
| `verify-agent-collections-ownership-filter.mjs` | Agent scope regression |
| `verify-collection-inconsistencies.mjs` | AR hygiene |

---

## Related blueprint

- [05_order_invoice_payment_rules.md](./05_order_invoice_payment_rules.md) — payment creation & allocation rules
- [08_operations_center_rules.md](./08_operations_center_rules.md) — Credit & Risk drawer mention
- [04_role_access_matrix.md](./04_role_access_matrix.md) — role write permissions
