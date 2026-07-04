# 15 — Do Not Break Rules

Hard constraints. Violations require explicit approval + blueprint amendment + verify regression.

---

## Database & security

| ID | Rule |
|----|------|
| D1 | Do not change RLS without approval + `verify-hq-rls-reads.mjs` |
| D2 | Do not weaken tenant/lab isolation |
| D3 | Do not re-introduce `temp_anon_*` policies |
| D4 | Document new tables/columns in 01 + 03 before migration |
| D5 | No `select("*")` on production-sensitive paths |
| D6 | No cross-lab / cross-tenant data exposure |

---

## Financial integrity

| ID | Rule |
|----|------|
| F1 | Orders remain **financial SoT** |
| F2 | Shipments remain **operational SoT** — do not conflate statuses |
| F3 | Invoice allocation canonical for invoice status |
| F4 | AR canonical for collections outstanding |
| F5 | No draft invoice allocation (without approved policy) |
| F6 | No `payments.invoice_id` |
| F7 | Fulfill does not roll back on invoice/shipment failure |
| F8 | Payment compensation on AR failure (new payments) |
| F9 | Delivery charge **not** in invoice/AR in Phase 3A |
| F10 | Commission must not change payment logic |
| F11 | PDF reads invoice_line_items only |
| F12 | Payroll commission must be cash-only: `payments.amount_received` attributable collected cash × approved rate |
| F13 | Payroll must never use order value, invoice value, fulfilled revenue, projected revenue, outstanding receivables, or allocation totals as commission amount |
| F14 | Payroll approval/export must not create accounting entries, bank payouts, GL postings, or disbursement records without an approved future finance phase |

---

## Orders & lab

| ID | Rule |
|----|------|
| O1 | No backorder (pilot) |
| O2 | ORDER_OUT on fulfill (idempotent) |
| O3 | Track Order by **business order_id** |
| O4 | Previous Orders refresh after checkout |

---

## Logistics

| ID | Rule |
|----|------|
| L1 | One shipment per order |
| L2 | Shipment hook after invoice on fulfill |
| L3 | Shipment failure non-blocking |
| L4 | Finance modules do not import shipment tables |
| L5 | Delivered today = `delivered_at` |

---

## Operations & lab portal

| ID | Rule |
|----|------|
| P1 | Lab portal not default for all labs Day-1 |
| P2 | Default ordering mode HQ Managed until onboarding (`labs.ordering_mode`) |
| P3 | Admin freeze blocks structural changes, not daily payments |
| P4 | Permissions from matrix — not hardcoded |
| P5 | **Ordering Mode controls order initiation only** — never block track order, invoices, payments, collections, finance, inventory, or shipment lifecycle |
| P6 | HQ admin/executive on-behalf order creation is allowed only for `ACTIVE` labs with `ordering_mode` in `hq_managed`, `hybrid`, or `self_service`; it is blocked for `INACTIVE` labs and `suspended` Ordering Mode |
| P7 | Existing labs default to `hq_managed` on migration (non-breaking) |
| P8 | `INACTIVE` lab lifecycle status must never hide or alter AR, invoices, payments, allocations, orders, shipments, Track Order, audit history, reporting, or authorized HQ visibility |
| P9 | Admin on-behalf ordering must reuse `LabOrderingPage`/cart flow, must not impersonate lab users, and must preserve existing pricing, catalog, credit, inventory, finance, delivery, AR, shipment, and commission behavior |
| P10 | HR is an HQ payroll support role only; HR cannot approve payouts, approve commission changes, lock payroll, export payroll, or mutate finance records |
| P11 | Distributor OS has no payroll ownership, payout approval, payout authorization, or accounting role |

---

## Approval matrix

| Change | Approval |
|--------|----------|
| RLS | HQ + security review |
| Invoice/payment/AR lifecycle | HQ finance |
| Phase 3B delivery finance | HQ finance + founder |
| New core table | HQ + architect |
| Compensation/payroll approval and export | Executive |
| HR role/RLS enablement | HQ + security review |

---

## When in doubt

Stop → report → CHANGELOG → blueprint update → then implement.
