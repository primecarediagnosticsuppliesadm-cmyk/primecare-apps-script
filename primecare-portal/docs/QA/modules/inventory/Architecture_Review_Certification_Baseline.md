# Inventory Module Certification — Architecture Review (Finalized)

**Gate:** Architecture documentation only — no implementation  
**Status:** Founder-reviewed baseline (2026-07-11)  
**Methodology:** People Operations · Collections / Credit & Risk · HQ Orders  

**Do not change (out of scope for Sprint 1 UX):** schema, APIs, RPCs, inventory ledger semantics, stock calculations, ORDER_OUT, PURCHASE_IN, opening stock write path, reorder engine, permissions, RLS, business rules.

Canonical taxonomy: [16_Certification_Framework.md](../../../PrimeCare_System_Blueprint/16_Certification_Framework.md)  
Domain rules: [11_Inventory_Rules.md](../../../PrimeCare_System_Blueprint/11_Inventory_Rules.md)

---

## 1. Executive Summary

Inventory is the **operational stock source of truth** (`inventory.current_stock` + `inventory_ledger`). Domain integrity for Year-1 pilot is sound: bounded reads, ORDER_OUT on fulfill, PURCHASE_IN on PO receive, opening stock on catalog create, negative-stock checks, valuation KPI path.

Product UX is **not certified**. Observation and action are split across Stock (read hub), Purchase (receive / reorder / PO admin), and Master Catalog (opening stock + thresholds).

### Tier definitions (module certification)

| Tier | Meaning | Inventory today |
|------|---------|-----------------|
| **Bronze** | **Domain Integrity** — SoT, ledger rules, automated integrity verifies | **Met** |
| **Silver** | **Operational Workspace** — primary actions clear, Start Here suggests work, context preserved, cognitive load managed | **Not met** |
| **Gold** | **Certified UX + Verification + Signed Manual UAT** — Silver + High UX defects closed + QA module pack + signed UAT | **Not met** |

| Lens | Verdict |
|------|---------|
| Domain / ledger integrity (Bronze) | **GO** |
| Operational workspace (Silver) | **NO-GO** |
| Certified UX (Gold) | **NO-GO** |
| Ready to start Sprint 1A (UX-only) | **YES** |
| Overall baseline | **CONDITIONAL GO** for HQ inventory ops continuation; **NO-GO** for UX freeze |

**Primary UX blockers for Silver:** INV-CERT-001 (Purchase ops cognitive load), INV-CERT-002 (no action-oriented Start Here), INV-CERT-003 (Stock lacks receive/opening handoffs), INV-CERT-004 (context continuity).  
**Verification / Gold gate:** INV-CERT-005.  
**Not Sprint 1 blockers:** INV-CERT-012 (recommendation explainability), INV-CERT-011 (GAP-001 architecture), engineering file split (RC2).

---

## 2. Feature Inventory

### Surfaces & roles

| Surface | Entry | Roles |
|---------|-------|-------|
| Inventory (Stock / Movements / Health) | `inventory` / `stock` | admin, executive |
| Purchase / Reorder | `purchase` | admin, executive |
| Master Catalog | `masterCatalog` | admin, executive |
| Reorder Forecast (standalone) | `reorder` (not sidebar) | admin, executive |

**Denied:** read_only_auditor, distributor roles for inventory / catalog / purchase / reorder.

### Read actions

Stock levels, health badges, Critical/Reorder KPIs, tenant filter, search, value analytics, ledger browse, health/velocity/slow-dead, reorder forecast, PO list/history/suppliers, catalog product + thresholds.

### Write actions

| Capability | API | UI |
|------------|-----|-----|
| Create SKU + seed inventory + optional opening | `createHqProductWrite` | Master Catalog |
| Edit price / min / reorder qty | `updateHqProductWrite` | Master Catalog |
| Activate / deactivate product | `setHqProductActiveWrite` | Master Catalog |
| Create / update / cancel PO | PO write APIs | Purchase |
| Receive stock → PURCHASE_IN | `receivePurchaseOrderWrite` | Purchase → Receive |
| Bulk draft POs from reorder | create PO path | Purchase |
| ORDER_OUT on fulfill | deduction / RPC | **Orders only** |

### Bulk / search / export

| Feature | Present? |
|---------|----------|
| Multi-SKU adjust / transfer | No |
| Export CSV | No |
| Search stock / filter POs | Yes |
| Freeze (procurement/catalog writes) | Yes; inventory reads remain |

