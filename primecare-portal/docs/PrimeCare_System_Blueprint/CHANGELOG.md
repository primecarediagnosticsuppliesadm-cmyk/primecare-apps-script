# Blueprint CHANGELOG

Gaps, conflicts, and structural changes. **Add entry when doc vs code disagree or structure changes.**

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
