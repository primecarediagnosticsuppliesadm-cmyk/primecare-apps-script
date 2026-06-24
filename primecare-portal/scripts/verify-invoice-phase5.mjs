#!/usr/bin/env node
/**
 * Invoice Phase 5 — payment allocation & invoice balance reconciliation.
 *
 * Usage:
 *   node scripts/verify-invoice-phase5.mjs
 *   node scripts/verify-invoice-phase5.mjs --remote
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const SQL_PATH = resolve(root, "supabase/sql/invoice_system_phase5_migration.sql");
const API_PATH = resolve(root, "src/api/invoiceSupabaseApi.js");
const HQ_TENANT = "f168b98f-47a6-42c3-b788-24c00436fac2";
const REMOTE = process.argv.includes("--remote");

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

function verifyStatic() {
  if (!existsSync(SQL_PATH)) fail("S-00", "invoice_system_phase5_migration.sql missing");
  else pass("S-00", "Phase 5 SQL migration exists");

  const sql = existsSync(SQL_PATH) ? readFileSync(SQL_PATH, "utf8") : "";
  const api = existsSync(API_PATH) ? readFileSync(API_PATH, "utf8") : "";
  const collections = readFileSync(resolve(root, "src/pages/CollectionsPage.jsx"), "utf8");
  const executive = readFileSync(resolve(root, "src/pages/ExecutiveControlTower.jsx"), "utf8");
  const primeApi = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");

  if (/partially_paid/.test(sql) && /allocate_payment_to_invoice/.test(sql)) {
    pass("S-10", "Phase 5 SQL: partially_paid + allocate_payment_to_invoice");
  } else {
    fail("S-10", "Phase 5 allocation SQL incomplete");
  }

  if (/get_invoice_tenant_financial_kpis/.test(sql) && /unallocated_cash/.test(sql)) {
    pass("S-11", "Tenant financial KPI RPC with unallocated cash");
  } else {
    fail("S-11", "Tenant KPI RPC missing");
  }

  if (
    /allocatePaymentToInvoiceWrite/.test(api) &&
    /autoAllocatePaymentToOrderInvoice/.test(api) &&
    /getInvoiceAllocationsRead/.test(api)
  ) {
    pass("S-12", "invoiceSupabaseApi allocation surface");
  } else {
    fail("S-12", "invoiceSupabaseApi allocation API incomplete");
  }

  if (/autoAllocatePaymentToOrderInvoice/.test(primeApi)) {
    pass("S-13", "createPaymentWrite auto-allocation hook");
  } else {
    fail("S-13", "Payment auto-allocation hook missing");
  }

  if (/InvoiceAllocationsDrawer/.test(collections) && /Allocated/.test(collections)) {
    pass("S-20", "Collections invoice balance + allocations drawer");
  } else {
    fail("S-20", "Collections integration incomplete");
  }

  if (/unallocatedCash/.test(executive) && /collectionPct/.test(executive)) {
    pass("S-21", "Executive allocation KPIs wired");
  } else {
    fail("S-21", "Executive KPI integration incomplete");
  }

  if (!/payments\.invoice_id/.test(sql) && !/payments\.invoice_id/.test(api)) {
    pass("S-30", "No payments.invoice_id drift — junction table only");
  } else {
    fail("S-30", "payments.invoice_id drift detected");
  }
}

async function login(env, email, password) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { sb: null, error: error.message };
  return { sb, error: null };
}

async function verifyRemote(env) {
  const adminEnv = await login(env, "qa.admin@primecare.test", "1234");
  const labEnv = await login(env, "qa.lab@primecare.test", "1234");

  if (!adminEnv.sb) {
    warn("R-01", `Admin auth failed: ${adminEnv.error || "unknown"}`);
    return;
  }

  const stub = await adminEnv.sb.rpc("allocate_payment_to_invoice", {
    p_tenant_id: HQ_TENANT,
    p_payment_id: "PAY-PHASE5-TEST",
    p_invoice_id: "00000000-0000-0000-0000-000000000001",
    p_allocated_amount: 1,
    p_actor_id: "verify-phase5",
  });

  if (stub.error && /not_implemented_phase_1/i.test(stub.error.message)) {
    fail("R-10", "allocate_payment_to_invoice still Phase 1 stub — apply phase5 SQL to QA");
    return;
  }

  const { data: invoice } = await adminEnv.sb
    .from("invoices")
    .select("id,tenant_id,lab_id,order_id,total_amount,status")
    .eq("tenant_id", HQ_TENANT)
    .in("status", ["sent", "partially_paid"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!invoice?.id) {
    skip("R-20", "No allocatable invoice in QA for allocation test");
  } else {
    const paymentId = `PAY-P5-${Date.now()}`;
    const { error: payErr } = await adminEnv.sb.from("payments").insert({
      payment_id: paymentId,
      tenant_id: invoice.tenant_id,
      lab_id: invoice.lab_id,
      order_id: invoice.order_id,
      amount_received: 1,
      payment_date: new Date().toISOString().slice(0, 10),
      mode: "Cash",
      created_at: new Date().toISOString(),
    });

    if (payErr) {
      warn("R-20", `Payment insert for allocation test: ${payErr.message}`);
    } else {
      const alloc = await adminEnv.sb.rpc("allocate_payment_to_invoice", {
        p_tenant_id: invoice.tenant_id,
        p_payment_id: paymentId,
        p_invoice_id: invoice.id,
        p_allocated_amount: 1,
        p_actor_id: "verify-phase5",
      });

      if (alloc.error) {
        fail("R-20", `allocate_payment_to_invoice failed: ${alloc.error.message}`);
      } else {
        pass("R-20", "allocate_payment_to_invoice succeeded");

        const dup = await adminEnv.sb.rpc("allocate_payment_to_invoice", {
          p_tenant_id: invoice.tenant_id,
          p_payment_id: paymentId,
          p_invoice_id: invoice.id,
          p_allocated_amount: 1,
          p_actor_id: "verify-phase5",
        });
        if (dup.data?.idempotent) {
          pass("R-21", "Duplicate allocation idempotent (same amount)");
        } else if (dup.error) {
          pass("R-21", `Duplicate allocation blocked: ${dup.error.message}`);
        } else {
          fail("R-21", "Duplicate allocation should be idempotent or blocked");
        }

        const over = await adminEnv.sb.rpc("allocate_payment_to_invoice", {
          p_tenant_id: invoice.tenant_id,
          p_payment_id: paymentId,
          p_invoice_id: invoice.id,
          p_allocated_amount: 999999,
          p_actor_id: "verify-phase5",
        });
        if (over.error) {
          pass("R-22", "Over-allocation denied");
        } else {
          fail("R-22", "Over-allocation incorrectly allowed");
        }

        const { data: openBal } = await adminEnv.sb.rpc("get_invoice_open_balance", {
          p_invoice_id: invoice.id,
        });
        if (Number(openBal) >= 0) {
          pass("R-23", `Open balance readable (${openBal})`);
        } else {
          fail("R-23", "Open balance invalid");
        }
      }
    }
  }

  const { data: kpis, error: kpiErr } = await adminEnv.sb.rpc("get_invoice_tenant_financial_kpis", {
    p_tenant_id: HQ_TENANT,
  });
  if (!kpiErr && kpis?.unallocated_cash != null) {
    pass("R-30", `Tenant KPI RPC OK (unallocated ${kpis.unallocated_cash})`);
  } else {
    fail("R-30", `Tenant KPI RPC failed: ${kpiErr?.message || "missing"}`);
  }

  if (labEnv.sb) {
    const { data: foreignAlloc } = await labEnv.sb
      .from("invoice_payment_allocations")
      .select("id,tenant_id")
      .neq("tenant_id", HQ_TENANT)
      .limit(1);
    if (!foreignAlloc?.length) {
      pass("R-40", "Lab sees no foreign-tenant allocations");
    } else {
      fail("R-40", "Cross-tenant allocation visibility leak");
    }
  } else {
    skip("R-40", "Lab auth unavailable");
  }
}

function printSummary() {
  const fails = results.filter((r) => r.status === "FAIL");
  const passes = results.filter((r) => r.status === "PASS");
  console.log("\n=== Invoice Phase 5 Verification ===\n");
  for (const r of results) {
    console.log(`${r.status.padEnd(5)} ${r.id}  ${r.detail}`);
  }
  console.log(`\nSummary: PASS=${passes.length} FAIL=${fails.length}`);
  if (fails.length) {
    console.log("\nINVOICE PHASE 5: FAIL");
    process.exit(1);
  }
  console.log("\nINVOICE PHASE 5: PASS");
}

verifyStatic();
if (REMOTE) {
  const env = loadEnvLocal();
  if (!env?.VITE_SUPABASE_URL) {
    warn("R-00", ".env.local missing — remote tests skipped");
  } else {
    await verifyRemote(env);
  }
} else {
  skip("R-ALL", "Remote tests skipped (use --remote)");
}
printSummary();
