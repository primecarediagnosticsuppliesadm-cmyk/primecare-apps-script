# Feature Impact Assessment

**Feature / fix:**  
**Date:**  
**Author:**  
**Blueprint gate:** ALLOWED / BLOCKED  

---

## 1. Summary

_One paragraph: what changes and why._

---

## 2. Blueprint files read

- [ ] README.md
- [ ] 00_System_Architecture.md
- [ ] 01_Database_Schema.md
- [ ] _domain docs: ___

---

## 3. Code & schema verified

| Area | Paths inspected | Finding |
|------|-----------------|---------|
| Migrations | | |
| APIs | | |
| Pages | | |
| RLS SQL | | |
| Verify scripts | | |

---

## 4. Conflicts (doc vs code)

| Item | Blueprint says | Code/schema says | Resolution |
|------|----------------|------------------|------------|
| | | | |

---

## 5. Impact matrix

| Dimension | Affected items | Risk |
|-----------|----------------|------|
| Modules | | Low / Med / High |
| Tables | | |
| APIs | | |
| Pages | | |
| Roles | | |
| Business rules | | |
| RLS / security | | |
| Performance | | |

---

## 6. Regression risk

_Describe what could break and how it is mitigated._

---

## 7. Verification plan

| Script | Purpose |
|--------|---------|
| `npm run build` | |
| `node scripts/verify-*.mjs` | |

---

## 8. Manual UAT checklist

- [ ] _Role: ___ — step ___

---

## 9. Blueprint updates required

- [ ] Files to update: ___
- [ ] CHANGELOG entry: ___

---

## 10. Approval

- [ ] No never-break domain touched OR explicit approval obtained
- [ ] Implementation gate: **ALLOWED** / **BLOCKED**
