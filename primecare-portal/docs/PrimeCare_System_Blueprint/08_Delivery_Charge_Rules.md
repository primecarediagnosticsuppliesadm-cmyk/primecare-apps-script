# 08 — Delivery Charge Rules

**Phase 3A: operational quote only.** Not in invoice or AR until Phase 3B (`LOGISTICS_DELIVERY_CHARGE_FINANCE_ENABLED=false`).

---

## Policy storage

**Table:** `tenant_delivery_policy` (PK `tenant_id`)

| Field | Default |
|-------|---------|
| standard_delivery_charge | ₹150 |
| free_delivery_threshold | ₹5000 |
| currency | INR |

---

## Quote priority (`deliveryChargeEngine.js`)

1. HQ override (`hq_override`)
2. Customer pickup → ₹0 (`customer_pickup`)
3. Active L1B / Hybrid contract → ₹0 (`l1b_contract`)
4. Subtotal ≥ threshold → ₹0 (`free_threshold`)
5. Standard charge (`standard`)

---

## Order fields (snapshot)

`merchandise_subtotal`, `delivery_charge_amount`, `delivery_charge_reason`, `delivery_method_intent`, `delivery_policy_snapshot`, `delivery_charge_status`, override audit fields.

**Written:** `persistOrderDeliverySnapshotWrite` on create; `applyOrderDeliveryOverrideWrite` (HQ).

---

## Shipment mirror

`order_shipments.delivery_charge_amount`, `delivery_charge_reason` — copied at create; synced on override/reconcile.

---

## HQ override guard

Blocked when invoice is customer-facing (sent/partially_paid/paid/cancelled or has PDF).  
Check: `canEditDeliveryChargeOverride`.

---

## Golden rules

| Rule | |
|------|--|
| `orders.total_amount` = merchandise only | |
| Invoice RPC untouched | |
| No SVC-DELIVERY pseudo-SKU | |
| Logistics does not own revenue (3A) | |

---

## Future (not implemented)

- Lab-specific policy
- Contract-level policy beyond L1B waiver
- Phase 3B: invoice line + AR — requires ADR + approval

---

## Verification

- `verify-delivery-charge-policy.mjs`