### Dependencies

Orders fulfill (ORDER_OUT), Purchase receive (PURCHASE_IN), Master Catalog seed (GAP-001), lab no-backorder, valuation cost fallback.

### Business rules (SoT — unchanged by UX)

`current_stock >= 0`; no backorder; fulfilled → ORDER_OUT; receive → PURCHASE_IN; flat quantity model — **no FIFO/LIFO**.

---

## 3. Functional Parity Baseline

Future UX sprints **must preserve** every capability below (identical write semantics). Nothing may disappear without an explicit parity waiver.

| ID | Feature | Surface | Preserve |
|----|---------|---------|----------|
| F01 | Stock list + KPIs + search/tenant filter | Stock | Yes |
| F02 | Value analytics | Stock | Yes |
| F03 | Movements ledger browse | Movements | Yes |
| F04 | Health / velocity / slow-dead | Health | Yes |
| F05 | Reorder forecast data | Purchase / Reorder | Yes |
| F06 | Create / edit / cancel PO | Purchase | Yes |
| F07 | Receive stock (PURCHASE_IN) | Purchase Receive | Yes |
| F08 | Forecast → Create PO handoff | Purchase | Yes |
| F09 | Smart / bulk draft reorder | Purchase | Yes |
| F10 | Suppliers / PO history | Purchase | Yes |
| F11 | Create product + opening stock | Master Catalog | Yes |
| F12 | Edit min/reorder/pricing | Master Catalog | Yes |
| F13 | Soft delete / activate product | Master Catalog | Yes |
| F14 | ORDER_OUT via fulfill | Orders | Yes |
| F15 | Procurement / catalog freeze banners | Purchase / Catalog | Yes |
| F16 | Tenant / distributor scoping on stock | Stock | Yes |
| F17 | Bounded ledger / stock reads | API | Yes |

Adding Adjust/Transfer is **new capability**, not a Sprint 1 requirement (requires blueprint + API approval — out of Sprint 1 UX-only).

---

## 4. Workspace Review

Inventory already spans **multiple logical jobs**. Do not redesign; identify boundaries only.

| Logical workspace | Today | Primary question |
|-------------------|-------|------------------|
| Inventory overview | Stock tab | What do we have, and what’s critical? |
| Stock ledger | Movements tab | What changed stock, and why? |
| Inventory health | Health tab | What’s slow, dead, or at risk? |
| Receiving | Purchase Receive | What PO stock can I put away now? |
| Reorder | Purchase forecast tabs | What should we buy? |
| Purchase administration | Purchase PO list / suppliers | What POs exist? |
| Catalog master | Master Catalog | What products exist; opening/min/reorder? |
| Fulfillment deduction | Orders | Inventory effect — not Inventory UI |

**Sprint 1C direction:** visual workspace shells and cognitive separation of Receiving vs Reordering vs Purchase Administration — **not** engineering file decomposition (RC2).

---

## 5. Page-by-Page Evaluation (summary)

| Surface | Single purpose? | Primary action obvious? | Page budget | Operational? |
|---------|-----------------|-------------------------|-------------|--------------|
| Stock tab | Partial | No (no Receive/Opening CTA) | Borderline | Observational |
| Movements | Yes (audit) | Browse OK | OK | Audit-only |
| Health | Yes (risk) | No ops CTA | Secondary overload | Analytical |
| Purchase | **No** — Receiving + Reorder + Admin | Receive buried | Exceeded (cognitive) | Yes for procure→receive |
| Master Catalog | Product + seed | Clear for catalog | OK | Catalog ops |
| Reorder Forecast page | Forecast read | Low discoverability | Duplicate of Purchase | Weak |

Full 10-question detail remains as in the pre-finalization review; Founder decisions refine defects and Sprint 1B below — they do not reopen domain SoT.

---

## 6. Certification Defect Registry

Classify every defect using the **standard certification taxonomy** (§8 / Blueprint 16).

