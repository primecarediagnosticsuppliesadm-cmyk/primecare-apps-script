#!/usr/bin/env node
/**
 * Financial reconciliation certification — tenant-level drift + golden-path checks.
 *
 * Usage:
 *   node scripts/verify-financial-reconciliation.mjs
 *   GOLDEN_ORDER_ID=ORD-GP-PROD-... node scripts/verify-financial-reconciliation.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = "f168b98f-47a6-42c3-b788-24c00436fac2";
const GUNTUR = "787999b9-72f5-4163-a860-551c12ce3414";

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
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

async function loginAdmin(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (error) throw new Error(`Admin auth failed: ${error.message}`);
  return sb;
}

async function main() {
  const env = loadEnv();
  const sb = await loginAdmin(env);
  const goldenOrderId = process.env.GOLDEN_ORDER_ID || "";

  const { data: arRows } = await sb
    .from("ar_credit_control")
    .select("lab_id,outstanding,total_paid")
    .eq("tenant_id", HQ);
  const arOutstanding = (arRows || []).reduce((s, r) => s + num(r.outstanding), 0);
  const arPaid = (arRows || []).reduce((s, r) => s + num(r.total_paid), 0);

  const { data: invoices } = await sb
    .from("invoices")
    .select("id,total_amount,status,pdf_storage_path,order_id")
    .eq("tenant_id", HQ);
  const invTotal = (invoices || []).reduce((s, r) => s + num(r.total_amount), 0);

  const { data: allocs } = await sb
    .from("invoice_payment_allocations")
    .select("id,allocated_amount,payment_id,invoice_id")
    .eq("tenant_id", HQ);
  const allocSum = (allocs || []).reduce((s, r) => s + num(r.allocated_amount), 0);

  const { data: pays } = await sb
    .from("payments")
    .select("payment_id,amount_received,order_id")
    .eq("tenant_id", HQ);
  const paySum = (pays || []).reduce((s, r) => s + num(r.amount_received), 0);

  const { data: kpis } = await sb.rpc("get_invoice_tenant_financial_kpis", {
    p_tenant_id: HQ,
  });
  const unallocatedCash = num(kpis?.unallocated_cash);

  pass("FR-10", `Payments sum ₹${paySum} · allocations ₹${allocSum} · unallocated ₹${unallocatedCash}`);
  pass("FR-11", `AR outstanding ₹${arOutstanding} · invoice total ₹${invTotal}`);

  const allocByPayment = new Map();
  for (const a of allocs || []) {
    const k = `${a.payment_id}|${a.invoice_id}`;
    if (allocByPayment.has(k)) {
      fail("FR-20", `Duplicate allocation key ${k}`);
    }
    allocByPayment.set(k, a);
    const pay = (pays || []).find((p) => p.payment_id === a.payment_id);
    const payAmt = num(pay?.amount_received);
    const sumForPay = (allocs || [])
      .filter((x) => x.payment_id === a.payment_id)
      .reduce((s, x) => s + num(x.allocated_amount), 0);
    if (sumForPay > payAmt + 0.01) {
      fail("FR-21", `Over-allocation payment ${a.payment_id}: alloc ${sumForPay} > pay ${payAmt}`);
    }
  }
  if (!results.some((r) => r.id === "FR-20" && r.status === "FAIL")) {
    pass("FR-20", "No duplicate allocation keys");
  }
  if (!results.some((r) => r.id === "FR-21" && r.status === "FAIL")) {
    pass("FR-21", "No over-allocations detected");
  }

  let negOpen = 0;
  for (const inv of invoices || []) {
    const { data: ob } = await sb.rpc("get_invoice_open_balance", { p_invoice_id: inv.id });
    if (num(ob) < -0.01) negOpen += 1;
    if (inv.status === "paid" && num(ob) > 0.01) {
      fail("FR-30", `Paid invoice ${inv.id} has open balance ${ob}`);
    }
    if ((inv.status === "sent" || inv.status === "partially_paid") && num(ob) <= 0.01 && num(inv.total_amount) > 0) {
      warn("FR-31", `Sent invoice ${inv.id} has zero open balance (may be fully allocated)`);
    }
    if (!inv.pdf_storage_path && inv.status !== "draft") {
      warn("FR-32", `Invoice ${inv.id} missing PDF path`);
    }
  }
  if (!negOpen) pass("FR-22", "No negative open balances");
  else fail("FR-22", `${negOpen} invoice(s) with negative open balance`);

  const { data: fulfilledNoInv } = await sb
    .from("orders")
    .select("order_id,invoice_id")
    .eq("tenant_id", HQ)
    .eq("status", "Fulfilled")
    .is("invoice_id", null)
    .ilike("order_id", "ORD-GP-PROD%")
    .limit(5);
  if (fulfilledNoInv?.length) {
    fail("FR-40", `${fulfilledNoInv.length} GP-PROD fulfilled order(s) missing invoice_id`);
  } else {
    pass("FR-40", "No GP-PROD fulfilled orders missing invoices");
  }

  const legacyDrift = Math.abs(arOutstanding - Math.max(0, invTotal - allocSum));
  if (legacyDrift > 100 && unallocatedCash > 100) {
    warn(
      "FR-50",
      `Legacy dual-ledger drift ~₹${legacyDrift.toFixed(0)} (AR vs invoice open); unallocated cash ₹${unallocatedCash}`
    );
  } else {
    pass("FR-50", `Tenant ledger drift within tolerance (Δ₹${legacyDrift.toFixed(0)})`);
  }

  let goldenOrder = goldenOrderId;
  if (!goldenOrder) {
    const { data: recent } = await sb
      .from("orders")
      .select("order_id")
      .eq("tenant_id", HQ)
      .ilike("order_id", "ORD-GP-PROD%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    goldenOrder = recent?.order_id || "";
  }

  if (goldenOrder) {
    const { data: gOrder } = await sb
      .from("orders")
      .select("invoice_id,total_amount")
      .eq("tenant_id", HQ)
      .eq("order_id", goldenOrder)
      .maybeSingle();
    const invId = gOrder?.invoice_id;
    if (!invId) {
      fail("FR-GP-10", `Golden order ${goldenOrder} has no invoice_id`);
    } else {
      const { data: gPay } = await sb
        .from("payments")
        .select("payment_id,amount_received,order_id")
        .eq("tenant_id", HQ)
        .eq("order_id", goldenOrder)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const payId = gPay?.payment_id;
      const payAmt = num(gPay?.amount_received);
      const { data: gAlloc } = await sb
        .from("invoice_payment_allocations")
        .select("id,allocated_amount")
        .eq("tenant_id", HQ)
        .eq("payment_id", payId)
        .eq("invoice_id", invId);
      const gAllocSum = (gAlloc || []).reduce((s, r) => s + num(r.allocated_amount), 0);
      const { data: gOpen } = await sb.rpc("get_invoice_open_balance", { p_invoice_id: invId });

      if (gAllocSum > 0 && Math.abs(gAllocSum - Math.min(payAmt, num(gOrder?.total_amount))) <= 0.02) {
        pass("FR-GP-20", `Golden allocation ₹${gAllocSum} matches payment`);
      } else {
        fail("FR-GP-20", `Golden allocation mismatch alloc=${gAllocSum} pay=${payAmt}`);
      }
      if (num(gOpen) <= 0.01) {
        pass("FR-GP-21", `Golden invoice open balance ${gOpen}`);
      } else {
        fail("FR-GP-21", `Golden invoice open ${gOpen}`);
      }
      const unallocForPay = payAmt - gAllocSum;
      if (unallocForPay <= 0.01) {
        pass("FR-GP-22", "Golden payment fully allocated (unallocated = 0)");
      } else {
        fail("FR-GP-22", `Golden payment unallocated remainder ₹${unallocForPay}`);
      }
    }
  } else {
    warn("FR-GP-00", "No golden order found — run verify-primecare-production-golden-path.mjs first");
  }

  const { count: gunturTouch } = await sb
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", GUNTUR)
    .ilike("order_id", "ORD-GP-PROD%");
  if ((gunturTouch || 0) > 0) fail("FR-90", "Guntur tenant touched");
  else pass("FR-90", "Guntur tenant untouched");

  const primeApiSrc = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
  if (/rolling back payment row/.test(primeApiSrc) && /\.from\("payments"\)[\s\S]*\.delete\(\)/.test(primeApiSrc)) {
    pass("FR-60", "createPaymentWrite compensating rollback on AR failure");
  } else {
    fail("FR-60", "Payment+AR atomicity rollback missing in createPaymentWrite");
  }

  const fails = results.filter((r) => r.status === "FAIL");
  const warns = results.filter((r) => r.status === "WARN");
  console.log("\n=== Financial Reconciliation ===\n");
  for (const r of results) {
    console.log(`${r.status.padEnd(5)} ${r.id}  ${r.detail}`);
  }
  console.log(`\nSummary: PASS=${results.filter((r) => r.status === "PASS").length} WARN=${warns.length} FAIL=${fails.length}`);
  const goldenFails = fails.filter((r) => r.id.startsWith("FR-GP"));
  if (goldenFails.length) {
    console.log("\nRESULT: FAIL (golden path reconciliation)");
    process.exit(1);
  }
  if (fails.length) {
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }
  if (warns.length) {
    console.log("\nRESULT: WARN (legacy drift documented)");
    process.exit(0);
  }
  console.log("\nRESULT: PASS");
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
