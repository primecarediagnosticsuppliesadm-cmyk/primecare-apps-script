# PrimeCare HQ Admin — Final Certification Sweep

**Date:** 2026-06-28  
**Branch:** `qa`  
**Environment:** QA Supabase (`f168b98f-47a6-42c3-b788-24c00436fac2`) + local build  
**Scope:** HQ Admin modules only (not Executive, Agent, or Lab full certification)

---

## Executive Summary

This sweep reviewed all ten HQ Admin module areas against CRUD, reconciliation, tenant isolation, and existing automated verification scripts. **No open Critical defects** remain from the QA Gap Register (GAP-002–007 fixed). Core inventory, catalog, and procurement paths are **production-safe for Year-1 HQ** with documented Medium risks.

**Verdict: NO-GO** for full production pilot until manual UAT completion (PO lifecycle UI, payment record, create lab UI), Agent login smoke test, and Predator certification failures are cleared.

**Verdict: CONDITIONAL GO** for continued HQ Admin UAT on inventory / catalog / procurement.

**Admin Orders module: GO** (see §5; `verify-orders-admin-flow.mjs` 13/13 PASS).

**Admin Credit & Risk module: GO** (see §6; `verify-credit-risk-admin-flow.mjs` 16/16 PASS, 1 WARN).

**Admin Labs module: GO** (see §7; `verify-labs-admin-flow.mjs` 29/29 PASS, 6 WARN).

> Per certification rule: Critical issues are resolved, but High/Medium operational gaps and incomplete end-to-end UAT prevent an unconditional GO.

---

## Build & Automated Verification

### Build

| Check | Result |
|---|---|
| `npm run build` | **PASS** |

### QA verification scripts (25 total)

| Script | Result | Notes |
|---|---|---|
| `verify-inventory-dashboard-kpi.mjs` | **PASS** | Fixed during sweep: removed hardcoded `QA_SKU_003` stock (was 120; live 140). Now asserts `stock × cost = value` dynamically. |
| `verify-procurement-inventory-flow.mjs` | **PASS** | Catalog stock 140 = inventory; pricing matrix OK |
| `verify-orders-admin-flow.mjs` | **PASS** | 64 HQ orders; KPI reconcile; ORDER_OUT ledger match (GAP-017) |
| `verify-credit-risk-admin-flow.mjs` | **PASS** | 16 PASS / 1 WARN; KPI ₹1,500 = AR; golden allocation (GAP-018) |
| `verify-labs-admin-flow.mjs` | **PASS** | 29 PASS / 6 WARN; 26 labs tenant-scoped; ownership sync (GAP-019) |
| `verify-inventory-reconciliation.mjs` | **PASS** | No negative stock (does not reconcile ledger Σ vs on-hand) |
| `verify-financial-reconciliation.mjs` | **PASS** | 12/12 checks |
| `verify-hq-rls-reads.mjs` | **PASS** | Admin broad reads OK |
| `verify-hq-search-runtime.mjs` | **PASS** | Catalog + PO search |
| `verify-bounded-reads.mjs` | **PASS** | Payments + PO bounds |
| `verify-collection-inconsistencies.mjs` | **PASS*** | *22 legacy drift rows on non-golden labs; golden labs clean |
| `verify-ar-reconcile.mjs` | **PASS*** | *Same MIXED legacy classification |
| `verify-agent-collections-ownership-filter.mjs` | **PASS** | |
| `verify-founder-snapshot.mjs` | **PASS** | |
| `verify-sprint1-health.mjs` | **PASS** | RPC presence |
| `verify-transaction-integrity-rpcs.mjs` | **PASS** | ORDER_OUT idempotency RPC wired |
| `verify-pilot-migrations.mjs` | **PASS** | 28 migration files present (file check) |
| `verify-primecare-production-golden-path.mjs` | **PASS** | Golden invoice/payment path |
| `verify-invoice-phase1.mjs` – `phase5.mjs` | **PASS** | Remote checks skipped without `--remote` |
| `verify-lab-account-fallback.mjs` | **PASS** | |
| `verify-production-monitoring.mjs` | **FAIL** | 3/10 sub-checks failed (see below) |
| `verify-provisioning-role-guard.mjs` | **FAIL** | Node cannot resolve `@/` alias in `rolePermissionMatrix.js` |
| `verify-perf-scale-counts.mjs` | **FAIL** | Requires `.perf-scale-tenant.json` seed |
| `verify-pilot-hardening-sql.mjs` | **FAIL** | Requires linked Supabase CLI |

