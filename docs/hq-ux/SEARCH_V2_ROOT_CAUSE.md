# HQ Search V2 — Root Cause Analysis

**Sprint:** HQ Admin UX Hardening V2 (Search Reality Verification)  
**Date:** 2026-06-20

## Symptoms (QA runtime)

| Query | Expected | Observed |
|-------|----------|----------|
| `ORD-1728` | Matching order | No results |
| `1728` | Matching order | No results |
| `QA_SKU_003` | Matching product/SKU | No results |

Fixture script (`check-hq-global-search.mjs`) passed — failures were **runtime-only**.

---

## Root causes

### 1. Product index too narrow (QA_SKU_003)

**Cause:** Search indexed products only from `loadMasterCatalog({ tenantId })`, which reads HQ-tenant catalog via `getLabCatalogRead` with tenant preference. SKUs that exist in **inventory / stock dashboard** or under **distributor tenant rows** were excluded when not present in the HQ master catalog response.

**Fix:** Merge product sources without new APIs:

- `loadMasterCatalog({ tenantId })`
- `getLabCatalogRead({})` — all RLS-visible catalog rows
- `getStockDashboard().data.inventory` — stock SKUs

Dedupe by `productId`.

### 2. ORD-1728 / 1728 — data missing in live QA (not a search bug)

**Cause (live QA verified):** No order in the QA database contains `1728`. Authenticated admin sees 15 orders (`QA_ORD_001`, `ORD-1781915746583-5nygu3`, etc.) — none match `ORD-1728`.

**Prior confusion:** Fixture script `check-hq-global-search.mjs` used synthetic `ORD-1728` and reported PASS without hitting Supabase.

**Search behavior:** Zero results is **correct** until QA data is seeded with that order id.

**Matching improvements still shipped:** Raw `rawLower` / `rawCompact` id matching helps real ids like `QA_ORD_001` and `ORD-1782068662331-6byqdt`.

### 3. ID normalization stripped punctuation (real order ids)

**Cause:** Search haystack used only normalized text (`ORD-1728` → `ord 1728`), missing raw id substring matches.

**Fix:** Add `rawLower` / `rawCompact` haystack fields; score raw matches before tokenized fallback; index both `orderId` and `invoiceId`.

### 4. Silent empty API slices

**Cause:** `getOrdersRead()` returns `{ success: false, data: { orders: [] } }` without throwing. Loader indexed zero orders with no UI signal.

**Fix:** Explicit `readApiError()` when `success === false`; search modal footer shows coverage counts + API errors.

### 5. Labs not in HQ Admin menu (discoverability)

**Cause:** `labs` was missing from `ADMIN_HQ_MENU_KEYS` even though permissions allowed it and search could navigate there.

**Fix:** Add `labs` to `ADMIN_HQ_MENU_KEYS` and `HQ_ADMIN_MENU_SECTIONS` under OPERATIONS.

---

## Verification

### DEV modal footer

Open ⌘K search — footer shows:

```
HQ Search Coverage
HQ Search Coverage — Labs: X, Users: X, Orders: X, Products: X, POs: X
```

If Orders or Products count is **0**, check error lines below footer.

### Manual QA (qa.admin@primecare.test)

1. Search `QA_SKU_003` → Products group → Master Catalog
2. Search `ORD` → Orders + POs
3. Search `ORD-1728` → 0 results (expected — not in QA DB)
4. Sidebar OPERATIONS → **Labs** visible → `/labs` loads
5. ⌘K footer shows coverage counts in dev/QA builds

### Console (dev)

```
[HQ Search] HQ Search Coverage — Labs: …, Users: …, Orders: …, Products: …, POs: …
```

---

## Remaining risks

- If QA RLS returns **0 orders** for admin, search cannot invent data — footer will show `Orders: 0` + error
- Product search depends on SKU appearing in at least one of catalog/stock reads
- Distributor-only labs still require **Open in Distributor OS** from HQ Labs directory
