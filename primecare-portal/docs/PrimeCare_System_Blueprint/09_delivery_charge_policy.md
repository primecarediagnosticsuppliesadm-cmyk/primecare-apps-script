# 09 — Delivery Charge Policy

Phase 3A operational delivery charges. **Not wired to invoice, AR, or `orders.total_amount`.**

Feature flag: `LOGISTICS_DELIVERY_CHARGE_FINANCE_ENABLED=false` (`environment.js`)

---

## Current phase (3A)

### Scope
| In scope | Out of scope |
|----------|--------------|
| Tenant default policy | Invoice line item for delivery |
| Quote at lab checkout | AR outstanding includes delivery |
| Persist snapshot on `orders` | Payment allocation for delivery |
| Mirror on `order_shipments` | Commission on delivery |
| HQ override before invoice sent | Payroll / courier cost accounting |
| Display in Lab cart + Logistics UI | |

---

## Policy storage

**Table:** `tenant_delivery_policy`

| Field | Default | Meaning |
|-------|---------|---------|
| `standard_delivery_charge` | ₹150 | Default delivery fee |
| `free_delivery_threshold` | ₹5000 | Merchandise subtotal for free delivery |
| `currency` | INR | Display currency |
| `effective_from` | current date | Policy effective date |
| `is_active` | true | Policy active flag |

**API:** `getTenantDeliveryPolicyRead`, `upsertTenantDeliveryPolicyWrite`  
**UI:** `DeliveryPolicyPanel` (HQ Logistics)

---

## Quote priority engine

Source: `deliveryChargeEngine.js` — `computeDeliveryChargeQuote`

**Priority (first match wins):**

1. **HQ override** — `hasHqOverride` + `hqOverrideAmount` → reason `hq_override` (waived if ≤ 0)
2. **Customer pickup** — `delivery_method_intent = customer_pickup` → ₹0, reason `customer_pickup`
3. **L1B / Hybrid contract** — active `lab_contracts` type `L1B Reagent Rental` or `Hybrid` → ₹0, reason `l1b_contract`
4. **Free threshold** — `merchandise_subtotal >= free_delivery_threshold` → ₹0, reason `free_threshold`
5. **Standard** — `standard_delivery_charge`, reason `standard`

---

## Order snapshot fields (Phase 3A)

Written to `orders` on create / override:

| Field | Purpose |
|-------|---------|
| `merchandise_subtotal` | Sum of product lines (excludes delivery) |
| `delivery_charge_amount` | Quoted operational charge |
| `delivery_charge_reason` | Engine reason code |
| `delivery_method_intent` | `delivery`, `customer_pickup`, `unknown` |
| `delivery_policy_snapshot` | jsonb policy at quote time |
| `delivery_charge_status` | `quoted`, `waived`, `finalized` |
| `delivery_charge_override_*` | HQ override audit fields |

**API:** `persistOrderDeliverySnapshotWrite`, `applyOrderDeliveryOverrideWrite`

---

## Shipment mirror

| Field | Purpose |
|-------|---------|
| `order_shipments.delivery_charge_amount` | Copy at shipment create |
| `order_shipments.delivery_charge_reason` | Copy at shipment create |

**Sync:** `syncShipmentDeliveryMirrorWrite`, `reconcileDeliveryChargeForShipmentWrite`

---

## HQ override rules

| Rule | Detail |
|------|--------|
| **Who** | HQ admin/executive |
| **When blocked** | Invoice sent / partially_paid / paid / cancelled OR has PDF |
| **Check** | `canEditDeliveryChargeOverride(invoice)` |
| **Requires** | Override reason text |
| **Effect** | Recomputes quote with `hasHqOverride=true` |

---

## Lab checkout display

- Cart calls `buildDeliveryQuoteForLabOrder` with `DELIVERY_METHOD_INTENT.DELIVERY`
- Shows estimated delivery + merchandise total separately
- Server persists actual snapshot on `createOrderWrite`

---

## Status values

| Status | Meaning |
|--------|---------|
| `quoted` | Standard quote applied |
| `waived` | ₹0 by policy (pickup, L1B, threshold, override) |
| `finalized` | Locked for operational handoff (future finance use) |

---

## Golden rules (Phase 3A)

1. **`orders.total_amount` = merchandise only** — never add delivery in Phase 3A
2. **Invoice RPC untouched** — `create_invoice_for_fulfilled_order` does not read delivery columns
3. **No SVC-DELIVERY pseudo-SKU** in delivery path
4. **Collections AR unchanged** by delivery quote
5. **Additive schema only** — migration `20260701120000_logistics_phase3a_delivery_charges.sql`

---

## Future phases (not implemented — document before coding)

### Lab-specific delivery policy
- Per-lab overrides on top of tenant default
- Requires blueprint update + migration

### Contract-level delivery policy
- Embed in `lab_contracts` terms beyond L1B waiver
- Requires blueprint update

### Phase 3B — Invoice integration
- Synthetic order/invoice line for delivery charge
- Wire to `orders.total_amount` / invoice subtotal
- AR alignment
- Enable via `LOGISTICS_DELIVERY_CHARGE_FINANCE_ENABLED`
- **Requires explicit approval** — see [11_do_not_break_rules.md](./11_do_not_break_rules.md)

---

## Verification

- `verify-delivery-charge-policy.mjs` — engine rules, schema additive, invoice isolation
- `verify-logistics-dispatch-flow.mjs` — finance module untouched

---

## Key files

| File | Purpose |
|------|---------|
| `src/logistics/deliveryChargeEngine.js` | Quote priority pure logic |
| `src/api/deliveryChargeSupabaseApi.js` | Policy CRUD, snapshot, override |
| `src/components/logistics/DeliveryPolicyPanel.jsx` | HQ policy UI |
| `supabase/migrations/20260701120000_logistics_phase3a_delivery_charges.sql` | Schema |
