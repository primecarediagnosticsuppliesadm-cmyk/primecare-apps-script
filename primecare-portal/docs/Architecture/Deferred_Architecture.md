# PrimeCare Deferred Architecture

## DA-001: Inventory should separate product master from stock movements

### Current
Master Catalog product creation also creates/updates Inventory.

### Future
- Master Catalog: product definition only.
- Inventory: stock state and stock operations.
- Inventory Ledger: source of truth for quantity changes.
- Purchase/Reorder: stock receipt should create ledger movement.

### Deferred Until
Post-pilot or before multi-warehouse/distributor rollout.

## DA-002: Legacy Apps Script removal

### Current
Some client logging/fallback paths still assume `PRIMECARE_APPS_SCRIPT_URL`.

### Future
Remove `/api/primecare` dependency from production flows or guard all legacy code by `VITE_ENABLE_LEGACY_APPS_SCRIPT`.

### Deferred Until
After production smoke test unless it blocks normal workflows.

## DA-003: Distributor OS and Supplier Master

### Current
Year-1 HQ pilot runs under PrimeCare HQ tenant. Distributor OS and `public.distributors` are not provisioned in production. PO supplier is free text.

### Future
- Distributor OS with tenant-scoped lab/catalog provisioning.
- Supplier master for default unit costs and vendor history.

### Deferred Until
Post-pilot multi-distributor rollout.

## DA-004: Customer-level working-capital allocation

### Current
Conceptual WC days = Inventory Days + Receivable Days − Payable Days. Receivable days can later be derived per ACTIVE lab from AR / invoices / payments. Inventory days are HQ/SKU (`inventory`, `inventory_ledger`). Payable days are HQ AP (`purchase_orders`). Agent visit `approx_credit_days` / wallet are discovery only.

### Future
A certified allocation methodology (how HQ inventory and payables attach to a customer or segment) before any “contribution per ₹1 working capital” or “WC days per lab” KPI.

### Deferred Until
Analytics certification after Visit Evidence V1 exists and O2C data is sufficient. ADR-VE-008. Do not fake per-lab inventory days.
