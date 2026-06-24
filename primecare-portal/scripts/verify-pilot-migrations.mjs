#!/usr/bin/env node
/**
 * Verify required pilot SQL migrations exist on disk in dependency order.
 *
 * Usage:
 *   node scripts/verify-pilot-migrations.mjs
 *   node scripts/verify-pilot-migrations.mjs --check-remote  (requires .env.local + service role not included — file check only)
 */
import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlDir = resolve(__dirname, "../supabase/sql");

/** Ordered deployment manifest — apply top to bottom. */
export const PILOT_MIGRATION_MANIFEST = [
  {
    tier: "P0 — Purchase orders foundation",
    files: ["purchase_orders_migration.sql"],
  },
  {
    tier: "P0 — Security foundation",
    files: [
      "production_auth_rls_pilot_migration.sql",
      "executive_distributor_ops_rls_migration.sql",
    ],
  },
  {
    tier: "P0 — Tenant & distributor",
    files: [
      "durable_distributor_tenants_migration.sql",
      "operations_center_users_rls_migration.sql",
    ],
  },
  {
    tier: "P0 — Core writes",
    files: [
      "order_write_migration.sql",
      "payment_write_migration.sql",
      "inventory_ledger_migration.sql",
      "executive_distributor_lab_create_migration.sql",
    ],
  },
  {
    tier: "P1 — Qualification & contracts",
    files: [
      "lab_qualifications_migration.sql",
      "lab_qualifications_pipeline_migration.sql",
      "lab_contracts_migration.sql",
      "commission_ledger_migration.sql",
    ],
  },
  {
    tier: "P1 — User provisioning",
    files: [
      "user_provisioning_v1_migration.sql",
      "operations_center_agent_distributor_assignments_migration.sql",
      "user_provisioning_phase3a_roles_migration.sql",
      "user_provisioning_password_reset_event_migration.sql",
      "user_provisioning_phase3b_migration.sql",
      "user_provisioning_phase3c_lab_ownership_migration.sql",
    ],
  },
  {
    tier: "P1 — Pilot hardening",
    files: [
      "pilot_hardening_agent_ownership_rls_migration.sql",
    ],
  },
  {
    tier: "P2 — Supporting",
    files: [
      "operational_evidence_storage_migration.sql",
      "notifications_foundation_migration.sql",
      "v_labs_credit_security_invoker_migration.sql",
      "executive_distributor_catalog_inventory_rls.sql",
    ],
  },
  {
    tier: "P2 — Invoice foundation (Phase 1)",
    files: ["invoice_system_phase1_migration.sql"],
  },
  {
    tier: "P2 — Invoice creation engine (Phase 2)",
    files: ["invoice_system_phase2_migration.sql"],
  },
  {
    tier: "P2 — Invoice PDF download (Phase 3)",
    files: ["invoice_system_phase3_migration.sql"],
  },
  {
    tier: "P2 — Invoice payment allocation (Phase 5)",
    files: ["invoice_system_phase5_migration.sql"],
  },
];

function main() {
  const missing = [];
  const found = [];

  for (const group of PILOT_MIGRATION_MANIFEST) {
    for (const file of group.files) {
      const path = resolve(sqlDir, file);
      if (existsSync(path)) {
        found.push({ tier: group.tier, file });
      } else {
        missing.push({ tier: group.tier, file });
      }
    }
  }

  console.log("# Pilot Migration Manifest Verification\n");
  console.log(`SQL directory: ${sqlDir}\n`);

  for (const group of PILOT_MIGRATION_MANIFEST) {
    console.log(`## ${group.tier}`);
    for (const file of group.files) {
      const ok = existsSync(resolve(sqlDir, file));
      console.log(`- [${ok ? "x" : " "}] ${file}`);
    }
    console.log("");
  }

  if (missing.length) {
    console.error(`FAIL: ${missing.length} migration file(s) missing on disk.`);
    process.exit(1);
  }

  console.log(`PASS: ${found.length} migration files present.`);
  console.log("\nNext steps:");
  console.log("1. Apply migrations in manifest order in Supabase SQL editor.");
  console.log("2. Run supabase/sql/pilot_hardening_validation_queries.sql");
  console.log("3. Run node scripts/verify-hq-rls-reads.mjs");
  console.log("4. Run Predator full validation as executive in QA.");
}

main();
