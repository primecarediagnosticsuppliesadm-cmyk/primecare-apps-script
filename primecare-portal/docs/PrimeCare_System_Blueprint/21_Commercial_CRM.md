# 21 — Commercial CRM & Lab Growth Platform

Years 1–3 commercial workspace for PrimeCare’s Diagnostics Distribution Operating System.

**PrimeCare is not Salesforce / HubSpot.** This phase **composes** existing commercial modules into one HQ workspace. It does **not** invent a parallel CRM schema.

---

## Architecture discovery (mandatory)

| Existing module | SoT | Role in Phase 9 |
|-----------------|-----|-----------------|
| Labs lifecycle | `labs.status` (PROSPECT / ACTIVE / INACTIVE) | Account master |
| Qualification pipeline | `lab_qualifications.pipeline_stage` | Pre-contract pipeline |
| Agent visits | `agent_visits` | Activities / meetings |
| Lab contracts | `lab_contracts` | Contract / activation / renewal |
| Business ownership | `lab_ownership` + People Ops 8.4 read façade | Owner / territory context |
| Revenue Funnel | `revenueFunnelEngine` (read-only) | Conversion / post-qual integrity |
| Collections / Orders | Existing O2C pages | Deep-links only — **no mutation** |
| Ops Command Center | Action queue | Exception work items |

**Not found (do not invent without approval):** leads table, quotes/quotations table, meetings calendar object, Salesforce Activities clone.

**Sample capture (Year-1):** optional fields on `lab_product_intelligence` (requested/issued SKU/qty/date) — **not** a samples shipment object or kit catalog. Pipeline `sample_sent` remains lab-level qualification stage only.

### Canonical commercial pipeline (UI mapping → existing SoT)

| Commercial stage | Existing source |
|------------------|-----------------|
| Prospect | `labs.status=PROSPECT` and/or pipeline `new` |
| Qualified | pipeline `qualified` |
| Meeting Scheduled | pipeline `contacted` + visit / follow-up signals |
| Sample Sent | pipeline `sample_sent` |
| Quotation Sent | pipeline negotiation proxy (no quotes SoT — labeled) |
| Negotiation | pipeline `negotiation` / `reagent_rental_discussion` |
| Contract Review | `lab_contracts` status Under Review |
| Activated | pipeline `won` and/or Active contract |
| Customer | ACTIVE lab + Active contract |
| Lost | pipeline `lost` |

---

## Product module

```
Commercial (page key: commercialCrm)
├── Dashboard
├── Pipeline
├── Labs (Lab commercial 360)
├── Activities
├── Contracts
├── Forecast
└── Reports
```

Reads only from existing APIs:

- `getQualificationReviewRead`
- `loadVisibleLabContracts`
- `fetchAgentVisitsBoundedRows` / `getLabVisitsRead`
- Ownership façade (optional context)
- Revenue funnel widgets via deep-link / light reuse

**Writes** remain on Qualification Review, Visits wizard, Contract engine, Ops ownership — Commercial Workspace does not duplicate mutation paths in Phase 9.0.

---

## Explicitly out of scope

Payroll, compensation engines, finance mutations, orders lifecycle, payments, AR, inventory, People Ops payroll modules, RLS changes, new CRM tables.

---

## Verification

- `verify-commercial-dashboard.mjs`
- `verify-commercial-pipeline.mjs`
- `verify-commercial-lab360.mjs`
- `verify-commercial-forecast.mjs`
- `verify-commercial-activities.mjs`
- `verify-commercial-reuse.mjs`
- `audit-phase-9-certification.mjs`
