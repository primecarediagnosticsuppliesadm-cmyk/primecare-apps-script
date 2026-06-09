# PrimeCare HQ Launch Checklist

**Purpose:** Every requirement before handing PrimeCare HQ to the tester.  
**Scope:** 11 HQ modules only — not Distributor OS or roadmap modules.  
**Environment:** Staging Supabase + `qa` branch build + `VITE_PREDATOR_DEBUG=true`

---

## Section 1 — Infrastructure (Must pass before any UI testing)

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 1.1 | `production_auth_rls_pilot_migration.sql` applied | SQL: anon policies on `orders`, `payments`, `inventory` = 0 rows | ☐ |
| 1.2 | `executive_distributor_catalog_inventory_rls.sql` applied | Executive can SELECT HQ `products` and `inventory` | ☐ |
| 1.3 | `executive_distributor_ops_rls_migration.sql` applied | Executive can SELECT HQ `orders`, `payments`, `ar_credit_control` | ☐ |
| 1.4 | Supabase env vars set in staging build | App loads without "Supabase not configured" | ☐ |
| 1.5 | `VITE_PREDATOR_DEBUG=true` in staging | Predator Debug + QA Command Center accessible | ☐ |
| 1.6 | `npm run build` passes on `qa` branch | CI/local build exit 0 | ☐ |
| 1.7 | QA auth users seeded with active profiles | Executive + Admin login succeeds | ☐ |
| 1.8 | HQ tenant UUID confirmed (`f168b98f-47a6-42c3-b788-24c00436fac2` or env-specific) | Profile `tenant_id` matches | ☐ |

---

## Section 2 — Executive Dashboard

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 2.1 | Executive login lands on Executive Control Tower | Dashboard renders without fatal error | ☐ |
| 2.2 | Admin login lands on Admin Dashboard | KPI tiles render | ☐ |
| 2.3 | Orders count matches Supabase ground truth (service role or SQL) | Count within ±0 vs `SELECT count(*) FROM orders WHERE tenant_id = HQ` | ☐ |
| 2.4 | Collections outstanding matches AR sum | Outstanding ≈ `SUM(outstanding_amount)` for HQ tenant | ☐ |
| 2.5 | Inventory near-stockout count reasonable | Matches `v_stock_dashboard` low-stock filter | ☐ |
| 2.6 | No Apps Script zero-overwrite on Supabase KPIs | After refresh, KPIs unchanged (not reset to 0) | ☐ |
| 2.7 | Predator Admin Dashboard validator PASS or WARN-only | QA Command Center → Admin Dashboard module | ☐ |
| 2.8 | Intervention section loads (may be empty) | No unhandled exception | ☐ |

---

## Section 3 — Operations Center

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 3.1 | Page loads for Executive and Admin | Attention queue renders | ☐ |
| 3.2 | Labs list scoped to HQ tenant | No foreign `tenant_id` in lab rows | ☐ |
| 3.3 | Orders appear in ops payload | Order count > 0 if seed data exists | ☐ |
| 3.4 | Collections appear in ops payload | AR rows visible | ☐ |
| 3.5 | Qualifications load (may be empty for HQ-only) | No silent crash; empty state OK | ☐ |
| 3.6 | Operational evidence list loads | No 403 in network tab | ☐ |
| 3.7 | Predator Operations Center validator PASS or WARN-only | QA Command Center | ☐ |
| 3.8 | Navigate to Orders from ops link works | Route resolves (even if via URL) | ☐ |

---

## Section 4 — Master Catalog

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 4.1 | Page loads read-only product table | `MasterCatalogPage` renders | ☐ |
| 4.2 | Product count > 0 if HQ catalog seeded | Products tile matches table rows | ☐ |
| 4.3 | HQ price / cost / transfer price columns populated or show "Not configured" | No NaN or crash | ☐ |
| 4.4 | Source shows `hq_master` or `v_lab_catalog` | Source tile accurate | ☐ |
| 4.5 | `v_lab_catalog` view exists OR fallback to inventory documented | No persistent error banner | ☐ |
| 4.6 | RLS permits Executive/Admin read | No 403 on catalog load | ☐ |

---

