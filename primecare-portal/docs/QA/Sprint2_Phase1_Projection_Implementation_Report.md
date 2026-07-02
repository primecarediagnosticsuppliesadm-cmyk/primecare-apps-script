# Sprint 2 Phase 1 — Domain Projection Implementation Report

**Date:** 2026-07-02  
**Scope:** Orders + Collections domain projections  
**Mode:** Shadow (feature flags default OFF)

---

## Implemented

| Component | Artifact |
|-----------|----------|
| Migration | `20260705120000_sprint2_domain_projections_phase1.sql` |
| Fixes | `20260705120001_fix_proj_receivable_refresh.sql`, `20260705120002_fix_read_receivables_timeout.sql` |
| Tables | `proj_order_v1`, `proj_lab_receivable_v1`, `hq_projection_meta_v1` |
| Workers | `refresh_proj_order_row_v1`, `refresh_proj_lab_receivable_row_v1` |
| Rebuild | `rebuild_projection_v1` |
| Read adapters | `read_orders_list_v1`, `read_lab_receivables_list_v1` |
| Client | `projectionReadAdapters.js`, `projectionRefreshApi.js`, `readProjectionFlags.js` |
| Certs | `verify-projection-parity.mjs`, `verify-projection-staleness.mjs`, `measure-projection-reads.mjs` |

---

## Certification results (QA tenant)

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** |
| `verify-projection-parity.mjs` | **PASS** — 15 orders, 4 labs |
| `verify-projection-staleness.mjs` | **PASS** — 9–10 s lag |
| `verify-hq-list-detail-parity.mjs` | **PASS** |
| `verify-primecare-production-golden-path.mjs` | **PASS** (14/14) |

---

## Performance delta (QA cold)

| API | Transactional | Projection adapter | Delta |
|-----|---------------|-------------------|-------|
| Orders list | 2,052 ms | **615 ms** | **−70%** |
| Collections | 1,619 ms | **492 ms** | **−70%** |

Projection path: 1 RPC vs ~12 line-count fan-out (orders) / 3-table merge (collections).

---

## Parity report

- **Orders:** 100/100 rows; 15 sampled — item_count + orderTotal exact match
- **Collections:** 4/4 relevant labs; outstanding + totalPaid exact match
- **Summary:** totalOutstanding 1654 — match

---

## Shadow mode

- `VITE_READ_ADAPTER_ORDERS_V1` — **OFF** (default)
- `VITE_READ_ADAPTER_RECEIVABLES_V1` — **OFF** (default)
- Agent collections: `force: true` → always transactional (0 s SLA preserved)

---

## Remaining work

| Item | Phase |
|------|-------|
| 7-day shadow monitoring on QA | Before flag flip |
| Enable flags on QA → re-cert perf | Post-shadow |
| Phase 3 dashboard/EFI derived projections | TD-001 remainder |
| Event queue table (`projection_refresh_job`) | GAP-BP-020 |
| Payment-recorded refresh hook (server-side) | Phase 1.5 |

---

## GO / NO-GO

| Gate | Status |
|------|--------|
| Code + migrations | **PASS** |
| QA deploy | **PASS** |
| Parity | **PASS** |
| Staleness | **PASS** |
| Golden path | **PASS** |
| Build | **PASS** |
| Flag flip (production) | **NO-GO** — 7-day shadow required |

**Overall: CONDITIONAL GO** — shadow mode on QA; enable flags after shadow window.
