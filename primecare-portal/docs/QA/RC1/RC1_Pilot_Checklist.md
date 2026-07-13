# RC1 Pilot Checklist

**Pilot model:** Single HQ tenant, supervised, golden labs primary, desktop-first.

---

## Pilot Scope

- [ ] Tenant: HQ QA or designated pilot tenant ID documented
- [ ] Labs: `QA_LAB_*` golden labs + max N pilot labs agreed
- [ ] Roles enabled: executive, admin, hr, agent, lab only
- [ ] Distributor OS disabled for pilot users
- [ ] Legacy AR drift labs excluded from executive KPI sign-off

---

## Customer Onboarding

- [ ] Create lab (UI or approved script path)
- [ ] Assign agent + lab user
- [ ] Assign catalog / opening stock
- [ ] Set ordering mode (document chosen mode)
- [ ] Assign compensation plan (preview)
- [ ] Walkthrough: order → fulfill → invoice → payment

---

## Operational Readiness (Day 0)

| Step | Verified | Owner |
|---|---|---|
| Create new lab | [ ] | Admin |
| Activate lab | [ ] | Admin |
| Assign agent | [ ] | Admin |
| Assign compensation | [ ] | HR |
| Receive inventory | [ ] | Admin |
| Create order | [ ] | Lab/Admin |
| Dispatch shipment | [ ] | Admin/Logistics |
| Generate invoice | [ ] | System |
| Record payment | [ ] | Admin |
| Allocate payment | [ ] | System |
| Run payroll preview | [ ] | HR |
| Approve payroll preview | [ ] | HR |
| Export payroll | [ ] | HR |
| Founder review | [ ] | Executive |

---

## Support

- [ ] Support runbook shared with pilot contact
- [ ] Escalation path: Agent → Admin → Engineering → Founder
- [ ] Known issues sheet shared (`RC1_Known_Issues.md`)

---

## Exit Criteria (Pilot Success)

- [ ] 30 days without Critical finance defect on golden labs
- [ ] Golden path re-run PASS weekly
- [ ] Human UAT matrix all PASS or signed WAIVED
- [ ] Founder GO for R1.0 general availability

---

## Pilot GO Gate

**Current status:** BLOCKED — complete FAIL rows in `RC1_Human_UAT_Matrix.md`
