# 12 — Verification Matrix

All `scripts/verify-*.mjs` scripts and when to run them.  
**Exit code 1** = FAIL (must fix before merge for affected module).

---

## Quick certification bundle (HQ Admin)

From `docs/QA/Admin_Final_Certification.md`:

```bash
cd primecare-portal
npm run build
node scripts/verify-inventory-dashboard-kpi.mjs
node scripts/verify-procurement-inventory-flow.mjs
node scripts/verify-orders-admin-flow.mjs
node scripts/verify-credit-risk-admin-flow.mjs
node scripts/verify-labs-admin-flow.mjs
node scripts/verify-operations-center-admin-flow.mjs
node scripts/verify-financial-reconciliation.mjs
node scripts/verify-hq-rls-reads.mjs
```

---

## Script catalog (39 scripts)

### Finance & invoices

| Script | Checks | When to run |
|--------|--------|-------------|
| `verify-financial-reconciliation.mjs` | Payments vs allocations; no dup/over-alloc; invoice open balances; GP golden path; Guntur untouched; payment compensation rollback | Any payment/AR/allocation change |
| `verify-partial-payment-sync.mjs` | Strict finalize→pay→allocate; no draft-allocation relaxation; partial ₹10 open across modules | Payment lifecycle UI changes |
| `verify-order-payment-sync.mjs` | Finalize wiring, cache invalidation, freeze guards | Orders/collections payment drawer |
| `verify-invoice-account-status.mjs` | Invoice status derivation; draft vs customer-facing labels | Invoice status display changes |
| `verify-lab-account-fallback.mjs` | Lab account fallback summary math | Lab account page |
| `verify-invoice-phase1.mjs` | Tables, RLS, no payments.invoice_id, stubs | Invoice schema |
| `verify-invoice-phase2.mjs` | Auto-invoice on fulfill, numbering, RPC hooks | Invoice creation |
| `verify-invoice-phase3.mjs` | PDF edge function, storage, immutable lines | PDF generation |
| `verify-invoice-phase4.mjs` | Invoice Center UX, bounded reads, pagination | Invoice UI |
| `verify-invoice-phase5.mjs` | partially_paid, allocate RPC, junction-only | Allocation RPC |
| `verify-primecare-production-golden-path.mjs` | Full E2E: order→fulfill→invoice→pay→allocate on QA_LAB_001 | Pre-release golden path |
| `verify-ar-reconcile.mjs` | AR reconcile RPC + collection audit | AR drift repair |
| `verify-collection-inconsistencies.mjs` | Dual-ledger audit; golden labs clean | Collections data hygiene |

### Orders & lab portal

| Script | Checks | When to run |
|--------|--------|-------------|
| `verify-orders-admin-flow.mjs` | Tenant isolation; KPI reconcile; fulfill→ledger; freeze guards | Orders page changes |
| `verify-lab-ordering-flow.mjs` | Track by order_id/uuid; legacy guard; create_lab_order smoke | Lab ordering/tracking |
| `verify-transaction-integrity-rpcs.mjs` | Sprint 1 RPC symbols in SQL + client | Order/payment RPC changes |
| `verify-bounded-reads.mjs` | No unbounded select on payments/POs | Read path changes |

### Logistics

| Script | Checks | When to run |
|--------|--------|-------------|
| `verify-logistics-dispatch-flow.mjs` | Shipment tables; hook after invoice; state machine; finance untouched | Logistics changes |
| `verify-delivery-charge-policy.mjs` | Phase 3A engine; merchandise-only total; invoice isolation | Delivery charge changes |

### Labs, collections, credit

| Script | Checks | When to run |
|--------|--------|-------------|
| `verify-labs-admin-flow.mjs` | 26 labs scoped; AR dedup; ownership sync; RLS | Labs page |
| `verify-credit-risk-admin-flow.mjs` | KPI = Σ AR; aging; golden allocation | Credit & Risk |
| `verify-agent-collections-ownership-filter.mjs` | Agent sees only owned labs | Ownership + collections |
| `verify-create-lab-ar-rls.mjs` | Lab create + AR insert RLS | Add Lab flow |

### Operations & access

| Script | Checks | When to run |
|--------|--------|-------------|
| `verify-operations-center-admin-flow.mjs` | Bundle KPIs; role guard; ownership; freeze | Ops Center |
| `verify-operations-user-directory-integrity.mjs` | Directory classification; probe detection | User directory |
| `verify-provisioning-role-guard.mjs` | Admin cannot assign executive | Provisioning |
| `verify-hq-rls-reads.mjs` | Cross-role auth + read probes | **Any RLS change** |
| `verify-hq-freeze-policy.mjs` | Freeze wiring static | Freeze policy changes |
| `verify-hq-search-runtime.mjs` | Global search bounded index | Search changes |

### Inventory & procurement

