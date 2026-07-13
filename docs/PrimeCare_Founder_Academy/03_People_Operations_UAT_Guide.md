# 03 — People Operations UAT Guide

**Audience:** Founder, executive sponsor, QA lead  
**Purpose:** Sign-off checklist for People Operations v1.0  
**Environment:** QA tenant with realistic test data (recommended)

---

## Before you start

| Prerequisite | Why |
|--------------|-----|
| Log in as **Executive** (Founder test account) | Approve payroll; see full module |
| Have at least one **Agent**, **Admin**, **Lab** in test data | Realistic walkthrough |
| Have one **compensation plan** active and assigned | Payroll preview needs it |
| Have one **payment** recorded in Collections for test period | Commission needs cash collected |
| Have **lab ownership** assigned for test lab | Attribution chain |

**Test cast (suggested names):** Ravi (Executive), Priya (Admin), Arjun (Agent), City Diagnostics Lab.

---

## UAT result legend

| Result | Meaning |
|--------|---------|
| **PASS** | Works as expected |
| **FAIL** | Wrong behavior or blocker |
| **WAIVED** | Skipped with documented reason |

---

## Global checks (all tabs)

Run these once before tab-by-tab testing.

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| G1 | Open People Operations from sidebar | Page loads without blank screen | | |
| G2 | Browser console (F12) | No red runtime errors on navigation | | |
| G3 | Module bar | Dashboard, Employees, Compensation, Payroll, Budgeting, Ownership, Reports, Settings all visible | | |
| G4 | Context widget (right side, desktop) | Period, version, status shown once — not duplicated on Dashboard | | |
| G5 | Data quality banner (if warnings) | Actionable messages (e.g. unassigned plans) with links | | |
| G6 | Refresh button | Data reloads; no infinite loading loop | | |
| G7 | Switch modules 5× quickly | No crash; selection preserved where expected | | |

---

## Tab-by-tab UAT

### Dashboard

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| D1 | KPI strip | Shows payroll status, liability, inbox count, employee count | | |
| D2 | Work inbox | Approvals/alerts listed or "Inbox clear" | | |
| D3 | Workflow chips | Shows payroll lifecycle stage for selected period | | |
| D4 | Recent activity | Events listed or empty message | | |
| D5 | Operational timeline | Workforce snapshot numbers; pending actions or clear message | | |
| D6 | Quick actions | Compact toolbar; workflow actions respect role | | |
| D7 | No trend charts | Charts only in Reports — not on Dashboard | | |

**Founder focus:** *Does this tell me what to do today without opening five other tabs?*

---

### Employees

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| E1 | Directory loads | Employee list with role chips and avatars | | |
| E2 | Search / filters | Narrow list correctly | | |
| E3 | Click row | Opens Employee 360 drawer | | |
| E4 | ESC key | Closes drawer | | |
| E5 | Unassigned employee | Warning if plan missing (banner or badge) | | |
| E6 | No "Create user" | Provisioning not here — expected | | |
| E7 | Table toolbar | Density toggle and column chooser work | | |

**Founder focus:** *Can I see who is on the team and whether they have a pay plan?*

---

### Compensation — Plans

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| C1 | Plan list loads | Active and draft plans visible | | |
| C2 | Executive summary | Most used plan, draft count, version timeline | | |
| C3 | Create plan (Executive) | Draft created (optional test) | | |
| C4 | Admin login | Admin sees plans read-only; no create/activate | | |
| C5 | HR login | HR views; cannot edit commission rules | | |

**Founder focus:** *Do pay rules match our Year 1 policy on paper?*

---

### Compensation — Assignments

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| A1 | Assignment list | Employees linked to plan codes | | |
| A2 | Arjun test row | Shows active assignment to test plan | | |
| A3 | Assign flow | HR/Executive can assign (optional test) | | |
| A4 | History preserved | Changing plan does not erase prior assignment record | | |

**Founder focus:** *Is every paying employee on the right plan?*

---

### Business Ownership

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| O1 | Summary KPIs | Counts load before tree | | |
| O2 | Coverage bar | Percentage and orphan indicator | | |
| O3 | Explorer tree | Executive → Admin → Agent → Lab chain visible | | |
| O4 | Search | Filter by lab/agent name | | |
| O5 | Open lab | Lab 360 drawer opens | | |
| O6 | No edit ownership | No save/assign button in People Ops | | |
| O7 | Gap table | Unassigned labs listed if any | | |

**Founder focus:** *For City Diagnostics, do I see the right agent and any gaps?*

---

### Collections (related — verify connection)

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| COL1 | Record test payment | Collections module accepts payment | | |
| COL2 | People Ops unchanged | Payment does not require People Ops action | | |
| COL3 | Payroll preview after | Commission reflects collected cash (next preview) | | |

**Founder focus:** *Collections feed pay — but pay doesn't feed collections.*

---

