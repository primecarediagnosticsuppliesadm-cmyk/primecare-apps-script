# 04 — Browser Golden Path

**Manual end-to-end Order-to-Cash walkthrough for release certification.**

API golden path: `scripts/verify-primecare-production-golden-path.mjs`  
Environment: QA `https://primecare-portal.vercel.app` (or current QA alias)

---

## Prerequisites

| Item | Value |
|------|-------|
| Build deployed | Confirm bundle stamp in lab checkout diagnostics |
| Accounts | See [README.md](./README.md) |
| Lab | `QA_LAB_001` in self-service mode |
| Cart | Use stabilization SKU bundle or 1× low-value test SKU |
| Smoke filter | HQ Orders must **not** show `ORD-VERIFY-*` unless QA validation layer on |

Run API prereq gate first:

```bash
node scripts/run-browser-certification.mjs --prereq-only
```

---

## Path overview

```
Lab checkout (BGP-L*)
    → HQ Orders review (BGP-A03–A04)
    → Fulfill (BGP-A05)
    → Logistics dispatch (BGP-A07–A09)
    → Payment + allocation (BGP-A10–A11)
    → Lab invoice PDF (BGP-L09)
    → Executive EFI (BGP-E03)
```

**Estimated time:** 45–60 minutes with evidence capture.

---

## Phase 1 — Lab portal (BGP-L)

### BGP-L01 — Lab login

| | |
|---|---|
| **Actor** | Lab (`qa.lab@primecare.test`) |
| **Navigate** | `/lab-orders` |
| **Pass** | Catalog loads; ordering mode badge visible; no error boundary |

### BGP-L02 — Catalog and cart

| | |
|---|---|
| **Action** | Add 1–2 SKUs to cart |
| **Pass** | Line totals correct; delivery policy readable |

### BGP-L03 — Checkout creates NEW order

| | |
|---|---|
| **Action** | Submit order |
| **Pass** | Success banner shows **new** `order_id` (not a prior-day ID); cart clears |
| **Fail** | Same `order_id` as previous checkout with identical cart → idempotency replay bug |
| **Evidence** | Screenshot banner + note `order_id` |

### BGP-L04 — Previous Orders updated

| | |
|---|---|
| **Action** | Scroll Previous Orders immediately after checkout |
| **Pass** | New order appears at top with correct amount and unit count |

### BGP-L05 — Track Order consistency

| | |
|---|---|
| **Action** | Click Track Order on the new order |
| **Pass** | Drawer `order_id` matches success banner; line items present |
| **Fail** | Drawer shows different order → race/idempotency defect |

### BGP-L06 — Repeat order

| | |
|---|---|
| **Action** | Use Repeat Order from a prior fulfilled order |
| **Pass** | New cart populated; checkout creates **another** new `order_id` |

### BGP-L07 — Ordering mode spot check (optional)

| | |
|---|---|
| **Action** | Admin sets `hq_managed` → lab checkout blocked; restore `self_service` |
| **Pass** | Matches `verify-lab-ordering-flow` live checks |

### BGP-L08 — Race guard (optional)

| | |
|---|---|
| **Action** | Open track on old order → checkout new → track new |
| **Pass** | Final drawer always shows the order user selected last |

### BGP-L09 — Lab invoice center

| | |
|---|---|
| **Navigate** | `/lab-invoices` |
| **Pass** | Fulfilled order invoice listed; PDF downloads (> 0 bytes) |

---

## Phase 2 — HQ Admin (BGP-A)

### BGP-A01 — Admin login

| | |
|---|---|
| **Actor** | Admin (`qa.admin@primecare.test`) |
| **Navigate** | `/dashboard` |
| **Pass** | KPI tiles render |

### BGP-A02 — HQ Orders list hygiene

| | |
|---|---|
| **Navigate** | `/orders` |
| **Pass** | No `ORD-VERIFY-*` or `ORD-DC-SNAPSHOT-*` in default view |
| **Pass** | Search returns expected order; pagination works |

