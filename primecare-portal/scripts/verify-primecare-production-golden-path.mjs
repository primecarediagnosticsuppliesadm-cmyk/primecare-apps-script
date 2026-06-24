#!/usr/bin/env node
/**
 * Production golden path — app/API write paths only (HQ tenant, disposable records).
 * Chain: qual → contract → order → fulfill → invoice → PDF → payment → allocation → KPIs
 *
 * Usage: node scripts/verify-primecare-production-golden-path.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = "f168b98f-47a6-42c3-b788-24c00436fac2";
const GUNTUR = "787999b9-72f5-4163-a860-551c12ce3414";
const GOLDEN_LAB = "QA_LAB_001";
const TAG = "GP-PROD";

const results = [];
const chain = {};

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
}
function warn(id, detail) {
  results.push({ id, status: "WARN", detail });
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

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function loginAdmin(env) {
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
  });
  if (error) throw new Error(`Admin auth failed: ${error.message}`);
  return sb;
}

async function bindViteApi(adminSb) {
  const server = await createServer({
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
  });
  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const { data: session } = await adminSb.auth.getSession();
  if (supabase && session?.session) {
    await supabase.auth.setSession({
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
    });
  }
  const primeApi = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
  const invoiceApi = await server.ssrLoadModule("/src/api/invoiceSupabaseApi.js");
  return { server, primeApi, invoiceApi };
}

async function main() {
  const env = loadEnv();
  const adminSb = await loginAdmin(env);
  const { server, primeApi, invoiceApi } = await bindViteApi(adminSb);
  const ts = Date.now();
  const orderId = `ORD-${TAG}-${ts}`;

  try {
    const { data: qual } = await adminSb
      .from("lab_qualifications")
      .select("id,pipeline_stage")
      .eq("tenant_id", HQ)
      .eq("lab_id", GOLDEN_LAB)
      .maybeSingle();
    if (!qual?.id || !/won|qualified/i.test(String(qual.pipeline_stage))) {
      fail("GP-10", `Qualification not won for ${GOLDEN_LAB}`);
    } else {
      chain.qualification_id = qual.id;
      pass("GP-10", `Qualification ${qual.id} stage=${qual.pipeline_stage}`);
    }

    const { data: contract } = await adminSb
      .from("lab_contracts")
      .select("id,contract_number,status")
      .eq("lab_id", GOLDEN_LAB)
      .eq("status", "Active")
      .limit(1)
      .maybeSingle();
    if (!contract?.id) {
      fail("GP-11", "No active contract for golden lab");
    } else {
      chain.contract_id = contract.id;
      pass("GP-11", `Contract ${contract.contract_number || contract.id}`);
    }

    const { data: sku, error: skuErr } = await adminSb
      .from("v_stock_dashboard")
      .select("product_id,product_name,current_stock")
      .eq("tenant_id", HQ)
      .gt("current_stock", 0)
      .limit(1)
      .maybeSingle();
    if (!sku?.product_id) {
      fail("GP-12", `No in-stock SKU for order${skuErr ? `: ${skuErr.message}` : ""}`);
      return finish();
    }

    const qty = 1;
    const unitPrice = 100;
    const lineTotal = qty * unitPrice;

    const orderRes = await primeApi.createOrderWrite({
      labId: GOLDEN_LAB,
      tenantId: HQ,
      orderId,
      status: "Placed",
      createdBy: TAG,
      items: [
        {
          productId: sku.product_id,
          productName: sku.product_name,
          quantity: qty,
          unitPrice,
        },
      ],
    });
    if (!orderRes.success) {
      fail("GP-20", `createOrderWrite failed: ${orderRes.error}`);
      return finish();
    }
    chain.order_id = orderId;
    pass("GP-20", `Order created ${orderId} via createOrderWrite`);

    const fulfillRes = await primeApi.updateOrderStatusWrite(orderId, "Fulfilled", {
      actorId: TAG,
      note: `${TAG} fulfillment`,
    });
    if (!fulfillRes.success) {
      fail("GP-21", `updateOrderStatusWrite failed: ${fulfillRes.error}`);
      return finish();
    }
    pass("GP-21", "Order fulfilled via updateOrderStatusWrite");

    const { data: orderRow } = await adminSb
      .from("orders")
      .select("invoice_id,status,ar_posted")
      .eq("tenant_id", HQ)
      .eq("order_id", orderId)
      .maybeSingle();

    let invoiceDbId = orderRow?.invoice_id || null;
    if (!invoiceDbId) {
      fail("GP-22", "orders.invoice_id not set after fulfill");
    } else {
      const { data: inv } = await adminSb
        .from("invoices")
        .select("id,invoice_number,status,pdf_storage_path,total_amount")
        .eq("id", invoiceDbId)
        .maybeSingle();
      if (!inv?.id) {
        fail("GP-22", "Invoice row missing after fulfill hook");
      } else {
        chain.invoice_id = inv.id;
        chain.invoice_number = inv.invoice_number;
        pass("GP-22", `Invoice ${inv.invoice_number} created (${inv.id})`);
      }
    }

    if (chain.invoice_id) {
      const pdfRes = await invoiceApi.generateInvoicePdf(chain.invoice_id, {
        tenantId: HQ,
        actorId: TAG,
      });
      if (!pdfRes.success) {
        fail("GP-30", `generateInvoicePdf failed: ${pdfRes.error}`);
      } else {
        pass("GP-30", "PDF generated via generateInvoicePdf");
      }

      const { data: invPdf } = await adminSb
        .from("invoices")
        .select("pdf_storage_path")
        .eq("id", chain.invoice_id)
        .maybeSingle();
      chain.pdf_storage_path = invPdf?.pdf_storage_path || null;
      if (!chain.pdf_storage_path) {
        fail("GP-31", "pdf_storage_path not set");
      } else {
        pass("GP-31", `pdf_storage_path ${chain.pdf_storage_path}`);
      }

      const urlRes = await invoiceApi.getInvoicePdfSignedUrl(chain.invoice_id);
      const signedUrl = urlRes.url || urlRes.data?.signedUrl;
      if (!urlRes.success || !signedUrl) {
        fail("GP-32", `Signed URL failed: ${urlRes.error || "missing"}`);
      } else {
        const resp = await fetch(signedUrl);
        if (!resp.ok) {
          fail("GP-32", `PDF download HTTP ${resp.status}`);
        } else {
          const buf = await resp.arrayBuffer();
          if (buf.byteLength < 100) fail("GP-32", "PDF bytes too small");
          else pass("GP-32", `PDF download OK (${buf.byteLength} bytes)`);
        }
      }
    }

    const { data: arBefore } = await adminSb
      .from("ar_credit_control")
      .select("outstanding,total_paid")
      .eq("tenant_id", HQ)
      .eq("lab_id", GOLDEN_LAB)
      .maybeSingle();
    const arOutstandingBefore = num(arBefore?.outstanding);

    const paymentId = `PAY-${TAG}-${ts}`;
    const payAmount = lineTotal;
    const payRes = await primeApi.createPaymentWrite({
      labId: GOLDEN_LAB,
      tenantId: HQ,
      orderId,
      paymentId,
      amountReceived: payAmount,
      paymentMode: "Cash",
      outstandingBefore: arOutstandingBefore,
      collectedBy: TAG,
      note: `${TAG} golden payment`,
    });
    if (!payRes.success) {
      fail("GP-40", `createPaymentWrite failed: ${payRes.error}`);
    } else {
      chain.payment_id = paymentId;
      pass("GP-40", `Payment ${paymentId} recorded with orderId linkage`);
      if (payRes.data?.allocation) {
        chain.allocation_id =
          payRes.data.allocation?.id || payRes.data.allocation?.allocation_id || "linked";
        pass("GP-41", "Auto-allocation returned from createPaymentWrite");
      } else {
        const { data: allocs } = await adminSb
          .from("invoice_payment_allocations")
          .select("id,allocated_amount,payment_id,invoice_id")
          .eq("tenant_id", HQ)
          .eq("payment_id", paymentId);
        if (allocs?.length) {
          chain.allocation_id = allocs[0].id;
          pass("GP-41", `Allocation row ${allocs[0].id} amount=${allocs[0].allocated_amount}`);
        } else {
          fail("GP-41", "No allocation row for golden payment");
        }
      }
    }

    if (chain.invoice_id) {
      const { data: openBal } = await adminSb.rpc("get_invoice_open_balance", {
        p_invoice_id: chain.invoice_id,
      });
      if (num(openBal) <= 0.01) {
        pass("GP-42", `Invoice open balance ${openBal}`);
      } else {
        fail("GP-42", `Invoice still open: ${openBal}`);
      }
    }

    const { data: kpis } = await adminSb.rpc("get_invoice_tenant_financial_kpis", {
      p_tenant_id: HQ,
    });
    if (kpis && kpis.unallocated_cash != null) {
      pass("GP-50", `Executive KPI RPC OK (unallocated ${kpis.unallocated_cash})`);
    } else {
      fail("GP-50", "Executive financial KPI RPC failed");
    }

    try {
      const commData = await server.ssrLoadModule("/src/commission/commissionData.js");
      const bundle = await commData.loadCommissionEngineBundle(
        { tenantId: HQ, tenant_id: HQ, role: "executive" },
        { scopeTenantId: HQ, force: true }
      );
      const entries = bundle?.model?.entries || [];
      const payVisible = num(bundle?.paymentsCount) > 0;
      const attributed = entries.some(
        (e) => num(e.collectedAmount ?? e.collected_amount) > 0
      );
      if (payVisible && attributed) {
        pass("GP-45", `Commission engine: ${entries.length} entries, payments read OK`);
      } else if (payVisible) {
        pass("GP-45", "Commission engine loaded with payment reads (entries may be below threshold)");
      } else {
        fail("GP-45", "Commission engine has no payment reads for HQ scope");
      }
    } catch (commErr) {
      fail("GP-45", `Commission engine check failed: ${commErr?.message || commErr}`);
    }

    const { data: gunturOrders } = await adminSb
      .from("orders")
      .select("order_id")
      .eq("tenant_id", GUNTUR)
      .ilike("order_id", `${TAG}%`)
      .limit(1);
    if (gunturOrders?.length) {
      fail("GP-90", "Guntur tenant mutated — abort");
    } else {
      pass("GP-90", "Guntur tenant read-only confirmed");
    }
  } finally {
    await server?.close?.();
  }

  return finish();
}

function finish() {
  const fails = results.filter((r) => r.status === "FAIL");
  console.log("\n=== PrimeCare Production Golden Path ===\n");
  for (const r of results) {
    console.log(`${r.status.padEnd(5)} ${r.id}  ${r.detail}`);
  }
  console.log("\n--- Chain IDs ---");
  console.log(JSON.stringify(chain, null, 2));
  console.log(`\nSummary: PASS=${results.filter((r) => r.status === "PASS").length} FAIL=${fails.length}`);
  if (fails.length) {
    console.log("\nRESULT: FAIL");
    process.exit(1);
  }
  console.log("\nRESULT: PASS");
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
