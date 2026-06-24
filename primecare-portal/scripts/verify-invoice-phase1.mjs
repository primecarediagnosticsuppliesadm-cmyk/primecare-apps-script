#!/usr/bin/env node
/**
 * Invoice Phase 1 foundation verification (static SQL + optional live Supabase checks).
 * Does not mutate certified HQ/Guntur business data.
 *
 * Usage:
 *   node scripts/verify-invoice-phase1.mjs
 *   node scripts/verify-invoice-phase1.mjs --remote
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SQL_PATH = resolve(root, "supabase/sql/invoice_system_phase1_migration.sql");
const MIGRATION_PATH = resolve(
  root,
  "supabase/migrations/20260624120002_invoice_system_phase1.sql"
);

const REMOTE = process.argv.includes("--remote");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return null;
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

const results = [];

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
}

function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
}

function warn(id, detail) {
  results.push({ id, status: "WARN", detail });
}

function skip(id, detail) {
  results.push({ id, status: "SKIP", detail });
}

function assertSqlIncludes(sql, pattern, id, label) {
  if (pattern.test(sql)) pass(id, label);
  else fail(id, `Missing in migration SQL: ${label}`);
}

function assertSqlExcludes(sql, pattern, id, label) {
  if (!pattern.test(sql)) pass(id, label);
  else fail(id, `Must not appear in migration SQL: ${label}`);
}

function verifyStaticSql() {
  if (!existsSync(SQL_PATH)) {
    fail("S-00", `Migration file missing: ${SQL_PATH}`);
    return "";
  }
  pass("S-00", "invoice_system_phase1_migration.sql exists");

  if (!existsSync(MIGRATION_PATH)) {
    fail("S-01", "Timestamped migration mirror missing");
  } else {
    pass("S-01", "supabase/migrations/20260624120002_invoice_system_phase1.sql exists");
  }

  const sql = readFileSync(SQL_PATH, "utf8");

  assertSqlIncludes(sql, /CREATE TABLE IF NOT EXISTS public\.invoices/, "S-10", "invoices table");
  assertSqlIncludes(
    sql,
    /CREATE TABLE IF NOT EXISTS public\.invoice_line_items/,
    "S-11",
    "invoice_line_items table"
  );
  assertSqlIncludes(
    sql,
    /CREATE TABLE IF NOT EXISTS public\.invoice_payment_allocations/,
    "S-12",
    "invoice_payment_allocations table"
  );
  assertSqlIncludes(
    sql,
    /CREATE TABLE IF NOT EXISTS public\.invoice_number_sequences/,
    "S-13",
    "invoice_number_sequences table"
  );

  assertSqlIncludes(
    sql,
    /ADD COLUMN IF NOT EXISTS invoice_id uuid/,
    "S-20",
    "orders.invoice_id column"
  );
  assertSqlExcludes(
    sql,
    /ADD COLUMN IF NOT EXISTS invoice_status|ALTER TABLE public\.orders[\s\S]*invoice_status/i,
    "S-21",
    "no orders.invoice_status column"
  );
  assertSqlExcludes(
    sql,
    /ALTER TABLE public\.payments[\s\S]*invoice_id|ADD COLUMN IF NOT EXISTS invoice_id[\s\S]*payments/i,
    "S-22",
    "no payments.invoice_id column"
  );

  assertSqlIncludes(sql, /invoices_tenant_order_uidx/, "S-30", "unique tenant_id+order_id index");
  assertSqlIncludes(sql, /invoices_tenant_number_uidx/, "S-31", "unique tenant_id+invoice_number index");
  assertSqlIncludes(sql, /orders_invoice_id_idx/, "S-32", "orders invoice_id index");

  assertSqlIncludes(sql, /ENABLE ROW LEVEL SECURITY/, "S-40", "RLS enabled");
  assertSqlIncludes(sql, /invoices_select_by_role/, "S-41", "invoices SELECT policy");
  assertSqlIncludes(sql, /invoice_line_items_select_by_role/, "S-42", "line items SELECT policy");
  assertSqlIncludes(sql, /invoice_payment_allocations_select_by_role/, "S-43", "allocations SELECT policy");
  assertSqlIncludes(sql, /REVOKE ALL ON TABLE public\.invoice_number_sequences/, "S-44", "sequences revoked");

  assertSqlIncludes(
    sql,
    /create_invoice_for_fulfilled_order/,
    "S-50",
    "create_invoice_for_fulfilled_order RPC"
  );
  assertSqlIncludes(sql, /allocate_payment_to_invoice/, "S-51", "allocate_payment_to_invoice RPC");
  assertSqlIncludes(sql, /get_invoice_open_balance/, "S-52", "get_invoice_open_balance RPC");
  assertSqlIncludes(
    sql,
    /mark_invoice_paid_if_fully_allocated/,
    "S-53",
    "mark_invoice_paid_if_fully_allocated RPC"
  );
  assertSqlIncludes(sql, /not_implemented_phase_1/, "S-54", "Phase 2 RPC stubs raise not_implemented_phase_1");

  assertSqlIncludes(
    sql,
    /invoice_payment_allocations_enforce_cap/,
    "S-60",
    "allocation overpayment trigger function"
  );
  assertSqlIncludes(sql, /allocation_exceeds_payment/, "S-61", "allocation_exceeds_payment exception");

  assertSqlIncludes(sql, /'invoice-pdfs'/, "S-70", "invoice-pdfs storage bucket");
  assertSqlIncludes(sql, /invoice_pdf_storage_can_read/, "S-71", "storage read helper");

  assertSqlIncludes(sql, /status IN \('draft', 'sent', 'paid', 'cancelled', 'failed'\)/, "S-80", "status enum");
  assertSqlExcludes(sql, /'overdue'/, "S-81", "overdue not stored as status");

  return sql;
}

async function loginRole(env, email, password) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { sb: null, error: error.message };
  return { sb, error: null };
}

async function verifyRemote(env) {
  const { sb: labSb, error: labErr } = await loginRole(env, "qa.lab@primecare.test", "1234");
  if (labErr || !labSb) {
    warn("R-00", `Lab auth unavailable: ${labErr || "unknown"} — skipping live checks`);
    return;
  }

  const probe = async (table) => {
    const { error } = await labSb.from(table).select("*").limit(0);
    return error;
  };

  const tables = ["invoices", "invoice_line_items", "invoice_payment_allocations"];
  let tablesReady = true;
  for (const table of tables) {
    const err = await probe(table);
    if (err) {
      tablesReady = false;
      warn(`R-10-${table}`, `Table not queryable (migration may not be applied): ${err.message}`);
    } else {
      pass(`R-10-${table}`, `${table} exists and is queryable`);
    }
  }

  if (!tablesReady) {
    skip("R-20", "Skipping RLS write probes — invoice tables not deployed on remote");
    return;
  }

  const { data: ordersCols, error: ordersErr } = await labSb.from("orders").select("invoice_id").limit(1);
  if (ordersErr) fail("R-20", `orders.invoice_id missing or inaccessible: ${ordersErr.message}`);
  else pass("R-20", "orders.invoice_id column accessible");

  const { error: invInsErr } = await labSb.from("invoices").insert({
    tenant_id: "00000000-0000-0000-0000-000000000001",
    lab_id: "LAB-PROBE",
    order_id: "ORD-PROBE",
    invoice_number: "INV-PROBE",
    due_date: "2099-01-01",
    total_amount: 1,
    subtotal: 1,
    tax_amount: 0,
  });
  if (invInsErr) pass("R-30", `Lab direct invoice INSERT denied: ${invInsErr.message}`);
  else fail("R-30", "Lab was able to INSERT into invoices (RLS hole)");

  const { error: lineInsErr } = await labSb.from("invoice_line_items").insert({
    tenant_id: "00000000-0000-0000-0000-000000000001",
    invoice_id: "00000000-0000-0000-0000-000000000001",
    line_number: 1,
    order_id: "ORD-PROBE",
    product_name: "Probe",
    quantity: 1,
    unit_price: 1,
    line_total: 1,
  });
  if (lineInsErr) pass("R-31", `Lab direct line item INSERT denied: ${lineInsErr.message}`);
  else fail("R-31", "Lab was able to INSERT into invoice_line_items (RLS hole)");

  const { error: allocInsErr } = await labSb.from("invoice_payment_allocations").insert({
    tenant_id: "00000000-0000-0000-0000-000000000001",
    payment_id: "PAY-PROBE",
    invoice_id: "00000000-0000-0000-0000-000000000001",
    allocated_amount: 1,
  });
  if (allocInsErr) pass("R-32", `Lab direct allocation INSERT denied: ${allocInsErr.message}`);
  else fail("R-32", "Lab was able to INSERT into invoice_payment_allocations (RLS hole)");

  const { error: seqErr } = await labSb.from("invoice_number_sequences").select("*").limit(1);
  if (seqErr) pass("R-33", `invoice_number_sequences inaccessible to lab: ${seqErr.message}`);
  else fail("R-33", "Lab can SELECT invoice_number_sequences (should be denied)");

  const { error: rpcStubErr } = await labSb.rpc("create_invoice_for_fulfilled_order", {
    p_tenant_id: "00000000-0000-0000-0000-000000000001",
    p_order_id: "ORD-PROBE",
  });
  if (rpcStubErr && /not_implemented_phase_1/i.test(rpcStubErr.message)) {
    pass("R-40", "create_invoice_for_fulfilled_order stub raises not_implemented_phase_1");
  } else if (rpcStubErr) {
    warn("R-40", `RPC stub response: ${rpcStubErr.message}`);
  } else {
    fail("R-40", "create_invoice_for_fulfilled_order returned success in Phase 1");
  }

  const { error: openBalErr } = await labSb.rpc("get_invoice_open_balance", {
    p_invoice_id: "00000000-0000-0000-0000-000000000001",
  });
  if (openBalErr) warn("R-41", `get_invoice_open_balance: ${openBalErr.message}`);
  else pass("R-41", "get_invoice_open_balance RPC callable");

  const { data: buckets, error: bucketErr } = await labSb.storage.listBuckets();
  if (bucketErr) {
    warn("R-50", `Cannot list storage buckets (anon may lack permission): ${bucketErr.message}`);
  } else if ((buckets || []).some((b) => b.id === "invoice-pdfs" || b.name === "invoice-pdfs")) {
    pass("R-50", "invoice-pdfs storage bucket exists");
  } else {
    warn("R-50", "invoice-pdfs bucket not visible via anon listBuckets (may still exist server-side)");
  }
}

function printReport() {
  console.log("# Invoice Phase 1 Verification\n");
  for (const row of results) {
    console.log(`- [${row.status}] ${row.id}: ${row.detail}`);
  }
  const fails = results.filter((r) => r.status === "FAIL");
  const warns = results.filter((r) => r.status === "WARN");
  console.log(`\nSummary: ${results.length} checks, ${fails.length} FAIL, ${warns.length} WARN`);
  if (fails.length) {
    console.error("\nRESULT: FAIL");
    process.exit(1);
  }
  console.log("\nRESULT: PASS");
}

async function main() {
  verifyStaticSql();

  if (REMOTE) {
    const env = loadEnvLocal();
    if (!env?.VITE_SUPABASE_URL || !env?.VITE_SUPABASE_ANON_KEY) {
      warn("R-ENV", "Missing .env.local — remote checks skipped");
    } else {
      await verifyRemote(env);
    }
  } else {
    skip("R-ENV", "Remote checks skipped (pass --remote after applying migration to QA)");
  }

  printReport();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
