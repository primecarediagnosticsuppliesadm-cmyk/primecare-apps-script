# PrimeCare Technical Debt Register

Living register of architecture and performance debt. Updated with Sprint 2 projection work (2026-07-02).

---

## Production blockers (eliminate before scale)

| ID | Debt | Status | Sprint 1 impact |
|----|------|--------|-----------------|
| TD-001 | HQ dashboards read transactional tables + line fan-out | **MITIGATED (Phase 1)** | Orders + Collections projections; Dashboard/Ops/EFI Phase 3 |
| TD-006 | Mega-loaders (Ops, Founder, EFI duplicate bundles) | OPEN | Ops cache peek + EFI parallel extras |
| TD-014 | Client-side KPI engines on raw order windows | OPEN | Phase 3 derived KPI projections |
| TD-004 | HQ Read Model not in Blueprint | **MITIGATED** | Blueprint 18 + Projection Registry |
| TD-003 | No committed ADRs | **CLOSED** | ADR-001 committed |

---

## High priority

| ID | Debt | Status | Sprint 1 impact |
|----|------|--------|-----------------|
| TD-005 | Fragmented read caches (6+ TTL maps) | **MITIGATED** | `hqReadCoordinator.js` unified invalidate |
| TD-002 | Dual `order_items` / `order_lines` | OPEN | Unchanged |
| TD-007 | Schema drift migrations vs sql/ | OPEN | Unchanged |
| TD-013 | Distributor OS not blueprint-governed | OPEN | Unchanged |

---

## Medium priority

| ID | Debt | Status | Sprint 1 impact |
|----|------|--------|-----------------|
| TD-008 | Scattered audit tables (GAP-BP-007) | OPEN | Unchanged |
| TD-009 | Apps Script hybrid paths (DA-002) | OPEN | Unchanged |
| TD-010 | Catalog creates inventory (GAP-BP-009) | OPEN | Unchanged |
| TD-011 | Supplier free-text on PO | OPEN | Unchanged |
| TD-012 | `event_log` RLS gap | OPEN | Unchanged |
| TD-015 | Collections N+1 history on list load | **CLOSED** | `lastPaymentByLabId` from bounded payments |
| TD-016 | Dashboard widgets block KPI paint | **MITIGATED** | Deferred Today's Work + Logistics widget |
| TD-017 | HqPrioritiesStrip duplicate card fetches | **CLOSED** | Single `loadHqTodaysWorkBundle` |
| TD-018 | Sprint 2 projection migration deploy + flag flip | **MITIGATED** | Deployed QA; shadow mode; parity PASS |

---

## Acceptable debt (retain)

| Item | Reason |
|------|--------|
| Non-blocking shipment after fulfill | Blueprint invariant |
| Agent collections force-fresh | Correctness over perf |
| Bounded read limits until read models | Bridge only |

---

## Future acceptable (gated)

| ID | Debt | Gate |
|----|------|------|
| FD-001 | In-process event bus vs queue | < 50 distributors |
| FD-002 | Read models in primary Postgres | PERF cert pass |
| FD-004 | Manual CSV until `rpt_*` views | Year 1 |
