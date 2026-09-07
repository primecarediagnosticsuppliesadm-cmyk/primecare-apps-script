#!/usr/bin/env node
/**
 * Flow 3A — financial server hardening.
 *
 * Default: static only.
 * Live QA (mutates QA only; refuses Production):
 *   node scripts/verify-flow-3a.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { QA_ADMIN, QA_AGENT, QA_EXECUTIVE, QA_HQ_TENANT_ID, QA_LAB } from "./qaCredentials.mjs";
import { signInWithQaCredentials, loadEnvLocal } from "./qaSignIn.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";
const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const MIG_REL = "supabase/migrations/20260906120000_flow3a_financial_server_hardening.sql";
const TWIN_REL = "supabase/sql/flow3a_financial_server_hardening.sql";
const REVOKE_REL = "supabase/migrations/20260907120000_flow3a_revoke_anon_financial_rpc_execute.sql";
const REVOKE_TWIN_REL = "supabase/sql/flow3a_revoke_anon_financial_rpc_execute.sql";
const QA_LAB_ID = "QA_LAB_001";
const OTHER_LAB_ID = "QA_LAB_002";
const FOREIGN_TENANT = "787999b9-72f5-4163-a860-551c12ce3414";

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
  process.exitCode = 1;
}
function str(v) {
  return String(v ?? "").trim();
}
function moneyEq(a, b) {
  return Math.round(Number(a) * 100) === Math.round(Number(b) * 100);
}
function deniedWrite(res) {
  const msg = str(res?.error?.message).toLowerCase();
  const code = str(res?.error?.code);
  if (res?.error) {
    return (
      code === "42501" ||
      code === "401" ||
      code === "PGRST301" ||
      code === "P0001" ||
      /permission|denied|rls|policy|rpc_only|forbidden|jwt/i.test(msg)
    );
  }
  const rows = Array.isArray(res?.data) ? res.data.length : 0;
  return rows === 0;
}

function projectRefFromUrl(url) {
  const host = str(url).replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0] || "";
}

function readSrc(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

console.log("\n=== FLOW 3A FINANCIAL SERVER HARDENING ===\n");

const mig = existsSync(resolve(root, MIG_REL)) ? readSrc(MIG_REL) : "";
const twin = existsSync(resolve(root, TWIN_REL)) ? readSrc(TWIN_REL) : "";
const apiSrc = readSrc("src/api/primecareSupabaseApi.js");
const collectionsSrc = readSrc("src/pages/CollectionsPage.jsx");

if (mig && twin && mig === twin) pass("static.twin", `${MIG_REL} matches SQL twin`);
else fail("static.twin", "migration/twin missing or diverge");

const revokeMig = existsSync(resolve(root, REVOKE_REL)) ? readSrc(REVOKE_REL) : "";
const revokeTwin = existsSync(resolve(root, REVOKE_TWIN_REL)) ? readSrc(REVOKE_TWIN_REL) : "";
if (revokeMig && revokeTwin && revokeMig === revokeTwin) {
  pass("static.twin.revoke_anon", `${REVOKE_REL} matches SQL twin`);
} else {
  fail("static.twin.revoke_anon", "anon EXECUTE revoke migration/twin missing or diverge");
}

if (
  /REVOKE EXECUTE ON FUNCTION public\.post_collection_payment\(text, text, text, numeric, text, text, date, text, text, text\) FROM anon/.test(
    revokeMig
  ) &&
  /REVOKE EXECUTE ON FUNCTION public\.post_fulfillment_ar_bump\(text, text, text, numeric\) FROM anon/.test(
    revokeMig
  ) &&
  /FROM PUBLIC/.test(revokeMig) &&
  /GRANT EXECUTE ON FUNCTION public\.post_collection_payment\(text, text, text, numeric, text, text, date, text, text, text\) TO authenticated/.test(
    revokeMig
  ) &&
  /GRANT EXECUTE ON FUNCTION public\.post_fulfillment_ar_bump\(text, text, text, numeric\) TO authenticated/.test(
    revokeMig
  ) &&
  /TO service_role/.test(revokeMig) &&
  !/CREATE OR REPLACE FUNCTION/.test(revokeMig)
) {
  pass(
    "static.rpc.anon_no_execute",
    "anon/PUBLIC EXECUTE revoked; authenticated + service_role preserved; no body rewrite"
  );
} else {
  fail("static.rpc.anon_no_execute", "anon EXECUTE revoke migration incomplete or rewrites function bodies");
}

if (/CREATE OR REPLACE FUNCTION public\.post_collection_payment/.test(mig) && /p_client_request_id/.test(mig)) {
  pass("static.rpc.payment", "post_collection_payment requires client_request_id");
} else fail("static.rpc.payment", "payment RPC + idempotency key missing");

if (/CREATE OR REPLACE FUNCTION public\.post_fulfillment_ar_bump/.test(mig)) {
  pass("static.rpc.fulfill_ar", "post_fulfillment_ar_bump present");
} else fail("static.rpc.fulfill_ar", "fulfill AR RPC missing");

if (
  /ar_credit_protect_financial_columns/.test(mig) &&
  /ar_financial_columns_rpc_only/.test(mig)
) {
  pass("static.trigger.ar", "AR financial-column trigger");
} else fail("static.trigger.ar", "AR protect trigger missing");

if (
  /DROP POLICY IF EXISTS "payments_delete_by_role"/.test(mig) &&
  /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.payments FROM authenticated/.test(mig)
) {
  pass("static.payments.dml", "authenticated payment INSERT/UPDATE/DELETE revoked");
} else fail("static.payments.dml", "payment DML lockdown missing");

if (/payment_exceeds_receivable/.test(mig) && !/GREATEST\(0::numeric, v_old_out - p_amount_received\)/.test(mig)) {
  pass("static.overpay", "overpayment rejected; GREATEST floor removed");
} else fail("static.overpay", "overpayment policy missing");

if (/allocate_payment_to_invoice\(/.test(mig) && /invoice_not_allocatable/.test(mig)) {
  pass("static.atomic.linked", "linked path allocates in same function");
} else fail("static.atomic.linked", "linked allocation not in post_collection_payment");

if (/SET search_path = public/.test(mig) && /SECURITY DEFINER/.test(mig) && /auth\.uid\(\)/.test(mig)) {
  pass("static.security_definer", "search_path + actor from auth.uid");
} else fail("static.security_definer", "DEFINER hardening missing");

if (/idempotency_payload_conflict/.test(mig) && /payments_tenant_client_request_uidx/.test(mig)) {
  pass("static.idempotency", "unique client_request_id + payload conflict");
} else fail("static.idempotency", "idempotency enforcement missing");

if (!/INSERT INTO public\.labs/.test(mig) && !/activate_prospect_lab/.test(mig)) {
  pass("static.flow2_untouched", "3A does not touch Flow 2 objects");
} else fail("static.flow2_untouched", "unexpected Flow 2 mutation");

if (
  /rpc\("post_collection_payment"/.test(apiSrc) &&
  /p_client_request_id/.test(apiSrc) &&
  !/falling back to legacy write path/.test(apiSrc) &&
  !/compensateFailedOrderPaymentWrite/.test(apiSrc) &&
  !/insertPaymentsRow/.test(apiSrc)
) {
  pass("static.client.fail_closed", "createPaymentWrite RPC-only, no fallback/delete");
} else fail("static.client.fail_closed", "legacy payment write path still present");

if (/rpc\("post_fulfillment_ar_bump"/.test(apiSrc) && /async function bumpArOutstandingForFulfillment/.test(apiSrc)) {
  pass("static.client.fulfill_ar", "Flow 1 bump uses post_fulfillment_ar_bump");
} else fail("static.client.fulfill_ar", "fulfill AR still client table UPDATE");

if (/clientRequestId/.test(collectionsSrc) && /paymentClientRequestRef/.test(collectionsSrc)) {
  pass("static.ui.idempotency", "Collections reuses clientRequestId per fingerprint");
} else fail("static.ui.idempotency", "Collections idempotency key missing");

if (!APPLY) {
  console.log("\nStatic checks complete. Rerun with --apply for live QA probes (QA only).\n");
  process.exit(process.exitCode || 0);
}

const env = { ...loadEnvLocal(), ...process.env };
const envDir = root;
if (!env.VITE_SUPABASE_URL) {
  fail("live.env", "VITE_SUPABASE_URL missing");
  process.exit(1);
}
const urlRef = projectRefFromUrl(env.VITE_SUPABASE_URL);
if (urlRef === PROD_REF) {
  fail("live.env", `refusing Production project ${PROD_REF}`);
  process.exit(1);
}
if (urlRef !== QA_REF) {
  fail("live.env", `expected QA ${QA_REF}, got ${urlRef || "unknown"}`);
  process.exit(1);
}
pass("live.env", `QA ${QA_REF}`);

const adminSb = env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
if (!adminSb) {
  fail("live.service_role", "SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}

async function signIn(client, creds, label) {
  const { error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) fail(`live.auth.${label}`, error.message);
  else pass(`live.auth.${label}`, creds.email);
  return !error;
}

function userClient() {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const labClient = userClient();
const agentClient = userClient();
const adminClient = userClient();
const execClient = userClient();

if (!(await signIn(labClient, QA_LAB, "lab"))) process.exit(1);
const agentAuth = await signInWithQaCredentials(agentClient, QA_AGENT, {
  repairAgent: true,
  fallbackEmail: "qa.agent@primecare.test",
});
if (agentAuth.ok) pass("live.auth.agent", agentAuth.email);
else fail("live.auth.agent", agentAuth.error);
if (!(await signIn(adminClient, QA_ADMIN, "admin"))) process.exit(1);
if (!(await signIn(execClient, QA_EXECUTIVE, "executive"))) process.exit(1);
if (!agentAuth.ok) process.exit(1);

async function readAr(labId) {
  const { data } = await adminSb
    .from("ar_credit_control")
    .select("lab_id,outstanding,total_paid,total_delivered,tenant_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", labId)
    .maybeSingle();
  return data;
}

async function countPays(orderId) {
  const { data } = await adminSb.from("payments").select("payment_id,amount_received,client_request_id").eq("order_id", orderId);
  return data || [];
}

async function countAllocs(invoiceId) {
  const { data } = await adminSb
    .from("invoice_payment_allocations")
    .select("id,payment_id,allocated_amount")
    .eq("invoice_id", invoiceId);
  return data || [];
}

const agentFin = await agentClient
  .from("ar_credit_control")
  .update({ outstanding: 123456 })
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .eq("lab_id", QA_LAB_ID)
  .select("lab_id,outstanding");
if (deniedWrite(agentFin) || /ar_financial_columns_rpc_only/i.test(str(agentFin.error?.message))) {
  pass("live.H.agent_raw_ar", agentFin.error?.message || "0 rows");
} else {
  fail("live.H.agent_raw_ar", "agent updated outstanding");
}

const adminFin = await adminClient
  .from("ar_credit_control")
  .update({ outstanding: 123456 })
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .eq("lab_id", QA_LAB_ID)
  .select("lab_id,outstanding");
if (
  deniedWrite(adminFin) ||
  /ar_financial_columns_rpc_only/i.test(str(adminFin.error?.message))
) {
  pass("live.H.admin_raw_ar", adminFin.error?.message || "0 rows");
} else {
  fail("live.H.admin_raw_ar", "admin updated outstanding via table");
}

const notesOk = await adminClient
  .from("ar_credit_control")
  .update({ updated_at: new Date().toISOString() })
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .eq("lab_id", QA_LAB_ID)
  .select("lab_id");
if (!deniedWrite(notesOk) && (notesOk.data || []).some((r) => r.lab_id === QA_LAB_ID)) {
  pass("live.notes.updated_at", "operational AR UPDATE still allowed");
} else {
  fail("live.notes.updated_at", notesOk.error?.message || "notes/updated_at UPDATE blocked");
}

const delPay = await adminClient.from("payments").delete().eq("tenant_id", QA_HQ_TENANT_ID).select("payment_id").limit(1);
if (deniedWrite(delPay)) pass("live.I.admin_payment_delete", delPay.error?.message || "0 rows");
else fail("live.I.admin_payment_delete", "admin deleted a payment");

const labPay = await labClient.rpc("post_collection_payment", {
  p_tenant_id: QA_HQ_TENANT_ID,
  p_lab_id: QA_LAB_ID,
  p_payment_id: "PAY-3A-LAB-SHOULD-FAIL",
  p_amount_received: 1,
  p_client_request_id: `crq-lab-${Date.now()}`,
});
if (labPay.error && /forbidden/i.test(labPay.error.message)) pass("live.G.lab_rpc", labPay.error.message);
else fail("live.G.lab_rpc", labPay.error?.message || "lab RPC succeeded");

const anonClient = userClient();
const anonPay = await anonClient.rpc("post_collection_payment", {
  p_tenant_id: QA_HQ_TENANT_ID,
  p_lab_id: QA_LAB_ID,
  p_payment_id: "PAY-3A-ANON-SHOULD-FAIL",
  p_amount_received: 1,
  p_client_request_id: `crq-anon-${Date.now()}`,
});
const anonMsg = str(anonPay.error?.message).toLowerCase();
const anonCode = str(anonPay.error?.code);
if (
  anonPay.error &&
  (anonCode === "42501" ||
    anonCode === "PGRST301" ||
    /permission|denied|jwt|not authenticated|unauthorized/i.test(anonMsg))
) {
  pass("live.anon_rpc", anonPay.error.message);
} else {
  fail("live.anon_rpc", anonPay.error?.message || "anon EXECUTE succeeded");
}

const anonBump = await anonClient.rpc("post_fulfillment_ar_bump", {
  p_tenant_id: QA_HQ_TENANT_ID,
  p_lab_id: QA_LAB_ID,
  p_order_id: "ORD-3A-ANON-SHOULD-FAIL",
  p_delta_amount: 1,
});
const bumpMsg = str(anonBump.error?.message).toLowerCase();
const bumpCode = str(anonBump.error?.code);
if (
  anonBump.error &&
  (bumpCode === "42501" ||
    bumpCode === "PGRST301" ||
    /permission|denied|jwt|not authenticated|unauthorized/i.test(bumpMsg))
) {
  pass("live.anon_fulfill_rpc", anonBump.error.message);
} else {
  fail("live.anon_fulfill_rpc", anonBump.error?.message || "anon fulfill EXECUTE succeeded");
}

const xtenant = await adminClient.rpc("post_collection_payment", {
  p_tenant_id: FOREIGN_TENANT,
  p_lab_id: QA_LAB_ID,
  p_payment_id: "PAY-3A-XTENANT",
  p_amount_received: 1,
  p_client_request_id: `crq-xtenant-${Date.now()}`,
});
if (xtenant.error) pass("live.E.cross_tenant", xtenant.error.message);
else fail("live.E.cross_tenant", "cross-tenant payment succeeded");

async function catalogProduct() {
  const { data, error } = await adminSb
    .from("products")
    .select("product_id,product_name,selling_price,active")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("active", true)
    .gt("selling_price", 0)
    .limit(25);
  if (error) throw new Error(error.message);
  for (const row of data || []) {
    const inv = await adminSb
      .from("inventory")
      .select("product_id,current_stock")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("product_id", row.product_id)
      .gt("current_stock", 2)
      .maybeSingle();
    if (inv.data?.product_id) return { ...row, current_stock: Number(inv.data.current_stock) };
  }
  return null;
}

async function generateInvoicePdf(session, invoiceId) {
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/generate-invoice-pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: env.VITE_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ invoiceId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || body?.message || `PDF HTTP ${res.status}`);
  return body;
}

const product = await catalogProduct();
if (!product) {
  fail("live.fixture.product", "no in-stock catalog product");
  process.exit(1);
}
pass("live.fixture.product", `${product.product_id} price=${product.selling_price}`);

await adminSb
  .from("labs")
  .update({ ordering_mode: "self_service", status: "ACTIVE" })
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .eq("lab_id", QA_LAB_ID);

let viteServer = null;
try {
  viteServer = await createServer({
    configFile: resolve(root, "vite.config.js"),
    envDir,
    server: { middlewareMode: true },
  });
  const { supabase } = await viteServer.ssrLoadModule("/src/api/supabaseClient.js");
  const { data: adminSession } = await adminClient.auth.getSession();
  if (supabase && adminSession?.session) {
    await supabase.auth.setSession({
      access_token: adminSession.session.access_token,
      refresh_token: adminSession.session.refresh_token,
    });
  }
  const primeApi = await viteServer.ssrLoadModule("/src/api/primecareSupabaseApi.js");

  async function placeAndFulfill(tag) {
    const orderId = `ORD-3A-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const placed = await labClient.rpc("create_lab_order", {
      p_tenant_id: QA_HQ_TENANT_ID,
      p_lab_id: QA_LAB_ID,
      p_order_id: orderId,
      p_items: [{ product_id: product.product_id, quantity: 1 }],
      p_client_request_id: `CRQ-3A-${orderId}`,
      p_status: "Placed",
      p_created_by: QA_LAB.email,
    });
    if (placed.error) throw new Error(placed.error.message);
    const fulfillRes = await primeApi.updateOrderStatusWrite(orderId, "Fulfilled", {
      actorId: QA_ADMIN.email,
      note: "flow-3a QA",
      orderStatus: "Placed",
    });
    if (!fulfillRes?.success) throw new Error(fulfillRes?.error || "fulfill failed");
    const { data: order } = await adminSb
      .from("orders")
      .select("order_id,status,total_amount,ar_posted,invoice_id,lab_id")
      .eq("order_id", orderId)
      .maybeSingle();
    const { data: invoice } = await adminSb
      .from("invoices")
      .select("id,invoice_number,status,total_amount,order_id,lab_id,tenant_id,pdf_storage_path,sent_at")
      .eq("id", order.invoice_id)
      .maybeSingle();
    return { order, invoice };
  }

  const draftBundle = await placeAndFulfill("draft");
  const arBeforeDraft = await readAr(QA_LAB_ID);
  const paysBeforeDraft = (await countPays(draftBundle.order.order_id)).length;
  const allocsBeforeDraft = (await countAllocs(draftBundle.invoice.id)).length;
  const draftPost = await adminClient.rpc("post_collection_payment", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: QA_LAB_ID,
    p_payment_id: `PAY-3A-DRAFT-${Date.now()}`,
    p_amount_received: 1,
    p_client_request_id: `crq-draft-${Date.now()}`,
    p_order_id: draftBundle.order.order_id,
  });
  const arAfterDraft = await readAr(QA_LAB_ID);
  const paysAfterDraft = (await countPays(draftBundle.order.order_id)).length;
  const allocsAfterDraft = (await countAllocs(draftBundle.invoice.id)).length;
  if (
    draftPost.error &&
    /invoice_not_allocatable/i.test(draftPost.error.message) &&
    paysAfterDraft === paysBeforeDraft &&
    allocsAfterDraft === allocsBeforeDraft &&
    moneyEq(arAfterDraft.outstanding, arBeforeDraft.outstanding) &&
    moneyEq(arAfterDraft.total_paid, arBeforeDraft.total_paid)
  ) {
    pass("live.J.rollback", "draft linked post rolled back; AR/payment/allocation unchanged");
  } else {
    fail(
      "live.J.rollback",
      `err=${draftPost.error?.message} pays ${paysBeforeDraft}->${paysAfterDraft} alloc ${allocsBeforeDraft}->${allocsAfterDraft}`
    );
  }

  const live = await placeAndFulfill("pay");
  if (live.order?.ar_posted !== true) fail("live.O.ar_posted", String(live.order?.ar_posted));
  else pass("live.O.ar_posted", "Flow 1 fulfill still sets ar_posted");
  if (!live.invoice?.id) {
    fail("live.O.invoice", "invoice missing after fulfill");
    process.exit(1);
  } else pass("live.O.invoice", live.invoice.invoice_number);

  const session = (await adminClient.auth.getSession()).data.session;
  await generateInvoicePdf(session, live.invoice.id);
  const { data: sentInv } = await adminSb
    .from("invoices")
    .select("id,status,total_amount,order_id,lab_id,pdf_storage_path,sent_at")
    .eq("id", live.invoice.id)
    .maybeSingle();
  if (sentInv?.status === "sent" && sentInv.pdf_storage_path && sentInv.sent_at) {
    pass("live.finalize", `status=${sentInv.status}`);
  } else {
    fail("live.finalize", `status=${sentInv?.status} pdf=${sentInv?.pdf_storage_path}`);
    process.exit(1);
  }

  const invoiceTotal = Number(sentInv.total_amount);
  const payAmt = Math.round((invoiceTotal / 3) * 100) / 100;
  if (!(payAmt > 0 && payAmt < invoiceTotal)) {
    fail("live.A.amount", `cannot form partial from total=${invoiceTotal}`);
    process.exit(1);
  }

  const arBefore = await readAr(QA_LAB_ID);
  const crq = `crq-3a-partial-${live.order.order_id}`;
  const first = await primeApi.createPaymentWrite({
    labId: QA_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    orderId: live.order.order_id,
    amountReceived: payAmt,
    paymentMode: "UPI",
    collectedBy: QA_ADMIN.email,
    clientRequestId: crq,
  });
  if (!first.success) {
    fail("live.A.post", first.error || "createPaymentWrite failed");
    process.exit(1);
  }
  const pays = await countPays(live.order.order_id);
  const allocs = await countAllocs(sentInv.id);
  const { data: openAfter } = await adminSb.rpc("get_invoice_open_balance", { p_invoice_id: sentInv.id });
  const arMid = await readAr(QA_LAB_ID);
  const expectedOpen = invoiceTotal - payAmt;
  const outDelta = Number(arMid.outstanding) - Number(arBefore.outstanding);
  const paidDelta = Number(arMid.total_paid) - Number(arBefore.total_paid);
  if (
    pays.length === 1 &&
    allocs.length === 1 &&
    moneyEq(openAfter, expectedOpen) &&
    moneyEq(outDelta, -payAmt) &&
    moneyEq(paidDelta, payAmt)
  ) {
    pass(
      "live.A.partial",
      `pay=${payAmt} open=${openAfter} ARΔ=${outDelta} paidΔ=${paidDelta} (invoice ${invoiceTotal})`
    );
  } else {
    fail(
      "live.A.partial",
      `pays=${pays.length} allocs=${allocs.length} open=${openAfter} expectedOpen=${expectedOpen} outΔ=${outDelta} paidΔ=${paidDelta}`
    );
  }

  const retry = await primeApi.createPaymentWrite({
    labId: QA_LAB_ID,
    tenantId: QA_HQ_TENANT_ID,
    orderId: live.order.order_id,
    amountReceived: payAmt,
    paymentMode: "UPI",
    collectedBy: QA_ADMIN.email,
    clientRequestId: crq,
  });
  const pays2 = await countPays(live.order.order_id);
  const allocs2 = await countAllocs(sentInv.id);
  const arRetry = await readAr(QA_LAB_ID);
  if (
    retry.success &&
    retry.data?.idempotent &&
    pays2.length === 1 &&
    allocs2.length === 1 &&
    moneyEq(arRetry.outstanding, arMid.outstanding) &&
    moneyEq(arRetry.total_paid, arMid.total_paid)
  ) {
    pass("live.B.retry", "same client_request_id did not reduce AR twice");
  } else {
    fail("live.B.retry", `success=${retry.success} idempotent=${retry.data?.idempotent} pays=${pays2.length}`);
  }

  const changed = await adminClient.rpc("post_collection_payment", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: QA_LAB_ID,
    p_payment_id: "PAY-3A-CHANGED",
    p_amount_received: payAmt + 1,
    p_client_request_id: crq,
    p_order_id: live.order.order_id,
  });
  if (changed.error && /idempotency_payload_conflict/i.test(changed.error.message)) {
    pass("live.C.payload_conflict", changed.error.message);
  } else {
    fail("live.C.payload_conflict", changed.error?.message || "expected conflict");
  }

  const { data: otherInv } = await adminSb
    .from("invoices")
    .select("id,order_id,lab_id,status")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("lab_id", OTHER_LAB_ID)
    .limit(1)
    .maybeSingle();
  if (otherInv?.order_id) {
    const crossLab = await adminClient.rpc("post_collection_payment", {
      p_tenant_id: QA_HQ_TENANT_ID,
      p_lab_id: QA_LAB_ID,
      p_payment_id: `PAY-3A-XLAB-${Date.now()}`,
      p_amount_received: 1,
      p_client_request_id: `crq-xlab-${Date.now()}`,
      p_order_id: otherInv.order_id,
    });
    if (crossLab.error && /lab_mismatch|invoice_not_found|forbidden/i.test(crossLab.error.message)) {
      pass("live.D.cross_lab", crossLab.error.message);
    } else {
      fail("live.D.cross_lab", crossLab.error?.message || "cross-lab post succeeded");
    }
  } else {
    const mismatch = await adminClient.rpc("post_collection_payment", {
      p_tenant_id: QA_HQ_TENANT_ID,
      p_lab_id: OTHER_LAB_ID,
      p_payment_id: `PAY-3A-XLAB-${Date.now()}`,
      p_amount_received: 1,
      p_client_request_id: `crq-xlab-${Date.now()}`,
      p_order_id: live.order.order_id,
    });
    if (mismatch.error && /lab_mismatch|forbidden|ar_row_not_found/i.test(mismatch.error.message)) {
      pass("live.D.cross_lab", mismatch.error.message);
    } else {
      fail("live.D.cross_lab", mismatch.error?.message || "cross-lab post succeeded");
    }
  }

  const over = await adminClient.rpc("post_collection_payment", {
    p_tenant_id: QA_HQ_TENANT_ID,
    p_lab_id: QA_LAB_ID,
    p_payment_id: `PAY-3A-OVER-${Date.now()}`,
    p_amount_received: invoiceTotal + 1000,
    p_client_request_id: `crq-over-${Date.now()}`,
    p_order_id: live.order.order_id,
  });
  const arOver = await readAr(QA_LAB_ID);
  const paysOver = await countPays(live.order.order_id);
  if (
    over.error &&
    /payment_exceeds_receivable/i.test(over.error.message) &&
    paysOver.length === 1 &&
    moneyEq(arOver.outstanding, arMid.outstanding)
  ) {
    pass("live.F.overpay", over.error.message);
  } else {
    fail("live.F.overpay", over.error?.message || "overpay succeeded");
  }
} catch (err) {
  fail("live.exception", err?.message || String(err));
} finally {
  if (viteServer) await viteServer.close();
}

if (failures) {
  console.log(`\nFLOW 3A QA HOLD — ${failures} failure(s)\n`);
  process.exit(1);
}
console.log("\nFLOW 3A QA GREEN\n");
