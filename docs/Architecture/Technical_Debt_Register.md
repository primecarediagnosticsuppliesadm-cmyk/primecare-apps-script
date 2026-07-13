# PrimeCare Technical Debt Register

Living register of architecture and performance debt. Updated with Sprint 2 projection work (2026-07-02).

---

## Production blockers (eliminate before scale)

| ID | Debt | Status | Sprint 1 impact |
|----|------|--------|-----------------|
| TD-001 | HQ dashboards read transactional tables + line fan-out | **IN PROGRESS (Phase 2 design)** | Phase 1 Orders/Collections shadow; Phase 2 dashboard/executive composites designed |
| TD-006 | Mega-loaders (Ops, Founder, EFI duplicate bundles) | **PARTIAL (Phase 2 design)** | Executive composite replaces `get_founder_snapshot`; EFI Phase 3 |
| TD-014 | Client-side KPI engines on raw order windows | **IN PROGRESS (Phase 2 design)** | Domain metrics projections own KPIs; dashboard adapter reads composite only |
| TD-019 | `get_founder_snapshot` QA statement timeout | **OPEN — Phase 2 target** | Replace with `read_tenant_executive_v1` + `proj_tenant_executive_metrics_v1` |
| TD-020 | `getAdminDashboardRead` order_lines fan-out | **OPEN — Phase 2 target** | Replace with `read_tenant_dashboard_v1` |
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

## Sprint 2 Phase 2 (planned implementation)

| ID | Debt | Status | Target |
|----|------|--------|--------|
| TD-019 | `get_founder_snapshot` 57014 timeout on QA | OPEN | `proj_tenant_executive_metrics_v1` |
| TD-020 | `getAdminDashboardRead` transactional scan + line fan-out | OPEN | `proj_tenant_dashboard_metrics_v1` |
| TD-021 | Domain metrics not yet materialized | **MITIGATED** | Deployed QA Phase 2; rebuild PASS |

---

## Projection Operations Center

| ID | Debt | Status | Target |
|----|------|--------|--------|
| TD-022 | No operational projection monitoring UI | **IN PROGRESS** | Projection Operations Center |
| TD-023 | No projection refresh timeline / drift alerts | **IN PROGRESS** | Ops center modules 2 + 9 |
| TD-024 | Cert results not aggregated for Executive | **MITIGATED** | Ops report + cert scripts |

### Sprint 3A — Production safety (2026-07-02)

| ID | Debt | Status | Sprint 3A note |
|----|------|--------|----------------|
| TD-025 | `refresh_proj_*` RPCs lack tenant authorization | **CLOSED** | `_proj_assert_refresh_access_v1` in Sprint 3A migration |
| TD-026 | `read_lab_receivables_list_v1` cross-tenant `todayCollections` | **CLOSED** | Tenant-scoped SUM via visible projection rows |
| TD-027 | `reset-platform-user-password` admin cross-tenant | **CLOSED** | Mirrors provision cross-tenant guard |
| TD-028 | Dashboard masks read failures as success + empty KPIs | **CLOSED** | `readFailed` + `degraded` on catch and queryErrors |
| TD-029 | Production observability FAIL | **IN PROGRESS** | Framework + placeholders; vendor wiring deferred |
| TD-030 | Backup/restore not validated | **IN PROGRESS** | Checklists + runbook; drill execution pending |
| TD-031 | `degraded` flag not consumed in consumer UI | **CLOSED** | `ReadHealthBanner` on 4 surfaces |
| TD-032 | Projection refresh EXECUTE granted to all authenticated | **CLOSED** | REVOKE PUBLIC/anon + guarded EXECUTE + service_role |

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
