# 26 — Agent Visit Evidence (Field Discovery)

**Canonical product and architecture source of truth for PrimeCare Agent Visit Evidence V1 (VE).**

Status: **VE-3 GREEN** (QA field UX certified). VE-2 write/read contract reused. Production **unchanged**. No merge to main.

Owner: this document. Not Commercial CRM schema. Not Agent Resources. Not `operational_evidence` photos. Not Orders / AR / Inventory.

ADRs: [decisions/ADR_VE_Visit_Evidence.md](./decisions/ADR_VE_Visit_Evidence.md) (ADR-VE-001 … ADR-VE-008).

---

## Purpose

PrimeCare does **not** yet know which economic engine will win (consumables, reagents, analyzer placement, private label, software, manufacturer/distributor economics, chains/hospitals, network economics, or combinations).

The software must **discover** the business model. It must not encode an unvalidated winner.

| Rigid | Flexible |
|-------|----------|
| Destination (labs, visits, finance SoT) | Winning customer segment |
| Evidence collection | Winning product category |
| Financial truth (O2C) | Winning economic engine |
| Security / tenant isolation | Mix of engines |
| Measurement later from canonical transactions | Field sampling mix (e.g. 8/8/4) |
| Certification gates | Wallet ₹ thresholds |

M12–M48 founder planning gates are **governance context only**. Do not implement personal wealth targets, ₹30L/month, or ₹1Cr liquidity in the Agent application.

---

## Three layers of truth

| Layer | Canonical | Holds | Does not hold |
|-------|-----------|--------|----------------|
| **1. Account identity / lifecycle** | `labs` | Identity, contact, locality, `PROSPECT` / `ACTIVE` / `INACTIVE`, `sourced_by_agent_id`, ownership, `ordering_mode` | Changing economic discovery |
| **2. Field evidence** | `agent_visits` + `agent_visit_discovery_lines` | What the customer told the Agent; estimates; size band; analyzers/reagents/consumables observed; terms; complaint; opportunity; confidence | PrimeCare books |
| **3. Financial / operational truth** | `orders`, `invoices`, allocations, `payments`, `ar_credit_control`, `inventory`, `inventory_ledger`, `purchase_orders`, certified fulfillment | Actual transactions after (and only after) they exist | Agent estimates |

Once transactions exist, Layer 3 **overrides** Layer 2 for financial analysis. Never create a second financial truth from Agent estimates (ADR-VE-006).

---

## Conflict resolutions (AMBER → GREEN)

### A. Snapshot vs history (ADR-VE-002)

| Object | Role | Mutability |
|--------|------|------------|
| `lab_qualifications` | **Current** qualification / pipeline snapshot (1:1 lab) | Overwrite in place |
| `lab_product_intelligence` | **Current** incumbent product/mix snapshot | Overwrite / replace lines |
| `agent_visits` + `agent_visit_discovery_lines` | **Historical** field evidence | Append visits; lines belong to one visit |

Do **not** convert qualifications or product intelligence into history tables.  
Do **not** require V1 dual-write from visit evidence into those snapshots.  
A “latest known state” projection is **out of V1** and needs a separate certification if product later requires it.

### B. Prospect Log Visit without operational activation (ADR-VE-004)

Production Add Prospect remains minimal and correct: identity + contact + phone + locality + `sourced_by_agent_id` + `PROSPECT`. No AR, order, lab user, self-service, or activation at capture.

**Certified path (narrow):** Agent → sourced Prospect **or** assigned Lab → **Log Visit**.

| PROSPECT may | PROSPECT must not |
|--------------|-------------------|
| Visit evidence | Orders / `create_lab_order` |
| Qualification / discovery fields on the visit | Collections, payments, AR, credit controls |
| Follow-up on the visit | Fulfillment, lab portal, operational “Record Payment” |

Do **not** solve this by broadening `filterLabsForUser` (operational assigned-lab filter). That filter **must keep excluding `PROSPECT`** so area-matching cannot treat a sourced prospect as an operational lab.

**Visit-only picker:** assigned operational labs **union** Agent-sourced `PROSPECT` rows (`partitionVisitEligibleAccounts`). Prospect cards: **Log Visit** only — no collections CTA, no credit actions. `filterLabsForUser` is **not** used for this picker and remains the operational Orders/AR filter.

