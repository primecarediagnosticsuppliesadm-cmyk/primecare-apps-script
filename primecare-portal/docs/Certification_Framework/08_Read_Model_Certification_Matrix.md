# 08 — Read Model / Projection Certification Matrix

**Sprint 2 — domain projections for Orders, Collections, Dashboard, and Executive.**

Architecture: [18_Domain_Projection_Architecture.md](../PrimeCare_System_Blueprint/18_Domain_Projection_Architecture.md)  
Registry: [Projection_Registry.md](../../../docs/Architecture/Projection_Registry.md)

---

## Certification gate

| Check | Threshold | Script |
|-------|-----------|--------|
| Deploy probe | RPCs + tables exist | `verify-projection-parity.mjs` (preflight) |
| Parity — orders | item_count + orderTotal match (15 sample) | `verify-projection-parity.mjs` |
| Parity — collections | outstanding + totalPaid match (12 sample) | `verify-projection-parity.mjs` |
| Parity — dashboard KPIs | executive + summary scalars vs transactional sample | `verify-dashboard-projection-parity.mjs` |
| Parity — executive KPIs | `get_founder_snapshot` field match | `verify-executive-projection-parity.mjs` |
| Staleness — core | ≤ 60 s after rebuild | `verify-projection-staleness.mjs` |
| Staleness — metrics/composite | ≤ 90 s dashboard / 180 s executive | `verify-projection-staleness.mjs` (extended) |
| Performance — orders | ≤ 350 ms cold adapter | `measure-projection-reads.mjs` |
| Performance — collections | ≤ 300 ms cold adapter | `measure-projection-reads.mjs` |
| Performance — dashboard | ≤ 350 ms cold adapter | `measure-dashboard-projection-reads.mjs` |
| Performance — executive | ≤ 400 ms cold adapter | `measure-dashboard-projection-reads.mjs` |
| RLS | projection SELECT mirrors SoT | `verify-hq-rls-reads.mjs` (extend) |
| Zero SoT on hot path | adapter must not query orders/ar/payments/inventory | `verify-dashboard-projection-parity.mjs` (static + runtime) |
| Flag default | OFF (shadow) | `.env` — all `VITE_READ_ADAPTER_*` unset |

**Flag flip NO-GO** until all parity + staleness + perf checks PASS on QA for **7-day shadow** (14-day for dashboard/executive composites).

---

## Projection registry

### Phase 1 — shadow

| Registry ID | Table | Adapter RPC | SLA | Status |
|-------------|-------|-------------|-----|--------|
| PRJ-ORD-ORDER-v1 | `proj_order_v1` | `read_orders_list_v1` | 60 s | shadow |
| PRJ-COL-LAB-v1 | `proj_lab_receivable_v1` | `read_lab_receivables_list_v1` | 60 s | shadow |

### Phase 2 — design (Sprint 2 Phase 2)

| Registry ID | Table | Adapter RPC | SLA | Status |
|-------------|-------|-------------|-----|--------|
| PRJ-ORD-METRICS-v1 | `proj_tenant_order_metrics_v1` | (composite only) | 90 s | design |
| PRJ-COL-METRICS-v1 | `proj_tenant_receivable_metrics_v1` | (composite only) | 90 s | design |
| PRJ-DSH-METRICS-v1 | `proj_tenant_dashboard_metrics_v1` | `read_tenant_dashboard_v1` | 90 s | design |
| PRJ-EXE-METRICS-v1 | `proj_tenant_executive_metrics_v1` | `read_tenant_executive_v1` | 180 s | design |

---

## Phase 2 commands (after migration)

```bash
cd primecare-portal

# 1. Apply migration
node scripts/apply-sprint2-phase2-projection-migration.mjs

# 2. Rebuild cascade (core → metrics → composites)
# via rebuild_projection_v1 per registry or full tenant rebuild script

# 3. Parity
node scripts/verify-projection-parity.mjs
node scripts/verify-dashboard-projection-parity.mjs
node scripts/verify-executive-projection-parity.mjs

# 4. Staleness
node scripts/verify-projection-staleness.mjs

# 5. Performance (shadow — flags still OFF for UI)
node scripts/measure-dashboard-projection-reads.mjs

# 6. Regression
node scripts/verify-primecare-production-golden-path.mjs
node scripts/run-browser-certification.mjs --prereq-only
```

---

## Shadow mode workflow

1. Deploy Phase 2 migration — populate metrics + composites via rebuild cascade.
2. Flags **OFF** — UI continues `getAdminDashboardRead` / `getFounderSnapshotRead`.
3. Nightly / CI: dashboard + executive parity + staleness.
4. When PASS for **14 days**: enable `VITE_READ_ADAPTER_DASHBOARD_V1` and `VITE_READ_ADAPTER_EXECUTIVE_V1` on QA only.
5. Re-run performance cert; confirm zero transactional scans in Predator trace.

---

## Performance targets (adapter path)

| Surface | Adapter | Target (cold QA) | Replaces |
|---------|---------|------------------|----------|
| Orders list | `read_orders_list_v1` | ≤ 350 ms | `getOrdersRead` fan-out |
| Collections | `read_lab_receivables_list_v1` | ≤ 300 ms | `getCollectionsRead` |
| Admin Dashboard | `read_tenant_dashboard_v1` | ≤ 350 ms | `getAdminDashboardRead` (~31–40s QA) |
| Executive snapshot | `read_tenant_executive_v1` | ≤ 400 ms | `get_founder_snapshot` (~8s timeout) |

---

## KPI ownership (no duplicate owners)

Canonical owners: [KPI_Catalog.json](../../../docs/Architecture/Enforcement/KPI_Catalog.json).  
Composites **copy only** — never re-aggregate from SoT at read time.

---

## Projection Operations Center gates

| Check | Threshold | Script |
|-------|-----------|--------|
| Ops catalog complete | All deployed registry IDs in catalog | `verify-projection-ops-center.mjs` |
| Meta readable | `hq_projection_meta_v1` SELECT for QA tenant | `verify-projection-ops-center.mjs` |
| Health record shape | 10 required fields per projection | `verify-projection-ops-center.mjs` |
| Ops report generated | JSON + MD artifact | `generate-projection-ops-report.mjs` |
| Full ops cert | Staleness + ops verify + report | `run-projection-ops-certification.mjs` |

Spec: [Projection_Ops_Center.md](../../../docs/Architecture/Projection_Ops_Center.md)

**Ops monitoring does not replace parity/staleness cert** — it aggregates and surfaces results for Executive visibility.
