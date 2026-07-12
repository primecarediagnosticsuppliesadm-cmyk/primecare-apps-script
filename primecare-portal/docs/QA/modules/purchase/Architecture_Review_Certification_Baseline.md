# Purchase & Reorder Operations — Architecture Review (Certification Baseline)

**Gate:** Architecture documentation only — **no implementation**  
**Status:** Founder-reviewed baseline (2026-07-12)  
**Methodology:** People Operations · Collections · HQ Orders · Inventory  

**Do not change (out of scope for Sprint 1 UX):** schema, APIs, RPCs, Purchase Orders write semantics, inventory ledger, ORDER_OUT, PURCHASE_IN, reorder calculation engines, supplier master schema, receiving workflow rules, financial posting, permissions, RLS, business rules.

**Authorization note:** Inventory Closure deferred starting Purchase certification *from* Inventory Closure alone. This baseline is the **Founder-authorized separate Purchase module certification** track — Inventory remains its own freeze track.

Canonical taxonomy: [16_Certification_Framework.md](../../../PrimeCare_System_Blueprint/16_Certification_Framework.md)  
Domain adjacency / Purchase cert roadmap: [11_Inventory_Rules.md](../../../PrimeCare_System_Blueprint/11_Inventory_Rules.md)  
Inventory framing (INV-CERT-001 groups already shipped): [Architecture_Review_Certification_Baseline.md](../inventory/Architecture_Review_Certification_Baseline.md)

---

## Blueprint files read

| Path | Use |
|------|-----|
| `docs/PrimeCare_System_Blueprint/README.md` | Index |
| `16_Certification_Framework.md` | Taxonomy, Bronze/Silver/Gold |
| `11_Inventory_Rules.md` | PURCHASE_IN, receive, freeze, Purchase cert deferred note |
| `04_role_access_matrix.md` / `rolePermissionMatrix.js` | Admin/Executive only |
| `13_Verification_Matrix.md` | Procurement verifies |
| `14_Release_Gates.md` | Completion gates |
| `15_Do_Not_Break_Rules.md` | Inventory / AR / finance boundaries |
| `docs/QA/Admin_Final_Certification.md` | CERT-003, CERT-010 |
| Inventory module QA pack | Methodology mirror |

## Code / schema verified (read-only)

| Artifact | Finding |
|----------|---------|
| `src/pages/PurchaseOrdersPage.jsx` (~2.2k LOC) | Single operational workspace; 7 tabs; 3 visual groups |
| `src/pages/ReorderForecastPage.jsx` | Standalone forecast; not in sidebar |
| `src/config/menuConfig.js` | Label **Purchase / Reorder**, key `purchase` |
| `src/api/primecareSupabaseApi.js` | create / update / cancel / receive PO writes; bounded PO reads; `getReorderForecastRead`; health for triggers |
| `hqReleasePolicy.js` | `isHqProcurementWriteBlocked` |
| `supabase/sql/purchase_orders_migration.sql` | PO + items model |
| Inventory Sprint 1A wiring on **Receive only** | `ActionErrorSummary` + `mapInventoryMutationError` |
| Verify scripts | `verify-procurement-inventory-flow.mjs`, `verify-rc1-procurement-lifecycle.mjs`, inventory cert scripts that touch Purchase groups |

---

## Impact analysis (architecture review only)

| Dimension | Assessment |
|-----------|------------|
| **Modules affected** | Purchase / Reorder (primary); Inventory (handoff / PURCHASE_IN); Master Catalog (product picker); Orders (ORDER_OUT adjacency only) |
| **Tables affected** | **None** by UX sprints — `purchase_orders`, `purchase_order_items`, `inventory`, `inventory_ledger` remain SoT |
| **APIs affected** | **None** by UX sprints — preserve all write/read contracts |
| **Roles affected** | Admin, Executive (operators); Auditor / distributor unauthorized |
| **Business rules affected** | **None** — document defects only |
| **RLS / security** | No change |
| **Performance** | No change; bounded PO reads already required |
| **Verification** | Keep integrity scripts; add UX gates per sprint |
| **Manual UAT** | Role-scoped checklist below |
| **Implementation gate** | Application code **BLOCKED** until Sprint 1A kickoff; this baseline is **Founder-finalized** — Sprint 1A UX-only is **ALLOWED** |

---

## 1. Executive Summary

**Inventory** answers: *What stock do we have?*  
**Purchase** answers: *What stock do we need to buy — and how do we get it in?*

Purchase is already a real operational module: create/edit/cancel POs, receive → **PURCHASE_IN**, forecast/reorder queues, history search/filters, procurement freeze. Domain integrity for Year-1 is **Bronze-ready**. Product UX is **not certified**: mutation trust is incomplete outside Receive; no **action-oriented** Start Here; weak buy→receive context; Suppliers is a dead shell; three overlapping “what to buy” queues confuse first-time buyers.