Existing RLS `lab_record_is_visible_to_current_user` already includes `sourced_by_agent_id`. VE-1 UI must use it for visits without opening operational modules.

### C. Agent visit INSERT/UPDATE RLS (ADR-VE-005)

**Production gap (do not implement in VE-0):** `agent_visits` INSERT currently checks `can_write_agent_work` only — not lab visibility.

**Certified policy (VE-1):**

Agent INSERT/UPDATE visit header and discovery lines only when **all** of:

1. Authenticated Agent identity (`current_profile()`; `agent_id` / `agent_name` **server-stamped**, not client-trusted)
2. `tenant_id_matches`
3. `lab_record_is_visible_to_current_user(tenant_id, lab_id)` (assigned **or** sourced prospect)
4. `can_write_agent_work(tenant_id, agent_id, agent_name)` (no spoofing another Agent)

Conceptually: `can_write_agent_work` **AND** `lab_record_is_visible_to_current_user`.

Do not invent a new visibility model.

| Role | V1 |
|------|-----|
| Agent | INSERT/UPDATE **own** visit evidence on visible labs/prospects |
| Admin / Executive | Tenant-scoped **SELECT** only. HQ correction UPDATE is **not** in V1 |
| Lab / HR / anon | No access |

---

## `agent_visits` header contract (reuse — ADR-VE-001)

Reuse the existing table. Do **not** create a parallel activity / CRM visit table.

**Compatibility — keep:** `id` (uuid PK), `tenant_id`, `visit_id` (text, **not unique** — do not use as child FK), `lab_id`, `agent_id`, `agent_name`, `visit_date`, `visit_type`, `notes`, `follow_up_required`, `next_follow_up_date`, `next_follow_up_type`, `next_action`, `created_at`.

**VE-1 additive, all nullable, no backfill, none mandatory for save:**

| Column | Meaning |
|--------|---------|
| `visited_at` | timestamptz; time-of-day. If null, `visit_date` remains calendar SoT |
| `decision_maker_met` | boolean; null = unknown |
| `decision_maker_name` | text |
| `decision_maker_role` | text |
| `commercial_outcome` | enum below |
| `lab_size_band` | enum below |
| `estimated_monthly_wallet_inr` | numeric; **discovery only** |
| `wallet_range_band` | text; qualitative (e.g. agent-stated range). **No ₹ CHECK thresholds** |
| `wallet_confidence` | confidence enum |
| `evidence_confidence` | overall visit provenance |
| `reorder_interval` | text (weekly / monthly / … / unknown) |
| `payment_method_or_terms` | text; **not** AR credit terms |
| `approx_credit_days` | integer; discovery; **not** `ar_credit_control` |
| `top_complaint` | enum below |
| `top_complaint_notes` | text |
| `updated_at` | timestamptz |

`UNKNOWN` / null is legitimate.

`wallet_range_band` is justified because agents often know a band, not a number. It must **never** carry coded INR cutoffs in CHECK constraints or application constants.

---

## Size segment contract

`lab_size_band`: `SMALL` | `MEDIUM` | `LARGE` | `CHAIN_HOSPITAL` | `UNKNOWN`

Qualitative discovery labels only. **Do not** define ₹ wallet thresholds in V1 (or VE-0). The 20-lab sample exists to learn whether thresholds should exist later.

Existing `lab_qualifications.lab_size` (`Small` / `Medium` / `Large` / `Enterprise`) stays on the **snapshot**. Do not rename or migrate it in V1. Visit `lab_size_band` is a separate historical field. Optional UI mapping (not DB): Enterprise → `LARGE` or `CHAIN_HOSPITAL` at capture time only.

**20-lab sampling hypothesis (governance, not software):** ~8 SMALL, ~8 MEDIUM, ~4 LARGE / CHAIN_HOSPITAL. **Do not encode 8/8/4 in application logic, CHECK constraints, or quotas.**

---

## Commercial outcome vs existing visit fields

Two **different** dimensions already exist:

