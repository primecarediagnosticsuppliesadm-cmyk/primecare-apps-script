# HQ UX Hardening Sprint V1 — Review

**Date:** 2026-06-20  
**Scope:** HQ Admin / Executive UX only — no schema, RLS, auth, or write-path changes.

Scores use a 1–5 scale (5 = excellent for a new admin operator).

---

## Dashboard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 4 | Today's Work cards explain *what to do* with severity, count, and CTA. |
| Readability | 4 | Grouped sidebar + priority strip reduce scan time. |
| Discoverability | 4 | Global search (⌘K) and Help drawer added in header. |
| Actionability | 4 | Each priority card routes to the correct module. |

**Remaining issues**
- KPI sections below priorities still dense for first-time users.
- No inline drill-down from KPI tiles without leaving dashboard.

**Recommended next fixes**
- Collapse advanced KPI blocks behind "Show details".
- Add "last refreshed" timestamp on Today's Work strip.

---

## Orders

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 4 | Empty detail panel replaced with summary + suggested actions. |
| Readability | 4 | KPI row + filters remain; empty state guides next step. |
| Discoverability | 3 | Search navigates here via global index; no deep-link URL yet. |
| Actionability | 4 | "Review" replaces ambiguous "View"; status actions unchanged. |

**Remaining issues**
- Pending-orders shortcut filters to Placed only (Processing requires separate filter).
- Global search order context uses sessionStorage (lost on new tab).

**Recommended next fixes**
- Add "Open pending" compound filter (Placed + Processing).
- Optional `?orderId=` query param for shareable links.

---

## Credit & Risk (Collections HQ view)

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 3 | Rich filters and lab rows; still a large surface. |
| Readability | 3 | Many columns and badges; agent vs HQ modes differ. |
| Discoverability | 3 | Linked from priorities and sidebar; help copy added. |
| Actionability | 3 | HQ ops center uses "Review Lab"; agent "Open Lab" unchanged. |

**Remaining issues**
- Page title toggles between Collections and Credit & Risk by mode — can confuse new admins.
- Invoice expand still labeled "View" in lab-account drawer (lab-scoped).

**Recommended next fixes**
- Unified HQ page header with mode subtitle.
- HQ-only label pass on credit-risk table actions.

---

## Activity Center

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 4 | Timeline default; table toggle retained. |
| Readability | 4 | Human-readable sentences vs raw DB columns. |
| Discoverability | 4 | Listed under OPERATIONS; help describes timeline/table. |
| Actionability | 3 | Feed is read-only — no click-through to source module yet. |

**Remaining issues**
- Timeline rows are not clickable navigations.
- Event volume depends on `notification_events` population in QA.

**Recommended next fixes**
- Add module-aware "Review in …" link per row when entity ID is known.
- Severity icon set (not only left border color).

---

## Visits

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 3 | Functional list/detail; not part of this sprint's code changes. |
| Readability | 3 | Standard table layout. |
| Discoverability | 3 | In GROWTH section; help drawer documents purpose. |
| Actionability | 3 | Field-agent oriented; HQ uses for oversight. |

**Remaining issues**
- No HQ-specific visit queue or "labs not visited in N days" card on dashboard.

**Recommended next fixes**
- Dashboard card linking stale-visit labs.
- Cross-link from Collections credit-risk rows.

---

## Master Catalog

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 3 | CRUD flows exist; searchable via global index. |
| Readability | 3 | Product grid adequate; technical SKU IDs visible. |
| Discoverability | 4 | Global search includes products/SKUs. |
| Actionability | 3 | Edit flows clear; no bulk operations UX. |

**Remaining issues**
- Search lands on page but does not auto-focus product row.

**Recommended next fixes**
- Consume `hq_nav_context.productId` to scroll/highlight SKU.

---

## Inventory

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 3 | Critical items surfaced on dashboard priorities. |
| Readability | 3 | Stock tables can be wide on smaller screens. |
| Discoverability | 4 | Priority CTA + sidebar + search (via PO/SKU indirect). |
| Actionability | 3 | Reorder path requires navigating to Purchase. |

**Remaining issues**
- No single "fix stockout" wizard from priority card.

**Recommended next fixes**
- Deep link from critical inventory card with SKU filter pre-applied.

---

## Purchase / Reorder

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 3 | PO list and create flows present. |
| Readability | 3 | Status labels vary by source field names. |
| Discoverability | 4 | Included in global search index. |
| Actionability | 3 | PO search navigates to page; no auto-open PO detail. |

**Remaining issues**
- `hq_nav_context.poId` not yet consumed on landing.

**Recommended next fixes**
- PO detail drawer open from search selection.

---

## Operations Center

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 4 | User directory + provisioning; attention queue labels improved. |
| Readability | 4 | Tabbed layout; "Review Lab" / "Review inventory" CTAs. |
| Discoverability | 4 | User search in global index routes here. |
| Actionability | 4 | Clear provisioning actions; audit trail in Access Audit. |

**Remaining issues**
- User search does not auto-select user in directory grid.

**Recommended next fixes**
- Consume `hq_nav_context.userId` in UserProvisioningPanel.

---

## Access Audit

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 4 | Filters, KPIs, detail drawer — strong for compliance review. |
| Readability | 4 | Action labels resolved via engine. |
| Discoverability | 4 | Dashboard priority card + sidebar + help. |
| Actionability | 4 | Read-only by design; links to Operations Center in help. |

**Remaining issues**
- Export/download not available (screenshot-only).

**Recommended next fixes**
- CSV export (read-only client-side from loaded grid).

---

## Qualification Analytics

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 3 | Analytics table; unchanged this sprint. |
| Readability | 3 | Assumes familiarity with qualification stages. |
| Discoverability | 3 | Help drawer added; not in global search index. |
| Actionability | 2 | Limited HQ actions on this page (review-only). |

**Remaining issues**
- No queue-style "stalled qualifications" card on dashboard.

**Recommended next fixes**
- Add qualification stalled count to Today's Work when read API exposes it.

---

## Predator Debug

| Dimension | Score | Notes |
|-----------|-------|-------|
| Usability | 2 | Internal QA tool — intentionally dense. |
| Readability | 2 | Validator output is technical. |
| Discoverability | 2 | Hidden under SYSTEM; help warns it's not daily ops. |
| Actionability | 2 | Run validators only; not operator-facing. |

**Remaining issues**
- Should remain restricted to QA users in production messaging.

**Recommended next fixes**
- Role-gate or collapse under "Advanced" with warning banner.

---

## Cross-cutting improvements (this sprint)

| Feature | Status |
|---------|--------|
| Global HQ Search (⌘K / Ctrl+K) | Shipped — labs, users, orders, SKUs, POs |
| Help drawer (static config) | Shipped — per-page what / do / actions / related |
| Today's Work queue | Shipped — actionNeeded copy on each card |
| Orders empty state | Shipped |
| Activity timeline default | Shipped |
| Consistent action language (HQ) | Partial — Orders, Dashboard, Ops Center, Lab drawer |

---

## Overall HQ operator readiness

**Before sprint:** ~2.5/5 for a brand-new admin (scattered modules, table-heavy activity, empty order panel).  
**After sprint:** ~3.8/5 — clear entry points (search, help, work queue), better empty states, readable activity feed.

**Top 3 follow-up sprints**
1. Click-through from Activity timeline + search context consumption on all target pages.
2. Dashboard simplification mode (hide advanced KPIs by default).
3. Unified "Review Account" lab drawer entry from Collections, Orders, and Labs.
