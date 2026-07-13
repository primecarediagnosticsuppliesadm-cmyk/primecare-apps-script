# Manual UAT Checklist

**Feature:**  
**Environment:** QA / Staging / Prod smoke  
**Date:**  
**Tester:**  

---

## Prerequisites

- [ ] Build deployed / branch: ___
- [ ] Test users available (see qaCredentials.mjs)
- [ ] Relevant verify scripts passed: ___

---

## Roles under test

| Role | User | Tenant / Lab |
|------|------|--------------|
| executive | | |
| admin | | |
| agent | | |
| lab | | |

---

## Test cases

### TC-1: _Title_

**Role:**  
**Steps:**
1. 
2. 

**Expected:**  
**Actual:**  
**Pass / Fail:**  

---

### TC-2: Negative / security

**Steps:** Lab user attempts to access another lab's data / HQ module.

**Expected:** Denied or empty scoped result.  
**Pass / Fail:**  

---

## Regression smoke

- [ ] Orders fulfill path still works
- [ ] Payment + allocation still works
- [ ] Lab checkout + Track Order still works
- [ ] No console errors on happy path

---

## Sign-off

| Area | Status | Notes |
|------|--------|-------|
| Functional | Pass / Fail | |
| Security / scope | Pass / Fail | |
| Performance acceptable | Pass / Fail | |