### Payroll — Periods

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| P1 | Period list | Months with status badges | | |
| P2 | KPI summary | Summary row above table | | |
| P3 | Generate preview (HR) | Creates draft run with employee lines | | |
| P4 | Open preview | Navigates to Run Review | | |

**Founder focus:** *Is the current month in the right workflow stage?*

---

### Payroll — Run Review

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| R1 | Workflow timeline | Shows current stage | | |
| R2 | Sticky totals | Gross, commission, net visible while scrolling | | |
| R3 | Employee lines | Arjun row with salary + commission breakdown | | |
| R4 | Empty run message | "No employees in this payroll version" — not "0" everywhere | | |
| R5 | Approve (Executive) | Status advances; toast confirmation | | |
| R6 | Reject (Executive) | Requires reason; returns to fixable state | | |
| R7 | Lock (Executive) | Run becomes immutable | | |
| R8 | HR cannot approve | Approve/Lock hidden or disabled for HR | | |
| R9 | View employee from line | Opens Employee 360 | | |

**Founder focus:** *Would I sign this payroll for my field team?*

---

### Payroll — Commission Ledger / Activity / Exports

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| L1 | Commission ledger | Entries after preview or empty state with explanation | | |
| L2 | Activity | Audit events for workflow actions | | |
| L3 | Exports | Metadata after lock/export or empty state | | |

---

### Budgeting

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| B1 | Overview KPIs | Budget, forecast, variance, headcount | | |
| B2 | Not configured | "Budget not configured" when no payroll preview | | |
| B3 | Charts | Hidden or empty state when no meaningful data | | |
| B4 | Scenario edit | Session planning works; no finance GL change | | |

**Founder focus:** *Is this planning-only — not pretending to be company accounting?*

---

### Reports

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| REP1 | Executive summary | Revenue, collections, payroll, commission, top agent/territory KPIs first | | |
| REP2 | Charts | Appear only when data exists | | |
| REP3 | Empty state | "Open Payroll" action when no trends | | |
| REP4 | Intelligence panel | Rankings and ratios load or explain absence | | |

**Founder focus:** *Can I defend pay decisions with data?*

---

### Settings

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| S1 | Active configuration | Pay cycles and approval matrix marked active | | |
| S2 | Roadmap items | Bank file, GL, leave — marked roadmap | | |
| S3 | No false promises | No working buttons for unfinished features | | |

---

## Role-based UAT

Test menu access and key restrictions.

| Role | Login | People Ops in menu? | Generate preview? | Approve/Lock? | Expected | Actual | Result |
|------|-------|---------------------|-------------------|---------------|----------|--------|--------|
| **Executive** | Ravi | Yes | Yes | Yes | Full governance | | |
| **HR** | HR test user | Yes | Yes | No | Support role | | |
| **Admin** | Priya | Yes | No | No | View / recommend | | |
| **Agent** | Arjun | **No** | No | No | No menu entry | | |
| **Lab** | Lab test user | **No** | No | No | No menu entry | | |

---

## Boundary UAT (must pass)

| # | Check | How to verify | Expected | Actual | Result |
|---|-------|---------------|----------|--------|--------|
| BND1 | No finance mutation | Record payment only in Collections; confirm invoices/AR unchanged by People Ops actions | PASS | | |
| BND2 | Paid ≠ bank transfer | Mark Paid on payroll; confirm no bank file generated | Evidence only | | |
| BND3 | Ownership read-only | No assign lab action in Business Ownership | Must use Ops Center | | |
| BND4 | No user create in Employees | No provision button | Ops Center only | | |

---

## Regression commands (for QA engineer)

Run on QA branch before founder sign-off:

```bash
cd primecare-portal
npm run build
node scripts/audit-rc4-ui-certification.mjs
node scripts/audit-phase-9-3-certification.mjs
node scripts/verify-compensation-no-finance-mutation.mjs
node scripts/verify-payroll-no-finance-mutation.mjs
```

---

## UAT summary sheet

| Area | Tester | Date | PASS | FAIL | WAIVED | Notes |
|------|--------|------|------|------|--------|-------|
| Global | | | | | | |
| Dashboard | | | | | | |
| Employees | | | | | | |
| Compensation | | | | | | |
| Business Ownership | | | | | | |
| Collections link | | | | | | |
| Payroll | | | | | | |
| Budgeting | | | | | | |
| Reports | | | | | | |
| Settings | | | | | | |
| Role matrix | | | | | | |
| Boundaries | | | | | | |

---

## Sign-off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Founder / Executive sponsor | | | |
| QA lead | | | |
| Engineering witness | | | |

**People Operations v1.0 UAT verdict:** ☐ GO  ☐ NO-GO  ☐ CONDITIONAL GO

**Conditions (if conditional):**

---

## Related reading

- [01_PrimeCare_Enterprise_Map.md](./01_PrimeCare_Enterprise_Map.md)
- [02_People_Operations_Business_Walkthrough.md](./02_People_Operations_Business_Walkthrough.md)
- Blueprint: `docs/PrimeCare_System_Blueprint/20_People_Operations.md`
