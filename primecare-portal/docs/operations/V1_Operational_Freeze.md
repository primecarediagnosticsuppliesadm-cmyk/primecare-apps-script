# PrimeCare v1.0 — Operational Freeze Pack

| Field | Value |
|-------|-------|
| Date | 2026-07-12 |
| Gate | **ALLOWED** — freeze prep / docs only |
| Feature stance | Year-1 development **COMPLETE** — frozen except bugs, security, compliance |
| Forbidden | New modules · redesign · ERP expansion · dashboards · reports · Supplier Master · Distributor OS · CRM |

**Mission:** Identify only production bugs, security, performance, integrity, reliability, configuration, and deployment issues. No new functionality suggestions.

**Evidence base:** RC1 GO/NO-GO · RC1 Known Issues · RC8 ops report · Admin CERT-004 · Operational Readiness Execution · Inventory/Purchase CONDITIONAL Gold · Business Simulation.

---

## Production Readiness Verdict

| Audience | Verdict |
|----------|---------|
| Supervised single-HQ pilot (golden labs, trained ops) | **CONDITIONAL GO** |
| Unrestricted production GA | **NO-GO** |

### Overall freeze stance

# **CONDITIONAL GO** — freeze feature work now; clear P0 operator gates before first unsupervised customer

After Gold/pilot sign-off: change only **bug fixes**, **security fixes**, and **compliance updates**.

---

## 1. Production Freeze Checklist

Complete before calling the codebase “production frozen.”

### Feature freeze (immediate)

- [x] Year-1 feature development declared COMPLETE
- [x] No new modules / dashboards / Supplier / Distributor OS / CRM expansion authorized
- [ ] Founder / Product countersign on freeze (record date below)
- [ ] Engineering: reject PRs that add screens, workflows, or ERP scope

**Freeze countersign:** _________________ Date: _______

### Certification freeze gates

- [ ] Inventory signed browser UAT (`docs/QA/modules/inventory/Certification_Signoff_Template.md`)
- [ ] Purchase signed browser UAT (`docs/QA/modules/purchase/Certification_Signoff_Template.md`)
- [ ] First-customer operational gate signed (`docs/operations/V1_First_Customer_Operational_Gate.md`)

### Runtime freeze gates (prod)

- [ ] `HQ_PRODUCTION_ENV_CHECKLIST.md` executed on prod
- [ ] Prod RLS smoke (`verify-hq-rls-reads.mjs`) PASS
- [ ] Prod migrations confirmed (`HQ_SQL_MIGRATION_MANIFEST.md`)
- [ ] DR-01 restore drill dated in `HQ_BACKUP_RECOVERY_RUNBOOK.md`
- [ ] Invoice PDF smoke on prod (`HQ_STORAGE_HEALTH_CHECK.md`)
- [ ] Golden-lab-only KPI rule enforced operationally
- [ ] Predator / QA tools off on prod (`VITE_PREDATOR_DEBUG=false`, etc.)

### Allowed after freeze

| Allowed | Not allowed |
|---------|-------------|
| Bug fixes with verify + UAT | New modules / pages |
| Security / RLS patches (approved) | New dashboards / reports |
| Compliance / legal text | Supplier Master / Approvals / CRM |
| Dependency CVE patches | UX redesign / architecture rewrite |

---

## 2. Bug List (production-relevant only)

