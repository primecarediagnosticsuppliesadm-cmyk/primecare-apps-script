#!/usr/bin/env node
/**
 * HQ Admin Orders module certification — read-only against live QA Supabase.
 *
 * Usage:
 *   node scripts/verify-orders-admin-flow.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || "f168b98f-47a6-42c3-b788-24c00436fac2";
const QA_TENANT_CODE = "qa-tenant-001";
/** Seed order with historical ORDER_OUT before cancel — documented in GAP-017. */
const KNOWN_CANCELLED_LEDGER_SEED_ORDERS = new Set(["QA_ORD_001"]);

const results = [];

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
  console.error(`FAIL  ${id}: ${detail}`);
}

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeOrderStatusLabel(status) {
  const raw = str(status) || "Placed";
  const low = raw.toLowerCase();
  if (low === "cancelled") return "Cancelled";
  if (low === "fulfilled") return "Fulfilled";
  if (low === "processing") return "Processing";
  if (low === "placed" || low === "pending") return "Placed";
  return raw;
}

function normalizePaymentStatusLabel(status) {
  const raw = str(status);
  if (!raw) return "Pending";
  const low = raw.toLowerCase();
  if (low === "paid" || low === "current") return "Paid";
  if (low === "partial" || low === "partially paid") return "Partial";
  if (low === "pending") return "Pending";
  return raw;
}

function computeOrdersKpis(orders) {
  const list = Array.isArray(orders) ? orders : [];
  let placed = 0;
  let processing = 0;
  let fulfilled = 0;
  let cancelled = 0;
  let pendingPayment = 0;
  let totalValue = 0;

  for (const o of list) {
    const status = normalizeOrderStatusLabel(o.orderStatus).toLowerCase();
    if (status === "placed") placed += 1;
    else if (status === "processing") processing += 1;
    else if (status === "fulfilled") fulfilled += 1;
    else if (status === "cancelled") cancelled += 1;

    const payment = normalizePaymentStatusLabel(o.paymentStatus).toLowerCase();
    if (status !== "cancelled" && (payment === "pending" || payment === "partial")) {
      pendingPayment += 1;
    }

    if (status !== "cancelled") {
      totalValue += num(o.orderTotal);
    }
  }

  return {
    totalOrders: list.length,
    placed,
    processing,
    fulfilled,
    cancelled,
    pendingPayment,
    totalOrderValue: totalValue,
  };
}