Purchase Operations currently **combines Replenishment, Receiving, and Purchase Administration** into one operational workspace. That is an **operational complexity** issue for operators — **not** an engineering-structure defect. Visual groups already exist; **engineering file decomposition remains RC2** and is **not a Sprint 1 blocker** (PUR-CERT-001).

### Module certification tiers

| Tier | Definition | Purchase today |
|------|------------|----------------|
| **Bronze** | **Domain Integrity** | **Met** — PO SoT, receive → stock + PURCHASE_IN, lifecycle gates, freeze, integrity verifies |
| **Silver** | **Operational Workspace** | **Not met** — needs action-oriented Start Here, trust feedback on all writes, context continuity, honest surfaces, queue clarity |
| **Gold** | **Certified UX + Verification + Signed Browser UAT** | **Not met** — Silver + High Sprint defects closed + QA pack + signed browser UAT |

| Lens | Verdict |
|------|---------|
| Bronze — Domain Integrity | **GO** |
| Silver — Operational Workspace | **NO-GO** |
| Gold — Certified UX + Verification + Signed Browser UAT | **NO-GO** |
| Start Sprint 1A (UX-only) | **ALLOWED** (Founder-finalized baseline) |
| Overall | **CONDITIONAL GO** for HQ procurement ops continuation; **NO-GO** for UX freeze |

**Primary Silver blockers (Sprint 1):** PUR-CERT-002 (no action-oriented Start Here), PUR-CERT-003 (write-action trust incomplete), PUR-CERT-004 (workflow context), PUR-CERT-007 (Suppliers dead surface), PUR-CERT-009 (overlapping replenishment queues).  
**Gold gates:** PUR-CERT-005 (QA pack + signed browser UAT), PUR-CERT-012 (UX verifies).  
**Not Sprint 1 blockers / not Gold blockers:** PUR-CERT-001 (operational complexity documented; engineering RC2), PUR-CERT-010 / **PUR-CERT-015** (Trust & Explainability Constitution recommendation cards), approvals, GAP-013 supplier master, exports, multi-line PO.

---

## 2. Feature Inventory

### Surfaces & roles

| Surface | Entry | Roles |
|---------|-------|-------|
| **Purchase / Reorder** (primary) | Menu `purchase` · aliases `purchase-orders` / `procurement` / `suppliers` | admin, executive |
| **Reorder Forecast** (secondary) | Route `reorder` / `reorder-forecast` — **not** in sidebar | admin, executive |
| Inventory Start Here handoffs | `inventory` → Purchase tabs | admin, executive |
| Master Catalog | Product picker dependency | admin, executive |

**Denied:** read_only_auditor, distributor (and other non-admin/executive matrices).

### Logical “pages” (tabs inside `PurchaseOrdersPage`)

| ID | Label | Group | Purpose (intended) |
|----|-------|-------|--------------------|
| `triggers` | Forecast Suggestions | Replenishment | Velocity / stockout urgency (Inventory Health rules) |
| `reorder` | Reorder Candidates | Replenishment | Below reorder / min-stock candidates (`v_reorder_candidates`) |
| `smart` | Smart Reorder | Replenishment | Suggested quantities (forecast or Apps Script) |
| `receive` | Receive Stock | Receiving | Put away against Ordered / Partially Received PO |
| `create` | Create PO | Administration | Manual draft/ordered PO |
| `history` | Purchase Orders | Administration | List, search, filter, edit, cancel, jump to receive |
| `suppliers` | Suppliers | Administration | Supplier activity (UI only — **data never loaded**) |

**Not present as pages:** dedicated Purchase Dashboard, Pending Receipts queue, Approvals inbox, Supplier Master, Export center.

| Named review surface | How it maps today |
|----------------------|-------------------|
| Purchase Dashboard | Header KPIs on PurchaseOrdersPage (Total / Open / Received / Value) — not a separate page |
| Purchase Queue | Split across Forecast / Reorder / Smart |
| Purchase Orders | `history` tab |
| Purchase Order Details | Inline on history + edit form (no detail route) |
| Receive Purchase | `receive` tab |
| Pending Receipts | Implicit: open POs in receive picker / history filter — **no dedicated queue** |
| Supplier View | `suppliers` tab (empty) |
| Reorder Suggestions | `triggers` + `reorder` + `smart` (+ orphan `ReorderForecastPage`) |
| Purchase History | `history` tab |
| Search / Filters / Status | History: `poSearch`, `poStatusFilter` |
| Approvals | **Absent** |

### Read actions

