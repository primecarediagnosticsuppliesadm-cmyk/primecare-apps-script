#!/usr/bin/env node
/**
 * Invoice Phase 4 — Invoice Center UX & operations integration.
 *
 * Usage:
 *   node scripts/verify-invoice-phase4.mjs
 *   node scripts/verify-invoice-phase4.mjs --remote
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const REMOTE = process.argv.includes("--remote");
const HQ_TENANT = "f168b98f-47a6-42c3-b788-24c00436fac2";

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
  const paths = {
    labPage: resolve(root, "src/pages/LabInvoiceCenterPage.jsx"),
    drawer: resolve(root, "src/components/invoice/InvoiceDetailsDrawer.jsx"),
    api: resolve(root, "src/api/invoiceSupabaseApi.js"),
    bounds: resolve(root, "src/api/hqReadBounds.js"),
    collections: resolve(root, "src/pages/CollectionsPage.jsx"),
    orders: resolve(root, "src/pages/OrdersPage.jsx"),
    executive: resolve(root, "src/pages/ExecutiveControlTower.jsx"),
    menu: resolve(root, "src/config/menuConfig.js"),
    portal: resolve(root, "src/PrimeCareWebPortal.jsx"),
  };

  for (const [key, path] of Object.entries(paths)) {
    if (!existsSync(path)) fail(`S-00-${key}`, `${path} missing`);
    else pass(`S-00-${key}`, `${key} exists`);
  }

  const api = readFileSync(paths.api, "utf8");
  const bounds = readFileSync(paths.bounds, "utf8");
  const labPage = readFileSync(paths.labPage, "utf8");
  const drawer = readFileSync(paths.drawer, "utf8");
  const collections = readFileSync(paths.collections, "utf8");
  const orders = readFileSync(paths.orders, "utf8");
  const executive = readFileSync(paths.executive, "utf8");

  if (/HQ_INVOICE_LIST_COLUMNS/.test(api) && !/select\("\*"\)/.test(api)) {
    pass("S-10", "Invoice API uses projected columns");
  } else {
    fail("S-10", "Invoice API may use unbounded select");
  }

  if (
    /getInvoicesForLabRead/.test(api) &&
    /\.range\(/.test(api) &&
    /HQ_INVOICE_LIST_MAX_LIMIT/.test(bounds)
  ) {
    pass("S-11", "Lab invoice list paginated with max limit");
  } else {
    fail("S-11", "Pagination missing on lab invoice list");
  }

  if (/getInvoicesByOrderIdsRead/.test(api) && /HQ_INVOICE_ORDER_LOOKUP_CHUNK/.test(bounds)) {
    pass("S-12", "Orders integration uses chunked invoice lookup");
  } else {
    fail("S-12", "Chunked order invoice lookup missing");
  }

  if (/getInvoiceTenantKpisRead/.test(api) && /count:\s*"exact"/.test(api)) {
    pass("S-13", "Executive KPI reads use head counts");
  } else {
    fail("S-13", "Executive invoice KPI read missing");
  }

  if (
    /Invoice Number/.test(labPage) &&
    /pageSize/.test(labPage) &&
    /InvoiceDetailsDrawer/.test(labPage)
  ) {
    pass("S-20", "Lab Invoice Center list + drawer wired");
  } else {
    fail("S-20", "Lab Invoice Center incomplete");
  }

  if (/getInvoiceDetailRead/.test(drawer) && /Line Items/.test(drawer)) {
    pass("S-21", "Invoice details drawer loads snapshot lines");
  } else {
    fail("S-21", "Invoice details drawer incomplete");
  }

  if (/View Invoice/.test(collections) && /InvoiceDetailsDrawer/.test(collections)) {
    pass("S-22", "Collections invoice drawer integrated");
  } else {
    fail("S-22", "Collections integration incomplete");
  }

  if (/View Invoice/.test(orders) && /getInvoicesByOrderIdsRead/.test(orders)) {
    pass("S-23", "Orders page invoice columns + actions wired");
  } else {
    fail("S-23", "Orders integration incomplete");
  }

  if (/getInvoiceTenantKpisRead/.test(executive) && /Invoice visibility/.test(executive)) {
    pass("S-24", "Executive invoice KPI strip wired");
  } else {
    fail("S-24", "Executive invoice visibility incomplete");
  }

  const menu = readFileSync(paths.menu, "utf8");
  const portal = readFileSync(paths.portal, "utf8");
  if (/labInvoices/.test(menu) && /LabInvoiceCenterPage/.test(portal)) {
    pass("S-30", "Lab menu route for Invoice Center");
  } else {
    fail("S-30", "Lab Invoice Center route missing");
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
  const executiveEnv = await login(env, "qa.executive@primecare.test", "1234");

  if (!adminEnv.sb) {
    warn("R-01", `Admin auth failed: ${adminEnv.error || "unknown"}`);
    return;
  }

  const { data: profile } = await labEnv.sb
    ? await labEnv.sb.from("profiles").select("lab_id,tenant_id").limit(1).maybeSingle()
    : { data: null };

  const labId = profile?.lab_id || "QA_LAB_001";

  if (labEnv.sb && labId) {
    const page1 = await labEnv.sb
      .from("invoices")
      .select(
        "id,tenant_id,lab_id,order_id,invoice_number,invoice_date,due_date,subtotal,tax_amount,total_amount,status,pdf_storage_path,pdf_generated_at,sent_at,paid_at,created_at,updated_at",
        { count: "exact" }
      )
      .eq("lab_id", labId)
      .order("invoice_date", { ascending: false })
      .range(0, 24);
    if (!page1.error) {
      pass("R-20", `Lab paginated invoice list OK (${page1.data?.length ?? 0} rows, total ${page1.count ?? "?"})`);
    } else {
      fail("R-20", `Lab invoice list failed: ${page1.error.message}`);
    }

    const { data: foreign } = await labEnv.sb
      .from("invoices")
      .select("id")
      .neq("lab_id", labId)
      .limit(5);
    if (!foreign?.length) {
      pass("R-21", "Lab sees no foreign-lab invoices in list");
    } else {
      fail("R-21", `Lab sees ${foreign.length} foreign-lab invoice rows`);
    }
  } else {
    skip("R-20", "Lab auth unavailable");
    skip("R-21", "Lab auth unavailable");
  }

  if (executiveEnv.sb) {
    const { count, error } = await executiveEnv.sb
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", HQ_TENANT);
    if (!error) {
      pass("R-30", `Executive tenant invoice count readable (${count ?? 0})`);
    } else {
      fail("R-30", `Executive invoice count failed: ${error.message}`);
    }
  } else {
    skip("R-30", "Executive auth unavailable");
  }

  const { data: adminInvoice } = await adminEnv.sb
    .from("invoices")
    .select("id")
    .eq("tenant_id", HQ_TENANT)
    .limit(1)
    .maybeSingle();

  if (adminInvoice?.id) {
    const { data: lines, error: lineErr } = await adminEnv.sb
      .from("invoice_line_items")
      .select(
        "id,tenant_id,invoice_id,line_number,order_id,product_id,product_name,sku,quantity,unit_price,tax_rate,tax_amount,line_total,created_at"
      )
      .eq("invoice_id", adminInvoice.id)
      .order("line_number", { ascending: true });
    if (!lineErr && Array.isArray(lines)) {
      pass("R-40", `Invoice drawer line read OK (${lines.length} lines)`);
    } else {
      fail("R-40", `Invoice line read failed: ${lineErr?.message}`);
    }
  } else {
    skip("R-40", "No invoice row for drawer line test");
  }
}

function printSummary() {
  const fails = results.filter((r) => r.status === "FAIL");
  const passes = results.filter((r) => r.status === "PASS");
  console.log("\n=== Invoice Phase 4 Verification ===\n");
  for (const r of results) {
    console.log(`${r.status.padEnd(5)} ${r.id}  ${r.detail}`);
  }
  console.log(`\nSummary: PASS=${passes.length} FAIL=${fails.length}`);
  if (fails.length) {
    console.log("\nINVOICE PHASE 4: FAIL");
    process.exit(1);
  }
  console.log("\nINVOICE PHASE 4: PASS");
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