| Script | Checks | When to run |
|--------|--------|-------------|
| `verify-inventory-dashboard-kpi.mjs` | Valuation KPIs; cost fallback chain | Inventory dashboard |
| `verify-inventory-reconciliation.mjs` | No negative current_stock | Inventory writes |
| `verify-procurement-inventory-flow.mjs` | PO receive → inventory + ledger | Procurement |

### Founder & executive

| Script | Checks | When to run |
|--------|--------|-------------|
| `verify-founder-snapshot.mjs` | Founder RPC + client | Founder snapshot |
| `verify-executive-financial-intelligence.mjs` | EFI read-only; 7 sections; no write APIs | EFI module |

### Infrastructure & pilot

| Script | Checks | When to run |
|--------|--------|-------------|
| `verify-pilot-migrations.mjs` | Migration manifest files on disk | New migration added |
| `verify-pilot-hardening-sql.mjs` | No temp_anon; ownership index; live probes | Post-migration hardening |
| `verify-sprint1-health.mjs` | Bounded reads + RPC existence | Sprint 1 bundle |
| `verify-perf-scale-counts.mjs` | PERF tenant scale watermarks | Performance testing |
| `verify-production-monitoring.mjs` | RC-2 monitoring orchestrator | Release monitoring |

---

## Required scripts per module

| Module | Minimum scripts |
|--------|-----------------|
| Orders / fulfill | `verify-orders-admin-flow.mjs`, `verify-transaction-integrity-rpcs.mjs`, `verify-financial-reconciliation.mjs` |
| Lab portal | `verify-lab-ordering-flow.mjs`, `verify-hq-rls-reads.mjs` |
| Invoices / payments | `verify-invoice-phase5.mjs`, `verify-partial-payment-sync.mjs`, `verify-financial-reconciliation.mjs` |
| Logistics | `verify-logistics-dispatch-flow.mjs`, `verify-delivery-charge-policy.mjs` |
| Operations | `verify-operations-center-admin-flow.mjs`, `verify-provisioning-role-guard.mjs` |
| RLS / security | `verify-hq-rls-reads.mjs`, `verify-pilot-hardening-sql.mjs` |
| Inventory / PO | `verify-inventory-reconciliation.mjs`, `verify-procurement-inventory-flow.mjs` |
| Executive FI | `verify-executive-financial-intelligence.mjs` |
| Pre-release | Full HQ Admin bundle + `npm run build` |

---

## Manual UAT checklists

### Lab portal
- [ ] Login as lab user
- [ ] Catalog loads with stock badges
- [ ] Add to cart; credit hold blocks checkout
- [ ] Place order; success shows `order_id`
- [ ] Track Order opens immediately
- [ ] Previous Orders shows new order without hard refresh
- [ ] Lab invoices list scoped to own lab
- [ ] Lab account outstanding matches AR
- [ ] Cannot access HQ orders/logistics URL

### Orders (HQ)
- [ ] Order list tenant-scoped
- [ ] Fulfill order → inventory deducted once
- [ ] Invoice created (idempotent re-fulfill)
- [ ] Shipment appears in Logistics
- [ ] Cancel blocked after fulfilled
- [ ] Freeze blocks status change when enabled

### Collections / payments
- [ ] Record payment reduces AR
- [ ] Order-linked payment finalizes invoice PDF
- [ ] Allocation updates invoice to partially_paid/paid
- [ ] Open balance correct on invoice detail
- [ ] Draft invoice not allocatable

### Logistics
- [ ] Shipment auto-created on fulfill
- [ ] Status transitions follow state machine
- [ ] Courier assignment works
- [ ] Delivered today uses delivered_at
- [ ] Delivery charge shown; invoice total unchanged

### Operations Center
- [ ] Admin can provision lab/agent (not executive)
- [ ] Ownership assignment reflects in collections filter
- [ ] Access audit shows provisioning events
- [ ] Freeze blocks structural writes; payments still work

### Credit & Risk
- [ ] Credit hold blocks lab order
- [ ] KPI outstanding = sum AR rows
- [ ] Aging buckets correct

---

## PASS / FAIL / WARN semantics

| Status | Meaning |
|--------|---------|
| **PASS** | Check succeeded |
| **WARN** | Known gap or pre-migration state — review but may not fail build |
| **FAIL** | Regression — fix before merge |

Most admin scripts: **exit 1 if any FAIL**.

---

## Environment prerequisites

| Requirement | Used by |
|-------------|---------|
| `.env.local` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Live QA scripts |
| QA credentials in `scripts/qaCredentials.mjs` | Live auth scripts |
| Linked Supabase CLI | `verify-pilot-hardening-sql.mjs`, `verify-perf-scale-counts.mjs` |
| `--mutate` flag | `verify-procurement-inventory-flow.mjs` (destructive receive test) |
| `--remote` flag | Invoice phase scripts (live RLS probes) |

---

## Build gate

Always run before PR:

```bash
npm run build
```

Build includes `check:tenant-view` for view import safety.