| Capability | Source |
|------------|--------|
| PO list + items (bounded) | `getPurchaseOrdersRead` |
| Reorder candidates / forecast | `getReorderForecastRead` (`v_reorder_candidates`) |
| Forecast Suggestions urgency | `getInventoryHealthRead` → velocity rules |
| Smart reorder | Forecast rows and/or legacy `getSmartReorder` |
| Catalog products for create | Catalog read path |
| Supplier dashboard | **None wired** — state cleared to `[]` / `null` |
| Header KPIs | Derived from loaded POs |

### Write actions

| Capability | API | UI |
|------------|-----|-----|
| Create PO (+ first line item) | `createPurchaseOrderWrite` | Create tab; Forecast/Reorder/Smart → Create |
| Bulk create Critical draft POs | Loop of `createPurchaseOrderWrite` | Forecast Suggestions |
| Update PO (pre-receive) | `updatePurchaseOrderWrite` | History (Draft/Ordered, received_qty = 0) |
| Cancel PO (pre-receive) | `cancelPurchaseOrderWrite` | History |
| Receive PO → stock + **PURCHASE_IN** | `receivePurchaseOrderWrite` | Receive Stock |
| Freeze block | `isHqProcurementWriteBlocked` | Banner + disabled writes |

### Search / filters / exports / bulk

| Feature | Present? |
|---------|----------|
| Search POs (id / product / supplier) | Yes — history |
| Status filter | Yes — history |
| Export CSV / print | **No** (RC2 / deferred) |
| Bulk draft Critical POs | Yes |
| Bulk receive / put-away | **No** |
| Multi-line PO | **No** (one product line per PO) |
| Approvals | **No** |

### Permissions

| Role | Purchase | Reorder route |
|------|----------|---------------|
| Admin / Executive | Full read + write (subject to freeze) | Allowed |
| Auditor / distributor / lab | Denied | Denied |

### Dependencies

| Dependency | Direction |
|------------|-----------|
| Master Catalog products | Create PO requires valid `product_id` |
| Inventory + ledger | Receive writes stock + PURCHASE_IN |
| Inventory Health | Forecast Suggestions urgency SoT |
| `v_reorder_candidates` | Reorder / Smart (min-stock path) |
| Orders fulfill | ORDER_OUT (not Purchase UI) |
| Procurement freeze flag | Blocks writes; reads OK |

### Business rules (SoT — unchanged by UX)

- Status path: Draft → Ordered → Partially Received → Received; Cancelled  
- Receive only when Ordered or Partially Received; qty ≤ remaining  
- Receive → inventory ↑ + ledger **PURCHASE_IN**  
- Update/cancel only Draft/Ordered with zero received qty  
- Flat quantity model — **no FIFO/LIFO**  
- Supplier is free-text (GAP-013 deferred) — **no “supplier blocked” engine**  
- PO cost is operational; **no GL financial posting** from Purchase in Year-1 pilot  

### Functional parity baseline (must preserve in all UX sprints)

| ID | Feature | Preserve |
|----|---------|----------|
| F01 | Forecast Suggestions (Health velocity) | Yes |
| F02 | Reorder Candidates | Yes |
| F03 | Smart Reorder | Yes |
| F04 | Create PO (Draft/Ordered) | Yes |
| F05 | Bulk Critical draft POs | Yes |
| F06 | Receive → PURCHASE_IN | Yes |
| F07 | History search / status filter | Yes |
| F08 | Edit / cancel pre-receive | Yes |
| F09 | Receive status gating | Yes |
| F10 | Procurement freeze banner + write block | Yes |
| F11 | Inventory return context / Back to Inventory | Yes |
| F12 | Visual workspace groups | Yes |
| F13 | Active step purpose + Next step chip | Yes |
| F14 | Bounded PO reads | Yes |

Adding Approvals, Supplier Master, multi-line PO, exports, or bulk receive is **new capability** — blueprint-first, not Sprint 1 UX-only.

---

## 3. Workspace Review

**Question:** Remain one workspace, or do logical workspaces already exist?

**Answer:** Keep **one menu entry** (`Purchase / Reorder`) for Year-1. Logical operational boundaries **already exist** as visual groups; they should be treated as certification workspaces for cognitive design — **not** as separate apps or engineering splits in Sprint 1.

