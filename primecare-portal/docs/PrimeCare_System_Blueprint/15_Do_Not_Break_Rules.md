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
| P6 | HQ admin override always allowed for order creation |
| P7 | Existing labs default to `hq_managed` on migration (non-breaking) |

---

## Approval matrix

| Change | Approval |
|--------|----------|
| RLS | HQ + security review |
| Invoice/payment/AR lifecycle | HQ finance |
| Phase 3B delivery finance | HQ finance + founder |
| New core table | HQ + architect |

---

## When in doubt

Stop → report → CHANGELOG → blueprint update → then implement.
