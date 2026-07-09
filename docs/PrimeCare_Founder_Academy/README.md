# PrimeCare Founder Academy

Founder-friendly guides that explain how PrimeCare works in **business language** — not developer language.

These documents are for founders, executives, and business stakeholders who need to understand **what the system does**, **why it exists**, and **how to verify it** during UAT.

---

## What this folder is

| Document | Who it's for | What you'll learn |
|----------|--------------|-------------------|
| [01_PrimeCare_Enterprise_Map.md](./01_PrimeCare_Enterprise_Map.md) | Founder, board, new executives | How PrimeCare modules fit together across Commercial, Operations, Finance, People, and Founder OS |
| [02_People_Operations_Business_Walkthrough.md](./02_People_Operations_Business_Walkthrough.md) | Founder, HR, finance partners | The full People Operations story: employees → pay → approval, with a realistic field example |
| [03_People_Operations_UAT_Guide.md](./03_People_Operations_UAT_Guide.md) | Founder, QA, pilot leads | Step-by-step UAT checklist for every People Operations tab |
| [04_RC5_Founder_UX_UAT_Checklist.md](./04_RC5_Founder_UX_UAT_Checklist.md) | Founder, HR, Finance | RC5 business-language UX sign-off (warnings, help, empty states) |

---

## How to read these docs

1. Start with **01 — Enterprise Map** if you are new to PrimeCare or need the big picture.
2. Read **02 — Business Walkthrough** before your first live demo of People Operations.
3. Use **03 — UAT Guide** when you are ready to sign off on People Operations v1.0.
4. Use **04 — RC5 UAT** after the Founder UX language pass to confirm every page is understandable in ~5 minutes.

---

## Important boundaries (plain English)

- **People Operations** manages workforce, compensation plans, and payroll **for HQ field teams**. It does **not** replace Finance, Collections, or Operations Center.
- **People Operations never changes** orders, invoices, payments, receivables, or inventory. It **reads** collection data to calculate commission; it does not record payments.
- **Payroll approval** in People Operations is an internal HQ workflow. Marking a run as "paid" is **evidence only** — it does not send money to a bank or post to accounting (those are future phases).

---

## Technical reference (for your team)

For engineering truth, schema, and verification scripts, see:

- `docs/PrimeCare_System_Blueprint/20_People_Operations.md`
- `docs/PrimeCare_System_Blueprint/19_Executive_Compensation_Payroll_Engine.md`
- `docs/PrimeCare_System_Blueprint/13_Verification_Matrix.md`

---

## Version

| Item | Value |
|------|-------|
| Product area | People Operations v1.0 |
| Audience | Founder / Executive |
| Last updated | July 2026 |
| Status | Founder Academy + RC5 Founder UX (UI copy only; no schema/API/logic changes) |
