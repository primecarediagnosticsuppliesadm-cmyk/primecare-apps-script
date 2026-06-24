# HQ SQL Migration Manifest

**Last updated:** 2026-06-24 (Engineering Green fix)  
**Owner:** HQ Engineering / Release Captain  
**Purpose:** Single source of truth for Production SQL deployment — what to apply, in what order, and what to skip.

---

## Deployment tracks (choose one)

| Track | When to use | Apply via |
|-------|-------------|-----------|
| **A — Manual manifest (recommended for Production)** | First Production cutover; matches QA certification | Supabase SQL Editor — files in §1 below, top to bottom |
| **B — Supabase CLI migrations** | Greenfield project using `supabase db push` only | `supabase/migrations/*.sql` (6 files) |

**Do not apply both tracks for the same objects.** Invoice phases, HQ profiles RLS, and orders date index exist in **both** `supabase/sql/` and `supabase/migrations/` — pick one track per environment.

**QA reference project:** `zipuzmfkwwucbchlphcj` — certified with **Track A** (manual manifest).

---

## §1 — Required Production migration order (Track A)

Apply in Supabase SQL Editor. Verify after each tier with scripts in §4.

| Order | Tier | File | Classification |
|------:|------|------|----------------|
| 1 | P0 PO foundation | `purchase_orders_migration.sql` | **ACTIVE MIGRATION** — CREATE `purchase_orders` / `purchase_order_items` (before any ALTER) |
| 2 | P0 Security | `production_auth_rls_pilot_migration.sql` | **ACTIVE MIGRATION** |
| 3 | P0 Security | `executive_distributor_ops_rls_migration.sql` | **ACTIVE MIGRATION** |
| 4 | P0 Tenant | `durable_distributor_tenants_migration.sql` | **ACTIVE MIGRATION** |
| 5 | P0 Tenant | `operations_center_users_rls_migration.sql` | **ACTIVE MIGRATION** |
| 6 | P0 Writes | `order_write_migration.sql` | **ACTIVE MIGRATION** |
| 7 | P0 Writes | `payment_write_migration.sql` | **ACTIVE MIGRATION** |
| 8 | P0 Writes | `inventory_ledger_migration.sql` | **ACTIVE MIGRATION** |
| 9 | P0 Writes | `executive_distributor_lab_create_migration.sql` | **ACTIVE MIGRATION** |
| 10 | P1 Qual | `lab_qualifications_migration.sql` | **ACTIVE MIGRATION** |
| 11 | P1 Qual | `lab_qualifications_pipeline_migration.sql` | **ACTIVE MIGRATION** |
| 12 | P1 Qual | `lab_contracts_migration.sql` | **ACTIVE MIGRATION** |
| 13 | P1 Qual | `commission_ledger_migration.sql` | **ACTIVE MIGRATION** |
| 14 | P1 Users | `user_provisioning_v1_migration.sql` | **ACTIVE MIGRATION** |
| 15 | P1 Users | `operations_center_agent_distributor_assignments_migration.sql` | **ACTIVE MIGRATION** |
| 16 | P1 Users | `user_provisioning_phase3a_roles_migration.sql` | **ACTIVE MIGRATION** |
| 17 | P1 Users | `user_provisioning_password_reset_event_migration.sql` | **ACTIVE MIGRATION** |
| 18 | P1 Users | `user_provisioning_phase3b_migration.sql` | **ACTIVE MIGRATION** |
| 19 | P1 Users | `user_provisioning_phase3c_lab_ownership_migration.sql` | **ACTIVE MIGRATION** |
| 20 | P1 Hardening | `pilot_hardening_agent_ownership_rls_migration.sql` | **ACTIVE MIGRATION** |
| 21 | P2 Support | `operational_evidence_storage_migration.sql` | **ACTIVE MIGRATION** |
| 22 | P2 Support | `notifications_foundation_migration.sql` | **ACTIVE MIGRATION** |
| 23 | P2 Support | `v_labs_credit_security_invoker_migration.sql` | **ACTIVE MIGRATION** |
| 24 | P2 Support | `executive_distributor_catalog_inventory_rls.sql` | **ACTIVE MIGRATION** |
| 25 | P2 Invoice | `invoice_system_phase1_migration.sql` | **ACTIVE MIGRATION** |
| 26 | P2 Invoice | `invoice_system_phase2_migration.sql` | **ACTIVE MIGRATION** |
| 27 | P2 Invoice | `invoice_system_phase3_migration.sql` | **ACTIVE MIGRATION** |
| 28 | P2 Invoice | `invoice_system_phase5_migration.sql` | **ACTIVE MIGRATION** |

