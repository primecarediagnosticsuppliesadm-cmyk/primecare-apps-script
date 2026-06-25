# HQ Performance Certification

**Generated:** 2026-06-25T00:15:46.038Z
**PERF tenant:** 3ced2736-acd5-4504-a8cd-5223afbf69e1
**Scale target:** 1000 labs · 1000 agents · 100000 orders · 100000 payments

## Result: PASS

### Tenant row counts

| Table | Count | Target |
|-------|-------|--------|
| labs | 1000 | 1000 |
| agent_profiles (PERF seed uses synthetic IDs on labs) | 1000 | — |
| orders | 100000 | 100000 |
| payments | 100000 | 100000 |

**Count method:** Executive JWT — labs head count; watermark existence for PERF_AGENT_01000, PERF_ORD_00000001+PERF_ORD_00100000, PERF_PAY_00000001+PERF_PAY_00100000

### Benchmarks

| Surface | ms | Rows | Payload bytes | Bounded |
|---------|-----|------|---------------|---------|
| Orders (bounded) | 548 | 0 | 166 | yes |
| Collections (bounded) | 152 | 0 | 131 | yes |
| Admin Dashboard (bounded) | 183 | 0 | 479 | yes |
| Operations Center loader | 403 | 0 | 3732 | yes |
| Revenue Funnel orders probe | 286 | 100 | 7112 | yes |

- **Slowest query:** Orders (bounded) (548 ms)
- **API calls measured:** 5
- **Unbounded surfaces:** 0

### Indexes (verified via migration apply)

- `idx_orders_tenant_order_date`
- `idx_payments_tenant_payment_date`
