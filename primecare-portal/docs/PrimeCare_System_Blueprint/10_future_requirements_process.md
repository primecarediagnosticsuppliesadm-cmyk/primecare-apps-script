# 10 — Future Requirements Process

Mandatory workflow for every new feature, fix, migration, or integration in PrimeCare.

---

## Step 1 — Read blueprint

Before writing code or SQL:

1. Open [README.md](./README.md) and identify affected documents (01–12).
2. Read current rules for finance, logistics, lab portal, operations, and access.
3. Read [11_do_not_break_rules.md](./11_do_not_break_rules.md).

**If the request conflicts with the blueprint → stop and report.**

---

## Step 2 — Update blueprint with proposed rule

For any new requirement:

1. Draft the new rule in the appropriate blueprint file (or add a new section).
2. Include: purpose, affected tables/fields, roles, do-not-break impact.
3. For schema changes: update [01_schema_catalog.md](./01_schema_catalog.md) and [02_field_dictionary.md](./02_field_dictionary.md) **before** migration.
4. For access changes: update [04_role_access_matrix.md](./04_role_access_matrix.md) and `rolePermissionMatrix.js` in same change set.

**Blueprint leads implementation** — not the reverse.

---

## Step 3 — Identify affected schema/modules

Document in PR/task:

| Question | Answer location |
|----------|-----------------|
| New tables/columns? | 01, 02, migration file |
| New relationships? | 03 |
| New role permissions? | 04 + `rolePermissionMatrix.js` |
| Finance impact? | 05 |
| Logistics impact? | 06, 09 |
| Lab portal impact? | 07 |
| Operations/provisioning impact? | 08 |
| Verification needed? | 12 |

---

## Step 4 — Identify do-not-break rules

Check each item in [11_do_not_break_rules.md](./11_do_not_break_rules.md).

Explicitly list:
- Rules at risk
- Mitigation (e.g. additive migration only, feature flag, read-only phase)

**High-risk areas requiring explicit approval:**
- RLS policy changes
- Invoice/payment/AR lifecycle changes
- `orders.total_amount` semantics
- Delivery charge → invoice wiring (Phase 3B)
- Commission touching payment logic

---

## Step 5 — Implement code

Implementation constraints:
- Match existing naming and API patterns in `src/api/`
- Use bounded column projections from `hqReadBounds.js`
- Use `rolePermissionMatrix.js` for page access
- Prefer Supabase RPCs for atomic finance operations
- Non-blocking hooks for operational side effects (pattern: shipment after fulfill)

---

## Step 6 — Update verification scripts

| Change type | Action |
|-------------|--------|
| New table | Add to `verify-pilot-migrations.mjs` manifest if pilot-critical |
| Finance change | Update `verify-financial-reconciliation.mjs` or invoice phase scripts |
| Logistics change | Update `verify-logistics-dispatch-flow.mjs` / `verify-delivery-charge-policy.mjs` |
| Lab portal change | Update `verify-lab-ordering-flow.mjs` |
| RLS change | Update `verify-hq-rls-reads.mjs` |
| Operations change | Update `verify-operations-center-admin-flow.mjs` |
| New module | Create `verify-{module}-*.mjs` following existing pattern |

Run relevant scripts before PR — document results in PR description.

---

## Step 7 — Update blueprint again if implementation differs

After implementation, reconcile:

1. If actual behavior differs from Step 2 draft → update blueprint to match reality.
2. Update [12_verification_matrix.md](./12_verification_matrix.md) if scripts changed.
3. Update `docs/QA/QA_Gap_Register.md` if gaps closed/opened.
4. Note any **deferred** items in `docs/Architecture/Deferred_Architecture.md`.

---

## Requirement classification template

```markdown
## Requirement: [title]

### Blueprint sections affected
- [ ] 01 Schema
- [ ] 02 Fields
- [ ] 03 Relationships
- [ ] 04 Roles
- [ ] 05 Finance
- [ ] 06 Logistics
- [ ] 07 Lab portal
- [ ] 08 Operations
- [ ] 09 Delivery policy
- [ ] 11 Do-not-break
- [ ] 12 Verification

### Do-not-break checklist
- [ ] RLS unchanged OR approved
- [ ] Invoice allocation model unchanged OR approved
- [ ] AR canonical unchanged OR approved
- [ ] No new financial SoT OR documented
- [ ] Bounded reads preserved

### Verification plan
- Scripts: ...
- Manual UAT: ...
```

---

## Emergency hotfix process

For production hotfixes:

1. Still read blueprint for affected domain.
2. Minimal diff only.
3. Post-hoc blueprint update in same or follow-up PR within 24h.
4. Add regression verify check if bug was testable.

---

## Architecture decision records

Major decisions go to `docs/Architecture/Founder_Decisions.md` (FD-xxx).  
Deferred work goes to `docs/Architecture/Deferred_Architecture.md` (DA-xxx).

Blueprint documents **current truth**; Architecture docs **why** and **what's deferred**.