| Field | Meaning | Persist |
|-------|---------|---------|
| `visit_type` | Why the Agent went (New Lead, Follow-up, Closing, Collection, Support Visit) | Keep as-is |
| `lab_response` | Legacy UI response; **not** a guaranteed column — `createAgentVisitWrite` remaps into `notes` | Keep notes remap; do not break old rows |
| `commercial_outcome` | Structured **commercial output** of this visit (VE-1) | New nullable column |

`commercial_outcome`: `REQUIREMENT` | `QUOTE_OPPORTUNITY` | `FOLLOW_UP` | `ORDER_OPPORTUNITY` | `NO_OPPORTUNITY` | `UNKNOWN`

**Compatibility / mapping (VE-1 UI, no historical backfill):**

| Legacy `lab_response` (UI value) | Suggested `commercial_outcome` |
|----------------------------------|--------------------------------|
| (empty) | `UNKNOWN` |
| Interested | `REQUIREMENT` |
| Warm | `FOLLOW_UP` |
| Need Follow-up | `FOLLOW_UP` |
| Converted | `ORDER_OPPORTUNITY` |
| Not Interested | `NO_OPPORTUNITY` |

Do **not** parse historical `[Visit] Response:` notes into `commercial_outcome` in V1.  
Do **not** delete `visit_type` or stop notes remap.  
`ORDER_OPPORTUNITY` does **not** create an order. `Converted` sold-value-in-notes remains non-financial.

---

## Complaint contract

`top_complaint`: `PRICE` | `AVAILABILITY` | `DELIVERY` | `STOCKOUT` | `SHORT_EXPIRY` | `CREDIT` | `QUALITY` | `SERVICE` | `ANALYZER_SUPPORT` | `SOFTWARE` | `OTHER` | `UNKNOWN`

Notes allowed. Do not over-normalize.  
`lab_product_intelligence.primary_pain_point` (price, quality, availability, delivery, credit, service, other) stays on the **current mix snapshot**. Visit complaint is historical and broader. No V1 migration between them.

---

## Evidence confidence

`ESTIMATED` | `CUSTOMER_STATED` | `DOCUMENT_CONFIRMED` | `UNKNOWN`

**Both layers, all optional (minimal provenance without form bloat):**

| Location | Column | Meaning |
|----------|--------|---------|
| Visit header | `evidence_confidence` | Overall visit |
| Visit header | `wallet_confidence` | Wallet figure only |
| Discovery line | `confidence` | That line |

Do not require confidence to save a visit.

---

## `agent_visit_discovery_lines` (ADR-VE-003)

**Visit evidence child — not a CRM table, not a second product-intelligence SoT, not Salesforce Activities.**

| Attribute | Contract |
|-----------|----------|
| PK | `id` uuid |
| FK | `visit_uuid` → `agent_visits.id` (**uuid PK**, composite tenant-safe). **Forbidden:** FK to non-unique `visit_id` text |
| `tenant_id` | required |
| `lab_id` | denormalized **for RLS**, required, stamped from parent visit (not client-trusted) |
| `line_kind` | `ANALYZER` \| `REAGENT` \| `CONSUMABLE` |
| `confidence` | optional enum |
| timestamps | `created_at`, `updated_at` |

Kind-specific (all optional):

| Kind | Fields |
|------|--------|
| ANALYZER | manufacturer, model, notes |
| REAGENT | description/family, brand, approximate monthly spend **or** quantity, supplier |
| CONSUMABLE | category/product, brand, approximate volume, approximate price/pack, supplier |

Implementation may use sparse columns on one table (unused kind columns null) or a small `notes`/json **only if** bounded reads still project named columns — prefer sparse typed columns, no `SELECT *`.

**Forbidden:** equipment master, reagent master, second `products` catalog, required product FK, inventory integration, order integration.

Cardinality: one visit → 0..N lines. A lab has many visits; history is the visit list.

---

## UX contract (&lt;90 seconds)

Agent may be standing in a laboratory.

```
Agent → Prospect or assigned Lab → Log Visit
```

**Minimum useful save:** visit result / `commercial_outcome` (may be `UNKNOWN`) + notes and/or next action. Date/time and lab identity required. **No other discovery field is required.**

