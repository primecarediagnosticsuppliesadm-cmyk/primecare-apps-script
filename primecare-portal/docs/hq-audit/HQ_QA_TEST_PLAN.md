# HQ QA Test Plan — 100 Test Cases

**Date:** 2026-05-28  
**Sprint:** PrimeCare HQ Stabilization (no new features)  
**Environments:** Staging Supabase + `qa` branch build  
**Roles under test:** Executive, Admin, Agent, Lab

**Pass criteria:** Expected result matches actual; no RLS error in console; no unhandled exception.  
**Fail criteria:** Any P0 mismatch, Supabase 403/42501, or incorrect metric by >1 unit (count) or >₹1 (currency).

---

## P0 — Critical Path (40 cases)

| ID | Area | Test case | Expected result | Pass/Fail |
|----|------|-----------|-----------------|-----------|
| P0-001 | Auth | Executive login with active profile | Dashboard loads; `current_profile()` resolves | |
| P0-002 | Auth | Login without active profile | Blocked with profile activation message | |
| P0-003 | Auth | Lab user accesses HQ-only route | Redirect or access denied | |
| P0-004 | RLS | Verify pilot migration applied — anon cannot SELECT orders | 0 rows or auth required | |
| P0-005 | RLS | Verify anon cannot INSERT payments | Policy violation | |
| P0-006 | RLS | Executive INSERT lab for Guntur tenant | Row created with correct `tenant_id` | |
| P0-007 | RLS | Executive UPDATE Guntur lab from HQ profile | Document: fails OR passes after RLS fix | |
| P0-008 | Qual | Distributor OS → Qualification → create qual row | Row in `lab_qualifications` | |
| P0-009 | Qual | Mark pipeline stage `qualified` | Stage persisted; RF qualified count +1 | |
| P0-010 | Qual | Contract activate without qualification | Blocked: "Lab must complete Qualification..." | |
| P0-011 | Qual | Contract activate with qualified pipeline | Status → Active | |
| P0-012 | Contract | Executive activates contract cross-tenant | SUCCESS (RLS permits) | |
| P0-013 | Contract | Admin reads only own-tenant contracts (post-fix) | No foreign distributor contracts | |
| P0-014 | Catalog | Apply catalog RLS migration | Executive can read Guntur products | |
| P0-015 | Catalog | Catalog mirror sync after assignment | Products > 0, Inventory > 0 in RF | |
| P0-016 | Inventory | Executive upsert inventory for distributor | Row visible in stock dashboard | |
| P0-017 | Order | Lab places order for own lab | Order row created | |
| P0-018 | Order | Executive views distributor orders (HQ profile) | Document current behavior | |
| P0-019 | Fulfill | Update order status to fulfilled | RF fulfilled count updates | |
| P0-020 | Collection | Create AR row for lab | Visible on Collections page | |
| P0-021 | Payment | Record payment against lab | `payments` row; `totalPaid` updates | |
| P0-022 | RF | Qualified labs count matches qual query | Pipeline qualified/won only | |
| P0-023 | RF | Contracted labs = Active contracts | Matches `lab_contracts` | |
| P0-024 | RF | Qualification integrity Broken | Active contract, no qual row → Broken | |
| P0-025 | RF | Ready to order gate | Contracted + inventory ready | |
| P0-026 | Pilot | Foundation gate PASS for active durable distributor | Gate green | |
| P0-027 | Pilot | Labs gate — qualified_lab PASS | ≥1 pipeline qualified | |
| P0-028 | Pilot | Contracts gate — active_contract PASS | ≥1 ACTIVE | |
| P0-029 | Predator | Run full batch as executive | Report generated | |
| P0-030 | Predator | Lab Contract `contract_activation_requires_qualification` | PASS after qual fix | |
| P0-031 | Isolation | HQ tenant rows not in Guntur scoped set | `detectHqLeakage` = 0 | |
| P0-032 | Nav | Qualification Analytics visible in executive sidebar | Menu item present | |
| P0-033 | Nav | Distributor OS Labs Qualification tab | Tab renders panel | |
| P0-034 | E2E | Full Guntur path: qual → contract → order → pay | RF pathComplete or documented gap | |
| P0-035 | Tenant | Admin cannot mutate foreign tenant (post-fix) | UPDATE rejected | |
| P0-036 | Agent | Agent sees only assigned labs | Scoped SELECT | |
| P0-037 | Lab | Lab sees only own orders | Scoped SELECT | |
| P0-038 | Ops | Operations Command Center loads | No fatal error | |
| P0-039 | Build | `npm run build` | Exit 0 | |
| P0-040 | Session | Logout clears predator store context | No stale tenant in Predator | |

---

## P1 — High Priority (35 cases)

