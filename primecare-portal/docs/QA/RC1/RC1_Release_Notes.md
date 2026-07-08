# PrimeCare RC1 — Release Notes

**Version:** Release Candidate 1 (RC1)  
**Date:** 2026-07-08  
**Codename:** Pilot Certification  
**Feature freeze:** Active — no new modules or schema in RC1

---

## Summary

RC1 certifies PrimeCare for a **supervised single-HQ diagnostics distribution pilot**. This release consolidates platform navigation (Phase 9.1), introduces the Founder Operating System decision cockpit (Phase 9.2, compose-only), and expands Commercial CRM workspace (read-compose over existing qual/visit/contract data). Core O2C, payroll preview, and compensation preview paths are automated-certified on QA.

---

## What's Included

### Platform (9.1)
- Unified executive workspace navigation (EXECUTIVE / OPERATIONS / PEOPLE / GROWTH / PLATFORM)
- Production Readiness dashboard
- Deep-link-only keys hidden from global nav
- KPI/report ownership registry

### Founder OS (9.2)
- Founder Operating System page — Today, Revenue, Collections, Ops, People, Risks, Approvals
- Decision queue, insights, priorities engines (read-compose)
- Global search over existing HQ reads

### Commercial (9.0)
- Commercial CRM workspace — pipeline, activities, lab 360 drawer
- No new CRM schema; reuses `lab_qualifications`, visits, contracts

### People Operations (8.x)
- Enterprise shell, budgeting, ownership explorer, productivity widgets
- Payroll/compensation preview — no finance mutation

### Certified Core Flows
- Golden path: Qual → Order → Invoice → Payment → Allocation
- Admin: Orders, Credit & Risk, Labs, Operations Center
- Financial reconciliation (golden labs clean)

---

## What's Not in RC1

- New database tables or business logic engines
- Projection engine live mode (shadow/opt-in only)
- Distributor pilot launch roles
- Full mobile agent experience
- Supplier master entity
- AR backfill for all legacy labs

---

## Upgrade / Deploy Notes

1. Deploy from `qa` branch after RC1 sign-off
2. Confirm `VITE_SUPABASE_URL` has no `/rest/v1` suffix (GAP-002)
3. Run `node scripts/audit-rc1-certification.mjs` post-deploy
4. Complete Human UAT matrix before customer access

---

## Verification

```bash
npm run build
node scripts/audit-rc1-certification.mjs
```

---

## Support

See `RC1_Support_Runbook.md` and `RC1_Known_Issues.md`.
