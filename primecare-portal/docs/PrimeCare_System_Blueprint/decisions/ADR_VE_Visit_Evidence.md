# ADR-VE — Agent Visit Evidence decisions

**Status:** Accepted (VE-0 Blueprint)  
**Date:** 2026-09-07  
**Deciders:** Founder / PrimeCare AI Architect (VE-0 certification)

Canonical narrative: [26_Agent_Visit_Evidence.md](../26_Agent_Visit_Evidence.md).  
Template: [Architecture_Decision_Record_Template.md](../templates/Architecture_Decision_Record_Template.md).

These ADRs are **documentation**. They do not migrate schema or change Production.

---

## ADR-VE-001 — Reuse `agent_visits` as canonical visit header

**Status:** Accepted

### Context

PrimeCare needs per-visit field evidence. Commercial CRM (doc 21) already names `agent_visits` as the activity SoT and forbids a Salesforce Activities clone. A second visit/activity table would duplicate the canonical model.

### Decision

Reuse `agent_visits` as the visit header. Extend it additively. Child evidence FKs `agent_visits.id` (uuid).

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| A. New `field_visits` table | Cleaner columns | Duplicates activity SoT; breaks Commercial compose |
| B. Reuse `agent_visits` | Existing RLS, wizard, notifications | Additive columns; `visit_id` not unique |
| C. Stuff everything into `notes` | No migration | Not queryable; already used for `lab_response` remap |

### Consequences

- VE-1 migrates columns onto `agent_visits`, not a new header table.  
- Never-break: no Orders/AR change.

---

## ADR-VE-002 — Historical discovery belongs to Visit Evidence, not `labs`

**Status:** Accepted

### Context

A lab has many visits. Information changes. Putting wallet, size, analyzers, terms on `labs` would overwrite history and bloat Add Prospect. `lab_qualifications` and `lab_product_intelligence` are **current snapshots**.

### Decision

Layer 1 = `labs` identity/lifecycle only. Layer 2 = `agent_visits` + discovery lines. Do not add economic discovery columns to `labs`. Do not convert snapshot tables into history. No V1 dual-write.

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| A. Columns on `labs` | Simple query | No history; violates Add Prospect minimalism |
| B. Overwrite `lab_qualifications` | Fields already exist | 1:1; loses visit history; hard-codes engines |
| C. Visit-scoped evidence | History; snapshots stay | Two read paths until a later projection |

### Consequences

- Add Prospect stays four fields.  
- Qualify / product-mix wizard may remain for snapshots; visit evidence is separate SoT.

---

## ADR-VE-003 — One discovery child table for analyzer / reagent / consumable

**Status:** Accepted

### Context

A visit may record multiple analyzers, reagents, and consumables. An equipment master or second product catalog would over-engineer V1 and collide with `products` / inventory.

### Decision

One table `agent_visit_discovery_lines` with `line_kind` `ANALYZER` | `REAGENT` | `CONSUMABLE`. FK to `agent_visits.id`. Observational fields only. No product FK.

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| A. Three child tables | Strict typing | Extra RLS and UI |
| B. JSONB on visit | Fast ship | Weaker bounds/indexes; easy to dump unstructured CRM |
| C. One typed child table | Enough for V1 analytics later | Sparse columns |

### Consequences

- Not a CRM table (see 21). Not a replacement for `lab_product_intelligence`.  
- `visit_id` text must not be the FK.

---

## ADR-VE-004 — Prospects may receive Visit Evidence without operational activation

**Status:** Accepted

### Context

Flow 2 Add Prospect creates `PROSPECT` without AR, orders, lab user, or activation. `filterLabsForUser` excludes `PROSPECT` so sourced labs are not treated as operational. Agents therefore cannot Log Visit on a prospect they just captured.

### Decision

Allow visit evidence on Agent-sourced `PROSPECT` via a **visit-only** lab picker (operational assigned ∪ sourced prospects). Do **not** broaden operational lab filters. Prospect cards: Log Visit only. Orders, collections, payments, AR, credit, fulfillment, lab portal remain blocked until existing HQ activation.

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| A. Activate first, then visit | Reuses operational picker | Forces AR/activation too early |
| B. Include PROSPECT in `filterLabsForUser` | One list | Collections/payment CTAs leak onto prospects |
| C. Narrow visit union picker | Preserves 2B operational split | Two filters to maintain |

### Consequences

