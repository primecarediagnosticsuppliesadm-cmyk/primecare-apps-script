# 06 — Release Scorecard

**Template for release certification PASS/FAIL matrix. Copy to `docs/QA/Release_Scorecard_YYYY-MM-DD.md` per run.**

---

## Run metadata

| Field | Value |
|-------|-------|
| **Release** | Year-1 O2C / RC name |
| **Branch** | |
| **Commit** | |
| **Canonical URL** | Production: `https://app.primecarediagnostics.in` (not `*.vercel.app`) |
| **Browser SHA** | Must match Commit (`window.__PRIMECARE_BUILD__.commit`) |
| **Supabase** | Production: `alxhrnotnvwpblsiadxj` |
| **Environment** | QA / Staging / Production |
| **Certifier** | |
| **Date** | |

---

## Executive summary

_(2–3 sentences: overall readiness, blocker count, GO/NO-GO)_

---

## PASS / FAIL matrix

| # | Domain | Automated | Manual UAT | Status | Evidence |
|---|--------|-----------|------------|--------|----------|
| 1 | Lab ordering | | | ☐ PASS ☐ FAIL | `verify-lab-ordering-flow` |
| 2 | HQ Orders | | | ☐ PASS ☐ FAIL | `verify-orders-admin-flow` |
| 3 | Fulfillment | | | ☐ PASS ☐ FAIL | golden path GP-21/22 |
| 4 | Logistics | | | ☐ PASS ☐ FAIL | `verify-logistics-dispatch-flow` |
| 5 | Finance | | | ☐ PASS ☐ FAIL | `verify-financial-reconciliation` |
| 6 | Performance | | | ☐ PASS ☐ FAIL | perf cert / matrix 07 |
| 7 | Security / RLS | | | ☐ PASS ☐ FAIL | `verify-hq-rls-reads` |
| 8 | Regression bundle | | | ☐ PASS ☐ FAIL | build + 8 scripts |
| 9 | Browser golden path | | | ☐ PASS ☐ FAIL | BGP-* steps |
| 10 | Production identity STOP gate | | | ☐ PASS ☐ FAIL | Canonical URL + SHA + `alxhrnotnvwpblsiadxj` |

---

## Build results

| Check | Result | Notes |
|-------|--------|-------|
| `npm run build` | ☐ PASS ☐ FAIL | |
| Bundle size warnings | ☐ OK ☐ REVIEW | |

---

## Verification results

| Script | PASS | WARN | FAIL |
|--------|------|------|------|
| verify-lab-ordering-flow.mjs | | | |
| verify-lab-orders-sync-stabilization.mjs | | | |
| verify-orders-admin-flow.mjs | | | |
| verify-logistics-dispatch-flow.mjs | | | |
| verify-delivery-charge-policy.mjs | | | |
| verify-financial-reconciliation.mjs | | | |
| verify-payment-allocation-flow.mjs | | | |
| verify-primecare-production-golden-path.mjs | | | |
| verify-hq-rls-reads.mjs | | | |
| verify-executive-financial-intelligence.mjs | | | |

---

## Browser golden path

| Step | Result | Notes |
|------|--------|-------|
| BGP-L03 New order_id | ☐ | |
| BGP-L05 Track match | ☐ | |
| BGP-A03 Item count | ☐ | |
| BGP-A05 Fulfill | ☐ | |
| BGP-A07 Shipment | ☐ | |
| BGP-A11 Allocation | ☐ | |
| BGP-E03 EFI | ☐ | |

`run-browser-certification.mjs` prereq: ☐ PASS ☐ FAIL

---

## Performance metrics

| Surface | Before (ms) | After (ms) | Target (ms) | Status |
|---------|-------------|------------|-------------|--------|
| Orders list | | | 350 | |
| Collections | | | 200 | |
| Admin dashboard | | | 350 | |
| Operations Center | | | 400 | |
| Lab catalog | | | 300 | |

**Slowest query:**  
**Recommendations:**

---

## Security checklist

| Check | Status |
|-------|--------|
| RLS tenant isolation | ☐ |
| Lab isolation | ☐ |
| Ordering mode gates | ☐ |
| HQ freeze policy | ☐ |
| No finance regression from logistics | ☐ |
| Guntur tenant untouched | ☐ |

---

## Root causes (if FAIL)

| ID | Domain | Root cause | Fix commit |
|----|--------|------------|------------|
| | | | |

---

## Remaining bugs / WARNs

| Severity | Item | Accept for pilot? |
|----------|------|-------------------|
| | | ☐ Yes ☐ No |

---

## Release risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| | | | |

---

## Scoring

| Criterion | Weight | Score (0–100) |
|-----------|--------|---------------|
| Automated regression | 30% | |
| Golden path API | 20% | |
| Security | 15% | |
| Performance | 15% | |
| Manual UAT | 15% | |
| Deploy hygiene | 5% | |

### **Production readiness score: ___ / 100**

---

## Recommendation

| Gate | Decision |
|------|----------|
| QA pilot | ☐ GO ☐ CONDITIONAL GO ☐ NO-GO |
| Production | ☐ GO ☐ NO-GO |

**Conditions for full GO:**

1.  
2.  
3.  

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering | | | |
| QA | | | |
| Product / Founder | | | |