**Apply note:** `purchase_orders_migration.sql` installs temporary `temp_anon_*` policies on PO tables; `production_auth_rls_pilot_migration.sql` (step 2) drops them and applies tenant-scoped authenticated RLS. Do not skip step 1 on greenfield databases.

**Machine verification:** `node scripts/verify-pilot-migrations.mjs` — expects 28/28 on disk.

---

## §2 — Track B — `supabase/migrations/` (CLI only)

| File | Equivalent in `supabase/sql/` | Classification |
|------|------------------------------|----------------|
| `20260624120000_hq_profiles_rls_tenant_scope.sql` | `hq_profiles_rls_tenant_scope_migration.sql` | **ACTIVE MIGRATION** (CLI) — **DO NOT APPLY** if Track A profile RLS already applied via manual file |
| `20260624120001_hq_orders_date_index.sql` | `hq_orders_date_index_migration.sql` | **ACTIVE MIGRATION** (CLI) |
| `20260624120002_invoice_system_phase1.sql` | `invoice_system_phase1_migration.sql` | **ACTIVE MIGRATION** (CLI) |
| `20260624120003_invoice_system_phase2.sql` | `invoice_system_phase2_migration.sql` | **ACTIVE MIGRATION** (CLI) |
| `20260624120004_invoice_system_phase3.sql` | `invoice_system_phase3_migration.sql` | **ACTIVE MIGRATION** (CLI) |
| `20260624120005_invoice_system_phase5.sql` | `invoice_system_phase5_migration.sql` | **ACTIVE MIGRATION** (CLI) |

**Note:** Track B does **not** include the full 27-file manifest. Production using Track B alone is **incomplete** — use Track A for full HQ pilot.

---

## §3 — Orphan / unlisted SQL files

| File | Classification | Production action |
|------|----------------|-------------------|
| `ar_reconcile_from_payments.sql` | **MANUAL VALIDATION** | **DO NOT APPLY** — one-off AR repair script |
| `collections_data_hygiene_diagnostics.sql` | **MANUAL VALIDATION** | **DO NOT APPLY** — diagnostics only |
| `collections_notes_migration.sql` | **REFERENCE SQL** | **DO NOT APPLY** unless Collections notes feature explicitly launched |
| `distributor_billing_migration.sql` | **LEGACY / ARCHIVE** | **DO NOT APPLY** — out of HQ pilot scope |
| `distributor_billing_payment_types_b4.sql` | **LEGACY / ARCHIVE** | **DO NOT APPLY** |
| `hq_orders_date_index_migration.sql` | **REFERENCE SQL** | **DO NOT APPLY** if Track A complete without it, or if `20260624120001` applied |
| `hq_profiles_rls_tenant_scope_migration.sql` | **REFERENCE SQL** | **DO NOT APPLY** if `production_auth_rls_pilot_migration.sql` + users RLS already applied, or if CLI `20260624120000` applied |
| `lab_catalog_view_tenant_join_migration.sql` | **REFERENCE SQL** | Apply only if `v_lab_catalog` tenant join missing — verify first |
| `lab_id_normalization_migration.sql` | **MANUAL VALIDATION** | **DO NOT APPLY** on fresh prod — one-time data fix |
| `operations_center_profiles_email_migration.sql` | **REFERENCE SQL** | Superseded by `user_provisioning_v1` on greenfield |
| `operations_center_profiles_identity_migration.sql` | **REFERENCE SQL** | Same |
| `operations_center_profiles_username_migration.sql` | **REFERENCE SQL** | Same |
| `operations_center_user_directory_backfill.sql` | **MANUAL VALIDATION** | **DO NOT APPLY** on greenfield — backfill only |
| `order_cross_module_sync_migration.sql` | **REFERENCE SQL** | Review if order sync triggers missing |
| `order_status_update_migration.sql` | **LEGACY / ARCHIVE** | Absorbed by `order_write_migration.sql` |
| `pilot_hardening_validation_queries.sql` | **MANUAL VALIDATION** | **DO NOT APPLY** — run as read-only checks |
| `qa_role_seed_and_rls_validation.sql` | **MANUAL VALIDATION** | **DO NOT APPLY** to Production — QA seed only |

