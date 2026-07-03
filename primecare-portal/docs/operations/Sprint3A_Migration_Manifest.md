# Sprint 3A Migration Manifest

Generated: 2026-07-03T03:11:59.002Z

| Track | Count | Path |
|-------|------:|------|
| A — manual `supabase/sql/` | 53 | Track A per HQ_SQL_MIGRATION_MANIFEST.md |
| B — CLI `supabase/migrations/` | 23 | `supabase db push` |

## Duplicate / overlap candidates

- **hq_orders_date_index.sql**: `supabase/sql/hq_orders_date_index_migration.sql` ↔ `supabase/migrations/20260624120001_hq_orders_date_index.sql`
- **hq_profiles_rls_tenant_scope.sql**: `supabase/sql/hq_profiles_rls_tenant_scope_migration.sql` ↔ `supabase/migrations/20260624120000_hq_profiles_rls_tenant_scope.sql`
- **invoice_system_phase1.sql**: `supabase/sql/invoice_system_phase1_migration.sql` ↔ `supabase/migrations/20260624120002_invoice_system_phase1.sql`
- **invoice_system_phase2.sql**: `supabase/sql/invoice_system_phase2_migration.sql` ↔ `supabase/migrations/20260624120003_invoice_system_phase2.sql`
- **invoice_system_phase3.sql**: `supabase/sql/invoice_system_phase3_migration.sql` ↔ `supabase/migrations/20260624120004_invoice_system_phase3.sql`
- **invoice_system_phase5.sql**: `supabase/sql/invoice_system_phase5_migration.sql` ↔ `supabase/migrations/20260624120005_invoice_system_phase5.sql`
- **sprint2_domain_projections_phase1.sql**: `supabase/sql/sprint2_domain_projections_phase1_migration.sql` ↔ `supabase/migrations/20260705120000_sprint2_domain_projections_phase1.sql`

## SQL-only (not in migrations/)

- `supabase/sql/ar_reconcile_from_payments.sql`
- `supabase/sql/collections_data_hygiene_diagnostics.sql`
- `supabase/sql/collections_notes_migration.sql`
- `supabase/sql/commission_ledger_migration.sql`
- `supabase/sql/create_lab_with_ar_credit_rpc.sql`
- `supabase/sql/distributor_billing_migration.sql`
- `supabase/sql/distributor_billing_payment_types_b4.sql`
- `supabase/sql/durable_distributor_tenants_migration.sql`
- `supabase/sql/executive_distributor_catalog_inventory_rls.sql`
- `supabase/sql/executive_distributor_lab_create_migration.sql`
- `supabase/sql/executive_distributor_ops_rls_migration.sql`
- `supabase/sql/inventory_ledger_migration.sql`
- `supabase/sql/lab_catalog_view_tenant_join_migration.sql`
- `supabase/sql/lab_contracts_migration.sql`
- `supabase/sql/lab_id_normalization_migration.sql`
- `supabase/sql/lab_qualifications_migration.sql`
- `supabase/sql/lab_qualifications_pipeline_migration.sql`
- `supabase/sql/notifications_foundation_migration.sql`
- `supabase/sql/operational_evidence_storage_migration.sql`
- `supabase/sql/operations_center_agent_distributor_assignments_migration.sql`
- `supabase/sql/operations_center_profiles_email_migration.sql`
- `supabase/sql/operations_center_profiles_identity_migration.sql`
- `supabase/sql/operations_center_profiles_username_migration.sql`
- `supabase/sql/operations_center_user_directory_backfill.sql`
- `supabase/sql/operations_center_users_rls_migration.sql`
- `supabase/sql/order_cross_module_sync_migration.sql`
- `supabase/sql/order_status_update_migration.sql`
- `supabase/sql/order_write_migration.sql`
- `supabase/sql/payment_write_migration.sql`
- `supabase/sql/pilot_hardening_agent_ownership_rls_migration.sql`
- `supabase/sql/pilot_hardening_validation_queries.sql`
- `supabase/sql/production_auth_rls_pilot_migration.sql`
- `supabase/sql/production_invoice_pdf_service_role_grants.sql`
- `supabase/sql/production_orders_fulfill_rls_patch.sql`
- `supabase/sql/production_rls_parity_lab_ar_insert_patch.sql`
- `supabase/sql/production_rls_parity_verification.sql`
- `supabase/sql/production_schema_parity_migration.sql`
- `supabase/sql/purchase_orders_migration.sql`
- `supabase/sql/qa_role_seed_and_rls_validation.sql`
- `supabase/sql/sprint1_ar_reconcile_service_role_fix.sql`
- `supabase/sql/user_provisioning_password_reset_event_migration.sql`
- `supabase/sql/user_provisioning_phase3a_roles_migration.sql`
- `supabase/sql/user_provisioning_phase3b_migration.sql`
- `supabase/sql/user_provisioning_phase3c_lab_ownership_migration.sql`
- `supabase/sql/user_provisioning_v1_migration.sql`
- `supabase/sql/v_labs_credit_security_invoker_migration.sql`

## Migrations track B

- `supabase/migrations/20260624120000_hq_profiles_rls_tenant_scope.sql`
- `supabase/migrations/20260624120001_hq_orders_date_index.sql`
- `supabase/migrations/20260624120002_invoice_system_phase1.sql`
- `supabase/migrations/20260624120003_invoice_system_phase2.sql`
- `supabase/migrations/20260624120004_invoice_system_phase3.sql`
- `supabase/migrations/20260624120005_invoice_system_phase5.sql`
- `supabase/migrations/20260624130000_sprint1_ar_reconcile_rpc.sql`
- `supabase/migrations/20260624130001_sprint1_transaction_integrity_rpcs.sql`
- `supabase/migrations/20260624130002_sprint1_founder_snapshot_rpc.sql`
- `supabase/migrations/20260624130003_sprint1_transaction_rpc_uuid_cast_fix.sql`
- `supabase/migrations/20260628120000_logistics_phase1a_shipments.sql`
- `supabase/migrations/20260630120000_logistics_phase2_couriers.sql`
- `supabase/migrations/20260701120000_logistics_phase3a_delivery_charges.sql`
- `supabase/migrations/20260702120000_persist_order_delivery_snapshot_rpc.sql`
- `supabase/migrations/20260702160000_sprint2_phase2_dashboard_executive_metrics.sql`
- `supabase/migrations/20260702160100_fix_dashboard_visits_count.sql`
- `supabase/migrations/20260702170000_sprint3a_production_safety_hardening.sql`
- `supabase/migrations/20260703120000_lab_ordering_governance.sql`
- `supabase/migrations/20260703120001_delivery_policy_foundation.sql`
- `supabase/migrations/20260704120000_logistics_phase4_route_planning.sql`
- `supabase/migrations/20260705120000_sprint2_domain_projections_phase1.sql`
- `supabase/migrations/20260705120001_fix_proj_receivable_refresh.sql`
- `supabase/migrations/20260705120002_fix_read_receivables_timeout.sql`

## Machine-readable

See `Sprint3A_Migration_Manifest.json`.
