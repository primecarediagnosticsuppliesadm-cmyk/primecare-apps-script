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