| Logical workspace | Today | Primary question | Natural owner |
|-------------------|-------|------------------|---------------|
| **Purchase Operations (hub)** | Page header + KPIs + workflow guide | What needs attention in buying / receiving? | Shell |
| **Replenishment** | Forecast / Reorder / Smart | What should we buy? | Replenishment group |
| **Receiving** | Receive Stock (+ open POs) | What inbound stock can I put away? | Receiving group |
| **Purchase administration** | Create + History | What POs exist; create/edit/cancel? | Administration group |
| **Suppliers** | Empty tab | Who supplies us? | **Deferred** (GAP-013) — honesty issue until fixed or hidden |
| **Approvals** | Absent | What POs need approval? | **Absent** — not a Year-1 workspace unless Founder adds scope |
| **Reorder analytics (orphan)** | `ReorderForecastPage` | Forecast KPIs | Duplicate of Replenishment — RC2 consolidate |

**Do not redesign.** Sprint 1C may strengthen shells / Start Here / queue clarity within these boundaries. Engineering file decomposition of `PurchaseOrdersPage.jsx` remains **RC2**.

---

## 4. Page-by-Page Evaluation

For each surface: (1) single purpose (2) business question (3) primary action obvious (4) operational (5) context preserved (6) navigation consistent (7) explains attention (8) page budget (9) duplication (10) first-time procurement employee.

### Purchase Dashboard (header KPIs)

| # | Answer |
|---|--------|
| 1 | Aggregate PO counts/value — **not** a single ops purpose |
| 2 | How big is the PO book? |
| 3 | No — KPIs are observational |
| 4 | Weak |
| 5 | N/A |
| 6 | OK within page |
| 7 | Partially (Open POs) — no “do this next” |
| 8 | Borderline — competes with ops |
| 9 | Overlaps Open count with Receiving need |
| 10 | Sees numbers, not a job |

### Forecast Suggestions (`triggers`)

| # | Answer |
|---|--------|
| 1 | Review velocity-based buy candidates | Mostly yes |
| 2 | What will stock out soon? |
| 3 | Yes — Create Draft / Bulk Critical |
| 4 | Yes |
| 5 | Partial — candidate → Create carries selection; return to Inventory only if handoff |
| 6 | Group nav OK; three replenishment tabs still compete |
| 7 | Yes — urgency badges + reason text for velocity |
| 8 | OK for this tab; whole page still overloaded |
| 9 | Overlaps Reorder / Smart / Inventory Health |
| 10 | Understandable if they know “Forecast” |

### Reorder Candidates (`reorder`)

| # | Answer |
|---|--------|
| 1 | Confirm below-threshold SKUs | Yes |
| 2 | What’s below reorder/min? |
| 3 | Select → Create PO | Moderate |
| 4 | Yes |
| 5 | Partial |
| 6 | Same competition as above |
| 7 | Weak why (min-stock, little narrative) |
| 8 | OK locally |
| 9 | Duplicates Smart / Forecast intent |
| 10 | Confused which queue to trust |

### Smart Reorder (`smart`)

| # | Answer |
|---|--------|
| 1 | Suggested quantities | Intended yes |
| 2 | How much should we order? |
| 3 | Select → Create | Moderate |
| 4 | Yes |
| 5 | Partial |
| 6 | Same |
| 7 | Weak — Admin CERT-003: still largely min-stock path |
| 8 | OK locally |
| 9 | High overlap with Reorder Candidates |
| 10 | “Smart” without explanation feels magical |

### Create PO (`create`)

| # | Answer |
|---|--------|
| 1 | Create a purchase order | Yes |
| 2 | How do I buy this SKU? |
| 3 | Yes — Create Purchase Order |
| 4 | Yes |
| 5 | Selected candidate banner helps; weak after create → receive |
| 6 | Next chip to Receive helps |
| 7 | Form validation only |
| 8 | OK |
| 9 | Low |
| 10 | Clear form |

### Receive Stock (`receive`)

| # | Answer |
|---|--------|
| 1 | Put away inbound stock against PO | Yes |
| 2 | What can I receive now? |
| 3 | Yes — Receive Purchase Order |
| 4 | Yes — strongest operational tab |
| 5 | Partial — PO picker; Inventory Back link if return context |
| 6 | OK |
| 7 | Status gating helps; no “pending receipts” attention list |
| 8 | OK |
| 9 | Open POs also on History |
| 10 | Clear once PO selected; trust feedback present (1A) |

### Purchase Orders / History (`history`)

| # | Answer |
|---|--------|
| 1 | Track and administer POs | Yes |
| 2 | Where is this PO? |
| 3 | Mixed — Prefill Receive / Edit / Cancel compete |
| 4 | Yes |
| 5 | Search/filter preserved on refresh patterns uneven |
| 6 | OK |
| 7 | Status filter helps; no aging / waiting reason |
| 8 | Borderline dense |
| 9 | Overlaps Receive open-PO list |
| 10 | Usable with training |

### Suppliers (`suppliers`)