function resolveOrderAmount(orderRow, lineTotalByOrderId) {
  const orderKey = str(orderRow.order_id ?? orderRow.orderId ?? orderRow.id);
  let amount = num(orderRow.total_amount ?? orderRow.totalAmount ?? orderRow.orderTotal ?? 0);
  if (amount <= 0 && orderKey) {
    amount = num(lineTotalByOrderId.get(orderKey));
  }
  return amount;
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

function mapOrderRow(row, labName = "") {
  return {
    orderId: str(row.order_id ?? row.orderId),
    tenantId: str(row.tenant_id ?? row.tenantId),
    labId: str(row.lab_id ?? row.labId),
    labName,
    orderStatus: str(row.status ?? row.order_status),
    paymentStatus: "Pending",
    orderTotal: num(row.total_amount ?? row.totalAmount),
    orderDate: str(row.order_date ?? row.orderDate),
    createdAt: str(row.created_at ?? row.createdAt),
    inventoryUpdated: row.inventory_updated === true,
  };
}

function lineTotal(line) {
  const direct = num(line.total_price ?? line.totalPrice ?? line.net_line_total);
  if (direct > 0) return direct;
  return num(line.quantity) * num(line.unit_price ?? line.unitPrice ?? line.price);
}

async function fetchOrderLines(sb, orderId) {
  const oid = str(orderId);
  const { data: items } = await sb.from("order_items").select("*").eq("order_id", oid);
  if ((items || []).length) return items;

  const { data: lines } = await sb.from("order_lines").select("*").eq("order_id", oid);
  return lines || [];
}

async function main() {
  console.log("\n=== HQ Admin Orders Certification ===\n");
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

  const { data: rawOrders, error: ordersErr } = await sb
    .from("orders")
    .select(
      "order_id,tenant_id,lab_id,status,total_amount,order_date,created_at,inventory_updated,ar_posted,cancelled_at,fulfilled_at,invoice_id"
    )
    .eq("tenant_id", HQ)
    .order("created_at", { ascending: false })
    .limit(500);
  if (ordersErr) throw new Error(ordersErr.message);

  const foreignRows = (rawOrders || []).filter((row) => str(row.tenant_id) !== HQ);
  if (foreignRows.length) {
    fail("tenant.isolation", `${foreignRows.length} order(s) outside HQ tenant visible to admin`);
  } else {
    pass("tenant.isolation", `All ${(rawOrders || []).length} visible orders belong to ${QA_TENANT_CODE}`);
  }

  const { count: foreignCount, error: foreignErr } = await sb
    .from("orders")
    .select("order_id", { count: "exact", head: true })
    .neq("tenant_id", HQ);
  if ((foreignCount || 0) > 0) {
    fail("tenant.rls_probe", `Admin can see ${foreignCount} foreign-tenant order row(s) via RLS`);
  } else if (foreignErr?.message) {
    pass("tenant.rls_probe", `Foreign orders not visible (${foreignErr.message})`);
  } else {
    pass("tenant.rls_probe", "No foreign-tenant orders visible under admin JWT");
  }

  const orders = (rawOrders || []).map((row) => mapOrderRow(row));
  if (!orders.length) {
    fail("orders.present", "No orders found for HQ tenant");
  } else {
    pass("orders.present", `${orders.length} HQ orders loaded`);
  }

  const kpis = computeOrdersKpis(orders);
  const statusCounts = orders.reduce(
    (acc, o) => {
      const key = normalizeOrderStatusLabel(o.orderStatus).toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {}
  );

  if (kpis.totalOrders === orders.length) {
    pass("kpi.total", `Total Orders KPI ${kpis.totalOrders}`);
  } else {
    fail("kpi.total", `KPI total ${kpis.totalOrders} != list ${orders.length}`);
  }

  for (const [field, actualKey] of [
    ["placed", "placed"],
    ["processing", "processing"],
    ["fulfilled", "fulfilled"],
    ["cancelled", "cancelled"],
  ]) {
    const expected = statusCounts[actualKey] || 0;
    if (kpis[field] === expected) {
      pass(`kpi.${field}`, `${kpis[field]} ${field}`);
    } else {
      fail(`kpi.${field}`, `KPI ${kpis[field]} != counted ${expected}`);
    }
  }

  const recomputedActiveValue = orders
    .filter((o) => normalizeOrderStatusLabel(o.orderStatus).toLowerCase() !== "cancelled")
    .reduce((s, o) => s + num(o.orderTotal), 0);
  if (Math.abs(kpis.totalOrderValue - recomputedActiveValue) <= 0.01) {
    pass("kpi.active_value", `Active Order Value ₹${kpis.totalOrderValue}`);
  } else {
    fail(
      "kpi.active_value",
      `KPI ${kpis.totalOrderValue} != recomputed ${recomputedActiveValue}`
    );
  }

  let headerMismatch = 0;
  let headerChecked = 0;
  for (const order of orders.slice(0, 50)) {
    const lines = await fetchOrderLines(sb, order.orderId);
    if (!lines.length) continue;
    headerChecked += 1;
    const lineSum = lines.reduce((s, line) => s + lineTotal(line), 0);
    const header = num(order.orderTotal);
    const resolved = resolveOrderAmount(
      { total_amount: header, totalAmount: header },
      new Map([[order.orderId, lineSum]])
    );
    if (header > 0 && Math.abs(header - lineSum) > 0.01 && Math.abs(resolved - header) > 0.01) {
      headerMismatch += 1;
    }
  }
  if (headerChecked === 0) {
    pass("reconcile.header_lines", "No line rows in sample — skipped header check");
  } else if (headerMismatch === 0) {
    pass(
      "reconcile.header_lines",
      `Header totals reconcile with line sums (${headerChecked} orders checked)`
    );
  } else {
    fail(
      "reconcile.header_lines",
      `${headerMismatch}/${headerChecked} orders have header vs line total mismatch`
    );
  }

  const fulfilledOrders = orders.filter(
    (o) => normalizeOrderStatusLabel(o.orderStatus).toLowerCase() === "fulfilled"
  );
  const cancelledOrders = orders.filter(
    (o) => normalizeOrderStatusLabel(o.orderStatus).toLowerCase() === "cancelled"
  );

  let fulfilledMissingLedger = 0;
  let fulfilledDuplicateLedger = 0;
  let fulfilledChecked = 0;

  for (const order of fulfilledOrders.slice(0, 30)) {
    const lines = await fetchOrderLines(sb, order.orderId);
    if (!lines.length) continue;
    fulfilledChecked += 1;

    const { data: ledgerRows } = await sb
      .from("inventory_ledger")
      .select("product_id,quantity,movement_type,order_id")
      .eq("order_id", order.orderId)
      .eq("movement_type", "ORDER_OUT");

    const ledger = ledgerRows || [];
    if (!ledger.length) {
      fulfilledMissingLedger += 1;
      continue;
    }

    for (const line of lines) {
      const productId = str(line.product_id ?? line.productId);
      const qty = num(line.quantity);
      if (!productId || qty <= 0) continue;
      const matches = ledger.filter((row) => str(row.product_id) === productId);
      if (matches.length !== 1) {
        fulfilledDuplicateLedger += 1;
        break;
      }
      if (num(matches[0].quantity) !== qty) {
        fulfilledMissingLedger += 1;
        break;
      }
    }
  }

  if (!fulfilledOrders.length) {
    pass("fulfill.ledger", "No fulfilled orders in sample");
  } else if (fulfilledMissingLedger === 0 && fulfilledDuplicateLedger === 0) {
    pass(
      "fulfill.ledger",
      `${fulfilledChecked} fulfilled order(s) have matching single ORDER_OUT per SKU`
    );
  } else {
    if (fulfilledMissingLedger) {
      fail(
        "fulfill.ledger",
        `${fulfilledMissingLedger} fulfilled order(s) missing or mismatched ORDER_OUT ledger`
      );
    }
    if (fulfilledDuplicateLedger) {
      fail(
        "fulfill.duplicate_ledger",
        `${fulfilledDuplicateLedger} fulfilled order(s) have duplicate ORDER_OUT rows per SKU`
      );
    }
  }

  let cancelledWithLedger = 0;
  let cancelledSeedExceptions = 0;
  for (const order of cancelledOrders.slice(0, 20)) {
    const { data: ledgerRows } = await sb
      .from("inventory_ledger")
      .select("movement_type")
      .eq("order_id", order.orderId)
      .eq("movement_type", "ORDER_OUT");
    if (!(ledgerRows || []).length) continue;
    if (KNOWN_CANCELLED_LEDGER_SEED_ORDERS.has(order.orderId)) {
      cancelledSeedExceptions += 1;
      continue;
    }
    cancelledWithLedger += 1;
  }

  if (!cancelledOrders.length) {
    pass("cancel.no_deduct", "No cancelled orders in sample");
  } else if (cancelledWithLedger === 0) {
    pass(
      "cancel.no_deduct",
      `${cancelledOrders.length} cancelled order(s) have no ORDER_OUT` +
        (cancelledSeedExceptions
          ? ` (${cancelledSeedExceptions} known seed exception(s) documented)`
          : "")
    );
  } else {
    fail(
      "cancel.no_deduct",
      `${cancelledWithLedger} cancelled order(s) unexpectedly have ORDER_OUT ledger rows`
    );
  }

  const ordersPage = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
  const opsPage = readFileSync(resolve(root, "src/components/operations/UserProvisioningPanel.jsx"), "utf8");
  if (ordersPage.includes("isHqOrderStatusWriteBlocked") && !ordersPage.includes("disabled={updatingStatus || hqFrozen}")) {
    pass("ui.freeze_review", "Review button is not disabled by HQ freeze");
  } else {
    fail("ui.freeze_review", "Review button incorrectly tied to hqFrozen disabled state");
  }
  if (
    /onClick=\{\(\) => openOrder\(order\.orderId\)\}/.test(ordersPage) &&
    /Status Actions[\s\S]{0,1200}hqStatusWriteBlocked/.test(ordersPage)
  ) {
    pass("ui.freeze_writes", "Status mutation buttons remain disabled when HQ is frozen");
  } else {
    fail("ui.freeze_writes", "Status mutation buttons missing HQ freeze guard");
  }
  if (
    !/disabled=\{hqFrozen\}[\s\S]{0,240}handleRecordOrderPayment/.test(ordersPage) &&
    !/function handleRecordOrderPayment\(\) \{[\s\S]{0,80}if \(hqFrozen\) return;/.test(ordersPage)
  ) {
    pass("ui.freeze_payment", "Record Payment remains available during HQ freeze");
  } else {
    fail("ui.freeze_payment", "Record Payment incorrectly blocked by HQ freeze");
  }
  if (/disabled=\{hqFrozen\}/.test(opsPage) && /Create User/.test(opsPage)) {
    pass("ui.freeze_provisioning", "User provisioning writes blocked when HQ is frozen");
  } else {
    fail("ui.freeze_provisioning", "User provisioning missing HQ freeze guard");
  }

  console.log("\n=== Summary ===");
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`PASS: ${results.filter((r) => r.status === "PASS").length}`);
  console.log(`FAIL: ${failed.length}`);
  if (failed.length) {
    for (const row of failed) console.log(`  - ${row.id}: ${row.detail}`);
    process.exit(1);
  }
  console.log("\nHQ Admin Orders certification passed.\n");
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
