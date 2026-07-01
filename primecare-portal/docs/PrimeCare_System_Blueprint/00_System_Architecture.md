# 00 — System Architecture

PrimeCare is a multi-tenant distributor ERP: labs order products, HQ fulfills, invoices and collections follow, logistics tracks delivery, operations manages users and ownership.

---

## Repository layout

```
primecare-portal/
├── src/
│   ├── api/           # Supabase + legacy Apps Script bridge
│   ├── pages/         # Role-scoped UI modules
│   ├── config/        # menuConfig, rolePermissionMatrix, pageRouting
│   ├── operations/    # Command center, provisioning engines
│   ├── logistics/     # Shipment + delivery charge pure logic
│   ├── collections/   # AR, ledger, invoice status derivation
│   ├── founder/       # Executive / founder analytics (read-only)
│   └── components/    # Shared UI
├── supabase/
│   ├── migrations/    # 13 formal timestamped migrations
│   └── sql/           # 52 manual SQL scripts (RLS, features)
├── scripts/           # verify-*.mjs certification
└── docs/
    ├── PrimeCare_System_Blueprint/   # THIS — business SoT
    ├── QA/                           # Release certification
    └── Architecture/                 # FD/DA decisions
```

Baseline schema dump: `primecare_public_schema.sql` (repo root).

---

## Source-of-truth map

| Concern | SoT | Not SoT |
|---------|-----|---------|
| Order financial lifecycle | `orders.status`, fulfill flags | `order_shipments.dispatch_status` |
| Customer billing | `invoices`, allocations | Shipment delivery charge (Phase 3A) |
| Lab outstanding | `ar_credit_control.outstanding` | Sum of open orders alone |
| Invoice paid/partial | `invoice_payment_allocations` | `payments` row alone |
| Stock on hand | `inventory.current_stock` | Catalog list without inventory join |
| Dispatch / delivery ops | `order_shipments` | Order status |
| Identity | `profiles` + Supabase Auth | Legacy `users` (backfill only) |
| Page permissions | `rolePermissionMatrix.js` | Hardcoded role checks in pages |

---

## Module map

| Module | Key APIs | Key pages | Tables |
|--------|----------|-----------|--------|
| **Orders** | `createOrderWrite`, `updateOrderStatusWrite`, `getOrdersRead` | OrdersPage, LabOrderingPage | orders, order_items, order_lines |
| **Finance** | `createInvoiceForFulfilledOrderWrite`, `createPaymentWrite`, `allocatePaymentToInvoiceWrite` | CollectionsPage, LabInvoiceCenter | invoices, payments, allocations, AR |
| **Logistics** | `logisticsSupabaseApi`, `deliveryChargeSupabaseApi` | LogisticsDeliveryPage | order_shipments, couriers, policy |
| **Inventory** | `getStockDashboard`, `createInventoryLedgerWrite` | StockPage, MasterCatalog | inventory, ledger, products |
| **Procurement** | `createPurchaseOrderWrite`, `receivePurchaseOrderWrite` | PurchaseOrdersPage | purchase_orders, items |
| **Labs** | `createLabWrite`, `getLabsCredit` | LabsPage | labs, ar_credit_control |
| **Operations** | `userProvisioningApi`, `labOwnershipApi` | OperationsCenterAdmin | profiles, lab_ownership |
| **Agent** | collections, visits APIs | AgentDashboard, Visits | agent_visits, ownership |
| **Executive** | `founderSnapshotApi`, EFI engines | ExecutiveControlTower, EFI pages | read aggregates |
| **Lab portal** | `getLabCatalogRead`, `getLabOrderDetailsRead` | LabOrderingPage | orders (scoped) |

---

## Core data flows

### Order → cash

```
Lab checkout (Placed)
  → HQ Fulfill
      → inventory ORDER_OUT
      → AR outstanding bump
      → invoice RPC (draft)
      → shipment create (ops, non-blocking)
  → Payment
      → finalize invoice (PDF/sent)
      → allocate to invoice
      → AR reduced
```

### Lab portal (self-service path)

```
Catalog (v_lab_catalog) → cart → createOrderWrite / create_lab_order RPC
  → recent orders → Track Order (order_id lookup)
```

---

## Technology stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite (`primecare-portal`) |
| Auth | Supabase Auth → `profiles` |
| Database | Supabase Postgres + RLS |
| Atomic writes | RPCs: `create_lab_order`, `post_collection_payment`, `create_invoice_for_fulfilled_order`, `allocate_payment_to_invoice` |
| Legacy (dev only) | Apps Script via `/api/primecare` — gated by `ALLOW_LEGACY_APPS_SCRIPT` |
| PDF | Edge function + `invoice-pdfs` storage |

---

## Environments

| Env | Notes |
|-----|-------|
| **Dev** | All roles may login; legacy Apps Script optional |
| **QA** | Pilot roles only; Supabase `zipuzmfkwwucbchlphcj` |
| **Prod** | Pilot roles; separate Supabase project |

---

## Schema evolution (critical)

Three layers — see `CHANGELOG.md` for gaps:

1. `primecare_public_schema.sql` — baseline CREATE TABLE
2. `supabase/sql/*.sql` — primary RLS and feature evolution
3. `supabase/migrations/*.sql` — subset promoted to formal migrations

**Never assume** a migration folder alone reproduces full schema.

---

## Feature flags (`environment.js`)

| Flag | Default | Meaning |
|------|---------|---------|
| `ALLOW_LEGACY_APPS_SCRIPT` | dev only | Apps Script fallback |
| `LOGISTICS_DELIVERY_CHARGE_FINANCE_ENABLED` | false | Phase 3B invoice wiring |
| `VITE_HQ_PROCUREMENT_FROZEN` | optional | Freeze PO writes |

---

## Architecture principles

1. **Bounded reads** — limits and column projections in `hqReadBounds.js`
2. **Idempotent side effects** — fulfill, invoice, shipment, payment RPCs
3. **Non-blocking ops hooks** — shipment failure does not roll back fulfill
4. **Additive logistics** — no finance module imports shipment tables
5. **Blueprint-first** — doc leads schema/rule changes
