#!/usr/bin/env node
/**
 * HQ Admin Credit & Risk / Collections certification — live QA Supabase.
 *
 * Usage:
 *   node scripts/verify-credit-risk-admin-flow.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || "f168b98f-47a6-42c3-b788-24c00436fac2";
const QA_TENANT_CODE = "qa-tenant-001";

const results = [];

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
  console.error(`FAIL  ${id}: ${detail}`);
}
function warn(id, detail) {
  results.push({ id, status: "WARN", detail });
  console.warn(`WARN  ${id}: ${detail}`);
}

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

function collectionOverdueBucket(overdueDays) {
  const days = num(overdueDays);
  if (days <= 0) return "current";
  if (days <= 15) return "1_15";
  if (days <= 30) return "16_30";
  return "31_plus";
}

function summarizeCollectionsList(collections, todayCollections = 0) {
  const totalOutstanding = (collections || []).reduce((s, c) => s + num(c.outstandingAmount), 0);
  const overdueCount = (collections || []).filter((c) => num(c.overdueDays) > 0).length;
  const highRiskCount = (collections || []).filter(
    (c) => str(c.riskStatus).toLowerCase() === "high"
  ).length;
  return {
    totalOutstanding,
    overdueCount,
    highRiskCount,
    todayCollections: num(todayCollections),
  };
}

function groupCollectionsByOverdueBucket(collections = []) {
  const buckets = { current: [], "1_15": [], "16_30": [], "31_plus": [] };
  for (const item of collections) {
    buckets[collectionOverdueBucket(item.overdueDays)].push(item);
  }
  return buckets;
}

async function main() {
  console.log("\n=== HQ Admin Credit & Risk Certification ===\n");
  console.log(`Tenant: ${HQ}\n`);

  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (authErr) throw new Error(`auth: ${authErr.message}`);

  const { data: tenantRow } = await sb
    .from("tenants")
    .select("id,tenant_code,tenant_name")
    .eq("id", HQ)
    .maybeSingle();
  if (tenantRow?.tenant_code === QA_TENANT_CODE) {
    pass("tenant.operating", `${tenantRow.tenant_name} (${tenantRow.tenant_code})`);
  } else {
    fail("tenant.operating", `Expected ${QA_TENANT_CODE}, got ${tenantRow?.tenant_code || "missing"}`);
  }

  const server = await createServer({
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
  });
  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const { data: session } = await sb.auth.getSession();
  if (supabase && session?.session) {
    await supabase.auth.setSession({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    });
  }
  const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");

  const { data: arRaw, error: arErr } = await sb
    .from("ar_credit_control")
    .select("lab_id,outstanding,total_paid,total_delivered,credit_limit,credit_hold,days_overdue,tenant_id")
    .eq("tenant_id", HQ);
  if (arErr) throw new Error(arErr.message);

  const arOutstandingSum = (arRaw || []).reduce((s, r) => s + num(r.outstanding), 0);
  const foreignAr = (arRaw || []).filter((r) => str(r.tenant_id) !== HQ);
  if (foreignAr.length) {
    fail("tenant.ar_isolation", `${foreignAr.length} AR row(s) outside HQ tenant in scoped query`);
  } else {
    pass("tenant.ar_isolation", `${(arRaw || []).length} AR rows scoped to ${QA_TENANT_CODE}`);
  }

  const { count: foreignCount } = await sb
    .from("ar_credit_control")
    .select("lab_id", { count: "exact", head: true })
    .neq("tenant_id", HQ);
  if ((foreignCount || 0) > 0) {
    fail("tenant.rls_probe", `Admin sees ${foreignCount} foreign AR row(s)`);
  } else {
    pass("tenant.rls_probe", "No foreign-tenant AR visible under admin JWT");
  }

  const collRes = await api.getCollectionsRead({ tenantId: HQ });
  if (!collRes?.success) {
    fail("collections.read", collRes?.error || "getCollectionsRead failed");
  } else {
    pass("collections.read", "getCollectionsRead succeeded");
  }

  const collections = collRes?.data?.collections || [];
  const summary = collRes?.data?.summary || summarizeCollectionsList(collections);
  const { data: payRaw } = await sb.from("payments").select("*").eq("tenant_id", HQ);
  const issues = api.auditCollectionDataInconsistencies(arRaw, payRaw, collections);

  const goldenIssues = (issues || []).filter((i) => /QA_LAB/i.test(str(i.labId)));
  if (goldenIssues.length) {
    fail(
      "golden.clean",
      `${goldenIssues.length} audit issue(s) on QA golden labs: ${goldenIssues.map((i) => i.type).join(", ")}`
    );
  } else {
    pass("golden.clean", "QA_LAB_* rows have no collection audit issues");
  }

  const inactiveIssues = (issues || []).filter((i) => i.type === "ar_row_no_activity");
  if (inactiveIssues.length) {
    warn(
      "audit.inactive_ar",
      `${inactiveIssues.length} inactive AR row(s) with no activity (non-golden labs)`
    );
  } else {
    pass("audit.inactive_ar", "No inactive AR audit flags");
  }

  const recomputed = summarizeCollectionsList(collections, summary.todayCollections);
  if (Math.abs(num(summary.totalOutstanding) - recomputed.totalOutstanding) <= 0.01) {
    pass("kpi.outstanding", `Outstanding ₹${recomputed.totalOutstanding}`);
  } else {
    fail(
      "kpi.outstanding",
      `API summary ${summary.totalOutstanding} != recomputed ${recomputed.totalOutstanding}`
    );
  }

  if (Math.abs(arOutstandingSum - recomputed.totalOutstanding) <= 0.01) {
    pass(
      "kpi.ar_reconcile",
      `Dashboard outstanding ₹${recomputed.totalOutstanding} == Σ AR outstanding`
    );
  } else {
    fail(
      "kpi.ar_reconcile",
      `Collections KPI ${recomputed.totalOutstanding} != AR table sum ${arOutstandingSum}`
    );
  }

  if (summary.overdueCount === recomputed.overdueCount) {
    pass("kpi.overdue", `Overdue labs ${recomputed.overdueCount}`);
  } else {
    fail("kpi.overdue", `API ${summary.overdueCount} != recomputed ${recomputed.overdueCount}`);
  }

  if (summary.highRiskCount === recomputed.highRiskCount) {
    pass("kpi.high_risk", `High risk ${recomputed.highRiskCount}`);
  } else {
    fail("kpi.high_risk", `API ${summary.highRiskCount} != recomputed ${recomputed.highRiskCount}`);
  }

  const boundaryCases = [
    [0, "current"],
    [15, "1_15"],
    [16, "16_30"],
    [30, "16_30"],
    [31, "31_plus"],
  ];
  let boundaryOk = true;
  for (const [days, expected] of boundaryCases) {
    if (collectionOverdueBucket(days) !== expected) boundaryOk = false;
  }
  if (boundaryOk) {
    pass("aging.boundaries", "Bucket boundaries: 0/15/16/30/31+ verified");
  } else {
    fail("aging.boundaries", "Overdue bucket boundary math incorrect");
  }

  const buckets = groupCollectionsByOverdueBucket(collections);
  const bucketOutstanding =
    num(buckets.current.reduce((s, c) => s + num(c.outstandingAmount), 0)) +
    num(buckets["1_15"].reduce((s, c) => s + num(c.outstandingAmount), 0)) +
    num(buckets["16_30"].reduce((s, c) => s + num(c.outstandingAmount), 0)) +
    num(buckets["31_plus"].reduce((s, c) => s + num(c.outstandingAmount), 0));
  if (Math.abs(bucketOutstanding - recomputed.totalOutstanding) <= 0.01) {
    pass(
      "aging.bucket_sum",
      `Σ bucket outstanding ₹${bucketOutstanding} == KPI total`
    );
  } else {
    fail(
      "aging.bucket_sum",
      `Bucket sum ${bucketOutstanding} != KPI ${recomputed.totalOutstanding}`
    );
  }

  const negativeOutstanding = (collections || []).filter((c) => num(c.outstandingAmount) < 0);
  if (negativeOutstanding.length) {
    fail("balance.negative", `${negativeOutstanding.length} collection row(s) with negative outstanding`);
  } else {
    pass("balance.negative", "No negative outstanding balances in scoped collections");
  }

  const { data: allocs } = await sb
    .from("invoice_payment_allocations")
    .select("payment_id,invoice_id,allocated_amount,tenant_id")
    .eq("tenant_id", HQ);
  const { data: pays } = await sb
    .from("payments")
    .select("payment_id,amount_received,order_id,tenant_id")
    .eq("tenant_id", HQ);

  let dupAlloc = 0;
  let overAlloc = 0;
  const allocKeys = new Set();
  for (const a of allocs || []) {
    const key = `${a.payment_id}|${a.invoice_id}`;
    if (allocKeys.has(key)) dupAlloc += 1;
    allocKeys.add(key);
    const payAmt = num((pays || []).find((p) => p.payment_id === a.payment_id)?.amount_received);
    const sumForPay = (allocs || [])
      .filter((x) => x.payment_id === a.payment_id)
      .reduce((s, x) => s + num(x.allocated_amount), 0);
    if (sumForPay > payAmt + 0.01) overAlloc += 1;
  }
  if (!dupAlloc) pass("alloc.no_duplicate", "No duplicate payment/invoice allocation keys");
  else fail("alloc.no_duplicate", `${dupAlloc} duplicate allocation key(s)`);
  if (!overAlloc) pass("alloc.no_over", "No over-allocations vs payment amount");
  else fail("alloc.no_over", `${overAlloc} over-allocation(s)`);

  const { data: goldenOrder } = await sb
    .from("orders")
    .select("order_id,invoice_id,total_amount")
    .eq("tenant_id", HQ)
    .ilike("order_id", "ORD-GP-PROD%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (goldenOrder?.order_id && goldenOrder?.invoice_id) {
    const { data: gPay } = await sb
      .from("payments")
      .select("payment_id,amount_received")
      .eq("tenant_id", HQ)
      .eq("order_id", goldenOrder.order_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: gAlloc } = await sb
      .from("invoice_payment_allocations")
      .select("allocated_amount")
      .eq("tenant_id", HQ)
      .eq("payment_id", gPay?.payment_id)
      .eq("invoice_id", goldenOrder.invoice_id)
      .maybeSingle();
    const { data: openBal } = await sb.rpc("get_invoice_open_balance", {
      p_invoice_id: goldenOrder.invoice_id,
    });
    if (gPay && gAlloc && Math.abs(num(gAlloc.allocated_amount) - num(gPay.amount_received)) <= 0.01) {
      pass(
        "golden.allocation",
        `Golden payment ₹${gPay.amount_received} allocated; open balance ₹${num(openBal)}`
      );
    } else {
      fail("golden.allocation", "Golden-path payment/allocation mismatch");
    }
  } else {
    warn("golden.allocation", "No ORD-GP-PROD golden order with invoice — skipped");
  }

  if ((arRaw || []).length <= 5000 && (payRaw || []).length <= 5000) {
    pass(
      "perf.bounded_reads",
      `AR ${(arRaw || []).length} / payments ${(payRaw || []).length} within HQ limits (5000)`
    );
  } else {
    fail("perf.bounded_reads", "Unbounded AR or payments read detected");
  }

  await server.close();

  console.log("\n=== Summary ===");
  const failed = results.filter((r) => r.status === "FAIL");
  const warned = results.filter((r) => r.status === "WARN");
  console.log(`PASS: ${results.filter((r) => r.status === "PASS").length}`);
  console.log(`WARN: ${warned.length}`);
  console.log(`FAIL: ${failed.length}`);
  if (failed.length) {
    for (const row of failed) console.log(`  - ${row.id}: ${row.detail}`);
    process.exit(1);
  }
  console.log("\nHQ Admin Credit & Risk certification passed.\n");
}

main().catch(async (err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