| ID | Sev | Area | Issue | Evidence | Freeze action |
|----|-----|------|-------|----------|---------------|
| **FZ-P0-01** | **P0** | Ops | DR restore drill not executed | DR-01 / RC1 Known Issues | Block GA until drill |
| **FZ-P0-02** | **P0** | Config | Prod env checklist not executed | `HQ_PRODUCTION_ENV_CHECKLIST.md` | Block first customer on prod |
| **FZ-P0-03** | **P0** | Integrity | PO receive multi-step; no PURCHASE_IN idempotency RPC | Admin CERT-004 | SOP + single-click; eng fix only if Founder elevates |
| **FZ-P0-04** | **P0** | Integrity | Fulfill does not roll back if invoice/shipment fails | Blueprint `05_Order_Lifecycle` | SOP mandatory; do not redesign |
| **FZ-P1-01** | **P1** | Finance trust | Legacy AR / collection inconsistencies on non-golden labs | AR-LEGACY / MON-15 | Golden-lab KPI only |
| **FZ-P1-02** | **P1** | Deploy | Prod migration / shipment column drift risk | GAP-BP-004 | Confirm schema on prod |
| **FZ-P1-03** | **P1** | Reliability | Lab checkout client 90s idempotency; no server TTL | GAP-BP-016 | Monitor duplicates; eng only if elevated |
| **FZ-P1-04** | **P1** | Field | Agent offline — no durable queue | RC1 Production Readiness | Ops discipline; no feature in freeze |
| **FZ-P1-05** | **P1** | Cert | Inventory/Purchase Gold unsigned | Certification packs | Sign UAT |
| **FZ-P1-06** | **P1** | UX trust | Edge CORS `*` on provision/reset functions (`generate-invoice-pdf` uses request origin) | RC8 P1-6 | Accept with JWT; harden later |
| **FZ-P1-07** | **P1** | Customer | No transactional email | notification placeholders | Expectation brief (not a build) |
| **FZ-P2-01** | **P2** | Perf | MON-14 orders/payments scale FAIL at 100k | RC1 Performance | Pilot volume OK |
| **FZ-P2-02** | **P2** | Perf | Large bundles (predator-tools); god pages | RC1 Performance | Keep Predator off prod |
| **FZ-P2-03** | **P2** | Perf | Unbounded / soft-bound HQ reads (Ops profiles, some SELECT *) | Sprint5 / Admin cert | Monitor; no rewrite in freeze |
| **FZ-P2-04** | **P2** | Observability | Sentry / uptime / paging not wired | HQ_MONITORING_PLAN | Config only when ready |
| **FZ-P3-01** | **P3** | Debt | Dual order line tables | GAP-BP-002 | Document only |
| **FZ-P3-02** | **P3** | Debt | Dual migration tracks / orphan SQL | RC8 P1-3 | Manifest discipline |
| **FZ-P3-03** | **P3** | Debt | `verify-procurement-inventory-flow.mjs` `@/` Node import | CHANGELOG | Tooling; not UX fail |
| **FZ-P3-04** | **P3** | Debt | God components LOC | RC1 Performance | No refactor in freeze |
| **FZ-P3-05** | **P3** | Debt | GAP-008 legacy Apps Script console noise | Known Issues | Ignore |

**No Category “missing ERP feature” items** — out of scope for freeze.

---

## 3. Security Checklist

| # | Check | Status | Evidence / action |
|---|-------|--------|-------------------|
| S1 | Supabase Auth + pilot role gate | **QA PASS** | `rolePermissionMatrix` / RC1 agent closure |
| S2 | Cross-tenant password reset guard | **PASS** | `verify-security-hardening.mjs` SEC-03 |
| S3 | HQ RLS reads (admin/agent/lab) | **QA PASS** · prod open | `verify-hq-rls-reads.mjs` |
| S4 | Pilot hardening SQL | **QA PASS** | `verify-pilot-hardening-sql.mjs` |
| S5 | Service role key never in Vercel client env | **Required** | Env checklist S5 |
| S6 | Legacy Apps Script disabled on prod | **Required** | `VITE_ENABLE_LEGACY_APPS_SCRIPT` unset/false |
| S7 | Predator / QA tooling hidden on prod | **Required** | Env flags |
| S8 | Invoice PDF bucket private + signed URLs | **QA PASS** · prod open | Storage health check |
| S9 | Edge CORS `*` on provision/reset | **Accepted risk** | JWT-required; PDF fn uses Origin; track FZ-P1-06 |
| S10 | No secrets in git | **PASS** | Repo hygiene |
| S11 | Freeze write policy / HQ release policy | **Present** | `hqReleasePolicy.js` + verify |
| S12 | Distributor OS out of pilot | **WAIVED** | PILOT_LAUNCH_ROLES |

**Security freeze rule:** Any RLS / auth / storage policy change requires Founder/security approval + re-run S3–S8.

---

## 4. Performance Checklist

