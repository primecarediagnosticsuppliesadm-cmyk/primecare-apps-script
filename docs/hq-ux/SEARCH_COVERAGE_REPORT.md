# HQ Global Search — Coverage Report

**Sprint:** HQ Search Reliability  
**Date:** 2026-06-20

Runtime counts are logged in dev mode when the search modal opens:

```
[HQ Search] Indexed counts — Labs: X, Users: X, Orders: X, Products: X, POs: X
```

## Index coverage

| Entity | Source API | Indexed fields | Count indexed |
|--------|------------|----------------|---------------|
| **Labs** | `getLabsCredit()` → `v_labs_credit` | `labName`, `labId`, `area`, `city`, `territory`, `ownerName`, `assignedAgent` | RLS-visible lab rows |
| **Users** | `getOperationsPlatformUsersRead({ tenantId })` → `profiles` + `users` directory | `name`, `displayName`, `agentName`, `userName`, `username`, `email`, `role`, `agentId` | Profiles for HQ tenant |
| **Orders** | `getOrdersRead()` → `orders` | `orderId`, compact ID (no hyphens), `labName`, `labId`, `invoiceId`, `orderStatus` | RLS-visible orders |
| **Products** | `loadMasterCatalog({ tenantId })` | `productName`, `productId`, `sku`, `category` | Catalog products for tenant |
| **Purchase Orders** | `getPurchaseOrdersRead()` | `poId`, compact ID, `status`, `supplierName` | RLS-visible POs |

Counts are computed at index build time via `buildHqSearchCoverageReport()` in `hqGlobalSearchEngine.js`.

## Matching behavior

| Mode | Example | Behavior |
|------|---------|----------|
| Substring | `Alpha` → QA Alpha Diagnostics | Normalized haystack contains query |
| Prefix | `ORD-172` → ORD-1728 | Title/haystack prefix match (scored higher) |
| Tokenized | `QA Agent` → QA Test Agent One | Every query token must match a haystack token or substring |
| Compact ID | `1728` → ORD-1728 | Hyphens/spaces stripped for ID fragments |

## Navigation context

| Entity | Target page | Context key | Consumer |
|--------|-------------|-------------|----------|
| Lab | `labs` | `labId`, `labName` | `LabsPage` — scroll + highlight |
| User | `operationsCenter` | `userId` | `OperationsCenterAdminPage` → `UserProvisioningPanel` |
| Order | `orders` | `orderId` | `OrdersPage` — open detail |
| Product | `masterCatalog` | `productId` | *(scroll TBD)* |
| PO | `purchase` | `poId` | *(drawer TBD)* |

## Validation

Run fixture tests (no backend):

```bash
node scripts/check-hq-global-search.mjs
```

Expected: all five query cases pass (`QA Alpha Diagnostics`, `Alpha`, `QA Agent`, `ORD-1728`, `1728`).
