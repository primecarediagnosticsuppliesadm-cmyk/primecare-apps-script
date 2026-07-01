# Schema Change Proposal

**Change ID:**  
**Date:**  
**Migration file(s):**  

---

## Table(s)

| Table | Change type | Owner module |
|-------|-------------|--------------|
| | ADD TABLE / ADD COLUMN / INDEX / CONSTRAINT / RLS | |

---

## Column detail

| Table | Column | Type | Required | Default | Business meaning |
|-------|--------|------|----------|---------|------------------|
| | | | | | |

---

## Keys & constraints

- **Primary key:**
- **Business key:**
- **Unique:**
- **Foreign keys:**
- **Check constraints:**

---

## RLS

| Policy | Operation | Roles | USING / WITH CHECK |
|--------|-----------|-------|---------------------|
| | SELECT / INSERT / UPDATE / DELETE | | |

**Approval required for RLS changes:** Yes — always.

---

## Relationships

_Parent → child, join fields — link to 02_Object_Relationships.md._

---

## Read/write map

| Role | Read | Write |
|------|------|-------|
| executive | | |
| admin | | |
| agent | | |
| lab | | |

---

## API impact

| API function | Change |
|--------------|--------|
| | |

---

## Verification

- [ ] `verify-pilot-migrations.mjs` manifest updated
- [ ] `verify-hq-rls-reads.mjs`
- [ ] Domain-specific verify script: ___

---

## Rollback

_How to revert safely._

---

## Blueprint updates

- [ ] `01_Database_Schema.md`
- [ ] `03_Field_Dictionary.md`
- [ ] `02_Object_Relationships.md`
- [ ] `CHANGELOG.md`