| ID | Category | Severity | Defect | Business impact | Constitution | Recommended UX direction | Sprint |
|----|----------|----------|--------|-----------------|-------------|--------------------------|--------|
| **INV-CERT-001** | Page Budget / Architecture (UX) | High | **Purchase Operations** combines Receiving, Reordering, and Purchase Administration into one operational workspace, creating cognitive load | Ops delay; wrong workflow chosen; support burden | Single purpose / page budget (user experience) | Visual workspace framing: Receiving vs Reorder vs Purchase Admin — **no API/schema change**. Engineering LOC decomposition is **RC2**, not a Sprint 1 certification blocker | 1C |
| **INV-CERT-002** | Discoverability | High | Inventory first viewport has no **action-oriented** Start Here | Warehouse/ops cannot start work in 5s | Discoverability / operational focus | Start Here must suggest work (see Sprint 1B), not only statistics | 1B |
| **INV-CERT-003** | Discoverability / Functional Parity (UX) | High | Stock page lacks clear Receive / Opening handoffs (GAP-001 UX) | Users hunt Purchase/Catalog | Operational completeness (UX) | Prominent handoffs to Purchase Receive / Catalog create — **do not invent Adjust API in Sprint 1** | 1B |
| **INV-CERT-004** | Context | High | Weak context + return path Stock ↔ Purchase ↔ Catalog | Lost SKU/PO focus mid-workflow | Context / continuity | Context strip + Back to Inventory / Back to Purchase (Orders/Collections 1B pattern) | 1B |
| **INV-CERT-005** | Verification / Manual UAT | Medium | No `docs/QA/modules/inventory/` pack beyond this baseline + unsigned UAT | Cannot close Gold | Verification / release gates | Module QA pack + signed UAT | Closure |
| **INV-CERT-006** | Page Budget | Medium | Health + value analytics compete with ops on first viewport | Cognitive load | Page budget | Collapse analytics; promote action queue | 1C |
| **INV-CERT-007** | Explainability / Trust | Medium | “Adjustment” ledger label with no adjust capability | Trust / support confusion | Explainability | Clarify display mapping; defer Adjust to post-pilot blueprint | Closure / RC2 |
| **INV-CERT-008** | Discoverability | Medium | Reorder Forecast page duplicates Purchase tabs; not in sidebar | Navigation inconsistency | Navigation | Prefer one entry (Purchase) or promote with clear purpose | RC2 |
| **INV-CERT-009** | Functional Parity | Low | No export / bulk put-away | Throughput | Completeness | RC2 | RC2 |
| **INV-CERT-010** | Architecture | Low | Orphan legacy stock surfaces | Dead surface risk | Hygiene | RC2 remove or quarantine | RC2 |
| **INV-CERT-011** | Architecture | Low | GAP-001 catalog seeds inventory | Long-term SoT purity | Architecture | **Deferred** — not Sprint 1 UI | Deferred |
| **INV-CERT-012** | Explainability | Medium | Inventory shows Critical / Reorder / Healthy **without explaining WHY** | Operators cannot trust or challenge recommendations | Trust & Explainability Constitution | Future: expose Current Stock, Minimum Stock, Reorder Level, Recent Consumption, Business Rule, Reason, Trust Level (High/Medium/Low). **No fake percentages.** **Not a Sprint 1 blocker** | Future |

**Not Year-1 certification defects:** Missing FIFO/LIFO, transfers, cycle count — intentionally absent.

---

## 7. Sprint Roadmap (UI/UX only)

Each sprint: one workflow, independently releasable, functional parity preserved, **no** schema/API/ledger/ORDER_OUT/PURCHASE_IN/opening-stock/reorder-engine/RLS/permission changes.

### Sprint 1A — Inventory-adjacent action feedback & trust

| | |
|--|--|
| **Touch** | Mutation feedback on existing UI writes (Master Catalog create/update; Purchase receive) |
| **Pattern** | Collections/Orders Sprint 1A: ActionErrorSummary, loading labels, busy/aria, success toast, preserve form on failure |
| **Does not** | Change receive/ledger/ORDER_OUT semantics; no Adjust API |
| **Addresses** | Trust slice; prepares INV-CERT-007 messaging |

### Sprint 1B — Action-oriented Start Here + context continuity

| | |
|--|--|
| **Touch** | **Action-oriented Start Here** on Inventory overview — must suggest operational work, **not** statistics-only |
| **Example actions** | Receive Purchase Order · Create Purchase Order · Review Critical Stock · Investigate Stock Risk |
| **Also** | Context strip; return paths Stock ↔ Purchase ↔ Catalog |
| **Does not** | Split Purchase state machine; invent Adjust/Transfer APIs |
| **Closes** | INV-CERT-002, INV-CERT-003 (handoffs), INV-CERT-004 |

### Sprint 1C — Workspace simplification (visual / cognitive)