| # | Check | Status | Freeze action |
|---|-------|--------|---------------|
| P1 | Golden-path / pilot volume latency acceptable | **PASS** (RC1) | Proceed supervised |
| P2 | MON-14 100k scale | **FAIL** | Do not claim enterprise scale |
| P3 | Bounded reads on payments/PO lists | **Partial PASS** | Keep bounds; no SELECT * expansion |
| P4 | Predator bundle size | **WARN** | Ensure not loaded in prod nav |
| P5 | Collections / Agent large pages | **Debt** | No rewrite during freeze |
| P6 | Founder/EFI timeouts without tenant pushdown | **Documented** | Golden labs; avoid polluted tenants |
| P7 | Build chunk warnings | **WARN** | Accept for freeze |

**Performance freeze rule:** No performance “platform rewrite.” Only targeted bugfixes with measure-before/after.

---

## 5. Deployment Checklist

| # | Step | Owner | Done |
|---|------|-------|------|
| D1 | Tag release commit on `qa` / release branch | Eng | ☐ |
| D2 | `npm run build` PASS | Eng | ☐ |
| D3 | `verify-scripts-readonly.mjs` PASS | Eng | ☐ |
| D4 | `verify-rc1-production-readiness.mjs` CONDITIONAL GO or documented WARNs | Eng | ☐ |
| D5 | `verify-operational-readiness-pack.mjs` GO | Eng | ☐ |
| D6 | `verify-no-finance-mutation.mjs` GO | Eng | ☐ |
| D7 | Apply prod migrations per manifest (order) | Eng | ☐ |
| D8 | Deploy edge fns: provision, reset-password, generate-invoice-pdf | Eng | ☐ |
| D9 | Fill `HQ_PRODUCTION_ENV_CHECKLIST.md` | Eng | ☐ |
| D10 | Vercel prod: Predator/QA flags off; `VITE_APP_ENV=prod` | Eng | ☐ |
| D11 | Smoke: executive / admin / lab / agent login | Eng | ☐ |
| D12 | Smoke: invoice PDF download | Eng | ☐ |
| D13 | Record prior Vercel deployment ID (rollback) | Eng | ☐ |
| D14 | On-call has `RC1_Rollback_Plan.md` + `RC1_Recovery_Checklist.md` | Ops | ☐ |
| D15 | DR drill dated OR written waiver with Founder | Eng + Founder | ☐ |
| D16 | Update `RC1_GO_NO_GO.md` / this pack with prod sign-off | Product | ☐ |

---

## 6. Data Integrity & Reliability (summary)

| Risk | Sev | Mitigation under freeze |
|------|-----|-------------------------|
| Receive non-transactional | P0 | SOP — no double-click; escalate before retry |
| Fulfill non-atomic invoice/shipment | P0 | SOP — manual invoice/dispatch recovery |
| Legacy AR outside golden labs | P1 | KPI scope lock |
| Dual line tables | P3 | Do not expand dual-read paths |
| Payment compensating rollback | OK | Keep; do not alter allocation RPCs without approval |

---

## 7. Production configuration issues (open)

| Item | Status |
|------|--------|
| Prod Supabase/Vercel values filled | Open (template) |
| PITR / backup confirmation | Open (DR-01) |
| Monitoring webhook / Sentry DSN | Optional for pilot; required posture for GA |
| Auth Site URL / redirects on prod | Open until env checklist |

---

## Explicit non-goals (rejected for freeze)

- Supplier Management  
- Distributor OS expansion  
- CRM / leads schema  
- New dashboards or reports  
- UX redesign / workspace split  
- Approvals workflow  
- Explainability Constitution cards (unless Founder elevates as bug)

---

## Related artifacts

- `docs/operations/V1_Operational_Readiness_Execution.md`  
- `docs/operations/V1_First_Customer_Operational_Gate.md`  
- `docs/operations/V1_Critical_Workflow_Recovery_SOP.md`  
- `docs/QA/RC1/RC1_GO_NO_GO.md`  
- `docs/QA/RC1/RC1_Known_Issues.md`  
- `docs/operations/HQ_PRODUCTION_ENV_CHECKLIST.md`  

**STOP.** No feature work. Execute freeze checklist items only.
