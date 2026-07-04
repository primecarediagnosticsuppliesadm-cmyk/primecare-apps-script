# Blueprint CHANGELOG

Gaps, conflicts, and structural changes. **Add entry when doc vs code disagree or structure changes.**

---

## 2026-07-03 — Sprint 8B Labs KPI Definition

### Change

- Define `Active Labs` as lifecycle-active labs (`labs.status == ACTIVE`) and explicitly state that it is unaffected by `ordering_mode`.
- Define `Order-Eligible Labs` as lifecycle-active labs with `ordering_mode != suspended` and `ordering_eligible == true`.
- Define `Ordering Suspended` as labs where `ordering_mode == suspended`; checkout is intentionally blocked while invoices, payments, Track Order, finance, logistics, and history remain available.
- Update Labs certification references so `verify-labs-admin-flow.mjs` validates the three KPI definitions.

### Not changed

- No SQL, schema, RLS policy, projection table, projection flag, finance, AR, payment, invoice, order lifecycle, inventory, logistics, commission, or ordering behavior changes.
- `Active Labs` semantics are preserved and not silently redefined.

### Verification gates

- `npm run build`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- Manual Labs Portfolio Summary UAT: suspend/re-enable ordering and confirm only Order-Eligible / Ordering Suspended counts move.

---

## 2026-07-03 — Sprint 8A.1 Labs Projection Hardening

### Change

- Harden `readLabsListV1` so stale/unavailable/empty/failed projection reads fall back to the existing `getLabsCredit` / `v_labs_credit` path with `degraded: true` and `source: "fallback"`.
- Make `verify-labs-projection-parity.mjs` read-only by default; Labs projection rebuilds move to `repair-labs-projection.mjs --apply`.
- Extend Labs projection certification for deterministic `read_labs_list_v1` ordering/limit windows and SECURITY DEFINER adapter visibility vs projection table RLS.

### Not changed

- No finance, AR, payments, invoices, orders, inventory, logistics, commissions, delivery charge rules, business logic ownership, RLS policy, SQL semantics, or production flag changes.
- `VITE_READ_ADAPTER_LABS_V1` remains disabled by default.

### Verification gates

- `npm run build`
- `node scripts/verify-scripts-readonly.mjs`
- `node scripts/verify-labs-projection-parity.mjs`
- Full Sprint 8A regression bundle before QA flag review.

---

## 2026-07-03 — Sprint 8A Labs Projection QA Shadow

### Change

- Add the approved Laboratory domain projection `proj_lab_profile_v1` at `(tenant_id, lab_id)` grain for lab identity/profile/ownership/qualification/ordering display fields.
- Add `read_labs_list_v1` as a read adapter that composes `proj_lab_profile_v1` with the finance-owned `proj_lab_receivable_v1` to preserve the existing `v_labs_credit` UI contract without duplicating receivable ownership.
- Register `PRJ-LAB-PROFILE-v1` in projection registry, staleness, Projection Ops, and Labs parity certification.
- Add `VITE_READ_ADAPTER_LABS_V1` as a disabled-by-default shadow flag.
- Optimize `read_labs_list_v1` with an explicit adapter visibility predicate: admin uses the equivalent own-tenant fast path; all other roles continue through `distributor_lab_record_visible`.

### Not changed

- No finance, AR, payments, allocations, invoices, orders, inventory, logistics, commissions, delivery charge rules, or business logic ownership changes.
- No production flag enablement.
- No `proj_lab_credit_v1`; receivable data remains owned by `proj_lab_receivable_v1`.

### Verification gates

- `npm run build`
- `node scripts/verify-labs-projection-parity.mjs`
- `node scripts/verify-projection-staleness.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-ar-reconcile.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`

---

## 2026-07-03 — Sprint 7B Data Path Optimization & Progressive Loading

### Change

- Split Executive Financial Intelligence initial load from deep analytics: core summary renders first; portfolio/payments/shipments/catalog/commission analytics load after idle.
- Removed default EFI order-line fallback from initial analytics; EFI uses `orders.total_amount` as the merchandise SoT and leaves line fallback opt-in for deep diagnostics.
- Removed founder snapshot RPC from the default Operations Command Center load path; Operations initial and extended panels no longer block on founder analytics.
- Reused the Sprint 7A shared read broker in the distributor/founder portfolio loader for shared labs, orders, and collections reads.

### Not changed

