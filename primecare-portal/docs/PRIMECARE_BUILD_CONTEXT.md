# PrimeCare Build Context

Shared reference for **Cursor** and **ChatGPT** to stay aligned on business model, architecture, source-of-truth rules, and build priorities.

**Last updated:** 2026-05-28  
**Scope:** `primecare-portal` (Year-1 Hardening Sprint)

---

## 1. PrimeCare business model

PrimeCare is a **HQ-operated B2B platform** for diagnostic distributor operations.

| Principle | Year-1 reality |
|-----------|----------------|
| **Who operates the platform** | PrimeCare HQ — not distributors |
| **Distributor OS** | HQ-operated console for managing distributor entities |
| **What distributors are** | Business entities (tenants) with catalog, labs, contracts, orders — **not** self-service SaaS users |
| **Distributor users** | **Future** — no distributor login, admin, or finance users in Year-1 |

### Explicitly future (do not build in Year-1)

- Distributor admin portal
- Distributor finance user
- Distributor self-service auth
- Password reset for distributor users
- User invitations
- Role management for distributor staff

HQ staff (executive, admin, agent) operate all distributor workflows centrally.

---

## 2. Year-1 goal

Launch and operate distributors end-to-end with founder visibility:

1. **Launch distributors** — provision tenant, catalog, isolation, labs, contracts, activation
2. **Assign catalog** — HQ pricing on master/distributor catalog
3. **Add labs** — lab entities under each distributor
4. **Create contracts** — lab commercial terms (L1A, L1B, Lab OS, Hybrid)
5. **Drive orders** — order creation and fulfillment workflow
6. **Collect money** — collections / AR against labs
7. **Calculate commissions** — distributor commission from collections
8. **Track PrimeCare billing** — HQ billing against distributors
9. **Give founder visibility** — portfolio health, strategy KPIs, launch gates

Success = durable data in Supabase, tenant isolation verified, Predator green, `npm run build` passes.

---

## 3. Current architecture

### Platform surfaces

| Module | Purpose |
|--------|---------|
| **PrimeCare HQ OS** | Executive command center, provisioning, portfolio |
| **Distributor OS** | Per-distributor ops: dashboard, catalog, labs, contracts, orders, collections, billing, launch |
| **Master Catalog** | HQ product master |
| **Distributor Catalog** | Tenant-scoped catalog with HQ pricing |
| **Labs** | Lab entities + AR credit control |
| **Orders** | Order headers and line items |
| **Collections** | Payments against AR |
| **Contracts** | Lab commercial contracts (`labContract*` module) |
| **Commissions** | Commission calculation and ledger |
| **Billing** | PrimeCare ↔ distributor billing display |
| **Predator** | Automated validation / health checks |

### Routing

- State-based routing via `App.jsx` → `PrimeCareWebPortal.jsx`
- Menu config in `menuConfig.js`
- Some routes are hidden from sidebar but remain routable (e.g. `labContractEngine`, `distributorProvisioning`)

### Activation gates (distributor launch)

All required before distributor status **ACTIVE**:

- `durable_tenant`
- `catalog_configured`
- `catalog_hq_pricing_configured`
- `isolation_verified`
- `at_least_one_lab`
- `contract_configured`

Post-activation ops (`canDistributorOperate`) additionally require non-expired **distributor platform** dates in `tenants.metadata.config` — separate from lab contracts.

---

## 4. Source of truth rules

### Supabase = durable business records

| Domain | Target SoT | Current SoT |
|--------|--------------|-------------|
| Tenants / distributors | `tenants` | Supabase (+ localStorage fallback) |
| Catalog / products | `products`, `inventory`, `tenants.metadata` | Supabase |
| Labs | `labs`, `ar_credit_control` | Supabase |
| Orders | `orders`, `order_items` | Supabase |
| Collections | `payments` | Supabase |
| Operational evidence | `operational_evidence` + Storage | Supabase |
| **Contracts** | `lab_contracts` (planned) | **localStorage** `primecare_lab_contract_registry_v1:{tenantId}` |
| **Commissions** | TBD table | **localStorage** `primecare_commission_ledger_v1:{tenantId}` |
| **PrimeCare billing** | TBD ledger | **Display-only** from `tenants.metadata.config` |

### localStorage — allowed uses only

- UI state (active tab, filters, drawer open)
- Draft carts / unsaved form state
- **Temporary** one-time migration fallback (read once, upsert to Supabase, mark migrated)
- Dev-only cache (must not be authoritative after migration)

### localStorage — must not remain SoT for

- Contracts
- Commission approval / payout ledger
- PrimeCare billing payments / ledger
- Any record that must survive browser refresh, device change, or multi-user HQ access

### Distinction: two contract concepts

| Concept | Storage | Used for |
|---------|---------|----------|
| **Lab commercial contract** | `labContract*` → moving to `lab_contracts` | Per-lab terms, margins, L1B, launch gate `contract_configured` |
| **Distributor platform agreement** | `tenants.metadata.config` (`contractStartDate`, `contractEndDate`) | Distributor lifecycle expiry, `canDistributorOperate` |

Do not merge these into one table.

---

## 5. Current known gaps