---

## §4 — Post-migration validation scripts

Run from `primecare-portal/` after SQL apply (QA or Production):

```bash
node scripts/verify-pilot-migrations.mjs          # disk manifest 28/28
node scripts/verify-hq-rls-reads.mjs              # 4-role RLS reads
node scripts/verify-pilot-hardening-sql.mjs         # PH-10 temp_anon=0 (needs linked CLI)
node scripts/verify-primecare-production-golden-path.mjs
node scripts/verify-financial-reconciliation.mjs
node scripts/run-hq-predator-certification.mjs
node scripts/verify-invoice-phase3.mjs --remote   # PDF + storage
```

Manual SQL checks: `supabase/sql/pilot_hardening_validation_queries.sql` (read-only).

---

## §5 — Rollback / forward-fix

**Policy:** Prefer **forward-fix** SQL over destructive rollback (`HQ_PRODUCTION_ROLLBACK_PLAN.md`).

| Failure type | Action |
|--------------|--------|
| Bad RLS policy | Apply corrective `DROP POLICY` + restore prior policy from git history |
| Bad index | `DROP INDEX CONCURRENTLY IF EXISTS idx_orders_tenant_order_date;` only if planner regression confirmed |
| Invoice phase partial apply | Re-run phase migration (idempotent `DROP POLICY IF EXISTS`) |
| Full catastrophic migration | Supabase backup restore — see `HQ_BACKUP_RECOVERY_RUNBOOK.md` § Drill |

**Never** delete HQ tenant `f168b98f-47a6-42c3-b788-24c00436fac2` or Guntur tenant `787999b9-72f5-4163-a860-551c12ce3414` during rollback.

---

## §6 — Notifications migration status

| Item | Status |
|------|--------|
| `notifications_foundation_migration.sql` | **ACTIVE MIGRATION** — tier P2 #21 in manifest |
| In-app notifications | **PASS** — Predator Notifications module |
| Email/SMS/WhatsApp | **Placeholder channels only** — not Production-ready |

---

## §7 — Invoice phases 1–5 status

| Phase | File | Certified |
|-------|------|-----------|
| 1 — Schema + bucket skeleton | `invoice_system_phase1_migration.sql` | Yes |
| 2 — Creation engine | `invoice_system_phase2_migration.sql` | Yes |
| 3 — PDF + signed URL | `invoice_system_phase3_migration.sql` | Yes — golden path GP-30–32 |
| 4 — (skipped in numbering) | — | N/A |
| 5 — Payment allocation | `invoice_system_phase5_migration.sql` | Yes — golden path GP-40–42 |

---

## Engineering Green verification

| Check | Result |
|-------|--------|
| `purchase_orders_migration.sql` in manifest (before `production_auth`) | **PASS** |
| Invoice phases 1–5 in manifest | **PASS** |
| Notifications in manifest | **PASS** |
| Orphan files classified | **PASS** (17 files §3) |
| Production order unambiguous | **PASS** — Track A §1; Track B warning documented |
