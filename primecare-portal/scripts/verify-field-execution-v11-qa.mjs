/**
 * Live QA checks for Field Execution V1.1.
 * Refuses any Supabase host other than the QA project.
 * Does not print credentials, tokens, or keys.
 */
import { createClient } from "@supabase/supabase-js";
import { QA_AGENT, QA_EXECUTIVE, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { loadEnvLocal, signInWithQaCredentials } from "./qaSignIn.mjs";

const QA_HOST = "zipuzmfkwwucbchlphcj";
const env = loadEnvLocal();
const url = String(env.VITE_SUPABASE_URL || "");
const anon = String(env.VITE_SUPABASE_ANON_KEY || "");
if (!url.includes(QA_HOST) || url.includes("alxhrnotnvwpblsiadxj")) {
  console.error("FAIL  refused: database host is not the QA project");
  process.exit(1);
}
if (!anon) {
  console.error("FAIL  QA anon key missing");
  process.exit(1);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: ${detail}`);
}

function client() {
  return createClient(url, anon, { auth: { persistSession: false } });
}

const stamp = Date.now();
const fixtureName = `V11 QA fixture ${stamp}`;
const requestId = crypto.randomUUID();
let labId = "";
let visitId = "";

const agentClient = client();
const agentSignIn = await signInWithQaCredentials(agentClient, QA_AGENT);
record("agent.signin", agentSignIn.ok === true, agentSignIn.ok ? "QA agent session" : "sign-in failed");
if (!agentSignIn.ok) process.exit(1);

const profileRes = await agentClient.from("profiles").select("tenant_id,role,agent_id").limit(1);
const profile = profileRes.data?.[0] || {};
record(
  "agent.tenant",
  profile.tenant_id === QA_HQ_TENANT_ID && String(profile.role || "").toLowerCase() === "agent",
  `role ${profile.role || "missing"}`
);

const created = await agentClient.rpc("create_prospect_lab", {
  p_lab_name: fixtureName,
  p_owner_name: "QA Contact",
  p_phone: "9000000099",
  p_area: "QA Locality",
});
labId = String(created.data?.lab_id || created.data?.labId || "");
record("agent.create_lab", !created.error && Boolean(labId), created.error?.message || labId);

const agentClassify = await agentClient
  .from("labs")
  .update({ record_origin: "certification" })
  .eq("lab_id", labId)
  .select("lab_id");
record(
  "agent.classify_denied",
  Boolean(agentClassify.error) || (agentClassify.data || []).length === 0,
  agentClassify.error?.code || agentClassify.error?.message || "no row returned"
);

const visit = await agentClient
  .from("agent_visits")
  .insert({
    lab_id: labId,
    visit_date: "2026-10-24",
    notes: "[Visit]\nQA meaningful observation for duplicate protection.",
    visit_type: "field",
    commercial_outcome: "NO_OPPORTUNITY",
    client_request_id: requestId,
    no_discussion_reason: null,
  })
  .select("id,tenant_id,agent_id,client_request_id")
  .single();
visitId = visit.data?.id || "";
record("agent.visit_insert", !visit.error && Boolean(visitId), visit.error?.message || "saved");

const duplicate = await agentClient.from("agent_visits").insert({
  lab_id: labId,
  visit_date: "2026-10-24",
  notes: "[Visit]\nQA meaningful observation for duplicate protection.",
  visit_type: "field",
  commercial_outcome: "NO_OPPORTUNITY",
  client_request_id: requestId,
}).select("id");
record(
  "agent.duplicate_blocked",
  duplicate.error?.code === "23505",
  [duplicate.error?.code, duplicate.error?.message].filter(Boolean).join(" ") || "unexpected second row"
);

const ownLookup = await agentClient.rpc("agent_visit_for_client_request", {
  p_client_request_id: requestId,
});
const ownRow = Array.isArray(ownLookup.data) ? ownLookup.data[0] : null;
record(
  "agent.retry_lookup",
  !ownLookup.error && ownRow?.id === visitId && ownRow?.tenant_id === QA_HQ_TENANT_ID,
  ownLookup.error?.message || (ownRow ? "original row" : "empty")
);

const otherLookup = await agentClient.rpc("agent_visit_for_client_request", {
  p_client_request_id: "00000000-0000-4000-8000-000000000000",
});
record(
  "agent.unknown_request",
  !otherLookup.error && (otherLookup.data || []).length === 0,
  otherLookup.error?.message || "empty"
);

await agentClient.auth.signOut();

const hq = client();
const hqSignIn = await signInWithQaCredentials(hq, QA_EXECUTIVE, { repairAgent: false });
record("hq.signin", hqSignIn.ok === true, hqSignIn.ok ? "QA executive session" : "sign-in failed");

if (hqSignIn.ok && labId) {
  const hqProfile = await hq.from("profiles").select("tenant_id,role").limit(1);
  const hqRole = String(hqProfile.data?.[0]?.role || "");
  record("hq.role", ["admin", "executive"].includes(hqRole.toLowerCase()), hqRole || "missing");

  const mark = await hq.from("labs").update({ record_origin: "certification" }).eq("lab_id", labId).select("record_origin");
  record(
    "hq.classify",
    !mark.error && mark.data?.[0]?.record_origin === "certification",
    mark.error?.message || mark.data?.[0]?.record_origin || "unchanged"
  );
  const restore = await hq.from("labs").update({ record_origin: "field" }).eq("lab_id", labId).select("record_origin");
  record(
    "hq.restore",
    !restore.error && restore.data?.[0]?.record_origin === "field",
    restore.error?.message || restore.data?.[0]?.record_origin || "unchanged"
  );

  const order = await hq
    .from("orders")
    .select("order_id,record_origin,status,total_amount")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .limit(1);
  const orderId = order.data?.[0]?.order_id || "";
  const before = order.data?.[0]?.record_origin || "";
  if (orderId) {
    const deny = client();
    await signInWithQaCredentials(deny, QA_AGENT);
    const agentOrder = await deny.from("orders").update({ record_origin: "test" }).eq("order_id", orderId).select("order_id");
    record(
      "agent.order_classify_denied",
      Boolean(agentOrder.error) || (agentOrder.data || []).length === 0,
      agentOrder.error?.code || "no row returned"
    );
    await deny.auth.signOut();
    const afterDeny = await hq.from("orders").select("record_origin").eq("order_id", orderId).limit(1);
    record("order.unchanged_after_agent", afterDeny.data?.[0]?.record_origin === before, afterDeny.data?.[0]?.record_origin || "missing");
  } else {
    record("agent.order_classify_denied", false, "no QA order available");
  }

  const hqLookup = await hq.rpc("agent_visit_for_client_request", { p_client_request_id: requestId });
  const hqRow = Array.isArray(hqLookup.data) ? hqLookup.data[0] : null;
  record("hq.retry_lookup", !hqLookup.error && hqRow?.id === visitId, hqLookup.error?.message || (hqRow ? "original row" : "empty"));

  if (visitId) {
    const removedVisit = await hq.from("agent_visits").delete().eq("id", visitId).select("id");
    record(
      "cleanup.visit_denied",
      removedVisit.error?.code === "42501",
      removedVisit.error?.message || "delete unexpectedly allowed"
    );
  }
  const removedLab = await hq.from("labs").delete().eq("lab_id", labId).select("lab_id");
  record("cleanup.lab", !removedLab.error && (removedLab.data || []).length === 1, removedLab.error?.message || "removed");
}

await hq.auth.signOut();

const failed = results.filter((row) => !row.ok).length;
console.log(`${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
