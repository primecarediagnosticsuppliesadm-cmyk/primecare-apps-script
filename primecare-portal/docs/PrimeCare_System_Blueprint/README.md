# PrimeCare System Blueprint

**Living source of truth for schema, business rules, access control, verification, and release gates.**

Enforced by Cursor rules:
- `.cursor/rules/primecare-ai-architect.mdc` — AI Architect Mode (impact analysis, implementation gate)
- `.cursor/rules/primecare-engineering.mdc` — engineering standards and completion gates

---

## AI Architect workflow

```
Read Blueprint → Inspect code/migrations → Compare doc vs implementation
    → Conflict? Stop + CHANGELOG gap
    → Impact analysis (template)
    → Update Blueprint if schema/rules change
    → Implement
    → Verify scripts + UAT
    → Release gates → recommend commit
```

---

## Document index

| # | Document | Contents |
|---|----------|----------|
| 00 | [00_System_Architecture.md](./00_System_Architecture.md) | Modules, SoT, data flow, repo layout |
| 01 | [01_Database_Schema.md](./01_Database_Schema.md) | Tables, keys, RLS, read/write map |
| 02 | [02_Object_Relationships.md](./02_Object_Relationships.md) | Joins, cardinality, query patterns |
| 03 | [03_Field_Dictionary.md](./03_Field_Dictionary.md) | Critical fields, id vs business keys |
| 04 | [04_Role_Access_Matrix.md](./04_Role_Access_Matrix.md) | Roles, modules, freeze |
| 05 | [05_Order_Lifecycle.md](./05_Order_Lifecycle.md) | Order states, fulfill, inventory |
| 06 | [06_Finance_Rules.md](./06_Finance_Rules.md) | Invoice, payment, allocation, AR |
| 07 | [07_Logistics_Rules.md](./07_Logistics_Rules.md) | Shipments, couriers, dispatch |
| 08 | [08_Delivery_Charge_Rules.md](./08_Delivery_Charge_Rules.md) | Phase 3A policy engine |
| 09 | [09_Lab_Portal_Rules.md](./09_Lab_Portal_Rules.md) | Lab ordering, tracking, scope |
| 10 | [10_Operations_Center_Rules.md](./10_Operations_Center_Rules.md) | Users, ownership, freeze |
| 11 | [11_Inventory_Rules.md](./11_Inventory_Rules.md) | Stock, ledger, procurement |
| 12 | [12_Executive_Analytics_Rules.md](./12_Executive_Analytics_Rules.md) | Founder / EFI read-only analytics |
| 13 | [13_Verification_Matrix.md](./13_Verification_Matrix.md) | All verify scripts + UAT |
| 14 | [14_Release_Gates.md](./14_Release_Gates.md) | Build, cert, commit criteria |
| 15 | [15_Do_Not_Break_Rules.md](./15_Do_Not_Break_Rules.md) | Hard constraints |
| — | [CHANGELOG.md](./CHANGELOG.md) | Gaps, conflicts, structural changes |

### Templates

| Template | Use |
|----------|-----|
| [Feature_Impact_Assessment_Template.md](./templates/Feature_Impact_Assessment_Template.md) | Pre-implementation gate |
| [Schema_Change_Template.md](./templates/Schema_Change_Template.md) | Migrations + RLS |
| [UAT_Checklist_Template.md](./templates/UAT_Checklist_Template.md) | Manual testing |
| [Verification_Script_Template.md](./templates/Verification_Script_Template.md) | New verify scripts |
| [Architecture_Decision_Record_Template.md](./templates/Architecture_Decision_Record_Template.md) | ADRs |

### Legacy docs (superseded numbering)

Earlier blueprint files (`01_schema_catalog.md` … `12_verification_matrix.md`) remain for reference; **prefer 00–15 numbering** above.

---

## Golden rules

| Domain | Source of truth |
|--------|-----------------|
| Orders (financial) | `orders` + fulfill flags + ledger |
| Invoices | `invoices` + `invoice_line_items` |
| Collections / AR | `ar_credit_control` + `payments` + allocations |
| Shipments (operational) | `order_shipments` |
| Inventory | `inventory` + `inventory_ledger` |
| Permissions | `rolePermissionMatrix.js` |
| Bounded reads | `hqReadBounds.js` |

---

## Related docs

- `docs/QA/` — certification, UAT, gap register
- `docs/Architecture/` — founder decisions, deferred architecture
- `supabase/migrations/` — formal migrations
- `supabase/sql/` — manual SQL evolution (52 files)

---

## Conflict policy

If blueprint and code disagree: **stop**, report conflict, add `CHANGELOG.md` entry, update blueprint or fix code explicitly — never silent drift.