- VE-1 changes visit picker / prospect card only, not collections filters.  
- RLS already allows sourced visibility; INSERT must AND lab visibility (ADR-VE-005).

---

## ADR-VE-005 — Agent visit write requires identity + tenant + visible lab

**Status:** Accepted

### Context

`agent_visits` INSERT uses `can_write_agent_work` (blocks spoofing) but not `lab_record_is_visible_to_current_user`. An Agent could write a visit for a `lab_id` they cannot see.

### Decision

INSERT/UPDATE on visit header and discovery lines: `can_write_agent_work` **AND** `lab_record_is_visible_to_current_user`, same tenant. Server-stamp Agent identity from `current_profile()`. Admin/Exec V1: SELECT only. Lab/HR/anon: none.

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| A. Keep identity-only INSERT | No RLS change | Invisible-lab write |
| B. New visibility function | Tailored | Second SoT |
| C. Compose existing helpers | Matches labs/orders | Must patch visit policies in VE-1 |

### Consequences

- RLS change in VE-1 requires D1 approval path (`15_Do_Not_Break_Rules.md`) — this ADR **is** that approval for **tightening** isolation, not weakening it.  
- `verify-hq-rls-reads.mjs` + visit-evidence RLS verify.

---

## ADR-VE-006 — Agent estimates never become financial SoT

**Status:** Accepted

### Context

Visit wallet, credit days, prices, and volumes are field discovery. Layer 3 already owns orders, invoices, payments, AR, inventory, procurement.

### Decision

Visit money fields are labeled discovery. No triggers into Orders/AR/Inventory. HQ economics later read only canonical O2C. UI must not present estimates as PrimeCare books.

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| A. Seed AR/credit from visit terms | Faster onboarding | Second finance truth; never-break F4 |
| B. Discovery-only estimates | Clean SoT | HQ cannot treat wallet as revenue |

### Consequences

- Never-break F1–F4, inventory, payments preserved.

---

## ADR-VE-007 — No hard-coded winning business engine

**Status:** Accepted

### Context

Qualify UI already scores `reagent_rental_potential` and Lab OS fit. Encoding more “winner” scores would pretend the engine is known. PrimeCare must discover the engine.

### Decision

V1 captures raw evidence (size band, wallet, lines by kind, complaint, outcome). Do not add engine-winner scores. Do not require reagent-rental as the commercial path. Do not encode 8/8/4 or wallet ₹ thresholds. Existing qualify snapshot fields may remain unused or optional; do not extend that pattern.

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| A. Score each engine on the visit | Forces a thesis | Biases capture |
| B. Evidence without a winner | Learnable | HQ must interpret later |

---

## ADR-VE-008 — Customer-level working-capital allocation remains undefined

**Status:** Accepted

### Context

Governance wants WC days = Inventory Days + Receivable Days − Payable Days, and contribution per ₹1 WC. Inventory and AP are HQ/SKU/supplier scoped, not lab-scoped. Inventing a per-lab WC formula would be false precision.

### Decision

Document customer-level WC efficiency as an **open analytics definition**. Do not implement WC-days-per-lab in V1. A future certified allocation methodology is required (see DA-004). Receivable days per ACTIVE lab may be derived later from AR/invoices/payments without claiming full WC.

### Alternatives considered

| Option | Pros | Cons |
|--------|------|------|
| A. Fake per-lab inventory days | Dashboard now | Wrong |
| B. Use visit credit days as WC | Easy | Discovery ≠ finance |
| C. Leave undefined until methodology | Honest | No M12 WC KPI until certified |

### Consequences

- [Deferred_Architecture.md](../../Architecture/Deferred_Architecture.md) DA-004.  
- Days-to-close also remains dual-clock (activation vs first order) until a later analytics cert — see doc 26.

---

## Never-break check

- [x] No violation of `15_Do_Not_Break_Rules.md` in VE-0 (docs only).  
- VE-1 RLS is a **tightening** of D2 (isolation), not a weakening.  
- F1–F4, Orders, AR, Inventory, Agent Resources, Add Prospect, activation RPC untouched.

## Blueprint impact

- `26_Agent_Visit_Evidence.md` (owner)  
- `00`, `01`, `01_schema_catalog`, `02_Object_Relationships`, `02_field_dictionary`, `03_Field_Dictionary`, `04_Role_Access_Matrix`, `12`, `13`, `15`, `21`, `README`, `CHANGELOG`