| # | Answer |
|---|--------|
| 1 | Claimed: supplier activity | **Fails** — empty |
| 2 | Who do we buy from? | Unanswered |
| 3 | No action |
| 4 | No |
| 5 | N/A |
| 6 | Nav implies real feature |
| 7 | No |
| 8 | Dead budget |
| 9 | KPI cards with no data |
| 10 | Broken trust — **High defect** |

### Reorder Forecast standalone page

| # | Answer |
|---|--------|
| 1 | Read-only forecast KPIs | Yes |
| 2 | What’s critical to reorder? |
| 3 | No create path |
| 4 | Weak |
| 5 | Isolated |
| 6 | **Inconsistent** — not in menu |
| 7 | Badges only |
| 8 | Duplicate of Purchase Replenishment |
| 9 | High |
| 10 | May never find it |

### Approvals / Pending Receipts (missing)

| Surface | Assessment |
|---------|------------|
| Approvals | Not a page — Draft→Ordered is creator discretion. Document as capability gap, not fake UI. |
| Pending Receipts | Not a page — operators infer from Open POs. Discoverability gap for warehouse. |

### Summary scorecard

| Surface | Single purpose | Primary action | Page budget | First-time OK? |
|---------|----------------|----------------|-------------|----------------|
| Dashboard KPIs | No | No | Borderline | Weak |
| Forecast | Mostly | Yes | OK | Moderate |
| Reorder | Yes | Moderate | OK | Confused vs Smart |
| Smart | Intended | Moderate | OK | Weak explain |
| Create | Yes | Yes | OK | Yes |
| Receive | Yes | Yes | OK | Yes |
| History | Yes | Mixed | Dense | With training |
| Suppliers | **Fail** | No | Dead | **No** |
| Standalone Forecast | Yes | No | Duplicate | Hard to find |

---

## 5. Founder Workflow Review

| Persona | What they need | What they get today | Gap |
|---------|----------------|---------------------|-----|
| **Founder** | Trust that buy→receive→stock is honest; no silent finance posts | Bronze integrity + receive feedback | Silver UX; empty Suppliers; overlapping queues |
| **Operations Manager** | “What needs attention today?” in &lt;5s | Header KPIs + 7 tabs | No **action-oriented** Start Here; Open ≠ Pending Receipts |
| **Procurement Manager** | Decide buy source + qty + create PO | Three queues + Create | Which queue? Smart vs Reorder unexplained; no approvals |
| **Warehouse** | Receive eligible POs quickly | Receive tab + History prefill | No Pending Receipts list; GRN optional clarity |
| **Finance** | Cost on PO; no accidental GL | Unit cost on create; no posting | OK for Year-1; don’t invent posting in UX sprints |
| **Auditor** | Trace PURCHASE_IN | Denied Purchase UI; ledger via other paths | Access model intentional; inventory Movements remains audit path |

---

## 6. Trust & Explainability Gaps

| Question | Can Purchase explain today? | Gap |
|----------|----------------------------|-----|
| Why is this PO urgent? | Partial on Forecast (days-to-stockout + Health rules). Weak on History open POs | No aging / priority on History; no Trust Level |
| Why is reorder recommended? | Partial — Forecast has reason string; Reorder/Smart mostly thresholds | PUR-CERT-006 / 010; Admin CERT-003 |
| Why is supplier blocked? | **No** — no block engine; free-text supplier | Do not invent; document absence |
| Why is receiving waiting? | Implicit (status not Ordered / remaining 0) | No Pending Receipts “waiting because…” copy |

**Constitution direction (PUR-CERT-015 — future; not Sprint 1; not Gold blocker):** recommendation cards expose Current Stock · Minimum Stock · Forecast · Supplier · Business Rule · Reason · Trust Level **High / Medium / Low** — **no percentages**. Aligns with PrimeCare Trust & Explainability Constitution ([16_Certification_Framework.md](../../../PrimeCare_System_Blueprint/16_Certification_Framework.md)).

---

## 7. Certification Defect Registry

**Every defect uses exactly one primary category** from the standard taxonomy ([16_Certification_Framework.md](../../../PrimeCare_System_Blueprint/16_Certification_Framework.md)): Architecture · Discoverability · Context · Explainability · Trust · Page Budget · Functional Parity · Verification · Manual UAT.

