# PrimeCare UAT Checklist

## Executive
- [x] Login as founder/executive
- [x] Dashboard loads
- [x] Financial Intelligence loads
- [x] Revenue Funnel loads
- [ ] Credit & Risk validates with data
- [ ] Operations Center validates with data
- [ ] No QA/Predator tooling exposed in production unless intentionally allowed

## Admin
- [x] Login as admin
- [x] Master Catalog loads
- [x] Create product
- [x] Product appears in Inventory
- [x] Inventory Stock tab — value KPI cards show numeric totals (not "Not enough cost data" when `cost_price` exists)
- [x] Inventory valuation — `QA_SKU_003` contributes 120 × ₹200 = ₹24,000 (product cost fallback; post-receive)
- [x] Inventory valuation reconciliation — dashboard total equals Σ SKU `inventoryValue` logs
- [x] Master Catalog — HQ Cost shows `products.cost_price` (QA_SKU_003 = ₹200, margin from price/cost)
- [x] Master Catalog — HQ Price uses `products.selling_price` (QA_SKU_003 = ₹900, ~78% margin)
- [x] Inventory Health — expandable row shows valuation formula and warning explanations
- [x] Inventory Movements — expanded audit shows stock before/after, tenant, reference, timestamp
- [x] Purchase Forecast Suggestions — aligned with Inventory Health velocity thresholds or explains exclusion
- [x] Purchase Dashboard KPIs — basis labels on Total/Open/Received/Value cards
- [x] Procurement regression — `verify-procurement-inventory-flow.mjs` dry-run passes; `--mutate` fails clearly without open Ordered PO
- [ ] Create lab (HQ mode — no distributor picker; shows PrimeCare HQ)
- [ ] Create PO — select product from catalog only (invalid SKU blocked)
- [ ] Edit Draft/Ordered PO before receipt (qty, cost, supplier, status)
- [ ] Cancel Draft/Ordered PO before receipt
- [ ] Receive Stock — only Ordered / Partially Received POs
- [ ] Receive Stock blocked for Draft / Received / Cancelled with clear message
- [ ] Create / edit AR credit terms
- [ ] Create order as admin
- [ ] Fulfill order
- [ ] Record payment

## Agent
- [ ] Login as agent
- [ ] Dashboard loads
- [ ] Assigned labs only
- [ ] Visits page loads
- [ ] Collections page loads
- [ ] Cannot access admin/executive pages

## Lab
- [x] Login as lab
- [x] Lab portal loads
- [x] Lab Ordering loads
- [x] Invoice Center loads
- [x] Payments & Account loads
- [ ] Assigned catalog visible after lab/product setup
- [ ] Place order
- [ ] View generated invoice
- [ ] Confirm payment/account update

## End-to-End Business Flow
- [ ] Create lab
- [ ] Assign lab user/profile
- [ ] Assign product catalog / stock
- [ ] Lab places order
- [ ] HQ/Admin fulfills order
- [ ] Invoice generated
- [ ] Payment recorded
- [ ] AR updates
- [ ] Inventory decreases
- [ ] Executive KPIs update