### BGP-A03 — Order detail accuracy

| | |
|---|---|
| **Action** | Open order from BGP-L03 |
| **Pass** | Item **unit count** matches lab checkout (not 0); amount matches |

### BGP-A04 — Order KPIs

| | |
|---|---|
| **Pass** | Header KPIs load < 2s; total orders plausible |

### BGP-A05 — Fulfill order

| | |
|---|---|
| **Action** | Fulfill the lab order (Placed → Fulfilled) |
| **Pass** | Status Fulfilled; `fulfilled_at` set |
| **Pass** | No duplicate fulfill side effects on refresh |

### BGP-A06 — Orders payment drawer (if paying from Orders)

| | |
|---|---|
| **Action** | Record payment linked to order |
| **Pass** | Payment saved; allocation reflected |

### BGP-A07 — Logistics shipments

| | |
|---|---|
| **Navigate** | `/logistics-delivery` |
| **Pass** | Shipment exists for fulfilled order; status `ready` or beyond |

### BGP-A08 — Shipment transition

| | |
|---|---|
| **Action** | Advance shipment (assign courier if required) |
| **Pass** | Status machine respected; no finance regression |

### BGP-A09 — Route planning (Phase 4)

| | |
|---|---|
| **Action** | Create route, assign shipment, mark complete |
| **Pass** | Route KPI updates; orders/invoices unchanged |

### BGP-A10 — Collections grid

| | |
|---|---|
| **Navigate** | `/collections` |
| **Pass** | Lab AR outstanding reflects fulfill + payment |

### BGP-A11 — Payment allocation

| | |
|---|---|
| **Action** | Record partial then full payment (or confirm auto-alloc from BGP-A06) |
| **Pass** | Invoice open balance → 0; status `paid` |
| **Pass** | AR outstanding reduced consistently |

### BGP-A12 — Numbers reconcile

| | |
|---|---|
| **Pass** | Order total ≈ invoice total; allocations sum = payments applied |

---

## Phase 3 — Executive (BGP-E)

### BGP-E01 — Executive login

| | |
|---|---|
| **Actor** | `qa.executive@primecare.test` |
| **Pass** | Lands on dashboard |

### BGP-E02 — Revenue funnel (optional)

| | |
|---|---|
| **Navigate** | `/revenue-funnel` |
| **Pass** | Bounded read; no timeout |

### BGP-E03 — Executive Financial Intelligence

| | |
|---|---|
| **Navigate** | `/executive-financial-intelligence` |
| **Pass** | KPI section loads; unallocated payments figure present |
| **Pass** | Read-only — no write actions exposed |

---

## Evidence template

Copy per run into `docs/QA/Browser_Golden_Path_YYYY-MM-DD.md`:

```markdown
## Run metadata
- Date:
- Tester:
- QA URL:
- Bundle stamp:
- Order ID chain:

## Results
| Step | PASS/FAIL | Notes |
|------|-----------|-------|
| BGP-L03 | | |
| BGP-L05 | | |
| BGP-A03 | | |
| BGP-A05 | | |
| BGP-A11 | | |
| BGP-E03 | | |

## Verdict
GO / NO-GO
```

---

## Failure escalation

| Symptom | Likely object | First verify script |
|---------|---------------|---------------------|
| Old order_id on checkout | Order idempotency | `verify-lab-ordering-flow` |
| HQ item count 0 | Order lines | `verify-orders-admin-flow` |
| Fulfill no invoice | Invoice | `verify-invoice-phase2` |
| Payment no allocation | Allocation | `verify-payment-allocation-flow` |
| Shipment missing | Shipment | `verify-logistics-dispatch-flow` |
| AR mismatch | AR | `verify-financial-reconciliation` |

**Do not patch finance/logistics logic during cert** unless reconciliation script FAILs.