- No SQL, schema, RLS, projection architecture, projection adapters, projection flags, finance, AR, invoice, payment, inventory, logistics lifecycle, delivery charge, ordering, pricing, or commission business logic changed.
- Existing verification scripts were not modified for Sprint 7B.
- No production deployment.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/verify-hq-rls-reads.mjs`

---

## 2026-07-03 — Sprint 7A Client-Side Read Orchestration

### Change

- Add a client-only shared read broker for high-reuse reads with in-flight dedupe, TTL cache reuse, scoped cache keys, and standardized read health envelopes.
- Add route prefetch measurement for role-route alignment and a duplicate-read broker measurement probe.
- Keep existing Supabase/RLS/API contracts as the source of truth; broker reads wrap existing read APIs only.

### Not changed

- No SQL, schema, RLS, projection flags, write APIs, finance, AR, invoice, payment, inventory, logistics, ordering, pricing, or commission business logic changed.
- No production deployment.

### Verification gates

- `npm run build`
- `node scripts/verify-runtime-import-safety.mjs`
- `node scripts/run-browser-smoke-all-roles.mjs`
- `node scripts/measure-all-role-page-performance.mjs`
- `node scripts/verify-financial-reconciliation.mjs`
- `node scripts/verify-delivery-charge-policy.mjs`
- `node scripts/verify-hq-rls-reads.mjs`
- `node scripts/measure-route-prefetch.mjs`
- `node scripts/measure-data-broker-duplicates.mjs`

---

## 2026-07-03 — Sprint 6A.1 Read-Only Verification Safety Gate

### Change

- `verify-ar-reconcile.mjs` is now read-only and runs only the collection inconsistency audit.
- AR reconciliation mutation moved to `repair-ar-reconcile.mjs`, dry-run by default and requiring `--apply` or `CONFIRM_MUTATION=true` for the `reconcile_ar_from_payments` RPC.
- `verify-scripts-readonly.mjs` added to audit `verify-*`, `check-*`, `measure-*`, and `run-*-certification.mjs` scripts for obvious mutation patterns.
- `verify-production-readiness.mjs` now runs the read-only guard before nested readiness checks.
- Legacy mutation-capable verification probes now require an explicit apply confirmation for default safety.

### Not changed

- No finance, AR, payment, invoice, allocation, Orders adapter, RLS, schema, projection, inventory, or logistics business logic changed.
- No production deployment.

### Verification gates

- `node scripts/verify-scripts-readonly.mjs`
- Sprint 6A read-only certification bundle before commit recommendation.

---

## 2026-07-03 — Sprint 6A Orders Projection Adapter (QA enablement)

### Change

- `VITE_READ_ADAPTER_ORDERS_V1=true` enabled on QA (`.env.local`) — HQ Orders list now reads from `proj_order_v1` via `read_orders_list_v1`.
- Other read adapters remain **OFF** (`VITE_READ_ADAPTER_RECEIVABLES_V1`, `VITE_READ_ADAPTER_DASHBOARD_V1`, `VITE_READ_ADAPTER_EXECUTIVE_V1`).
- `OrdersPage.jsx`: skips `enrichOrdersListWithItemCounts` (transactional `order_lines`/`order_items` fan-out) when the list is projection-sourced — projection rows already carry `item_count`.
- `getOrdersRead` (`primecareSupabaseApi.js`): projection path now shares the same in-flight coalesce + 45 s TTL cache as the transactional path, so sidebar summary + Orders page + Operations Center coalesce to one RPC per TTL.
- Detail drawer path (`getOrderDetailsRead`) unchanged — transactional SoT reads permitted for a single order.

### Not changed

- No SoT writes, no lifecycle changes, no RLS changes, no finance/AR/inventory/logistics logic, no projection schemas.
- Production deployment untouched. QA-only.

### Verification gates (Sprint 6A)

- `verify-projection-parity.mjs`, `verify-projection-staleness.mjs`
- `verify-hq-list-detail-parity.mjs` (list `itemCount` vs detail drawer)
- `verify-admin-dashboard-no-transactional-lines.mjs`, `verify-financial-reconciliation.mjs`, `verify-delivery-charge-policy.mjs`, `verify-production-readiness.mjs`, `verify-runtime-import-safety.mjs`
- `run-browser-smoke-all-roles.mjs`, `measure-all-role-page-performance.mjs`

### References

- `18_Domain_Projection_Architecture.md` (adapter flags, staleness SLA)
- `05_Order_Lifecycle.md`, `06_Finance_Rules.md`, `15_Do_Not_Break_Rules.md`

---

## 2026-07-02 — Sprint 3A Production Safety Hardening

### Implemented (approved P0 fixes only)

| ID | Fix | Artifact |
|----|-----|----------|
| TD-025 / SEC-01 | Tenant auth on all `refresh_proj_*` SECURITY DEFINER RPCs | `20260702170000_sprint3a_production_safety_hardening.sql` |
| TD-032 | Least-privilege EXECUTE grants on refresh RPCs | Same migration |
| TD-027 / SEC-03 | Cross-tenant guard on `reset-platform-user-password` | Edge function |
| TD-026 / SEC-04 | Tenant-scoped `todayCollections` in `read_lab_receivables_list_v1` | Same migration |
| TD-028 / REL-01 | Dashboard `readFailed` — no silent zero KPIs | `primecareSupabaseApi.js` |
| TD-031 / REL-03 | `ReadHealthBanner` on Dashboard, Ops, Executive, Projection Ops | UI + `readHealth.js` |
| WS3 | Migration inventory + manifest + remediation plan | `Sprint3A_Migration_*` |
| WS4 | Observability abstraction + health endpoint + correlation IDs | `src/observability/` |
| WS5 | Backup/restore/rollback checklists + production runbook | `docs/operations/Sprint3A_*` |

### Verification scripts added

- `verify-security-hardening.mjs`
- `verify-migration-integrity.mjs`
- `verify-production-readiness.mjs`
- `verify-observability.mjs`

### Out of scope (unchanged)

- No `VITE_READ_ADAPTER_*` flag flips
- No projection architecture / read adapter logic changes
- No finance / logistics / inventory business rules

---

## 2026-07-02 — Projection Operations Center (ops monitoring)

### Added (design + implementation)
- Blueprint 18 Projection Operations Center section (10 modules)
- [Projection_Ops_Center.md](../../../docs/Architecture/Projection_Ops_Center.md) spec
- Cert matrix 08 ops gates
- TD-022, TD-023, TD-024 registered
- TD-021 mitigated (Phase 2 deployed QA)

### Scope
- Read-only monitoring via `hq_projection_meta_v1` + catalog
- No projection/adapter/flag changes
- Executive UI + CLI verification scripts

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-024 | ops | Refresh timeline limited to meta + local rebuild history (no append-only event log yet) | OPEN |
| GAP-BP-025 | ops | Parity dashboard requires cert script run for full field compare | OPEN |

---

## 2026-07-02 — Sprint 2 Phase 2 Dashboard & Executive (design)

### Added (design only — no schema yet)
- Blueprint 18 Sprint 2 Phase 2 section — domain metrics + thin dashboard/executive composites
- Registry entries: PRJ-ORD-METRICS-v1, PRJ-COL-METRICS-v1, PRJ-DSH-METRICS-v1, PRJ-EXE-METRICS-v1
- Cert matrix 08 Phase 2 gates + verification scripts planned
- TD-019, TD-020, TD-021 registered

### Design decisions
- Incremental refresh from `proj_order_v1` / `proj_lab_receivable_v1` only — no SoT at adapter read
- Replaces `getAdminDashboardRead` and `get_founder_snapshot` hot paths
- Flags `VITE_READ_ADAPTER_DASHBOARD_V1`, `VITE_READ_ADAPTER_EXECUTIVE_V1` default OFF
- 14-day shadow for composites before flag flip

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-022 | architecture | Phase 2 migration not deployed | OPEN |
| GAP-BP-023 | cert | Dashboard/executive parity scripts not yet implemented | OPEN |

---

## 2026-07-02 — Sprint 2 Phase 1 Domain Projections

### Added
- Migration `20260705120000_sprint2_domain_projections_phase1.sql` (+ fix migrations 001, 002)
- Client adapters, feature flags, parity/staleness certification scripts
- Cert matrix `08_Read_Model_Certification_Matrix.md`
- ADR-001 committed

### Updated
- Projection Registry status: `shadow`
- TD-001 mitigated (Orders + Collections); TD-003 closed

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-019 | architecture | Screen-oriented names | **CLOSED** — `proj_*` / `read_*` deployed |
| GAP-BP-020 | architecture | Event queue / worker | OPEN — Phase 1 uses row refresh + rebuild |
| GAP-BP-021 | cert | Flag flip after 7-day shadow | OPEN |

---

## 2026-07-02 — Domain Projection Architecture v2

### Added
- Blueprint `18_Domain_Projection_Architecture.md` — domain-driven read layer (replaces screen-oriented read model naming)
- `docs/Architecture/Projection_Registry.md` — authoritative projection catalog (`PRJ-*` registry IDs)

### Updated
- `README.md` — doc 18 in index; link to Projection Registry
- Sprint 2 implementation plan — **must rename** before schema:
  - `hq_orders_summary_v1` → `proj_order_v1`
  - `hq_collections_summary_v1` → `proj_lab_receivable_v1`
  - `get_*_summary_v1` → `read_*_v1` (read adapters, not projections)

### Gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-017 | gap | ADR-001 not committed; superseded by domain naming in doc 18 | OPEN |
| GAP-BP-018 | gap | Blueprint 17 (`HQ_Read_Model`) never created — superseded by doc 18 | CLOSED |
| GAP-BP-019 | architecture | Screen-oriented read model names in Sprint 2 draft | OPEN — rename required |
| GAP-BP-020 | architecture | No projection event queue / worker yet — Phase 1 uses row refresh + sweep | OPEN |

### Migration impact
**None** — documentation only until approved schema change.

---

## 2026-07-02 — Phase 2 Certification Framework

### Added
- Blueprint `16_Certification_Framework.md` — framework index and workflow
- `docs/Certification_Framework/` — 7 artifacts (object catalog, screen catalog, dependency graph, browser golden path, browser regression, release scorecard, performance matrix)
- `docs/Certification_Framework/browser-regression-manifest.json` — suite definitions
- `scripts/run-browser-certification.mjs` — API prereq orchestrator + manual checklist printer

### Updated
- `README.md` — doc 16 in index
- `13_Verification_Matrix.md` — framework cross-reference
- `14_Release_Gates.md` — cert framework + browser orchestrator gates

### Migration impact
**None** — documentation and non-mutating orchestration only.

---

## 2026-06-30 — AI Architect Mode + doc restructure

### Added
- Cursor rule: `.cursor/rules/primecare-ai-architect.mdc`
- Blueprint numbering 00–15 + templates/
- Legacy docs `01_schema_catalog.md` … `12_verification_matrix.md` superseded by 00–15 (retained for reference)

### Conflicts / gaps documented

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-001 | Schema drift | `supabase/migrations/` (13) vs `supabase/sql/` (52) — unclear single apply order | OPEN |
| GAP-BP-002 | Dual model | `order_items` + `order_lines` coexist | OPEN — detail reads try both |
| GAP-BP-003 | Type drift | `tenant_id` uuid vs text in legacy rows | OPEN |
| GAP-BP-004 | Migration | Phase 3A delivery columns may be missing on QA while client deployed | OPEN — shipment insert PGRST204 |
| GAP-BP-005 | RLS | `event_log` enabled without policies | OPEN |
| GAP-BP-006 | Product | No DB enum for lab ordering mode (HQ Managed / Hybrid / Self-Service) | MITIGATED — `labs.ordering_mode` Phase 4 |
| GAP-BP-007 | Audit | No single `audit` table — scattered audit tables | DOCUMENTED |
| GAP-BP-008 | Legacy | Apps Script fallback can show misleading errors if unguarded | MITIGATED in lab track path |
| GAP-BP-009 | Architecture | Catalog create seeds inventory (GAP-001 / DA-001) | DEFERRED |
| GAP-BP-010 | Roles | `read_only_auditor`, distributor roles not in pilot launch | BY DESIGN |

### Resolved (reference)

| ID | Resolution |
|----|------------|
| GAP-BP-011 | Lab Track Order — `getLabOrderDetailsRead` + cache handoff (code fix 2026-06-30) |
| GAP-BP-012 | Lab delivery snapshot PATCH 406 — `persist_order_delivery_snapshot` SECURITY DEFINER RPC (2026-07-01) |
| GAP-BP-013 | Lab ordering governance — `labs.ordering_mode` + initiation gates (2026-07-03) |
| GAP-BP-014 | Logistics Phase 4 route planning — `delivery_routes` + stop sequencing (2026-07-04) |
| GAP-BP-015 | Lab checkout false-success — persistence read-back gate before success banner (2026-07-02) |
| GAP-BP-015b | Lab checkout hardening — RPC order-row required, retry confirmation, structured diagnostics + build stamp, pending-track UX (2026-06-28) |
| GAP-BP-016 | Track Order stale-drawer fix + HQ Orders item count from order_lines/order_items quantities (2026-06-28) |

### Open (reference)

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-012 | conflict | Lab checkout called client PATCH on `orders` for delivery snapshot; `orders_update_by_role` blocks lab UPDATE → PGRST116/406 | MITIGATED — RPC path |

---

## How to add entries

```markdown
## YYYY-MM-DD — Short title

| ID | Type | Description | Status |
|----|------|-------------|--------|
| GAP-BP-0NN | conflict / gap / resolved | ... | OPEN / MITIGATED / CLOSED |
```

**Type:** `conflict` = blueprint vs code; `gap` = missing feature/schema; `resolved` = fixed.

---

## Sync with docs/QA

Mirror closed gaps to `docs/QA/QA_Gap_Register.md` when certified.
