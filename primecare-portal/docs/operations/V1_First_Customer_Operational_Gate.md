# PrimeCare v1.0 — First Customer Operational Gate

| Field | Value |
|-------|-------|
| Purpose | Executable Priority 1 checklist before first paying customer |
| Parent | `V1_Operational_Readiness_Execution.md` |
| Feature changes | **None** |

Complete all rows. Attach evidence (script logs, screenshots, dates). Sign at bottom.

---

## A. Environment & Auth

| # | Item | Evidence path / command | Done |
|---|------|-------------------------|------|
| A1 | Fill `HQ_PRODUCTION_ENV_CHECKLIST.md` (Vercel + Supabase) | Checklist signed | ☐ |
| A2 | Prod Auth Site URL + redirect URLs match Vercel domain | Supabase Auth settings | ☐ |
| A3 | Legacy Apps Script / Predator / QA flags off on prod | Vercel env | ☐ |
| A4 | Smoke login: executive, admin, lab, agent | Browser | ☐ |

## B. Migrations & RLS

| # | Item | Evidence | Done |
|---|------|----------|------|
| B1 | Confirm Track A / Sprint 3A migrations applied on prod | `HQ_SQL_MIGRATION_MANIFEST.md` | ☐ |
| B2 | Spot-check shipment/delivery columns present (GAP-BP-004) | SQL or fulfill smoke | ☐ |
| B3 | `node scripts/verify-hq-rls-reads.mjs` against prod/target | Log PASS | ☐ |
| B4 | `node scripts/verify-security-hardening.mjs` | Log PASS | ☐ |

## C. Backup & Restore (DR-01)

| # | Item | Evidence | Done |
|---|------|----------|------|
| C1 | Confirm Database Backups enabled in Supabase Dashboard | Screenshot / note | ☐ |
| C2 | Confirm PITR status (enabled or explicit waiver) | Dashboard | ☐ |
| C3 | Execute `Sprint3A_Restore_Verification_Checklist.md` once | Dated runbook entry | ☐ |
| C4 | Record observed RTO | `HQ_BACKUP_RECOVERY_RUNBOOK.md` | ☐ |

## D. Storage & Invoice PDF

| # | Item | Evidence | Done |
|---|------|----------|------|
| D1 | `invoice-pdfs` private bucket on prod | `HQ_STORAGE_HEALTH_CHECK.md` ST1–ST5 | ☐ |
| D2 | Edge `generate-invoice-pdf` deployed on prod | Supabase Functions | ☐ |
| D3 | Download one invoice PDF (bytes > 0) | Browser or GP-32 | ☐ |
| D4 | Operational evidence bucket policies present | OE1–OE2 | ☐ |

## E. Monitoring & Logging baseline

| # | Item | Evidence | Done |
|---|------|----------|------|
| E1 | `node scripts/verify-rc1-production-readiness.mjs` | CONDITIONAL GO or documented WARNs | ☐ |
| E2 | `node scripts/verify-production-monitoring.mjs` | MON-14/15 known; others PASS | ☐ |
| E3 | Confirm halt-on-verify-fail rule with on-call | `HQ_ALERTING_RUNBOOK.md` | ☐ |
| E4 | Optional: set `VITE_ALERT_WEBHOOK_URL` / Sentry (GA preferred) | Env | ☐ |

## F. Certification & scope

| # | Item | Evidence | Done |
|---|------|----------|------|
| F1 | Inventory signed browser UAT / sign-off | `docs/QA/modules/inventory/Certification_Signoff_Template.md` | ☐ |
| F2 | Purchase signed browser UAT / sign-off | `docs/QA/modules/purchase/Certification_Signoff_Template.md` | ☐ |
| F3 | Golden-lab-only finance KPI rule written | Pilot scope memo | ☐ |
| F4 | Customer brief: no transactional email/SMS | Comms | ☐ |
| F5 | Ops trained on `V1_Critical_Workflow_Recovery_SOP.md` | Attendance | ☐ |

## G. Golden path smoke (target env)

| # | Item | Evidence | Done |
|---|------|----------|------|
| G1 | `npm run build` PASS | CI / local | ☐ |
| G2 | `node scripts/verify-operational-readiness-pack.mjs` GO | Log | ☐ |
| G3 | Golden path (read-only or supervised write) | `verify-primecare-production-golden-path.mjs` | ☐ |
| G4 | `verify-no-finance-mutation.mjs` GO | Log | ☐ |

---

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Engineering | | | ☐ GO ☐ CONDITIONAL GO ☐ NO-GO |
| Operations | | | ☐ GO ☐ CONDITIONAL GO ☐ NO-GO |
| Product / Founder | | | ☐ GO ☐ CONDITIONAL GO ☐ NO-GO |

**First customer may start only with Engineering + Operations GO (or CONDITIONAL GO with written waivers).**
