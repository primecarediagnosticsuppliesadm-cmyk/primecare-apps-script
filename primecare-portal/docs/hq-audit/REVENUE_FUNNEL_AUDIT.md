# Revenue Funnel Audit — PrimeCare HQ Stabilization Sprint

**Date:** 2026-05-28  
**Engine:** `src/founder/revenueFunnelEngine.js`  
**Loader:** `src/founder/revenueFunnelData.js` → `loadFounderFinancialIntelligenceData`  
**UI:** `src/pages/RevenueFunnelPage.jsx`

---

## Data Flow

```
RevenueFunnelPage
  → loadRevenueFunnelData()
    → loadFounderFinancialIntelligenceData()
      → loadDistributorOsPortfolio / ops payload
      → getLabsCredit()           → v_labs_credit
      → getOrdersRead()           → orders
      → getCollectionsRead()      → ar_credit_control + payments
      → loadVisibleLabContracts() → lab_contracts
      → getQualificationReviewRead() → lab_qualifications
      → getStockDashboard()       → v_stock_dashboard
      → buildPortfolioCatalogMirrorSummary() → products + inventory
  → buildRevenueFunnelModel()
```

---

## Metric Trace Table

| UI Metric | Engine field | Formula | Source table(s) | Risk |
|-----------|--------------|---------|-----------------|------|
| Qualified labs | `qualifiedCount` | `isQualificationPipelineReady(qual)` — stage ∈ {qualified, won} | `lab_qualifications` | Ignores score/band; one qual per lab (Map last-write-wins) |
| Contracted labs | `contractedCount` | Lab has `status = Active` contract | `lab_contracts` | No qual required; multiple contracts → one boolean |
| Qual gap | `qualificationContractGapCount` | misaligned + unqualified-with-contract | qual + contracts | Correct post-ownership migration |
| Orders (portfolio) | `portfolio.ordered` | Σ `scopedOrders.length` | `orders` | **Order rows, not labs** — label confusion |
| Ordered (stage) | `orderedLabCount` | Lab with any order | `orders` | Any status counts |
| Fulfilled (portfolio) | `portfolio.fulfilled` | Σ fulfilled order rows | `orders` | Status substring match (`fulfill`/`delivered`) |
| Fulfilled (stage) | `fulfilledLabCount` | Lab with any fulfilled order | `orders` | Lab boolean ≠ order count |
| AR outstanding | `arOutstanding` | Σ `num(outstandingAmount)` | `ar_credit_control` | `num(null)` → 0 |
| Payments / Revenue | `paymentsReceived` | Σ `totalPaid` | `payments` + AR row | Not order revenue |
| Paid (table col) | `paidLabs` | Lab count with `totalPaid > 0` | collections | **Lab count, not currency** |
| Ready to order | `readyToOrderCount` | `contracted && inventory.ready` | contracts + inventory | Distributor-wide stock gate, not per-lab |
| Catalog assigned | `catalogItemCount` | `distributorCatalog.items.length` | `tenants.metadata` | Not Supabase products |
| Products | `productsCount` | Mirror probe count | `products` | RLS may hide rows |
| Inventory rows | `inventoryRowCount` | Tenant-scoped stock rows | `inventory` | Mirror vs metadata skew |
| Path complete | `pathComplete` | qual>0, contracted>0, inventory.ready, orders>0, fulfilled>0, payments>0 | all | Strict; payments not AR |

---

## Scoping Model

Per distributor in `buildLabCommercialContexts`:

1. Labs: `filterRowsByTenant(labs, distributorId)`
2. Qualifications: tenant match OR lab in distributor lab set
3. Contracts: `distributorId` / `tenantId` match
4. Orders/collections: tenant filter; fallback to lab-ID filter if empty
5. Lab universe: union of labs, quals, contracts, orders, collections

**Risk:** Lab-ID fallback can attach HQ-tagged orders if lab IDs overlap tenants.

---

## Known Calculation Issues

### P0 — Label / semantics mismatch

| Issue | Detail |
|-------|--------|
| Ordered column vs stage | Portfolio "Orders" = order row count; stage "Ordered" = lab count |
| Paid column | Table shows lab count; tile shows ₹ payments |
| `evaluateContractQualificationAlignment.aligned` | Only checks missing qual rows, ignores unqualified-with-contract |

### P1 — Data integrity

| Issue | Detail |
|-------|--------|
| Double counting | Portfolio sums across distributors; mis-tenant lab rows inflate |
| One row per lab | Qual/collection Maps keep last row only |
| Null coercion | `num()` silently zeroes missing data |
| Guntur default | Name match → first non-HQ → `[0]` arbitrary focus |

### P2 — Inventory / mirror

| Issue | Detail |
|-------|--------|
| Ready-to-order gate | One SKU in stock enables all contracted labs |
| Mirror status | Depends on localStorage sync history when probe missing |
| Catalog vs mirror | Metadata assigned but products/inventory empty if RLS blocks HQ |

---

## Qualification / Contract Alignment

Post ownership migration:

- **Qualified** = pipeline `qualified` or `won` (not founder review)
- **Contract gate** (activation) = same rule
- **Integrity Broken** = active contract without qual row
- **Integrity Warning** = contract with qual row but pipeline not qualified/won

Revenue Funnel blockers route to **Distributor OS → Labs → Qualification** (correct).

---

## Recommendations

1. Rename portfolio "Orders" to "Order records" or align with lab-count stage.
2. Rename table "Paid" to "Labs paid" or show currency.
3. Apply catalog inventory RLS migration + re-sync Guntur mirror before funnel sign-off.
4. Add per-distributor executive cross-tenant read for orders/quals if HQ operates distributors centrally.
5. Document one-qual-per-lab Map behavior in QA test plan.