| Gap | Impact | Priority |
|-----|--------|----------|
| **Contracts localStorage-only** | No cross-browser durability; gate reads local registries | P0 |
| **PrimeCare billing — no real ledger** | `billingCollected` display-only; no payment write path | P0 |
| **Commission ledger localStorage-only** | Approval/payout state lost across browsers | P0 |
| **Isolation coverage gaps** | Some tables not in `tenantIsolationManifest` | P1 |
| **Founder dashboards overlap** | Multiple engines read overlapping metrics | P1 |
| **Admin `operationsCenter` route** | Menu key exists; no route case in `PrimeCareWebPortal.jsx` | P2 fix |
| **Dual-registry contract pattern** | HQ + per-distributor localStorage keys; migration must dedupe | P0 risk |

---

## 6. Build workflow

**Before any build**, follow this sequence:

```
1. Cursor inspects current code
   → files, tables, object shapes, consumers, RLS patterns

2. Cursor reports
   → source of truth today vs target
   → risks, migration strategy, files to touch

3. ChatGPT reviews business fit
   → Year-1 model alignment
   → gate rules, naming, scope boundaries

4. Final build prompt is created
   → explicit acceptance criteria
   → do-not-build guardrails

5. Implementation begins
   → only after plan is confirmed safe
```

### Inspection checklist (Cursor)

- [ ] Files involved and call graph
- [ ] Current object shape vs proposed schema
- [ ] localStorage keys and migration dedupe rules
- [ ] RLS policies aligned with `is_admin_or_executive()`, `tenant_id_matches()`, `can_write_ops_for_tenant()`
- [ ] Launch gates and stage progress consumers
- [ ] Predator steps to add/update
- [ ] Async vs sync data loading impacts

### Review checklist (ChatGPT)

- [ ] Matches HQ-operated Year-1 model
- [ ] No distributor self-service scope creep
- [ ] Gate rules match business intent
- [ ] Table naming avoids concept collision
- [ ] Acceptance criteria testable

---

## 7. Near-term build priorities

### P0 — Data durability (Hardening Sprint Phase 1)

| Item | Target | Notes |
|------|--------|-------|
| **Durable contracts** | `public.lab_contracts` | Not `distributor_contracts` — lab-scoped commercial terms |
| **PrimeCare billing ledger** | Supabase table + write UI | Real payment recording, not config display only |
| **Commission ledger** | Supabase table | Replace `primecare_commission_ledger_v1` |

**Contract migration specifics (approved direction):**

- Table: `lab_contracts`
- Gate `contract_configured`: ≥1 non-terminated contract per `distributor_id` (`status NOT IN ('Terminated', 'Expired')`)
- Migrate all `primecare_lab_contract_registry_v1:*` keys (HQ + distributor buckets)
- One-time localStorage fallback; mark migrated; Predator validates

### P1 — Consolidation & intelligence

- Founder dashboard consolidation (single source for portfolio KPIs)
- Distributor profitability views
- Contract renewal intelligence (expiry alerts, auto-renewal tracking)

### P2 — Distributor self-service (future)

- Distributor user login
- Distributor admin portal
- Distributor finance user
- Password reset
- User invitations
- Role management

---

## 8. Do-not-build-now list

Do **not** implement unless explicitly requested and P2-approved:

- Distributor self-service login
- Distributor admin portal
- Distributor finance user
- Password reset (distributor users)
- User invitations
- Role management (distributor-scoped)
- AI / chat features
- Duplicate modules without documented justification
- New activation gates for distributor users (`admin_user`, `roles_configured`, `users_roles` — removed in V3)

---

## 9. Acceptance rules

Every build must satisfy:

| Check | Requirement |
|-------|-------------|
| **Build** | `npm run build` passes with no errors |
| **Source of truth** | New durable records read/write Supabase; localStorage not authoritative |
| **Tenant isolation** | Rows scoped by `distributor_id` / `tenant_id`; manifest updated if new table |
| **Predator** | Add/update validators when touching gates, storage, or isolation |
| **No data leakage** | HQ queries do not expose other tenants' data to wrong roles; probe in Predator |
| **No duplicate modules** | Extend existing engines/APIs unless split is justified in build prompt |
| **Migration idempotency** | Re-run safe; no duplicate rows; migration status visible in Predator/debug |

### Standard acceptance (contracts example)

- Contract creates in Supabase
- Contract persists across refresh / new browser
- `contract_configured` launch gate reads Supabase
- Stage bar shows Contract stage
- Distributor OS Contracts tab works
- localStorage is no longer source of truth
- Predator passes contract persistence steps
- `npm run build` passes

---

## 10. Key file locations (quick reference)

| Area | Path |
|------|------|
| Contracts module | `src/labContract/` |
| Distributor OS | `src/distributor/`, `src/pages/DistributorOsPage.jsx` |
| Provisioning / gates | `src/distributor/distributorProvisioningEngine.js` |
| Stage progress | `src/distributor/distributorStageEngine.js` |
| Supabase API | `src/api/primecareSupabaseApi.js` |
| RLS migrations | `supabase/sql/` |
| Predator validators | `src/predator/validators/` |
| Tenant isolation | `src/tenant/tenantIsolationManifest.js` |
| QA checklist | `qa/YEAR1_COMMAND_CENTER_CHECKLIST.md` |

---

## 11. Document maintenance

Update this file when:

- A P0 gap is closed (move from §5 to resolved note in §7)
- Source-of-truth rules change for a domain
- New do-not-build items are added
- Activation gates or Year-1 model assumptions change

Related docs:

- `docs/PRIMECARE_OPERATIONAL_READINESS_REPORT.md`
- `docs/OPERATIONAL_EVIDENCE_STORAGE.md`
- `qa/YEAR1_COMMAND_CENTER_CHECKLIST.md`
