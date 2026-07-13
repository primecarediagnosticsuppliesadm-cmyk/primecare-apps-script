# 11 — Do Not Break Rules

Hard constraints for all PrimeCare development. Violations require explicit founder/HQ approval and blueprint amendment.

---

## Database & security

| # | Rule |
|---|------|
| D1 | **Do not change RLS policies** without explicit approval and full role regression (`verify-hq-rls-reads.mjs`) |
| D2 | **Do not weaken tenant/lab isolation** — every lab query must respect RLS + client scope |
| D3 | **Do not re-introduce `temp_anon_*` policies** after pilot hardening |
| D4 | **Do not create new tables/columns** without documenting in [01_schema_catalog.md](./01_schema_catalog.md) and [02_field_dictionary.md](./02_field_dictionary.md) |
| D5 | **Do not use `select("*")`** on production-sensitive paths (payments, orders, POs, AR) — use `hqReadBounds.js` |
| D6 | **Do not expose lab data across tenants or labs** |

---

## Financial integrity

| # | Rule |
|---|------|
| F1 | **Do not change invoice/payment/AR lifecycle** without approval |
| F2 | **Do not allocate payments to draft invoices** (no PDF/sent lifecycle) |
| F3 | **Do not add or use `payments.invoice_id`** — junction table only |
| F4 | **Do not create duplicate financial sources of truth** — one canonical path per metric |
| F5 | **Invoice allocation is canonical** for invoice paid/partial status |
| F6 | **AR (`ar_credit_control.outstanding`) is canonical** for collections headline |
| F7 | **Fulfill must not roll back** on invoice or shipment failure |
| F8 | **Payment write must compensate** on AR failure for new payments |
| F9 | **Do not add delivery charge to `orders.total_amount`** until Phase 3B approved |
| F10 | **Do not wire delivery charge to invoice RPC** until Phase 3B approved |
| F11 | **Commission/payroll must not change payment logic** — separate ledger |
| F12 | **PDF generation must read `invoice_line_items` only** — not live catalog |

---

## Orders & inventory

| # | Rule |
|---|------|
| O1 | **No backorder in Year-1 pilot** — stock validation at order create |
| O2 | **Fulfilled orders require ORDER_OUT ledger** per SKU (idempotent) |
| O3 | **Cancelled orders must not deduct inventory** (except documented seeds) |
| O4 | **`orders.order_id` is the business key** — not UUID `id` for user-facing flows |
| O5 | **Lab Track Order must search by `order_id` first** |

---

## Logistics

| # | Rule |
|---|------|
| L1 | **Do not mix logistics `dispatch_status` with order financial `status`** |
| L2 | **One shipment per order** — respect unique constraint |
| L3 | **Shipment create is non-blocking** — never fail fulfill |
| L4 | **Shipment hook runs after invoice hook** on fulfill path |
| L5 | **Do not reference `order_shipments` from invoice or collections modules** |
| L6 | **Logistics does not own revenue** until Phase 3B |
| L7 | **Do not mix delivery operational cost with payroll/commission** |
| L8 | **Delivered-today KPI uses `delivered_at`** on shipment |

---

## Access & permissions

| # | Rule |
|---|------|
| A1 | **Do not hardcode role permissions in pages** — use `rolePermissionMatrix.js` |
| A2 | **Admin cannot provision executive role** |
| A3 | **Lab role cannot access HQ logistics or operations admin** |
| A4 | **Respect HQ freeze policy** — structural writes blocked when frozen |
| A5 | **Pilot launch roles only on QA/PROD** — no distributor/auditor login without explicit enable |

---

## Code quality & operations

| # | Rule |
|---|------|
| C1 | **Do not mutate Guntur certified tenant** in test/golden scripts |
| C2 | **Do not force-push to main/master** without explicit request |
| C3 | **Prefer additive migrations** over destructive schema changes |
| C4 | **Legacy Apps Script must be gated** by `ALLOW_LEGACY_APPS_SCRIPT` |
| C5 | **Do not skip verification scripts** for finance, RLS, or logistics changes |
| C6 | **Bounded read limits** — respect `HQ_*_LIMIT` constants |

---

## Schema evolution traps (known)

| Trap | Mitigation |
|------|------------|
| Dual `order_items` / `order_lines` | Always fetch both in detail reads |
| `tenant_id` uuid vs text drift | Normalize; check migration path |
| Phase 3A columns missing on env | Apply migration before deploying client code |
| `event_log` RLS with no policies | Do not use for app reads without policy fix |
| Text FKs without DB constraint | Enforce in RPC; test idempotency |

---

## Approval required matrix

| Change | Approver | Blueprint update |
|--------|----------|------------------|
| RLS policy edit | HQ + security review | 01, 04, 11 |
| Invoice lifecycle change | HQ finance | 05, 11 |
| Phase 3B delivery finance | HQ finance + founder | 05, 06, 09, 11 |
| New role or permission | HQ ops | 04, `rolePermissionMatrix.js` |
| New core table | HQ + architect | 01, 02, 03 |
| Freeze policy exception | HQ executive | 08, 11 |

---

## When in doubt

1. Read blueprint.
2. Run verify scripts for affected module.
3. Stop and report conflict — do not ship silent violations.