| | |
|--|--|
| **Touch** | Presentational shells: Overview vs Ledger vs Health; **cognitive separation** of Receiving vs Reordering vs Purchase Administration; collapse analytics |
| **Pattern** | Orders Sprint 1C / Collections shells |
| **Does not** | Engineering file decomposition of PurchaseOrdersPage (that is **RC2**); no business-rule redesign |
| **Closes** | INV-CERT-001 (cognitive load), INV-CERT-006 (partial) |

### Certification Closure

| | |
|--|--|
| **Touch** | Remaining High UX blockers; inventory QA module pack; signed Manual UAT; Adjustment label clarity |
| **Does not** | GAP-001 schema split; Adjust/Transfer APIs; FIFO; INV-CERT-012 full explainability (may ship later) |
| **Exit** | Silver → **Gold** if High defects closed + verification + signed UAT |

### RC2 / Future (deferred)

| Item | Note |
|------|------|
| PurchaseOrdersPage engineering decomposition | LOC/file split — **not** Sprint 1 cert blocker |
| INV-CERT-012 recommendation explainability | Trust & Explainability — documented for future |
| GAP-001 catalog/inventory split | Blueprint-first architecture |
| Export, bulk receive, Adjust/Transfer | New capability / blueprint |

---

## 8. Standard Certification Taxonomy

**Every future module certification review must classify defects under:**

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

Module tier meanings (reusable):

| Tier | Definition |
|------|------------|
| **Bronze** | Domain Integrity |
| **Silver** | Operational Workspace |
| **Gold** | Certified UX + Verification + Signed Manual UAT |

Living index: Blueprint [16_Certification_Framework.md](../../../PrimeCare_System_Blueprint/16_Certification_Framework.md).

---

## 9. Verification Strategy

### Current (keep)

| Script | Purpose |
|--------|---------|
| `verify-inventory-dashboard-kpi.mjs` | Valuation / economics |
| `verify-inventory-reconciliation.mjs` | No negative stock |
| `verify-procurement-inventory-flow.mjs` | Receive → stock → ledger |
| `verify-orders-admin-flow.mjs` | ORDER_OUT on fulfill |
| Freeze / no-finance-mutation guards | Boundary |
| `npm run build` | Compile |

### Recommended UX gates (per sprint)

| Script | When |
|--------|------|
| `verify-inventory-action-feedback.mjs` | Sprint 1A |
| `verify-inventory-navigation-context.mjs` | Sprint 1B (action Start Here + return paths) |
| `verify-inventory-workspace-simplification.mjs` | Sprint 1C |

INV-CERT-012 (explainability) gets its own verify script **when that feature is implemented** — not required for Sprint 1.

---

## 10. Manual UAT Plan (baseline)

**P0 — Admin / Executive**

| # | Scenario | Expected |
|---|----------|----------|
| I1 | Open Inventory | Stock loads; Critical/Reorder visible |
| I2 | Movements tab | Ledger rows with movement types |
| I3 | Health tab | Urgency / valuation load |
| I4 | Purchase → Receive eligible PO | Stock ↑; PURCHASE_IN appears |
| I5 | Forecast → Create PO | PO created; stock unchanged until receive |
| I6 | Master Catalog create with opening stock | Inventory row + opening/`IN` movement |
| I7 | Edit min/reorder only | Thresholds change; stock unchanged |
| I8 | Freeze procurement | Receive blocked; Stock reads OK |
| I9 | After Orders fulfill | ORDER_OUT visible in Movements |

**After Sprint 1B (add):**

| # | Scenario | Expected |
|---|----------|----------|
| I10 | Start Here shows **actions** (Receive PO / Create PO / Review Critical / Investigate Risk) | Not stats-only |
| I11 | Follow Start Here → Purchase/Catalog | Context preserved; Back to Inventory works |

**P1 — Regression:** inventory KPI + reconciliation + procurement flow + orders fulfill ledger + auditor cannot open Inventory.

---

## 11. Certification Recommendation

| Lens | Result |
|------|--------|
| Bronze (Domain Integrity) | **GO** |
| Silver (Operational Workspace) | **NO-GO** — INV-CERT-001–004 |
| Gold (Certified UX + Verify + Signed UAT) | **NO-GO** |
| Start Sprint 1A | **ALLOWED** (UX-only, parity-preserving) |

**Accept this finalized baseline before Sprint 1A.** Do not change ledger, stock math, receive, ORDER_OUT, opening stock, reorder engine, RLS, or permissions in Sprint 1.

---

**STOP.** No implementation. No code changes.