**Monitoring sub-check failures (MON-12/14/15):**

- Pilot hardening SQL dump — Supabase CLI not linked in CI/local sweep environment
- Performance certification — no PERF tenant seeded
- Predator validation — **2 FAIL**, 22 WARN (collection inconsistencies on legacy rows)

---

## Cross-Cutting Reconciliation

| Invariant | Status | Evidence |
|---|---|---|
| Inventory == Master Catalog HQ Stock | **PASS** | `verify-procurement-inventory-flow.mjs` — `catalog.stock_match` (live: 140) |
| Inventory Value == Σ(stock × resolved cost) | **PASS** | `verify-inventory-dashboard-kpi.mjs` — reconciliation.total (live HQ total ₹37,756) |
| Purchase Forecast Suggestions == Inventory Health velocity | **PASS** | GAP-016 fix; same `getInventoryHealthRead()` source |
| Ledger == Inventory movements (automated) | **NOT ENFORCED** | No scheduled job; `verify-inventory-reconciliation.mjs` checks negative stock only |
| Purchase Orders == Dashboard totals | **PASS** (scoped) | PO KPI cards label basis; bounded reads guarded |
| Orders == Inventory deductions | **PASS** | Fulfilled orders: ORDER_OUT qty matches order_items (verify script) |
| Payments == Collections | **PASS** | Golden allocation; no over-allocations; golden labs clean |
| Collections == Dashboard KPIs | **PASS** | Outstanding ₹1,500 = Σ AR; aging buckets reconcile |

---

## Module Certification

### 1. Dashboard — **PASS** (with Medium caveats)

| Check | Status | Notes |
|---|---|---|
| KPI accuracy | Pass | `getAdminDashboardRead` + metric engines |
| Cards vs source tables | Pass | Bounded Supabase reads |
| Stale cache | Medium | `getStockDashboard` session cache has no tenant key (low risk for admin) |
| Placeholder values | Pass | No "Not enough cost data" when `cost_price` exists (GAP-014) |
| Duplicate counting | Medium | Near-stockout uses `MAX(forecast, stock buckets)` — can diverge from Health tab |
| Refresh | Pass | Force refresh on dashboard load |

**Root cause (Medium):** Admin dashboard bounded reads rely on RLS without explicit `.eq("tenant_id")` in `hqBoundedReads.js`. Isolation depends on Supabase policies.

---

### 2. Master Catalog — **PASS**

| Check | Status | Notes |
|---|---|---|
| Add / Edit / Enable / Disable | Pass | `createHqProductWrite`, `updateHqProductWrite` |
| Price / Cost / Margin | Pass | `products.selling_price` / `cost_price` authoritative (GAP-015); `[masterCatalogPricing]` logs |
| HQ Stock vs Inventory | Pass | Dynamic reconciliation in verify script |
| Search / Sort | Pass | Client-side on catalog model; global search wired |
| Duplicate SKU prevention | Pass | DB unique `(tenant_id, product_id)` |

**Verified live:** QA_SKU_003 ₹900 / ₹200 / ~78%; QA_SKU_002 ₹800 / ₹150 / ~81%; QA TEST KIT D ₹13 / ₹12 / ~8%.

---

### 3. Inventory — **PASS** (with Medium caveats)

| Check | Status | Notes |
|---|---|---|
| Stock tab | Pass | `v_stock_dashboard` |
| Movements | Pass | 90-day bounded ledger; expanded audit fields |
| Health | Pass | Velocity + urgency; expandable valuation detail |
| KPI reconciliation | Pass | Value strip reconciles with economics model |
| Ledger reconciliation | Medium | Audit trail only; no Σ ledger vs on-hand job |
| Drill-down panels | Pass | Valuation formula + warning explanations |
| Duplicate inventory detection | Pass | Single row per tenant+SKU verified |

**Medium — semantic mismatch:** Stock tab "Critical" = zero stock; Health "Critical" = at/below min stock. Operators may see conflicting urgency labels across tabs.

**Defect fixed during sweep:** `verify-inventory-dashboard-kpi.mjs` hardcoded stock 120 caused false FAIL at live stock 140.

---

### 4. Purchase & Reorder — **PASS** (with Medium caveats)