| ID | Category | Severity | Defect | Business impact | Constitution | Recommended UX direction | Sprint |
|----|----------|----------|--------|-----------------|-------------|--------------------------|--------|
| **PUR-CERT-001** | Architecture | High | Purchase Operations currently combines **Replenishment**, **Receiving**, and **Purchase Administration** into one operational workspace. The certification issue is **operational complexity for the user**, not engineering structure | Operators must choose the right job among peer surfaces; delay and wrong workflow risk | Workspace boundaries (user experience) | Keep one menu entry + existing visual groups; optional future cognitive framing. **Engineering decomposition remains RC2.** **Not a Sprint 1 blocker.** | Future / RC2 |
| **PUR-CERT-002** | Discoverability | High | No **action-oriented** Purchase Start Here | Ops cannot start work in 5s | Discoverability | Action-oriented Start Here only — see Sprint 1B | 1B |
| **PUR-CERT-003** | Trust | High | Mutation feedback incomplete: Receive has 1A pattern; Create / Update / Cancel / Bulk draft lack equivalent ActionErrorSummary / inflight / preserve-on-fail parity | Duplicate POs; unclear failures; distrust | Trust | Extend Inventory/Collections 1A pattern to all Purchase writes — **UI only** | 1A |
| **PUR-CERT-004** | Context | High | Weak continuity Forecast/Reorder → Create → Receive → History; SKU/PO focus drops across tabs | Rework; wrong PO received | Context | Context strip (SKU/PO/supplier/status); preserve filters; Back to Inventory already exists | 1B |
| **PUR-CERT-005** | Verification | Medium | No Purchase module QA pack beyond this baseline; unsigned browser UAT (Manual UAT secondary) | Cannot close Gold | Verification | Pack under `docs/QA/modules/purchase/` + signed browser UAT | Closure |
| **PUR-CERT-006** | Explainability | Medium | Reorder Candidates / Smart Reorder do not clearly explain recommendation basis (Admin CERT-003 / min-stock vs velocity) | Over/under ordering | Explainability | Honest labels + reason lines in Sprint 1C; full cards via PUR-CERT-015 | 1C / Future |
| **PUR-CERT-007** | Trust | High | Suppliers tab renders dashboard UI but **never loads data** | Fake feature; lost trust | Trust | Hide, stub with explicit “not available”, or wire read-only aggregation — **no supplier master schema in Sprint 1** | 1C / Closure |
| **PUR-CERT-008** | Discoverability | Medium | `ReorderForecastPage` duplicates Purchase replenishment; not in sidebar | Nav inconsistency | Discoverability | Prefer Purchase entry; quarantine or deep-link with purpose | RC2 |
| **PUR-CERT-009** | Page Budget | High | Three overlapping buy queues without a clear “use this when…” hierarchy | Cognitive load; conflicting urgency | Page Budget | Presentational hierarchy / guidance; do not remove queues without parity waiver | 1C |
| **PUR-CERT-010** | Explainability | Medium | Cannot explain PO urgency / waiting receive / supplier blocked as a coherent narrative today | Operators cannot challenge system | Explainability | Covered by PUR-CERT-015 recommendation cards; **not Sprint 1** | Future |
| **PUR-CERT-011** | Functional Parity | Low | No PO approval workflow | Governance gap for some orgs | Functional Parity | Deferred unless Founder scopes Approvals as new capability | Deferred |
| **PUR-CERT-012** | Verification | Medium | No Purchase-specific UX verify scripts (only integrity + inventory-adjacent) | Regressions to Start Here / feedback / groups | Verification | Add `verify-purchase-action-feedback`, `verify-purchase-navigation-context`, `verify-purchase-workspace-simplification` | Per sprint |
| **PUR-CERT-013** | Discoverability | Medium | No dedicated Pending Receipts attention list | Warehouse hunts History/Receive | Discoverability | Action-oriented Start Here + receivable list presentation — **no new API** if derived from existing POs | 1B |
| **PUR-CERT-014** | Functional Parity | Low | No export / bulk receive / multi-line PO | Throughput | Functional Parity | RC2 / blueprint | RC2 |
| **PUR-CERT-015** | Explainability | Medium | Purchase recommends Reorder / Critical / Supplier / Receive **without explaining WHY**. Future recommendation cards should expose Current Stock · Minimum Stock · Forecast · Supplier · Business Rule · Reason · Trust Level (High / Medium / Low). **No percentages.** | Operators cannot trust or challenge recommendations | Trust & Explainability Constitution | Future cards; align with Inventory INV-CERT-012 pattern. **Not Sprint 1. Not a Gold blocker.** | Future |

**Not Year-1 certification defects:** FIFO/LIFO, GL posting from PO, Adjust/Transfer, inventing supplier block rules.

**Already mitigated (do not re-open as High):** INV-CERT-001 visual groups; Receive ActionErrorSummary; Inventory ↔ Purchase return context; GAP-009/010/011 lifecycle; GAP-016 Forecast↔Health alignment for triggers.

---

## 8. Standard Certification Taxonomy

