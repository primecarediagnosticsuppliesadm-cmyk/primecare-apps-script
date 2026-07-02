# Projection Operations Center

**Operational monitoring layer for the PrimeCare Projection Platform.**

Architecture: [18_Domain_Projection_Architecture.md](../primecare-portal/docs/PrimeCare_System_Blueprint/18_Domain_Projection_Architecture.md)  
Registry: [Projection_Registry.md](./Projection_Registry.md)

---

## Scope boundaries (mandatory)

| Allowed | Forbidden |
|---------|-----------|
| Read `hq_projection_meta_v1` | Modify projection tables/workers |
| Read registry catalog JSON | Modify read adapters |
| Trigger `rebuild_projection_v1` | Flip `VITE_READ_ADAPTER_*` flags |
| Store ops history (localStorage / report files) | Change finance/AR/inventory write paths |
| Aggregate cert script output | Remove transactional read paths |

---

## Module map

```
projectionMetricsApi.js
  ├── projectionHealthRegistry.js      (1)
  ├── projectionRefreshTimeline.js     (2)
  ├── projectionFreshnessDashboard.js  (3)
  ├── projectionParityDashboard.js     (4)
  ├── projectionFailureDashboard.js    (5)
  ├── projectionRebuildConsole.js      (6)
  ├── projectionShadowMonitoring.js    (7)
  ├── projectionCertificationReport.js (8)
  └── projectionDriftAlerts.js           (9)
```

---

## Health record schema

```json
{
  "registryId": "PRJ-ORD-ORDER-v1",
  "table": "proj_order_v1",
  "status": "shadow",
  "rowCount": 171,
  "freshnessMs": 42000,
  "freshnessHuman": "42s",
  "freshnessSlaMs": 60000,
  "freshnessStatus": "PASS",
  "lastRebuild": "2026-07-02T20:50:42.062537+00:00",
  "refreshDurationMs": 453,
  "parityStatus": "PASS",
  "failureCount": 0,
  "lastError": null,
  "shadowStatus": "shadow-off",
  "featureFlag": "VITE_READ_ADAPTER_ORDERS_V1",
  "featureFlagStatus": "OFF",
  "adapterRpc": "read_orders_list_v1",
  "tenantId": "f168b98f-47a6-42c3-b788-24c00436fac2"
}
```

### Status enums

| Field | Values |
|-------|--------|
| `freshnessStatus` | PASS, WARN (>80% SLA), FAIL (>SLA) |
| `parityStatus` | PASS, WARN, FAIL, SKIP, UNKNOWN |
| `shadowStatus` | `shadow-off`, `shadow-on`, `active-off`, `active-on`, `planned`, `design` |
| `featureFlagStatus` | OFF, ON, N/A |

---

## Data sources

| Source | Table / artifact | Fields used |
|--------|------------------|-------------|
| Meta SoT | `hq_projection_meta_v1` | `registry_id`, `as_of`, `row_count`, `last_error`, `updated_at` |
| Catalog | `projectionOpsCatalog.json` | registry nodes, adapters, flags, SLAs |
| Ops history | `localStorage` key `primecare_projection_ops_v1` | rebuild runs, cert runs, failure counts |
| Cert scripts | `scripts/verify-*.mjs` | parity/staleness (CLI only) |

---

## UI — ProjectionOperationsCenterPage

Executive-only route. Sections:

1. Summary tiles (aggregate freshness, failures, drift alerts)
2. Health Registry table (all 10 fields)
3. Freshness + Parity + Failure panels
4. Refresh Timeline
5. Shadow Monitoring
6. Rebuild Console (per registry + full cascade)
7. Certification Report (last run + trigger note for CLI)
8. Drift Alerts list

---

## Verification

```bash
cd primecare-portal
node scripts/verify-projection-ops-center.mjs
node scripts/generate-projection-ops-report.mjs
node scripts/run-projection-ops-certification.mjs
```

---

## Certification matrix reference

See [08_Read_Model_Certification_Matrix.md](../primecare-portal/docs/Certification_Framework/08_Read_Model_Certification_Matrix.md) — Section "Projection Operations Center gates".