| ID | Area | Test case | Expected result | Pass/Fail |
|----|------|-----------|-----------------|-----------|
| P1-001 | Qual | Qualification Analytics read-only — no approve button | View only | |
| P1-002 | Qual | Multiple qual rows same lab — last wins in RF | Consistent count | |
| P1-003 | Qual | Pipeline `won` counts as qualified | Included in qualifiedCount | |
| P1-004 | Qual | Pipeline `lost` excluded from qualified | Not in qualifiedCount | |
| P1-005 | Contract | Contract renewal CRITICAL expiry | Pilot FAIL on expiry_risk | |
| P1-006 | Contract | Non-terminated contract count | Matches Supabase count | |
| P1-007 | Contract | Contract date validation | Invalid dates → Predator FAIL | |
| P1-008 | Catalog | Catalog assigned without mirror | Pilot catalog WARN | |
| P1-009 | Inventory | Zero stock — Ready to order false | RF gate blocked | |
| P1-010 | Inventory | Distributor-wide stock enables all labs | Documented behavior | |
| P1-011 | Order | Order INSERT wrong tenant | RLS rejection | |
| P1-012 | Order | Order status partial fulfill | fulfilledLabCount rules | |
| P1-013 | Collection | AR outstanding sum | Matches RF `arOutstanding` | |
| P1-014 | Payment | Payment INSERT duplicate | Handled or second row allowed per rules | |
| P1-015 | Payment | Payment UPDATE attempt | RLS rejection (no policy) | |
| P1-016 | RF | Portfolio Orders vs stage Ordered semantics | Documented mismatch acknowledged | |
| P1-017 | RF | Paid column = lab count | Not currency | |
| P1-018 | RF | Payments tile = currency | Matches payments sum | |
| P1-019 | RF | pathComplete requires payments > 0 | Fails if AR only | |
| P1-020 | RF | Guntur focus distributor default | Correct tenant selected | |
| P1-021 | Pilot | Catalog mirror SYNC_FAILED | Gate FAIL | |
| P1-022 | Pilot | qualification_alignment WARN | active > qualified | |
| P1-023 | Pilot | Collections recovery % | Same across distributors (known) | |
| P1-024 | Pilot | Operations gate portfolio-level | Identical on all rows | |
| P1-025 | Pilot | Score CONDITIONAL with FAIL gate | Documented quirk | |
| P1-026 | Predator | Qualification module without page visit | Snapshot WARN/FN risk | |
| P1-027 | Predator | Distributor OS on-demand validation | Run after page visit | |
| P1-028 | Predator | Primecare OS on-demand validation | Snapshot PASS/WARN | |
| P1-029 | Predator | Commission engine does not corrupt prod | Rollback or staging only | |
| P1-030 | Predator | Revenue Funnel validator integrity check | Aligns with RF page | |
| P1-031 | Exec | Executive Intelligence loads | Signals present | |
| P1-032 | Exec | Founder Financial Intelligence | Billing + contracts load | |
| P1-033 | Billing | Billing model configured | Pilot billing PASS | |
| P1-034 | PO | Purchase order admin write own tenant | CRUD works | |
| P1-035 | Evidence | Operational evidence upload | Storage + metadata row | |

---

## P2 — Medium Priority (25 cases)

| ID | Area | Test case | Expected result | Pass/Fail |
|----|------|-----------|-----------------|-----------|
| P2-001 | Nav | Menu permissions for admin vs executive | Correct subset | |
| P2-002 | Nav | PortalLayout icons render | No missing Lucide imports | |
| P2-003 | Qual | Founder review fields read-only legacy | No activation dependency | |
| P2-004 | Qual | Qualification score display | Score computed from pipeline | |
| P2-005 | Contract | Contract PDF / export if present | Downloads or N/A | |
| P2-006 | Contract | Terminated contract excluded from active count | Not in contractedCount | |
| P2-007 | Catalog | Product name field on inventory upsert | No invalid column error | |
| P2-008 | Inventory | Stock dashboard view | `v_stock_dashboard` rows | |
| P2-009 | Order | Order tracking drawer | Status timeline renders | |
| P2-010 | Order | Lab ordering page catalog | Products visible to lab | |
| P2-011 | Invoice | Invoice UI placeholder | No crash; clearly N/A | |
| P2-012 | Collection | Collections filters | Tenant/lab filter works | |
| P2-013 | Collection | Credit control visibility agent | Assigned labs only | |
| P2-014 | Payment | Payment history lab portal | Lab sees own payments | |
| P2-015 | RF | Null outstanding coerces to 0 | No NaN in UI | |
| P2-016 | RF | Empty distributor — zero counts | Graceful empty state | |
| P2-017 | RF | Deep link to Distributor OS qual tab | `presetDistributorOsLabsSubTab` works | |
| P2-018 | Pilot | QA gate predator fail count | Reflects last Predator run | |
| P2-019 | Pilot | Financial profitability AT_RISK | Gate FAIL | |
| P2-020 | Pilot | Gate breakdown UI first row | Shows distributor[0] checks | |
| P2-021 | Predator | Notifications foundation | PASS for configured tenant | |
| P2-022 | Predator | Agent visits module | Visit counts match | |
| P2-023 | Predator | Lab portal module | Lab-scoped PASS | |
| P2-024 | Predator | Admin dashboard snapshot | Executive summary renders | |
| P2-025 | Perf | Revenue Funnel load < 10s | Acceptable on staging data | |

---

## Test Execution Order

1. **P0-004, P0-005** — Confirm migrations (block all else if FAIL)
2. **P0-006 → P0-021** — Guntur E2E data path
3. **P0-022 → P0-030** — Metrics and Predator
4. **P1** — Semantic and edge cases
5. **P2** — UX and regression

---

## Sign-Off Requirements

| Gate | Minimum |
|------|---------|
| P0 pass rate | 100% (40/40) |
| P1 pass rate | ≥90% (32/35) |
| P2 pass rate | ≥80% (20/25) |
| Open P0 defects | 0 |
| RLS migrations | Confirmed applied in Supabase |

---

## Defect Logging Template

```
ID: DEF-###
Priority: P0|P1|P2
Test: P0-###
Area: 
Steps:
Expected:
Actual:
RLS error: Y/N
Screenshot/log:
```
