# PrimeCare Operational Readiness Report

**Audit date:** Generated with Operational Foundation Audit V1  
**Scope:** LAB · AGENT · ADMIN · EXECUTIVE · Predator/QA  
**Legend:** ✓ Full · ~ Partial · ✗ Placeholder · ⚠ Risk flag

---

## Executive summary

PrimeCare has **production-grade ordering, collections, agent workspace, and operations center** paths backed by Supabase reads. Gaps cluster around **field evidence**, **offline/GPS**, **deep-link navigation from ops surfaces**, and **some disabled CTAs** (phone/WhatsApp). This report is the baseline for Operational Foundation V1; Evidence Layer V1 addresses the largest trust gap.

---

## LAB

| Feature | Status | Notes |
|---------|--------|-------|
| Product catalog & cart | ✓ | Supabase catalog + cart draft persistence |
| Checkout / order submit | ✓ | `createOrderWrite` + duplicate-submit guard |
| Order tracking drawer | ✓ | Shared `OrderTrackingDrawer`, lab-scoped fetch |
| Previous orders | ✓ | Table/cards + track/repeat |
| Payments & Account | ✓ | `CollectionsPage` lab mode |
| Activity / Operations Inbox | ✓ | Lab-safe notification filter |
| Repeat order | ✓ | Cart handoff via localStorage |
| Notifications | ~ | Real events when DB populated; placeholders when empty |
| Mobile UX | ~ | Cart drawer, sticky actions; needs device QA matrix |

**Gaps:** No lab-visible visit/collection evidence. Invoice download = toast placeholder.

---

## AGENT

| Feature | Status | Notes |
|---------|--------|-------|
| Daily workspace V2 | ✓ | Queue, route, performance strip |
| Agent Visit V2.5 wizard | ✓ | Multi-step, Supabase `createAgentVisitWrite` |
| Collections handoff | ✓ | Pending collection task → Collections |
| Follow-ups | ✓ | Visit wizard + workspace queue |
| Task queue | ~ | UI present; Supabase tasks empty (`[]`) |
| Lab snapshot drawer | ✓ | Agent + ops variants |
| Mobile sticky actions | ✓ | Workspace bottom bar |
| Evidence upload | **V1 NEW** | Visit/collection proof (this phase) |
| GPS / location | ✗ | Not implemented |
| Offline mode | ✗ | No service worker / offline queue |

**Gaps:** Phone/WhatsApp CTAs disabled. No GPS. Tasks not in Supabase.

---

## ADMIN

| Feature | Status | Notes |
|---------|--------|-------|
| Admin dashboard | ✓ | `getAdminDashboardRead` + KPI merge |
| Inventory / stock | ✓ | Stock dashboard + ledger |
| Procurement / PO | ✓ | `getPurchaseOrdersRead` |
| Collections | ✓ | Payment write + AR roll-forward |
| Operations Command Center | ✓ | Attention queue, risk, feed |
| Notifications | ✓ | Admin filters + event types |
| Risk engine | ~ | Deterministic ops risk; not ML |
| Evidence preview | **V1 NEW** | `EvidencePreviewDrawer` |

**Gaps:** Performance page placeholder. Some insights page is AI-marketing surface.

---

## EXECUTIVE

| Feature | Status | Notes |
|---------|--------|-------|
| Control tower | ✓ | Executive dashboard read |
| Operations center | ✓ | Shared with admin |
| Financial visibility | ✓ | Collections + ops financial panel |
| Health score | ✓ | Deterministic weighted score |
| Escalation visibility | ~ | Via attention queue severity |

---

## PREDATOR / QA

| Area | Status | Notes |
|------|--------|-------|
| Tenant isolation | ✓ | Validators + RLS assumptions |
| Role isolation | ✓ | Menu + permissions |
| UI sync snapshots | ~ | Admin/collections modules |
| Stale state guards | ~ | KPI preservation on admin dashboard |
| Validation coverage | ~ | Per-module; evidence validator added V1 |
| Mobile render | ⚠ | Manual QA checklist required |

---

## Fake-complete risks

1. **Disabled CTAs** without navigation (Call/WhatsApp on agent queue) — correctly disabled, not dead clicks.
2. **Invoice / support toasts** on lab ordering — intentional placeholders.
3. **Empty notification feed** shows demo placeholders for lab only when inbox empty.
4. **Evidence before V1** — no proof-of-visit; **addressed in this phase**.

---

## Real-world readiness checklist

| Requirement | Ready? |
|-------------|--------|
| Lab can order & track | Yes |
| Agent can visit, collect, prioritize | Yes |
| Admin can see ops risk & collections | Yes |
| Field accountability (photo proof) | V1 |
| Offline field work | No |
| Audit export / compliance pack | Partial |

---

## Recommended next maturity steps (post-V1)

1. Supabase `operational_evidence` table + storage bucket RLS (ops migration).
2. Agent task queue backed by Supabase.
3. GPS capture (optional) on evidence upload.
4. Deep links from Operations Center into filtered Orders/Collections views.
5. Device QA matrix (iPhone Safari, Android Chrome) signed off in Predator.
