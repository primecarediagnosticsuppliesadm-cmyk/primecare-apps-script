# Purchase Certification — Sign-off Template

| Field | Value |
|-------|-------|
| Module | Purchase / Reorder |
| Environment | QA |
| Date | |

## Scope acknowledged

- Sprint 1A action feedback (Create / Edit / Cancel / Bulk / Receive / Freeze)
- Sprint 1B Start Here / context strip / selection / return paths / empty states
- Sprint 1C queue hierarchy / Suppliers honesty / page budget
- Closure: PUR-CERT-005 evidence pack · PUR-CERT-012 verification packaging

## Founder boundary acknowledged

**Gold covers:** Purchase Workspace · Queue · Receive · Forecast Drafts · Pending Receipts · History · Context · Trust · Navigation.

**Gold does not certify:** Supplier Master · Approvals · Explainability cards · Engineering decomposition · Future procurement features.

## Do-not-break confirmed

No schema, API, RPC, Purchase Order write semantics, PURCHASE_IN, inventory ledger, reorder engine, receiving eligibility, financial posting, permission, or RLS changes in this certification cycle.

## Verdict

| Role | Name | Date | Result |
|------|------|------|--------|
| Admin / Executive tester | | | ☐ GO ☐ CONDITIONAL GO ☐ NO-GO |
| Procurement / Ops (optional) | | | ☐ GO ☐ CONDITIONAL GO ☐ NO-GO |
| Warehouse receive (optional) | | | ☐ GO ☐ CONDITIONAL GO ☐ NO-GO |
| Engineering | | | ☐ GO ☐ CONDITIONAL GO ☐ NO-GO |
| Founder (optional) | | | ☐ GO ☐ CONDITIONAL GO ☐ NO-GO |

## Notes / waivers

| Item | Decision |
|------|----------|
| PUR-CERT-015 / 010 explainability cards | Future — not required for this Gold |
| PUR-CERT-001 engineering split | RC2 — not required for this Gold |
| Supplier Master / Approvals | Deferred — out of Gold boundary |
| `verify-procurement-inventory-flow.mjs` `@/` Node import | Pre-existing exclusion — not a Purchase UX failure |
| Other | |

**Gold requires at least one signed GO from Admin/Executive tester and Engineering after browser UAT.**

After Gold approval: freeze Purchase except bug fixes, security fixes, and compliance updates. Do not begin Supplier certification.