Progressive sections (skip empty; do **not** force six empty screens):

1. Visit Result  
2. Lab Profile / Size  
3. Products & Consumables (discovery lines)  
4. Analyzers & Reagents  
5. Commercial Terms / Pain  
6. Next Action / Follow-up  
7. Optional photo proof (`operational_evidence` existing workflow — still optional)

Existing 6-step wizard may remain for assigned-lab/qualify/product-mix **snapshots**; the **Log Visit** evidence path must allow skip-to-save. Do **not** put discovery fields on Add Prospect.

Target: ~60–90 seconds for a basic useful visit.

Do not add HQ analytics screens in V1. Admin/Executive: read-only visit + lines (Commercial Activities / lab 360 compose).

---

## Add Prospect (frozen)

`create_prospect_lab` four fields only. Immutable `sourced_by_agent_id`. HQ `activate_prospect_lab` unchanged. VE must not expand the modal into a CRM/economic form.

---

## What V1 must not build

- Economic columns on `labs` or Add Prospect  
- Wallet ₹ thresholds or 8/8/4 quotas in code  
- Equipment / product / reagent masters  
- Quotes object, meetings calendar, Salesforce clone  
- Dual-write visit → `lab_qualifications` / `lab_product_intelligence`  
- Additional “winning engine” scores (do not extend reagent-rental as *the* engine)  
- Agent edits to AR, credit limit, `ordering_mode`, collections state, `sourced_by`, activation  
- Segment KPI / WC calculator  
- Lab/HR visit-evidence access  
- Parallel audit framework  
- Founder wealth targets in the Agent app  
- Orders, Inventory, Shipments, User provisioning, Agent Resources changes  

---

## Future economics (document only — ADR-VE-008)

V1 does **not** calculate these. HQ will later want, **from Layer 3**, per segment:

- contribution / account / month  
- working-capital efficiency (open definition)  
- days to close (open definition)  
- reorder / retention  
- wallet share (invoiced or collected vs **stated** visit wallet — denominator is discovery)  
- contribution per salesperson effort (visit counts; time-on-site not in V1)

### Working capital — OPEN ANALYTICS DEFINITION

Conceptual: Inventory Days + Receivable Days − Payable Days.

**Current schema does not support a certified per-lab WC-days formula:**

| Component | What exists today | Lab-scoped? |
|-----------|-------------------|-------------|
| Inventory days | HQ `inventory` + `inventory_ledger` | **No** — tenant/SKU |
| Receivable days | `ar_credit_control`, invoices, payments, allocations | **Yes** (after ACTIVE) |
| Payable days | HQ `purchase_orders` | **No** — PrimeCare AP to suppliers, not lab payables |

Visit `approx_credit_days` / wallet are **discovery**, not WC inputs.  
**Do not** document a false “WC days per lab” as if it were implementable. A future certified **allocation methodology** is required before customer-level WC efficiency (ADR-VE-008, DA-004).

### Days to close — recommended definition + ambiguity

Do **not** implement in V1.

| Candidate | Meaning | Ambiguity |
|-----------|---------|-----------|
| Start: `labs.created_at` | Prospect capture clock | HQ-created labs may have no Agent prospect event |
| Start: first `agent_visits.visit_date` | First field evidence | Misses desk-only capture time |
| End: `activate_prospect_lab` audit | Became ACTIVE | Not revenue; Flow 2E: PROSPECT cannot order until ACTIVE |
| End: first `orders` row (non-draft) | First commercial order | Requires activation first; not cash |
| End: first collected `payments.amount_received` | Cash conversion | Payroll-relevant; slower than order |

**Recommended for a later analytics cert (not V1):** publish **two** clocks, do not collapse them:

1. **Activation cycle:** Agent-sourced `labs.created_at` → `user_provisioning_events` `lab_prospect_activated` (fallback: first visit if no sourced prospect).  
2. **Order conversion:** `max(activation timestamp, first visit)` → first non-draft `orders.order_date` for that `lab_id`.

Cash conversion remains a third, optional clock from `payments`. Founder must pick which clock is the M12 “days to close” KPI **before** that dashboard is built.

---

