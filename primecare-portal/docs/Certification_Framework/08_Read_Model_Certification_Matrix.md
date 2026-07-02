# 08 — Read Model / Projection Certification Matrix

**Sprint 2 Phase 1 — domain projections for Orders and Collections.**

Architecture: [18_Domain_Projection_Architecture.md](../PrimeCare_System_Blueprint/18_Domain_Projection_Architecture.md)  
Registry: [Projection_Registry.md](../../../docs/Architecture/Projection_Registry.md)

---

## Certification gate

| Check | Threshold | Script |
|-------|-----------|--------|
| Deploy probe | RPCs + tables exist | `verify-projection-parity.mjs` (preflight) |
| Parity — orders | item_count + orderTotal match (15 sample) | `verify-projection-parity.mjs` |
| Parity — collections | outstanding + totalPaid match (12 sample) | `verify-projection-parity.mjs` |
| Staleness | ≤ 60 s after rebuild | `verify-projection-staleness.mjs` |
| Performance — orders | ≤ 350 ms cold adapter | `run-hq-performance-certification.mjs` |
| Performance — collections | ≤ 300 ms cold adapter | `measure-sprint1-hq-reads.mjs` (adapter path) |
| RLS | projection SELECT mirrors SoT | `verify-hq-rls-reads.mjs` (extend) |
| Flag default | OFF (shadow) | `.env` — flags unset |

**Flag flip NO-GO** until all parity + staleness checks PASS on QA for 7-day shadow window.

---

## Projection registry (Phase 1)

| Registry ID | Table | Adapter RPC | SLA | Status |
|-------------|-------|-------------|-----|--------|
| PRJ-ORD-ORDER-v1 | `proj_order_v1` | `read_orders_list_v1` | 60 s | shadow |
| PRJ-COL-LAB-v1 | `proj_lab_receivable_v1` | `read_lab_receivables_list_v1` | 60 s | shadow |

---

## Commands

```bash
cd primecare-portal

# 1. Apply migration (Dashboard SQL or script)
node scripts/apply-sprint2-projection-migration.mjs

# 2. Rebuild + parity
node scripts/verify-projection-parity.mjs

# 3. Staleness
node scripts/verify-projection-staleness.mjs

# 4. Performance (transactional baseline; adapter when flags ON)
node scripts/measure-sprint1-hq-reads.mjs
PERF_SKIP_SEED=1 node scripts/run-hq-performance-certification.mjs

# 5. Regression
node scripts/verify-hq-list-detail-parity.mjs
node scripts/verify-primecare-production-golden-path.mjs
```

---

## Shadow mode workflow

1. Deploy migration — projection tables populated via `rebuild_projection_v1`.
2. Flags **OFF** — UI continues transactional reads.
3. Nightly / CI: `verify-projection-parity.mjs` + `verify-projection-staleness.mjs`.
4. When PASS for 7 days: enable `VITE_READ_ADAPTER_*` on QA only.
5. Re-run performance cert; compare delta vs transactional baseline.

---

## Performance targets (adapter path)

| Surface | Adapter | Target (cold QA) |
|---------|---------|------------------|
| Orders list | `read_orders_list_v1` | ≤ 350 ms |
| Collections | `read_lab_receivables_list_v1` | ≤ 300 ms |

Expected delta: eliminate `fetchOrderUnitCountsForOrders` fan-out (~12 calls → 1 RPC).