## Section 5 — Inventory

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 5.1 | Stock tab loads (`StockPage`) | `v_stock_dashboard` rows render | ☐ |
| 5.2 | Movements tab loads (`InventoryLedgerPage`) | Ledger entries or empty state | ☐ |
| 5.3 | Health tab loads (`InventoryHealthPage`) | Health metrics or empty state | ☐ |
| 5.4 | Stock count matches Supabase | Row count ≈ SQL ground truth | ☐ |
| 5.5 | Predator Inventory Economics validator PASS or WARN-only | QA Command Center | ☐ |
| 5.6 | Receive PO updates stock (integration test) | Stock increases after PO receive | ☐ |

---

## Section 6 — Purchase Orders

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 6.1 | Purchase Orders page loads | PO list renders | ☐ |
| 6.2 | Reorder forecast loads | Forecast rows or empty state | ☐ |
| 6.3 | Create draft PO succeeds | Row in `purchase_orders` with HQ `tenant_id` | ☐ |
| 6.4 | Receive PO succeeds | `inventory` row updated | ☐ |
| 6.5 | Auto-triggers labeled as forecast suggestions (not live automation) | UI copy accurate | ☐ |
| 6.6 | RLS permits Admin/Executive CRUD on HQ tenant POs | No 403 on write | ☐ |
| 6.7 | No Apps Script fallback when Supabase configured | Network shows Supabase only | ☐ |

---

## Section 7 — Orders

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 7.1 | Orders page accessible (direct route or sidebar after P0 fix) | `OrdersPage` renders | ☐ |
| 7.2 | Order list shows HQ tenant orders only | `filterRowsByTenant` + RLS | ☐ |
| 7.3 | Order read error surfaces (not silent empty) — after P0 fix | Simulate RLS block → error banner | ☐ |
| 7.4 | Update order status succeeds | Status persisted in `orders` | ☐ |
| 7.5 | Fulfillment updates inventory (if applicable) | Stock decreases on fulfill | ☐ |
| 7.6 | Fulfillment creates/updates AR row | `ar_credit_control` reflects order | ☐ |
| 7.7 | Predator PrimeCare OS isolation PASS | No HQ leakage in isolation validator | ☐ |

---

## Section 8 — Collections / AR

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 8.1 | Collections page loads for Admin | `CollectionsPage` renders | ☐ |
| 8.2 | Credit & Risk page loads for Executive (via `risk` key) | Same page, exec role | ☐ |
| 8.3 | AR outstanding sum correct | Matches RF / dashboard outstanding | ☐ |
| 8.4 | Record payment succeeds | `payments` row + AR `total_paid` updated | ☐ |
| 8.5 | Payment correction path (UPDATE) works after ops RLS | Executive can fix payment amount | ☐ |
| 8.6 | Predator Collections validator PASS or WARN-only | Layer checks (DB/API/UI) | ☐ |
| 8.7 | Placeholder features documented (statement, support, tasks) | Tester knows these are N/A | ☐ |
| 8.8 | Agent sees only assigned labs' AR | Agent role scoped SELECT | ☐ |

---

## Section 9 — Revenue Funnel

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 9.1 | Page loads for Executive | `RevenueFunnelPage` renders | ☐ |
| 9.2 | Portfolio tiles show numeric values (not all zero if data exists) | Qualified, contracted, orders tiles | ☐ |
| 9.3 | Per-distributor table renders | At least HQ-focused row | ☐ |
| 9.4 | Integrity status accurate (healthy/warning/broken) | Matches qual + contract data | ☐ |
| 9.5 | Metric semantics documented for tester | Orders vs Ordered, Paid column = lab count | ☐ |
| 9.6 | Predator Revenue Funnel validator PASS or WARN-only | QA Command Center | ☐ |
| 9.7 | `pathComplete` logic understood | Requires payments > 0, not AR alone | ☐ |

---

## Section 10 — Pilot Readiness

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 10.1 | Page loads for Executive | 9 gates render per distributor | ☐ |
| 10.2 | Foundation gate PASS for HQ tenant | Durable + active | ☐ |
| 10.3 | Score and band display (READY / CONDITIONAL / etc.) | Numeric score 0–100 | ☐ |
| 10.4 | Trend section shows placeholder message (not broken UI) | "planned for future release" | ☐ |
| 10.5 | Predator run completed before assessment | Quality gate reflects Predator health | ☐ |
| 10.6 | Predator Pilot Readiness validator PASS or WARN-only | QA Command Center | ☐ |
| 10.7 | Portfolio gate duplication documented | Ops/Quality same across rows | ☐ |