## Security / RLS (VE-1)

Reuse `can_write_agent_work`, `lab_record_is_visible_to_current_user`, `tenant_id_matches`, `hqReadBounds.js`. No `SELECT *`.

Discovery lines: same visibility as parent visit; INSERT/UPDATE only when parent visit is Agent-owned and lab visible. No visit DELETE in V1. Agent may UPDATE own header and own lines (same-day correction). Bounded child reads by `visit uuid`.

Audit: existing `notification_events` `agent_visit_logged` on insert. Do not invent a new audit table. Do not write `user_provisioning_events` for ordinary visits.

---

## Verification (planned — not in VE-0)

| Script | Purpose | Wave |
|--------|---------|------|
| `verify-agent-visit-evidence-schema.mjs` | Columns, child FK to `agent_visits.id`, CHECKs without ₹ thresholds | **VE-1** |
| `verify-agent-visit-evidence-rls.mjs` | Identity + lab visibility; prospect visit; spoof denied; Lab/HR denied | **VE-1** |
| `verify-agent-visit-evidence-api.mjs` | VE-2 write/read contract: legacy payload, header fields, discovery lines, bounded reads, spoof/cross-tenant, no snapshot/finance dual-write | **VE-2** |
| `verify-agent-visit-evidence-ux.mjs` | Skip-empty save; Add Prospect unchanged; prospect Log Visit; no operational CTA on prospect | **VE-3** |
| Regression | `verify-agent-visit-product-intelligence.mjs`, `verify-agent-prospect-2a/2b/2c/2e.mjs`, orders/AR/inventory isolation | VE-1+ |

VE-0: documentation consistency only (this file linked from README; ADRs Accepted).

---

## VE-2 application contract (write / read)

Canonical write path remains `createAgentVisitWrite` → `persistAgentVisitWithOptionalDiscovery`. Do **not** add a second Visit API.

| Surface | Contract |
|---------|----------|
| Legacy payload | `lab_id` + `visit_date` + `visit_type` (+ notes/follow-up) still saves. Evidence columns omitted when null. |
| Header evidence | Optional VE-1 columns on the same insert. Invalid enums fail closed before/at persist. None required to save. |
| Discovery lines | Optional `discoveryLines` array after header insert. Child FK is `visit_uuid` → `agent_visits.id`. Never `visit_id` text. |
| Identity | Client `agent_id` / `tenant_id` are not authoritative. VE-1 BEFORE trigger stamps from `current_profile()`. |
| Reads | Dedicated `getAgentVisitEvidenceRead` / `fetchAgentVisitEvidenceBundle`. Dashboard lists stay on production-safe `HQ_AGENT_VISIT_COLUMNS`. No `SELECT *`. |
| Snapshot firewall | Visit Evidence persist must not write `lab_qualifications` or `lab_product_intelligence`. AgentVisitPage may still snapshot product mix **separately**. |
| Financial firewall | Zero writes to orders / invoices / payments / AR / inventory / POs / `ordering_mode` / activation / `sourced_by`. |

### Partial failure (no new RPC)

Existing visit save is sequential, not a DB transaction (visit insert, then optional product-intel upsert). VE-2 follows that pattern:

1. Invalid line payload → **do not** insert the header (`persistence: failed`).
2. Header insert fails → `persistence: failed`.
3. Header succeeds and requested lines fail → **`success: false`**, `persistence: header_only`, header `data` returned. Caller retries via `createAgentVisitDiscoveryLinesWrite` using the visit uuid and stable line ids. Do **not** call `createAgentVisitWrite` again (that would create a second visit).
4. Retry with the same line `id` after a successful insert fails unique — no silent duplicate evidence.

True all-or-nothing header+lines would require a new certified RPC. That is **out of VE-2**.

### Prospect

The data contract can write a Visit against a sourced visible `PROSPECT` (RLS). VE-3 owns the picker and Prospect Log Visit button. `filterLabsForUser` remains the operational filter and is **not** broadened.

---

## VE-3 fast-path UX

Default Agent experience is **Log Visit** (not the six-step qualify wizard).

