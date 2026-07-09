# RC5 — Manual UAT Checklist (Founder UX)

**Audience:** Founder, HR Manager, Finance Manager (no developer background)  
**Scope:** UI wording, guidance, empty states, help, onboarding — **no** calculation or write-path changes  
**Success:** Understand every People Operations page within ~5 minutes without external docs

---

## Global

| # | Check | Expected | Result |
|---|-------|----------|--------|
| G1 | Open People Operations | Dashboard loads; guided onboarding visible (or dismissed) | |
| G2 | Click “What does this page do?” on Dashboard | Business-language popover; no developer terms | |
| G3 | Dismiss onboarding | Stays dismissed after refresh | |
| G4 | Warning banners | Show Problem → Reason → Action CTA | |

---

## Dashboard

| # | Check | Expected | Result |
|---|-------|----------|--------|
| D1 | Missing plan warning | “Payroll Blocker” + Assign Compensation Plans → | |
| D2 | Ownership gaps | “Commission Blocker” + Open Business Ownership → | |
| D3 | No payroll run | “Payroll has not been generated…” + Generate Payroll Preview → | |

---

## Employees / Employee 360

| # | Check | Expected | Result |
|---|-------|----------|--------|
| E1 | Open employee drawer | Identity + Business + Payroll + Performance summary at top | |
| E2 | Section labels | Business Ownership, Current Pay Structure, Payroll History, Performance | |
| E3 | Ownership helper | “These laboratories generate this employee's commission.” | |
| E4 | Empty directory | “No employees assigned yet” + guidance | |

---

## Compensation

| # | Check | Expected | Result |
|---|-------|----------|--------|
| C1 | Create plan | Success message + Employees assigned 0 + Assign Employees → | |
| C2 | Executive summary | Most Used Plan, Highest Commission %, Promotion Eligible, Inactive Plans, Plans without Employees | |
| C3 | Empty plans | “No Compensation Plans yet” + create guidance | |

---

## Business Ownership

| # | Check | Expected | Result |
|---|-------|----------|--------|
| O1 | Page intro | Explains commission / reporting / payroll attribution | |
| O2 | Chain | Executive → Reporting Admin → Agent → Laboratory | |
| O3 | Open lab | Primary Agent, Reporting Admin, Executive, Commission Path | |
| O4 | Missing owner | Cannot generate commission message | |

---

## Payroll

| # | Check | Expected | Result |
|---|-------|----------|--------|
| P1 | Empty preview | “Payroll cannot be generated” + reasons + CTAs | |
| P2 | Expand employee line | Salary, Fuel, Mobile, Commission, Adjustments, Recoveries, Bonuses, Net | |
| P3 | How calculated | Salary←Plan, Commission←Collections, Override←Ownership, Adjustments←Review | |

---

## Reports

| # | Check | Expected | Result |
|---|-------|----------|--------|
| R1 | Top of page | Business Summary KPIs before charts | |
| R2 | KPIs include | Best Performing Agent, Needs Attention, Top/Lowest Territory, Highest Payroll/Collections, Promotion Candidates | |

---

## Sign-off

| Role | Name | Date | GO / NO-GO |
|------|------|------|------------|
| Founder / Executive | | | |
| HR / Finance | | | |

**Conditions (if conditional):**
