# HQ Search — Runtime Evidence (Live QA)

**Date:** 2026-06-20  
**Environment:** Supabase QA (`zipuzmfkwwucbchlphcj`)  
**User:** `qa.admin@primecare.test`  
**Tenant:** `f168b98f-47a6-42c3-b788-24c00436fac2`

Verified via `node scripts/verify-hq-search-runtime.mjs` (authenticated Supabase session, not fixtures).

---

## Search Coverage Report (runtime)

```
HQ Search Coverage — Labs: 3, Users: 14, Orders: 15, Products: 4, POs: 4
```

| Entity | Source APIs | Count |
|--------|-------------|-------|
| Labs | `getLabsCredit` / `v_labs_credit` | 3 |
| Users | `getOperationsPlatformUsersRead` / `profiles` | 14 |
| Orders | `getOrdersRead` / `orders` | 15 |
| Products | `loadMasterCatalog` + `getLabCatalogRead` + `getStockDashboard` | 4 |
| POs | `getPurchaseOrdersRead` | 4 |

---

## Root cause: ORD-1728 / 1728

**Finding:** No order containing `1728` exists in live QA.

Sample order IDs in database:

- `ORD-1781915746583-5nygu3`
- `QA_ORD_001`, `QA_ORD_002`, `QA_ORD_003`
- `ORD-1782068662331-6byqdt`
- …15 total

**Conclusion:** Search returning zero results for `ORD-1728` and `1728` is **correct behavior** — data is missing, not indexing or matching failure.

**Note:** Fixture script `check-hq-global-search.mjs` used synthetic `ORD-1728` and falsely implied QA parity.

---

## Root cause: QA_SKU_003 (browser failures before deploy)

**Finding:** `QA_SKU_003` **exists** in `v_lab_catalog` and `v_stock_dashboard` for HQ tenant.

**Prior browser failure causes:**

1. **Uncommitted fixes** — multi-source product index + raw ID matching not deployed
2. **QA build hides diagnostics** — footer used `import.meta.env.DEV` only (false on Vercel QA); fixed to include `VITE_APP_ENV=qa`
3. **Not a data/RLS issue** for this SKU

Runtime search for `QA_SKU_003` → **1 result** → `QA Test Kit C` → `masterCatalog`

---

## Root cause: Labs not in navigation

**Finding:** `labs` was absent from `ADMIN_HQ_MENU_KEYS` while permissions allowed access.

**Fix:** Added `labs` to `ADMIN_HQ_MENU_KEYS` and OPERATIONS section (first item).

---

## Validation Matrix (live QA)

| Query | Results | Entity Types | Navigation |
|-------|---------|--------------|------------|
| QA Alpha | 1 | Labs | labs |
| Alpha | 1 | Labs | labs |
| QA Agent | 4 | Users | operationsCenter |
| Agent One | 2 | Users | operationsCenter |
| ORD | 6 | Orders, POs | orders, purchase |
| ORD-1728 | 0 | — | — *(no such order in DB)* |
| 1728 | 0 | — | — *(no such order in DB)* |
| QA_SKU_003 | 1 | Products | masterCatalog |
| QA Test Kit | 4 | Products | masterCatalog |
| PO | 4 | Purchase Orders | purchase |

---

## Reproduce

```bash
cd primecare-portal
node scripts/verify-hq-search-runtime.mjs
```

Browser (after deploy):

1. Login as QA admin
2. ⌘K → footer shows **HQ Search Coverage** counts
3. Type query → **Query diagnostics** shows result count + nav targets

---

## Browser QA evidence (2026-06-22)

Verified at `http://127.0.0.1:5175` as `qa.admin@primecare.test`:

| Check | Result |
|-------|--------|
| ⌘K opens search | Pass |
| Coverage footer | `Labs: 3, Users: 14, Orders: 15, Products: 4, POs: 4` |
| `QA_SKU_003` | 1 result → QA Test Kit C → `masterCatalog` |
| `ORD-1728` | 0 results (query diagnostics confirms data gap) |
| Labs in nav | Pass — OPERATIONS section, `/labs` loads 3 labs |
| Labs page | Pass — existing `LabsPage` (reverted broken V2 wrapper) |

Screenshots captured during session:

- Search coverage footer (empty query)
- `QA_SKU_003` with query diagnostics
- `ORD-1728` zero-result with diagnostics
- Labs page with nav visible
