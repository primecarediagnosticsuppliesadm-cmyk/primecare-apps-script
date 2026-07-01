# 13 — Verification Matrix

39 scripts in `primecare-portal/scripts/`. **Exit 1 on FAIL** (WARN alone usually passes).

---

## By module

### Finance & invoices

| Script | Checks | When |
|--------|--------|------|
| verify-financial-reconciliation.mjs | Payments vs allocations; GP golden; Guntur untouched; compensation | Payment/AR changes |
| verify-partial-payment-sync.mjs | Strict finalize→pay→allocate | Payment lifecycle |
| verify-order-payment-sync.mjs | Finalize wiring, freeze guards | Payment drawer |
| verify-invoice-account-status.mjs | Status derivation | Invoice UI labels |
| verify-lab-account-fallback.mjs | Lab ledger fallback math | Lab account |
| verify-invoice-phase1.mjs | Schema, no payments.invoice_id | Invoice foundation |
| verify-invoice-phase2.mjs | Auto-invoice on fulfill | Invoice create |
| verify-invoice-phase3.mjs | PDF immutable lines | PDF |
| verify-invoice-phase4.mjs | Invoice Center bounded reads | Invoice UI |
| verify-invoice-phase5.mjs | Allocation RPC, partially_paid | Allocations |
| verify-primecare-production-golden-path.mjs | Full E2E golden | Pre-release |
| verify-ar-reconcile.mjs | AR reconcile + audit | AR drift |
| verify-collection-inconsistencies.mjs | Golden lab cleanliness | Collections hygiene |

### Orders & lab

| Script | Checks | When |
|--------|--------|------|
| verify-orders-admin-flow.mjs | KPI, fulfill ledger, freeze | Orders page |
| verify-lab-ordering-flow.mjs | Track order_id; RPC smoke | Lab portal |
| verify-transaction-integrity-rpcs.mjs | Sprint 1 RPC symbols | Order/payment RPC |
| verify-bounded-reads.mjs | No unbounded payment/PO select | Read paths |

### Logistics

| Script | Checks | When |
|--------|--------|------|
| verify-logistics-dispatch-flow.mjs | Shipment hook, finance isolation | Logistics |
| verify-delivery-charge-policy.mjs | Phase 3A engine | Delivery charge |

### Labs & credit

| Script | Checks | When |
|--------|--------|------|
| verify-labs-admin-flow.mjs | Tenant scope, ownership | Labs |
| verify-credit-risk-admin-flow.mjs | AR KPI, aging | Credit & Risk |
| verify-agent-collections-ownership-filter.mjs | Ownership scoping | Agent collections |
| verify-create-lab-ar-rls.mjs | Lab+AR insert RLS | Add lab |

### Operations

| Script | Checks | When |
|--------|--------|------|
| verify-operations-center-admin-flow.mjs | Provisioning, freeze | Ops center |
| verify-operations-user-directory-integrity.mjs | Probe classification | User directory |
| verify-provisioning-role-guard.mjs | No admin→executive | Provisioning |
| verify-hq-rls-reads.mjs | Cross-role reads | **Any RLS change** |
| verify-hq-freeze-policy.mjs | Freeze wiring | Freeze policy |
| verify-hq-search-runtime.mjs | Global search bounded | Search |

### Inventory

| Script | Checks | When |
|--------|--------|------|
| verify-inventory-dashboard-kpi.mjs | Valuation KPIs | Inventory dashboard |
| verify-inventory-reconciliation.mjs | No negative stock | Inventory writes |
| verify-procurement-inventory-flow.mjs | PO receive → stock | Procurement |

### Executive

| Script | Checks | When |
|--------|--------|------|
| verify-founder-snapshot.mjs | Founder RPC | Founder |
| verify-executive-financial-intelligence.mjs | EFI read-only | EFI module |

### Infrastructure

| Script | Checks | When |
|--------|--------|------|
| verify-pilot-migrations.mjs | Migration manifest | New migration |
| verify-pilot-hardening-sql.mjs | No temp_anon RLS | Post-hardening |
| verify-sprint1-health.mjs | Sprint 1 bundle | Sprint changes |
| verify-perf-scale-counts.mjs | PERF tenant scale | Perf testing |
| verify-production-monitoring.mjs | RC-2 orchestrator | Release monitoring |

---

## Required bundles

**HQ Admin cert:**
```
npm run build
verify-inventory-dashboard-kpi.mjs
verify-procurement-inventory-flow.mjs
verify-orders-admin-flow.mjs
verify-credit-risk-admin-flow.mjs
verify-labs-admin-flow.mjs
verify-operations-center-admin-flow.mjs
verify-financial-reconciliation.mjs
verify-hq-rls-reads.mjs
```

**Lab portal change:** `verify-lab-ordering-flow.mjs` + `verify-hq-rls-reads.mjs`

**Logistics change:** `verify-logistics-dispatch-flow.mjs` + `verify-delivery-charge-policy.mjs`

---

## Manual UAT (per module)

Use [templates/UAT_Checklist_Template.md](./templates/UAT_Checklist_Template.md).

| Module | Minimum UAT |
|--------|-------------|
| Lab | Checkout → Track Order → Previous Orders |
| Orders | Fulfill → invoice → shipment |
| Finance | Pay → allocate → open balance |
| Logistics | Status transitions → delivered_at |
| Ops | Provision lab user; ownership |
| Inventory | PO receive → stock increase |

---

## PASS / FAIL / WARN

| Status | Action |
|--------|--------|
| PASS | Continue |
| WARN | Review; may ship if documented |
| FAIL | Block merge |
