# Sprint 1B — HQ Orders Context & Continuity (Pre-Implementation)

| Field | Value |
|-------|-------|
| Micro-sprint | Sprint 1B |
| Module | HQ Orders — context, discoverability, workflow continuity |
| Date | 2026-07-11 |
| Gate | **ALLOWED** (UI/UX only) |
| Depends on | Sprint 1A action feedback (do not change) |

## Defects addressed

| ID | Issue |
|----|-------|
| ORD-CERT-002 | Primary fulfillment action not obvious |
| ORD-CERT-003 | Weak context awareness |
| ORD-CERT-004 | Return path lost after cross-module navigation |

---

## 1. Feature Inventory

| Feature | Current | After Sprint 1B | Parity |
|---------|---------|-----------------|--------|
| Operations queue selection | `activeQueueKey` + `HqOrdersOperationsQueue` | Same buckets + **Start Here** label/CTA on awaiting fulfillment | Same math |
| Order row selection | `selectedOrder` / `openOrder` | Stronger selected visual + `aria-selected` | Same |
| Filters | status, payment, lab, dates | Unchanged + Clear Filter recovery | Same |
| Search | `searchInput` → debounced `search` | Unchanged; shown in context strip | Same |
| Sort | `sortKey` | Unchanged | Same |
| Selected order | Detail pane | ID in header + strip; retained after targeted refresh | Same |
| Freeze state | Banner + disabled writes | Also in context strip | Same |
| Collections handoff | `navigateToCollections` | + store Orders return context | Same write |
| Labs handoff | `navigateToLabs` | + return context | Same |
| Logistics handoff | `navigateToLogisticsDelivery` | + return context; Back to Orders | Same |
| Inbound deep-link | `consumeHqNavContext("orders")` | Focus in strip; outside-filter recovery | Same consume |
| Return behavior | None | Back to Orders restores selection/filters/search | New UX only |

---

## 2. Current Context Flow

| State | Where it lives | Survives leave? | Survives browser refresh? |
|-------|----------------|-----------------|---------------------------|
| `selectedOrder` / details | React state on `OrdersPage` | No | No |
| search / filters / sort / queue | React state | No | No |
| HQ deep-link | `hq_nav_context` (one-shot consume) | Consumed on open | N/A |
| sessionStorage Orders return | **None today** | — | — |
| Collections return | `primecare_agent_workspace_return` | Yes for Collections↔Visits/Labs | Session only |

**Lost today when navigating away:** selected order, queue, search, filters. Destination pages have no Back to Orders.

**Reuse:** Collections strip + peek/write/consume return pattern; new `primecare_orders_return_context` for richer Orders restore payload.

---

## 3. Files affected

| File | Change |
|------|--------|
| `src/orders/ordersWorkflowReturn.js` | **Create** — return/restore session context |
| `src/orders/ordersContextUi.js` | **Create** — strip parts + empty/focus copy |
| `src/components/orders/OrdersContextStrip.jsx` | **Create** |
| `src/components/hq/HqOrdersOperationsQueue.jsx` | Start Here UI (no math change) |
| `src/pages/OrdersPage.jsx` | Wire strip, focus recovery, return capture, empty states |
| `src/components/logistics/OrdersLogisticsPanel.jsx` | Optional open callback for return capture |
| `src/pages/CollectionsPage.jsx` | Back to Orders |
| `src/pages/LabsPage.jsx` | Back to Orders |
| `src/pages/LogisticsDeliveryPage.jsx` | Back to Orders |
| `scripts/verify-orders-navigation-context.mjs` | **Create** |
| Blueprint `05`, `13`, `CHANGELOG` | Document UX |
| `docs/QA/modules/orders/Sprint1B_*` | Pre-impl, parity, UAT |

**Not touched:** APIs, schema, RPCs, lifecycle, Sprint 1A mutation semantics, Lab Ordering, checkout.

---

## 4–6. Parity / Verify / UAT

See companion Sprint 1B docs after implementation.

## Impact analysis

| Area | Impact |
|------|--------|
| Modules | Orders UX; light CTAs on Collections/Labs/Logistics |
| Tables / APIs / RLS | None |
| Business rules | None |
| Implementation gate | **ALLOWED** |