| Category | Use when the defect is about… |
|----------|-------------------------------|
| **Architecture** | Workspace boundaries, SoT ownership, deferred structural debt (not LOC size alone) |
| **Discoverability** | Can the operator find the next correct action in seconds? |
| **Context** | Is orientation preserved across filters, selection, and cross-page workflows? |
| **Explainability** | Can the operator see **why** the system recommends or labels something? |
| **Trust** | Mutation feedback, honesty of labels, no fake confidence metrics |
| **Page Budget** | Cognitive load: too many jobs, competing primary surfaces, analytics over ops |
| **Functional Parity** | Capability that must not be removed by UX work |
| **Verification** | Missing or insufficient automated verify gates |
| **Manual UAT** | Missing role-scoped signed checklist |

Living index: Blueprint [16_Certification_Framework.md](../../../PrimeCare_System_Blueprint/16_Certification_Framework.md).

---

## 9. Sprint Roadmap (UI/UX only)

Each sprint: one workflow, independently releasable, functional parity preserved, **no** schema/API/RPC/ledger/ORDER_OUT/PURCHASE_IN/reorder-engine/supplier-master/RLS/permission/business-rule changes.

### Sprint 1A — Action feedback & trust

| | |
|--|--|
| **Touch** | Create PO, Bulk Critical drafts, Update PO, Cancel PO, Receive — ActionErrorSummary / busy labels / inflight / toast / preserve-on-fail — **shipped** |
| **Pattern** | Inventory / Collections / Orders Sprint 1A |
| **Does not** | Change write eligibility, PURCHASE_IN, quantities, freeze semantics |
| **Closes** | PUR-CERT-003 (primary) |
| **Verify** | `verify-purchase-action-feedback.mjs` |

### Sprint 1B — Context & workflow continuity

| | |
|--|--|
| **Touch** | **Action-oriented Start Here** (not statistics-only cards) + context strip (SKU/PO) + receivable attention + preserve tab/filter + Create→Receive continuity |
| **Example actions** | **Create Purchase Orders** · **Receive Pending Deliveries** · **Review Critical Reorders** · **Investigate Blocked Purchase Orders** |
| **Does not** | Stats-only Start Here; split page into multiple routes; invent Approvals; address PUR-CERT-001 / 015 |
| **Closes** | PUR-CERT-002, PUR-CERT-004, PUR-CERT-013 (partial) |
| **Verify** | `verify-purchase-navigation-context.mjs` |

### Sprint 1C — Workspace simplification

| | |
|--|--|
| **Touch** | Cognitive hierarchy within existing groups; queue guidance (“use Forecast when… / Reorder when…”); collapse competing KPIs; **Suppliers honesty** (hide or explicit unavailable) |
| **Pattern** | Orders / Collections / Inventory 1C shells |
| **Does not** | Engineering LOC file split (**RC2** — PUR-CERT-001); remove F01–F03 without waiver; PUR-CERT-015 cards |
| **Closes** | PUR-CERT-007, PUR-CERT-009; PUR-CERT-006 partial |
| **Verify** | `verify-purchase-workspace-simplification.mjs` |

### Certification Closure

| | |
|--|--|
| **Touch** | Remaining High Sprint UX defects; complete `docs/QA/modules/purchase/` evidence; **signed browser Manual UAT** |
| **Does not** | GAP-013 supplier master; Approvals; PUR-CERT-001 engineering split; PUR-CERT-010 / **015** full explainability cards |
| **Exit** | Silver → **Gold** if High Sprint defects closed + Verification + Signed Browser UAT |

### Browser UAT → Gold → Freeze

1. Execute Manual UAT Plan (signed browser UAT)  
2. Attach evidence index  
3. Founder Gold verdict  
4. **Freeze** Purchase UX except bugs/security — same discipline as Inventory  

### RC2 / Future (deferred)

| Item | Note |
|------|------|
| PUR-CERT-001 operational complexity / engineering decomposition | Documented; **not Sprint 1 blocker**; engineering split **RC2** |
| PUR-CERT-015 / 010 Trust & Explainability cards | Future; **not Gold blocker** |
| GAP-013 Supplier Master | Blueprint-first |
| PUR-CERT-011 Approvals | New capability |
| PUR-CERT-008 / 014 | Orphan forecast page; exports; bulk receive; multi-line |

---

## 10. Verification Strategy

### Current (keep)

| Script | Purpose |
|--------|---------|
| `verify-procurement-inventory-flow.mjs` | Receive → stock → PURCHASE_IN (+ `--mutate`) |
| `verify-rc1-procurement-lifecycle.mjs` | Cancel/update/receive gating wiring |
| `verify-inventory-action-feedback.mjs` | Receive feedback (Inventory-adjacent) |
| `verify-inventory-navigation-context.mjs` | Inventory return path |
| `verify-inventory-certification-closure.mjs` | Purchase visual groups present |
| `verify-bounded-reads.mjs` | Bounded PO reads |
| `npm run build` | Compile |