| Check | Status | Notes |
|---|---|---|
| Forecast Suggestions | Pass | Aligned with Inventory Health (GAP-016) |
| Reorder Candidates / Smart Reorder | Medium | Still uses `v_reorder_candidates` (min-stock only); UI acknowledges split |
| Create PO | Pass* | Catalog picker + API validation (GAP-009); *manual UAT unchecked |
| Receive Stock | Pass | Status guards + remaining qty cap (GAP-011) |
| PO lifecycle | Pass* | Cancel/edit Draft/Ordered (GAP-010); *manual UAT unchecked |
| Duplicate receive protection | Pass | Status + qty guards; no DB idempotency RPC for PURCHASE_IN (Medium risk) |
| Dashboard KPIs | Pass | Basis labels on cards |

**Medium — PO receive:** Multi-step JS write (inventory → ledger → PO) is non-transactional. ORDER_OUT has idempotent RPC; PURCHASE_IN does not.

---

### 5. Orders — **GO** (GAP-017 fixed; automated certification PASS)

| Check | Status | Notes |
|---|---|---|
| Dashboard KPIs | Pass | 7 cards reconcile with scoped list (`computeOrdersKpis`) |
| Orders list | Pass | 64 orders; all `qa-tenant-001`; RLS blocks foreign tenants |
| Search / Filters / Sort | Pass | Status, payment, lab, date, ops queue, 7 sort keys |
| Order detail | Pass | `getOrderDetailsRead` — `order_items` + `order_lines` fallback |
| Status transitions | Pass | API guards; UI disables actions on cancelled/fulfilled |
| Fulfillment flow | Pass | Blocks deduction failure; requires ORDER_OUT ledger |
| Inventory deduction | Pass | Idempotent `deduct_inventory_for_order` RPC |
| order_items reconciliation | Pass | 50/50 header vs line totals in verify script |
| Ledger reconciliation | Pass | 30/30 fulfilled orders: one ORDER_OUT per SKU |
| Tenant / RLS | Pass | Zero foreign-tenant rows visible to admin JWT |
| Duplicate fulfillment | Pass | RPC idempotency + `inventory_updated` / ledger probe |
| Cancelled orders | Pass* | Cancel does not deduct; *seed `QA_ORD_001` has legacy ORDER_OUT |
| Error / loading / empty | Pass | Error banner on read failure; detail loading states |

**Fixes applied (GAP-017):** Block Cancelled→Fulfilled; fail Fulfilled without ORDER_OUT; line-item fallback; item count dedup; status button guards.

**Regression:** `node scripts/verify-orders-admin-flow.mjs` — **13/13 PASS**.

**Admin Orders verdict: GO** — no Critical defects; payment recording UAT still open separately.

---

### 6. Credit & Risk — **GO** (GAP-018 certified)

| Check | Status | Notes |
|---|---|---|
| Dashboard KPIs | Pass | Outstanding ₹1,500 = Σ AR; overdue 0; high risk 0 |
| Lab credit list | Pass | Search, filters, sort (Credit & Risk workspace + standard view) |
| Aging buckets | Pass | Current / 1–15 / 16–30 / 31+ boundaries verified; Σ = KPI |
| Payment allocation | Pass | No dup/over-alloc; golden payment ₹100 → open balance ₹0 |
| Tenant isolation | Pass | 26 AR rows scoped; 0 foreign tenants via RLS |
| Financial reconciliation | Pass | `verify-financial-reconciliation.mjs` 12/12 |
| Golden labs | Pass | QA_LAB_* zero audit issues |
| Bounded reads | Pass | AR 26 / payments 45 within 5,000 limits |
| Loading / empty states | Pass | Command center + lab account views |

**WARN:** 22 inactive AR rows (`ar_row_no_activity`) on non-golden labs — no KPI impact.

**Regression:** `node scripts/verify-credit-risk-admin-flow.mjs` — **16 PASS, 1 WARN, 0 FAIL**.

**Admin Credit & Risk verdict: GO**

---

### 7. Labs — **GO** (GAP-019 certified)

