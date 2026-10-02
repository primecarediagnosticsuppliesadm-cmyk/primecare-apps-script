#!/usr/bin/env node
/**
 * P0-A commercial response.
 * Default: static.
 * Live QA: node scripts/verify-commercial-response-p0a.mjs --apply
 * Never targets Production.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composeAgentVisibleCommercialText } from "../src/visits/commercialResponse.js";
import { QA_ADMIN, QA_AGENT, QA_HQ_TENANT_ID, QA_LAB } from "./qaCredentials.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");
const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const MIGRATION = "supabase/migrations/20261002120000_p0a_commercial_response.sql";

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

function loadEnv() {
  const candidates = [
    resolve(root, ".env.local"),
    resolve("/Users/kumarmanegalla/Documents/primecare-apps-script/primecare-portal/.env.local"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error("Missing .env.local (QA)");
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

function projectRefFromUrl(url) {
  const host = str(url).replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0] || "";
}

const sql = readFileSync(resolve(root, MIGRATION), "utf8");
const panel = readFileSync(resolve(root, "src/components/hq/VisitHandoffHqPanel.jsx"), "utf8");
const api = readFileSync(resolve(root, "src/visits/visitHandoffsApi.js"), "utf8");
const bounds = readFileSync(resolve(root, "src/api/hqReadBounds.js"), "utf8");

if (sql.includes("CREATE TABLE IF NOT EXISTS public.suppliers") && sql.includes("CREATE TABLE IF NOT EXISTS public.supplier_offers")) {
  pass("static.tables", "supplier and verified offer tables");
} else fail("static.tables", "supplier tables missing");

if (sql.includes("handoff_commercial_responses") && sql.includes("handoff_commercial_economics")) {
  pass("static.response_split", "agent terms and HQ economics are separate tables");
} else fail("static.response_split", "response split missing");

if (sql.includes("public.respond_visit_handoff") && sql.includes("commercial_respond_failed:")) {
  pass("static.same_transaction", "failed handoff response rolls the commercial write back");
} else fail("static.same_transaction", "respond integration missing");

if (!/CREATE TABLE[^;]*public\.products/i.test(sql) && !sql.includes("create_lab_order") && !sql.includes("ALTER TABLE public.orders") && !sql.includes("ALTER TABLE public.invoices") && !sql.includes("ALTER TABLE public.payments")) {
  pass("static.no_financial_rewrite", "no new product master and no order, invoice, or payment change");
} else fail("static.no_financial_rewrite", "migration touches financial or product-master objects");

if (!sql.includes("notification_email") && !/quote_lines|CREATE TABLE[^;]*quotes/i.test(sql)) {
  pass("static.no_quote_or_email", "no quote table and no email change");
} else fail("static.no_quote_or_email", "quote or email object present");

if (!sql.includes("AS unit_cost") && sql.includes("unit_selling_price") && sql.includes("Lab customers use v_lab_catalog")) {
  pass("static.catalog_cost_removed", "lab catalog view has selling price and no purchase-cost column");
} else fail("static.catalog_cost_removed", "catalog cost column still defined");

if (sql.includes("security_invoker = true") && sql.includes("REVOKE ALL ON public.v_stock_dashboard FROM anon")) {
  pass("static.stock_view", "stock views follow table RLS and anon cannot read them");
} else fail("static.stock_view", "stock view lockdown missing");

const catalogColumns = bounds.match(/HQ_LAB_CATALOG_LIST_COLUMNS =\s*"([^"]+)"/)?.[1] || "";
if (catalogColumns.includes("unit_selling_price") && !catalogColumns.includes("unit_cost")) {
  pass("static.catalog_select", "lab catalog read no longer requests unit_cost");
} else fail("static.catalog_select", catalogColumns || "catalog columns missing");

if (panel.includes("data-commercial-decision") && panel.includes("respondVisitHandoffWrite") && panel.includes("data-ae1c-hq-response") && !panel.includes("selling_price")) {
  pass("static.hq_ui", "existing HQ review gained a decision form without a selling_price field name");
} else fail("static.hq_ui", "HQ panel contract drifted");

if (api.includes("resolve_visit_handoff_commercial") && api.includes("respond_visit_handoff") && !api.includes("p_tenant_id")) {
  pass("static.api", "commercial resolve is tenant-stamped on the server");
} else fail("static.api", "API spoof or lifecycle path missing");

const preview = composeAgentVisibleCommercialText({
  decision: "YES",
  productId: "QA_SKU",
  productName: "QA Reagent",
  specification: "500 ml",
  quantity: 2,
  packUom: "bottle",
  availability: "Can source",
  leadTime: "5 days",
  sellingPrice: 125,
  validUntil: "2026-10-20",
  agentResponse: "Call the lab with this price.",
});
if (
  preview.includes("Decision: YES") &&
  preview.includes("Selling price: 125.00") &&
  preview.includes("Next action: Call the lab with this price.") &&
  !preview.includes("80.00") &&
  !preview.toLowerCase().includes("supplier") &&
  !preview.toLowerCase().includes("margin")
) {
  pass("static.preview", "agent preview has selling terms and no cost");
} else fail("static.preview", preview);

const noPreview = composeAgentVisibleCommercialText({
  decision: "NO",
  agentResponse: "We cannot supply this.",
  sellingPrice: 10,
});
if (noPreview.startsWith("Decision: NO") && !noPreview.includes("Selling price")) {
  pass("static.no_preview", "NO preview does not invent a price");
} else fail("static.no_preview", noPreview);

const needPreview = composeAgentVisibleCommercialText({
  decision: "NEED_MORE_INFORMATION",
  specification: "Which analyzer",
  agentResponse: "Ask which analyzer.",
});
if (needPreview.includes("NEED MORE INFORMATION") && needPreview.includes("Which analyzer") && !needPreview.includes("Selling price")) {
  pass("static.need_preview", "need-more preview has no price");
} else fail("static.need_preview", needPreview);

if (!APPLY) {
  console.log("\nStatic checks complete. Rerun with --apply for live QA.\n");
  process.exit(process.exitCode || 0);
}

const env = loadEnv();
const urlRef = projectRefFromUrl(env.VITE_SUPABASE_URL);
if (urlRef === PROD_REF || urlRef !== QA_REF) {
  fail("live.env", `refused database ${urlRef || "unknown"}`);
  process.exit(1);
}
pass("live.env", `QA ${QA_REF}`);

const url = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  fail("live.keys", "QA URL, anon key, or service role key missing");
  process.exit(1);
}

function userClient() {
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
const adminSb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(client, creds, label) {
  const { error } = await client.auth.signInWithPassword({ email: creds.email, password: creds.password });
  if (error) fail(`live.auth.${label}`, error.message);
  else pass(`live.auth.${label}`, "signed in");
  return !error;
}

const { count: ordersBefore } = await adminSb
  .from("orders")
  .select("order_id", { count: "exact", head: true })
  .eq("tenant_id", QA_HQ_TENANT_ID);

const profile = await adminSb
  .from("profiles")
  .select("agent_id, tenant_id, role")
  .eq("email", QA_AGENT.email)
  .eq("active", true)
  .maybeSingle();
if (!profile.data?.agent_id || profile.data.tenant_id !== QA_HQ_TENANT_ID || profile.data.role !== "agent") {
  fail("live.agent_profile", profile.error?.message || "QA agent profile missing");
  process.exit(1);
}
pass("live.agent_profile", profile.data.agent_id);

const lab = await adminSb
  .from("labs")
  .select("lab_id")
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .eq("assigned_agent_id", profile.data.agent_id)
  .limit(1)
  .maybeSingle();
const labId = lab.data?.lab_id;
if (!labId) {
  fail("live.lab", lab.error?.message || "no lab assigned to the QA agent");
  process.exit(1);
}
pass("live.lab", labId);

const product = await adminSb
  .from("products")
  .select("product_id, product_name, cost_price")
  .eq("tenant_id", QA_HQ_TENANT_ID)
  .eq("active", true)
  .limit(1)
  .maybeSingle();
const productId = product.data?.product_id || "";
const costBefore = product.data?.cost_price ?? null;
if (productId) pass("live.product", productId);
else pass("live.product", "no active product; YES will use specification only");

const stamp = Date.now();
const supplierName = `P0A Harbor Source ${stamp}`;
const internalNote = `HQ only cost note ${stamp}`;
const createdVisitIds = [];

async function makeHandoff(agentClient, summary) {
  const inserted = await agentClient
    .from("agent_visits")
    .insert({
      lab_id: labId,
      visit_date: "2026-10-02",
      commercial_outcome: "REQUIREMENT",
      notes: summary,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  createdVisitIds.push(inserted.data.id);
  const handoff = await agentClient.rpc("create_visit_handoff", {
    p_visit_uuid: inserted.data.id,
    p_requirement_summary: summary,
    p_needed_by: "2026-10-20",
  });
  if (handoff.error || handoff.data?.success !== true) {
    throw new Error(handoff.error?.message || handoff.data?.code || "create handoff failed");
  }
  return handoff.data.handoff.id;
}

const agent = userClient();
const hq = userClient();
const labUser = userClient();
if (!(await signIn(agent, QA_AGENT, "agent"))) process.exit(1);
if (!(await signIn(hq, QA_ADMIN, "admin"))) process.exit(1);
if (!(await signIn(labUser, QA_LAB, "lab"))) process.exit(1);

let yesHandoff = null;
try {
  yesHandoff = await makeHandoff(agent, `Need QA reagent ${stamp}`);
  pass("live.yes.handoff", "OPEN_HQ created");
} catch (err) {
  fail("live.yes.handoff", err.message);
}

if (yesHandoff) {
  const yes = await hq.rpc("resolve_visit_handoff_commercial", {
    p_handoff_id: yesHandoff,
    p_decision: "YES",
    p_agent_response: "Call the lab with this price.",
    p_product_id: productId || null,
    p_specification: "500 ml bottle",
    p_quantity: 2,
    p_pack_uom: "bottle",
    p_supplier_name: supplierName,
    p_verified_cost: 80,
    p_availability: "Can source",
    p_lead_time: "5 days",
    p_selling_price: 125,
    p_valid_until: "2026-10-20",
    p_internal_note: internalNote,
  });
  if (yes.error || yes.data?.success !== true) {
    fail("live.yes.resolve", yes.error?.message || yes.data?.code || "resolve failed");
  } else if (yes.data?.handoff?.status !== "HQ_RESPONDED") {
    fail("live.yes.status", yes.data?.handoff?.status || "missing status");
  } else {
    pass("live.yes.resolve", "HQ_RESPONDED");
    const text = str(yes.data.handoff.hq_response);
    if (text.includes("Selling price: 125.00") && text.includes("Can source") && text.includes("5 days") && text.includes("2026-10-20") && text.includes("Call the lab with this price.")) {
      pass("live.yes.agent_text", "selling terms are in the handoff response");
    } else fail("live.yes.agent_text", "selling terms missing from hq_response");
    if (!text.includes("80.00") && !text.includes(supplierName) && !text.includes(internalNote)) {
      pass("live.yes.cost_absent", "purchase cost, source, and HQ note are absent from hq_response");
    } else fail("live.yes.cost_absent", "confidential text leaked into hq_response");
  }

  const agentTerms = await agent
    .from("handoff_commercial_responses")
    .select("decision, selling_price, agent_visible_text")
    .eq("handoff_id", yesHandoff)
    .maybeSingle();
  if (agentTerms.data?.decision === "YES" && Number(agentTerms.data.selling_price) === 125) {
    pass("live.agent.read_terms", "agent can read the selling response");
  } else fail("live.agent.read_terms", agentTerms.error?.message || "terms hidden from the owning agent");

  const agentCost = await agent.from("handoff_commercial_economics").select("verified_cost, internal_note").eq("handoff_id", yesHandoff);
  if (!agentCost.error && (agentCost.data || []).length === 0) {
    pass("live.agent.cost_hidden", "agent cannot read purchase cost or the HQ note");
  } else fail("live.agent.cost_hidden", agentCost.error?.message || "economics rows returned to the agent");

  const agentSupplier = await agent.from("suppliers").select("id").eq("supplier_name", supplierName);
  if (!agentSupplier.error && (agentSupplier.data || []).length === 0) {
    pass("live.agent.supplier_hidden", "agent cannot read the source");
  } else fail("live.agent.supplier_hidden", agentSupplier.error?.message || "supplier visible to the agent");

  const hqCost = await hq.from("handoff_commercial_economics").select("verified_cost, internal_note").eq("handoff_id", yesHandoff).maybeSingle();
  if (Number(hqCost.data?.verified_cost) === 80 && hqCost.data?.internal_note === internalNote) {
    pass("live.hq.read_cost", "HQ can read verified cost and the internal note");
  } else fail("live.hq.read_cost", hqCost.error?.message || "HQ economics missing");

  if (productId) {
    const after = await adminSb.from("products").select("cost_price").eq("tenant_id", QA_HQ_TENANT_ID).eq("product_id", productId).maybeSingle();
    if (String(after.data?.cost_price ?? "") === String(costBefore ?? "")) {
      pass("live.product_cost_unchanged", "products.cost_price was not overwritten");
    } else fail("live.product_cost_unchanged", "catalog cost changed");
  }
}

async function expectNoPrice(decision, summary, next) {
  let handoffId;
  try {
    handoffId = await makeHandoff(agent, summary);
  } catch (err) {
    fail(`live.${decision}.handoff`, err.message);
    return;
  }
  const priced = await hq.rpc("resolve_visit_handoff_commercial", {
    p_handoff_id: handoffId,
    p_decision: decision,
    p_agent_response: next,
    p_selling_price: 10,
  });
  if (priced.data?.code === "pricing_not_allowed") pass(`live.${decision}.no_fake_price`, "price rejected");
  else fail(`live.${decision}.no_fake_price`, priced.error?.message || priced.data?.code || "price accepted");

  const plain = await hq.rpc("resolve_visit_handoff_commercial", {
    p_handoff_id: handoffId,
    p_decision: decision,
    p_agent_response: next,
    p_specification: decision === "NEED_MORE_INFORMATION" ? "Which analyzer" : null,
  });
  const text = str(plain.data?.handoff?.hq_response);
  if (plain.data?.success === true && plain.data?.handoff?.status === "HQ_RESPONDED" && !text.includes("Selling price") && text.includes(next)) {
    pass(`live.${decision}.responded`, "response stored without a price");
  } else fail(`live.${decision}.responded`, plain.error?.message || plain.data?.code || text || "failed");
}

await expectNoPrice("NO", `Need something we do not supply ${stamp}`, "We cannot supply this.");
await expectNoPrice("NEED_MORE_INFORMATION", `Need a clearer specification ${stamp}`, "Ask which analyzer.");

try {
  const plainId = await makeHandoff(agent, `Need a plain lifecycle check ${stamp}`);
  const plain = await hq.rpc("respond_visit_handoff", {
    p_handoff_id: plainId,
    p_hq_response: "Plain lifecycle reply.",
  });
  const row = await adminSb.from("handoff_commercial_responses").select("id").eq("handoff_id", plainId);
  if (plain.data?.success === true && plain.data?.handoff?.status === "HQ_RESPONDED" && (row.data || []).length === 0) {
    pass("live.lifecycle", "existing respond path still closes OPEN_HQ");
  } else fail("live.lifecycle", plain.error?.message || plain.data?.code || "lifecycle path changed");
} catch (err) {
  fail("live.lifecycle", err.message);
}

const otherTenant = "00000000-0000-4000-8000-000000000099";
const cross = await hq.from("suppliers").select("id").eq("tenant_id", otherTenant);
if (!cross.error && (cross.data || []).length === 0) pass("live.cross_tenant", "other tenant returns no suppliers");
else fail("live.cross_tenant", cross.error?.message || "cross-tenant rows returned");

const labCost = await labUser.from("products").select("cost_price").eq("tenant_id", QA_HQ_TENANT_ID).limit(5);
if (!labCost.error && (labCost.data || []).length === 0) pass("live.lab.products_hidden", "lab cannot read products");
else fail("live.lab.products_hidden", labCost.error?.message || "lab received product rows");

const labCatalog = await labUser.from("v_lab_catalog").select("product_id, unit_selling_price").eq("tenant_id", QA_HQ_TENANT_ID).limit(5);
if (!labCatalog.error && (labCatalog.data || []).some((row) => row.unit_selling_price != null)) {
  pass("live.lab.selling_price", "lab can still read the selling price");
} else fail("live.lab.selling_price", labCatalog.error?.message || "lab catalog empty");

const labUnitCost = await labUser.from("v_lab_catalog").select("unit_cost").limit(1);
if (labUnitCost.error) pass("live.lab.unit_cost_gone", "unit_cost is not a catalog column");
else fail("live.lab.unit_cost_gone", "lab catalog still returns unit_cost");

const anon = userClient();
const anonStock = await anon.from("v_stock_dashboard").select("cost_price").limit(1);
if (anonStock.error || (anonStock.data || []).length === 0) pass("live.anon.stock", "anon cannot read stock cost");
else fail("live.anon.stock", "anon received stock cost");

const { count: ordersAfter } = await adminSb
  .from("orders")
  .select("order_id", { count: "exact", head: true })
  .eq("tenant_id", QA_HQ_TENANT_ID);
if (ordersBefore === ordersAfter) pass("live.orders_unchanged", `orders remain ${ordersAfter}`);
else fail("live.orders_unchanged", `orders ${ordersBefore} -> ${ordersAfter}`);

if (createdVisitIds.length) {
  const handoffs = await adminSb.from("visit_handoffs").select("id").in("visit_uuid", createdVisitIds);
  const ids = (handoffs.data || []).map((row) => row.id);
  if (ids.length) {
    await adminSb.from("handoff_commercial_economics").delete().in("handoff_id", ids);
    await adminSb.from("handoff_commercial_responses").delete().in("handoff_id", ids);
    await adminSb.from("visit_handoffs").delete().in("id", ids);
  }
  await adminSb.from("supplier_offers").delete().eq("tenant_id", QA_HQ_TENANT_ID).in(
    "supplier_id",
    (await adminSb.from("suppliers").select("id").eq("supplier_name", supplierName)).data?.map((row) => row.id) || []
  );
  await adminSb.from("suppliers").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("supplier_name", supplierName);
  await adminSb.from("agent_visits").delete().in("id", createdVisitIds);
  pass("live.cleanup", "QA probe rows removed");
}

if (failures) console.error(`\n${failures} failed\n`);
else console.log("\nP0-A checks passed\n");