### Recommended additional scripts

| Script | When | Asserts |
|--------|------|---------|
| `verify-purchase-action-feedback.mjs` | Sprint 1A | Create/update/cancel/bulk use ActionErrorSummary / inflight / busy labels |
| `verify-purchase-navigation-context.mjs` | Sprint 1B | **Action-oriented** Start Here actions; context strip; receivable attention; tab continuity markers |
| `verify-purchase-workspace-simplification.mjs` | Sprint 1C | Groups + hierarchy copy; Suppliers not a fake populated dashboard |
| `verify-purchase-certification-closure.mjs` | Closure | Evidence paths + High Sprint defect markers closed |

Integrity scripts remain the **Bronze** (Domain Integrity) gate. UX scripts are **Silver / Gold** gates. PUR-CERT-015 explainability gets its own verify script **when implemented** — not required for Sprint 1 or Gold.

---

## 11. Manual UAT Plan (baseline)

**Roles:** Admin / Executive (operators). Auditor: confirm Purchase menu denied.

### P0 — Domain / ops

| # | Scenario | Expected |
|---|----------|----------|
| P1 | Open Purchase / Reorder | Page loads; groups Replenishment / Receiving / Administration visible |
| P2 | Forecast Suggestions | Critical/High/Medium from Health rules; reason visible |
| P3 | Create Draft PO from candidate | PO created; stock **unchanged** |
| P4 | Bulk Critical drafts (if Critical exists) | Drafts created or honest empty/blocked state |
| P5 | Edit Draft/Ordered (no receive) | Fields update |
| P6 | Cancel Draft/Ordered (no receive) | Status Cancelled; cannot receive |
| P7 | Receive Ordered PO | Stock ↑; Movements show **PURCHASE_IN**; status Partial/Received |
| P8 | Attempt receive on Draft/Cancelled/Received | Blocked with clear error |
| P9 | History search + status filter | List narrows correctly |
| P10 | Procurement freeze ON | Writes blocked; reads OK; banner shown |
| P11 | Inventory Start Here → Purchase → Back to Inventory | Return context works |

### P0 — UX certification (after sprints)

| # | Scenario | Expected |
|---|----------|----------|
| P12 | Purchase **action-oriented** Start Here | Create Purchase Orders · Receive Pending Deliveries · Review Critical Reorders · Investigate Blocked Purchase Orders — **not** stats-only |
| P13 | Create/Cancel failure | Inline ActionErrorSummary; form preserved |
| P14 | Context strip follows selected SKU/PO across Create/Receive | Orientation held |
| P15 | Suppliers | Not a fake empty dashboard (hidden or explicit unavailable) |
| P16 | Queue guidance | Operator can tell Forecast vs Reorder vs Smart purpose |

### P1 — Regression

Procurement inventory flow (`--mutate` in safe tenant) · RC1 lifecycle · Inventory reconciliation · Orders fulfill still ORDER_OUT · Auditor cannot open Purchase.

**Sign-off:** Founder + Ops/Procurement + Warehouse (receive) — signed **browser** Manual UAT for Gold.

---

## 12. Certification Recommendation

| Lens | Result |
|------|--------|
| **Bronze — Domain Integrity** | **GO** |
| **Silver — Operational Workspace** | **NO-GO** — PUR-CERT-002, 003, 004, 007, 009 |
| **Gold — Certified UX + Verification + Signed Browser UAT** | **NO-GO** |
| Start Sprint 1A | **ALLOWED** (Founder-finalized; UX-only, parity-preserving) |

### Bronze — Domain Integrity (met)

- Clear SoT: `purchase_orders` + receive → inventory + PURCHASE_IN  
- Status lifecycle gates  
- Automated integrity verifies available  
- Freeze boundary  

### Silver — Operational Workspace (not met)

- **Action-oriented** Start Here (not stats-only)  
- Primary actions obvious within &lt;5s  
- Context preserved across buy→receive  
- Queue clarity + honest surfaces (Suppliers)  

### Gold — Certified UX + Verification + Signed Browser UAT (not met)

- Silver complete  
- High Sprint UX defects closed (not PUR-CERT-001 / 015)  
- Purchase QA module pack + evidence  
- Signed browser Manual UAT  
- UX verify scripts green  

---

## Implementation gate

| Gate | Status |
|------|--------|
| Architecture review + Founder finalization | **YES** (this document) |
| Application code changes | **BLOCKED** until Sprint 1A kickoff |
| Schema / API / RLS / business rules | **BLOCKED** |
| Sprint 1A | **ALLOWED** (UX-only, parity-preserving) |

---

**STOP.** Architecture documentation only. No implementation. No code changes.