```
Open Visits (or Prospect card Log Visit)
→ select assigned lab or sourced PROSPECT (if not pre-selected)
→ visit result (defaults to “Not sure yet”)
→ optional notes
→ Save visit
```

**Mandatory fields:** lab/prospect + visit date (defaults to today). Commercial outcome is required in the payload but defaults to `UNKNOWN` (“Not sure yet”), so the Agent does not have to pick it.

**Optional sections (all skippable, collapsed):** lab size & wallet; decision maker; analyzers/reagents/consumables; terms/reordering; main pain/complaint.

Adding ANALYZER / REAGENT / CONSUMABLE lines **must remain on this same fast form**. It must not open Qualify / product mix, Strategic lab intelligence, or Product Intelligence. Optional `<details>` keep their open state across add-line re-renders. The six-step wizard opens **only** from the explicit **Qualify / product mix** control.

**Click/tap count (minimal useful visit):**
1. Open Log Visit (or tap Prospect **Log Visit**)
2. Select account if not already selected
3. Optional: type a note
4. Save visit

That is **2–4 taps**. 60–90 seconds is realistic on a phone when the account is already in context.

**Start Visit / Log Visit entry:** Labs (assigned lab **Start Visit**), sourced PROSPECT **Log Visit**, and workspace visit actions write a fast entry intent (`primecare_visit_entry_intent` + pending task) and always open the VE-3 fast form. A legacy wizard draft is **not** applied on this path. The six-step wizard opens only from **Qualify / product mix**.

**Visit eligibility** is `partitionVisitEligibleAccounts`: assigned operational labs (assigned Agent id match, not `PROSPECT`) **union** prospects with `sourced_by_agent_id` = current Agent. The operational Orders/AR filter (`filterLabsForUser`) is **unchanged** and is **not imported** by the visit helper. Prospect cards expose **Log Visit only**. A prospect visit does not activate the lab.

**Partial save:** VE-2 `header_only` shows “Visit was saved, but some evidence details could not be saved.” Retry uses `createAgentVisitDiscoveryLinesWrite` with stable line UUIDs. Header is not re-submitted.

**Duplicate submit:** Save is disabled and `savingRef` blocks re-entry while persistence is in flight.

**Parity:** Qualify / product mix wizard remains for snapshot qualification and `lab_product_intelligence`. Fast Log Visit does **not** dual-write those snapshots. Add Prospect remains the four-field RPC.

Wallet/size/product notes are labeled as field estimates — not PrimeCare revenue, AR, or inventory.

---

## VE-1 implementation contract

1. Blueprint already updated (this document).  
2. Schema change proposal from template; additive migration on **QA only**.  
3. RLS: visit + lines INSERT/UPDATE = `can_write_agent_work` AND `lab_record_is_visible_to_current_user`; SELECT same visibility; Admin/Exec SELECT tenant; no Lab/HR.  
4. Server-stamp `tenant_id` + `agent_id`/`agent_name` from `current_profile()` / `profiles` for `auth.uid()`.  
5. Child FK = `agent_visits.id`.  
6. Schema awareness + `hqReadBounds` evidence projections; live HQ visit list remains production-safe until QA apply. No `SELECT *`.  
7. **VE-3:** Visit lab picker union sourced prospects via `partitionVisitEligibleAccounts`; operational `filterLabsForUser` **unchanged** (not used for this picker).  
8. **VE-3:** Prospect card Log Visit only.  
9. **VE-3:** Skip-empty save; discovery optional.  
10. Do not dual-write snapshots. Do not touch Add Prospect fields, activation, Orders, AR, Inventory, Agent Resources.  
11. Verify scripts + UAT. Production apply only after QA cert.

---

## Related

- [00_System_Architecture.md](./00_System_Architecture.md)  
- [21_Commercial_CRM.md](./21_Commercial_CRM.md) — compose visits; discovery lines are visit evidence, not CRM  
- [25_Agent_Resources.md](./25_Agent_Resources.md) — field library, not evidence  
- [15_Do_Not_Break_Rules.md](./15_Do_Not_Break_Rules.md)  
- Production Agent Prospect: `create_prospect_lab`, `activate_prospect_lab`, `sourced_by_agent_id` (Flow 2A–2E)