| Check | Status | Notes |
|---|---|---|
| Tenant isolation | Pass | 26 labs scoped to `qa-tenant-001`; RLS probe clean |
| Lab directory read | Pass | `getLabsCredit()` / `v_labs_credit`; bounded 5,000 |
| Filters / attention queue | Pass | Credit chips + OUTSTANDING/FOLLOWUPS/UNASSIGNED reconcile |
| Portfolio KPIs | Pass | Outstanding ₹1,500 = Σ AR; attention cards reconcile |
| Golden labs | Pass | `QA_LAB_001–003` present; AR row each; no dup AR |
| Agent assignment | Pass | `labs.assigned_agent_id` = `lab_ownership` primary (52 ACTIVE rows) |
| Add Lab (HQ) | Pass (code) | No distributor field; tenant + required field validation |
| Edit Lab | Partial | No `updateLabWrite`; review drawer read-only |
| Credit integration | Pass | Golden labs in Collections read |
| Orders integration | Pass | Order lab_ids exist in labs directory |
| RLS (agent / lab user) | Pass | Agent ownership-scoped; lab user sees `QA_LAB_001` only |
| Loading / empty / error | Pass | `PageSkeleton`, `DataFetchError`, filter empty states |

**WARN:** No text search/pagination; golden labs `status=PROSPECT` (active KPI undercounts); manual create-lab UAT open.

**Regression:** `node scripts/verify-labs-admin-flow.mjs` — **29 PASS, 6 WARN, 0 FAIL**.

**Admin Labs verdict: GO**

---

### 8. Operations Center — **PASS** (code)

| Check | Status | Notes |
|---|---|---|
| Users / Roles | Pass | `OperationsCenterAdminPage` passes `tenantId` |
| Agent / Lab assignment | Pass | Bundle loaders tenant-scoped |
| RLS verification | Pass | `verify-hq-rls-reads.mjs` |
| Admin → Executive block | Pass (code) | `PROVISION_RULES_BY_ACTOR`; script runner broken (see tooling) |

---

### 9. Access & Security — **PASS**

| Check | Status | Notes |
|---|---|---|
| Roles / Route guards | Pass | `canRoleAccessPage` + `canAccessPage` + env visibility |
| Menu visibility | Pass | `ADMIN_HQ_MENU_KEYS`; pilot hides Predator/notifications |
| Unauthorized access | Pass | `UnauthorizedCard` on denied pages |
| Tenant isolation | Pass | Admin locked to profile tenant; isolation validation probes available |

**Medium:** Some permissioned routes reachable by URL but not in sidebar (`labContractEngine`, `reorder`, `collections`).

---

### 10. Qualification Analytics — **PARTIAL**

| Check | Status | Notes |
|---|---|---|
| Dashboard values / Charts / Counts | Pass (code) | `QualificationReviewPage` filter + count display |
| Filtering | Pass (code) | |
| Automated verification | None | No dedicated verify script; manual review recommended |

---

## Issue Register (This Sweep)

| ID | Severity | Area | Summary | Status |
|---|---|---|---|---|
| CERT-001 | **Medium** | Verification tooling | `verify-inventory-dashboard-kpi.mjs` hardcoded stock caused false FAIL | **Fixed** (dynamic stock × cost) |
| CERT-002 | **Medium** | Inventory UX | Stock "Critical" ≠ Health "Critical" threshold | Open — document for operators |
| CERT-003 | **Medium** | Procurement | Reorder Candidates / Smart Reorder still min-stock (`v_reorder_candidates`) | Open — partial GAP-016 fix |
| CERT-004 | **Medium** | Procurement | PO receive non-transactional; no PURCHASE_IN idempotency RPC | Open — mitigated by UI guards |
| CERT-005 | **Medium** | Dashboard | Bounded reads RLS-only (no explicit tenant filter) | Open — verify RLS in prod |
| CERT-006 | **Medium** | Tooling | `verify-provisioning-role-guard.mjs` fails on `@/` alias | Open — logic correct in source |
| CERT-007 | **Medium** | Legacy | GAP-008 Apps Script error logging in Supabase-only mode | Open |
| CERT-008 | **Low** | Ledger audit | `receivePurchaseOrderWrite` sets `order_id` but not `reference_id` | Open — UI falls back to `order_id` |
| CERT-009 | **Low** | Architecture | GAP-001 catalog creates inventory row (deferred) | Deferred |
| CERT-010 | **Low** | Supplier | GAP-013 free-text supplier (deferred) | Deferred |
| CERT-011 | **Low** | QA seed data | `QA_ORD_001` cancelled but retains seed ORDER_OUT ledger | Documented exception |
| CERT-012 | **Medium** | Credit & Risk | 22 inactive AR rows (`ar_row_no_activity`) on non-golden labs | WARN in verify script |
| CERT-013 | **Medium** | Credit & Risk | `days_overdue` not recomputed from invoices in app code | Stored field only |
| CERT-014 | **Low** | Credit & Risk | Aging UI uses 1–15/16–30/31+ not 30/60/90 calendar buckets | By design in `creditRiskHqEngine` |
| CERT-015 | **Medium** | Labs | No `updateLabWrite` / HQ edit form for lab profile fields | Read-only review drawer |
| CERT-016 | **Medium** | Labs | No text search or pagination on Labs directory | Credit/attention filters only |
| CERT-017 | **Medium** | Labs | Golden labs `status=PROSPECT`; active KPI uses `status===active` only | `labs.active=true` operationally |
| CERT-018 | **Low** | Labs | Duplicate lab names allowed — `(tenant_id, lab_id)` uniqueness only | Document for operators |
| CERT-019 | **Low** | Labs | Orders lab filter from orders list — no inactive-lab exclusion | Historical orders remain visible |

