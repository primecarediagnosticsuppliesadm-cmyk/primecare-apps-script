# HQ Workflow Navigation Matrix

Cross-module object links and context preservation for HQ Admin Workflow Hardening V1.

## Context pattern

All deep links use `persistHqNavContext` / `consumeHqNavContext` via helpers in `hqWorkflowNav.js`.

| Target page | Context keys | Consumer |
|-------------|--------------|----------|
| `labs` | `labId`, `labName`, `openReviewDrawer` | `LabsPage` → `HqLabsAdminView` |
| `orders` | `labId`, `orderId` | `OrdersPage` |
| `collections` | `labId`, `focusSection` | `CollectionsPage` |
| `visits` | `labId` | `AgentVisitPage` (pre-selects lab) |
| `operationsCenter` | `userId`, `agentId`, `agentName`, `openAssignDrawer`, `labId` | `OperationsCenterAdminPage` |

## Screen audit

### Labs (HqLabsAdminView)

| Object | Clickable | Action |
|--------|-----------|--------|
| Lab name | Yes | Open Review Lab drawer |
| Assigned agent | Yes | Operations Center + assignment drawer |
| Agent Coverage agent card | Yes | Operations Center + assignment drawer |
| Agent Coverage lab names | Yes | Review Lab drawer (in-page) |
| Orders / Collections / Visits buttons | Yes | Deep link with lab filter/context |
| Review Lab drawer tabs | Yes | Collections / Orders / Visits / Ops Center |
| Drawer order rows | Yes | Orders page filtered + order open |

### Orders

| Object | Clickable | Action |
|--------|-----------|--------|
| Order ID (list) | Yes | Open order detail |
| Lab name (list + detail) | Yes | Labs + Review drawer |
| Detail quick actions | Yes | Filter orders by lab / open Collections |

### Credit & Risk (CollectionsPage HQ view)

| Object | Clickable | Action |
|--------|-----------|--------|
| Attention queue lab name | Yes | Review Lab |
| Attention queue Review Lab | Yes | Labs + Review drawer |
| Receivables lab name | Yes | Review Lab (HQ credit view) |
| Record Payment / View Details | Yes | In-page expand (existing) |

### Activity Center

| Object | Clickable | Action |
|--------|-----------|--------|
| Event entity (when resolvable) | Yes | Orders / Labs / Collections / Ops Center |
| Open link (timeline) | Yes | Same as entity |

### Operations Center

| Object | Clickable | Action |
|--------|-----------|--------|
| User row (from search nav) | Yes | Focus + optional assignment drawer |
| Lab in assignment drawer | Yes | Highlight (existing) |

### Global Search

| Object | Clickable | Action |
|--------|-----------|--------|
| Lab / User / Order results | Yes | Context preserved per type |

## Remaining gaps (V1)

- Agent → Visits / Performance deep links from Ops Center user row
- Product/SKU search → Catalog page context
- PO search → Purchase Orders context
- Collections agent name → Operations Center
- Back navigation / breadcrumb trail (session context is one-shot consume)

## Validated flows

1. Search → Lab → Orders → Review Order
2. Lab → Agent → Assignment Drawer
3. Orders → Lab → Review Lab
4. Credit Risk → Lab → Review Lab (+ Collections in-page)
5. Activity Center → Lab/Order (when payload includes IDs)