---

## Section 11 — Predator

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 11.1 | Predator Debug Console accessible | Executive/Admin + flag enabled | ☐ |
| 11.2 | Run All Validations completes without crash | Report generated | ☐ |
| 11.3 | HQ-relevant modules validated | Admin Dashboard, Ops Center, Collections, Inventory Economics, Revenue Funnel, Pilot Readiness, QA Readiness | ☐ |
| 11.4 | No FAIL on RLS layer checks for HQ tenant | Review FAIL entries — all resolved or accepted | ☐ |
| 11.5 | Tenant + Role Isolation validator run | No HQ leakage detected | ☐ |
| 11.6 | Module snapshots captured (visit pages before batch) | Reduces false WARN from missing snapshots | ☐ |

---

## Section 12 — QA Command Center

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 12.1 | Page loads for Executive only | Admin cannot access | ☐ |
| 12.2 | Release status displays (Ready / Pilot Ready / Risky / Not Ready) | Score computed | ☐ |
| 12.3 | Module coverage grid populated after Predator run | Coverage areas show pass/warn/fail | ☐ |
| 12.4 | Defect registry accepts CRUD | Add test defect, verify persistence in session | ☐ |
| 12.5 | Export defect snapshot before handoff | JSON/markdown export saved | ☐ |
| 12.6 | Predator QA Readiness validator PASS or WARN-only | Meta-validation | ☐ |
| 12.7 | Tester briefed on local-only defect storage | Documented limitation | ☐ |

---

## Section 13 — Cross-module E2E (HQ tenant only)

| # | Requirement | How to verify | Pass |
|---|-------------|---------------|------|
| 13.1 | PO receive → Inventory stock increases | Stock tab reflects change | ☐ |
| 13.2 | Order place → fulfill → AR created | Collections shows outstanding | ☐ |
| 13.3 | Payment recorded → AR reduced | Outstanding decreases | ☐ |
| 13.4 | Dashboard KPIs update after E2E (may need cache refresh or force reload) | Counts reflect new data | ☐ |
| 13.5 | Revenue Funnel metrics update after E2E | Ordered / paid counts change | ☐ |
| 13.6 | No 403/42501 errors in browser console during E2E | Clean network tab | ☐ |

---

## Section 14 — Handoff package for tester

| # | Deliverable | Location | Pass |
|---|-------------|----------|------|
| 14.1 | HQ QA Test Plan (100 cases) | `docs/hq-audit/HQ_QA_TEST_PLAN.md` | ☐ |
| 14.2 | QA Execution Plan | `docs/hq-audit/QA_EXECUTION_PLAN.md` | ☐ |
| 14.3 | Finalization Report | `docs/hq-audit/PRIMECARE_HQ_FINALIZATION_REPORT.md` | ☐ |
| 14.4 | RLS Remediation Report | `docs/hq-audit/RLS_REMEDIATION_REPORT.md` | ☐ |
| 14.5 | Staging URL + credentials (secure channel) | — | ☐ |
| 14.6 | Known limitations doc (placeholders, metric semantics) | Section D of Finalization Report | ☐ |
| 14.7 | Migration apply confirmation screenshot/log | Supabase SQL editor | ☐ |

---

## Sign-off gates

| Gate | Minimum | Actual | Sign-off |
|------|---------|--------|----------|
| Section 1 (Infrastructure) | 8/8 | | ☐ |
| Sections 2–12 (Modules) | 90% items PASS | | ☐ |
| Section 13 (E2E) | 6/6 | | ☐ |
| Section 14 (Handoff) | 7/7 | | ☐ |
| P0 defects open | 0 | | ☐ |
| HQ weighted readiness | ≥ 85% | 71% (pre-remediation) | ☐ |

**QA Lead sign-off:** _________________ Date: _________  
**Architect sign-off:** _________________ Date: _________

---

## Tester quick-start (5 steps)

1. Confirm staging URL loads with Executive login
2. Apply/check Section 1 infrastructure items
3. Visit each module in sidebar once (captures Predator snapshots)
4. QA Command Center → Run All Predator Validations
5. Execute P0 tests from `HQ_QA_TEST_PLAN.md` (40 cases)

**Do not test:** Distributor OS, Doctor OS, Patient App, NABL OS, Insurance, or experimental modules.