**Critical issues from QA Gap Register:** 0 open (GAP-002–007 fixed).

---

## Remaining Risks

1. **Incomplete manual UAT** — PO create/edit/cancel/receive, lab create, order fulfill, payment record still unchecked in `UAT_Checklist.md`.
2. **Agent login** — Not smoke-tested (Production Readiness ⏳).
3. **Predator certification** — 2 FAIL in full validation run (MON-15).
4. **Legacy AR/collection drift** — 22+ rows on pre-golden labs; acceptable for golden path only.
5. **Dual forecast engines** — Forecast Suggestions vs Reorder Candidates may confuse operators.
6. **No ledger ↔ on-hand reconciliation job** — Drift possible after partial write failures.

---

## Production Blockers

| Blocker | Severity | Blocks GO? |
|---|---|---|
| Open Critical gaps | — | No (all fixed) |
| Manual Admin E2E UAT incomplete | High | **Yes** |
| Agent login not validated | High | **Yes** (full pilot) |
| Predator 2 FAIL | High | **Yes** (full pilot) |
| GAP-008 legacy logging | Medium | No (core flows) |
| CERT-002–004 operational semantics | Medium | No (HQ inventory pilot) |

---

## GO / NO-GO Recommendation

### Full production pilot: **NO-GO**

Reasons:
- Manual UAT checklist incomplete for Orders, Labs, PO UI flows
- Agent role not smoke-tested
- Predator full validation reports 2 failures
- End-to-end business flow (order → fulfill → invoice → payment → AR → inventory) not certified

### HQ Admin inventory / catalog / procurement UAT: **CONDITIONAL GO**

Reasons:
- All Critical gaps resolved
- Build passes
- Core reconciliation scripts pass on live QA data
- Master Catalog pricing, Inventory valuation, and Procurement dry-run verified
- Known Medium risks documented and mitigated by UI guards

### Required before full GO

1. Complete manual UAT items in `UAT_Checklist.md` (PO UI, payment record, create lab UI).
2. Agent login smoke test.
3. Resolve Predator certification failures (re-run `run-hq-predator-certification.mjs`).
4. Fix or skip-with-document `verify-provisioning-role-guard.mjs` Node alias issue.
5. Operator briefing on Stock vs Health "Critical" definitions and dual forecast paths.

### Admin Labs module — **GO**

Certified 2026-06-28 via `verify-labs-admin-flow.mjs` (29/29 PASS, 6 WARN). Manual create-lab UI UAT and lab edit workflow remain open but do not block Labs module certification.

---

### Admin Orders module — **GO**

Certified 2026-06-28 via `verify-orders-admin-flow.mjs` (13/13) + GAP-017 fulfillment guards. Payment recording remains open in UAT checklist but does not block Orders module certification.

---

## References

- Gap register: `docs/QA/QA_Gap_Register.md`
- UAT checklist: `docs/QA/UAT_Checklist.md`
- Production readiness: `docs/QA/Production_Readiness.md`
- Key scripts: `scripts/verify-inventory-dashboard-kpi.mjs`, `scripts/verify-procurement-inventory-flow.mjs`, `scripts/verify-orders-admin-flow.mjs`, `scripts/verify-credit-risk-admin-flow.mjs`, `scripts/verify-labs-admin-flow.mjs`, `scripts/verify-hq-rls-reads.mjs`, `scripts/verify-financial-reconciliation.mjs`

---

*Certification performed via code review, live QA Supabase script runs, and existing gap register cross-check. No new features introduced.*
