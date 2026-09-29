#!/usr/bin/env node
/**
 * AE-1C Second Move — static certification.
 * No Production deploy. No schema apply. No live writes.
 */
import { register } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

register("./lib/srcAliasLoader.mjs", import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  failures += 1;
  console.error(`FAIL  ${id}: ${detail}`);
}
function assert(cond, id, detail) {
  if (cond) pass(id, detail);
  else fail(id, detail);
}
function readRel(rel) {
  const path = resolve(root, rel);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const sql = readRel("supabase/sql/ae_1c_visit_handoffs.sql");
const mig = readRel("supabase/migrations/20260929010000_ae_1c_visit_handoffs.sql");
const api = readRel("src/visits/visitHandoffsApi.js");
const contract = readRel("src/visits/visitHandoffsContract.js");
const form = readRel("src/components/agent/AgentVisitEvidenceForm.jsx");
const hq = readRel("src/components/hq/HqLabsAdminView.jsx");
const hqPanel = readRel("src/components/hq/VisitHandoffHqPanel.jsx");
const mbPage = readRel("src/pages/MyBusinessPage.jsx");
const mbModel = readRel("src/myBusiness/myBusinessModel.js");
const mbRead = readRel("src/myBusiness/myBusinessRead.js");
const pkg = readRel("package.json");
const bounds = readRel("src/api/hqReadBounds.js");

const {
  HANDOFF_TRIGGER_OUTCOMES,
  HANDOFF_LOSS_REASONS,
  isHandoffTriggerOutcome,
  handoffHumanStatus,
  prefillRequirementSummary,
  parseHandoffRpcPayload,
} = await import("../src/visits/visitHandoffsContract.js");
const { buildMyBusinessModel } = await import("../src/myBusiness/myBusinessModel.js");

console.log("\n=== AE-1C Second Move — static certification ===\n");

assert(sql && sql === mig, "db.twin", "SQL source matches versioned migration");
assert(/CREATE TABLE IF NOT EXISTS public\.visit_handoffs/.test(sql), "db.table", "visit_handoffs created");
assert(/CONSTRAINT visit_handoffs_visit_uuid_key UNIQUE \(visit_uuid\)/.test(sql), "db.unique_visit", "one handoff per visit");
assert(
  /visit_uuid uuid NOT NULL/.test(sql) &&
    /tenant_id uuid NOT NULL REFERENCES public\.tenants/.test(sql) &&
    /lab_id text NOT NULL/.test(sql) &&
    /agent_id text NOT NULL/.test(sql),
  "db.key_types",
  "uses existing uuid/text key types"
);
assert(
  /FOREIGN KEY \(visit_uuid, tenant_id\)/.test(sql) &&
    /REFERENCES public\.agent_visits \(id, tenant_id\)/.test(sql),
  "db.visit_fk",
  "handoff belongs to the visit"
);
assert(!/REFERENCES public\.orders/.test(sql), "db.no_order_fk", "order_id is a nullable reference, not a required FK");
const tableBlock = sql.slice(
  sql.indexOf("CREATE TABLE IF NOT EXISTS public.visit_handoffs"),
  sql.indexOf("COMMENT ON TABLE")
);
assert(
  tableBlock.includes("CREATE TABLE") &&
    !/\bselling_price\b|\bquote_amount\b|\brevenue\b|\binvoice_amount\b|\bexpected_value\b/.test(tableBlock) &&
    !/^\s+(collection|margin|cost)\b/m.test(tableBlock),
  "db.no_financial_truth",
  "no quote/revenue/collection columns"
);
assert(
  /trigger_outcome IN \('REQUIREMENT', 'QUOTE_OPPORTUNITY'\)/.test(sql) &&
    /status IN \('OPEN_HQ', 'HQ_RESPONDED', 'CLOSED'\)/.test(sql) &&
    /owner IS NULL OR owner IN \('HQ', 'AGENT'\)/.test(sql),
  "db.enums",
  "allowed trigger/status/owner values"
);
assert(
  /status = 'OPEN_HQ'\s+AND owner = 'HQ'/.test(sql) &&
    /status = 'HQ_RESPONDED'\s+AND owner = 'AGENT'/.test(sql) &&
    /status = 'CLOSED'\s+AND owner IS NULL/.test(sql),
  "db.state_check",
  "state consistency enforced"
);
assert(/ENABLE ROW LEVEL SECURITY/.test(sql), "rls.enabled", "RLS on");
assert(
  /visit_handoffs_insert_deny/.test(sql) &&
    /visit_handoffs_update_deny/.test(sql) &&
    /WITH CHECK \(false\)/.test(sql),
  "rls.rpc_only_write",
  "authenticated table mutation denied"
);
assert(
  /is_admin_or_executive\(\)/.test(sql) &&
    /current_profile_agent_id\(\)/.test(sql) &&
    /lab_record_is_visible_to_current_user/.test(sql) &&
    /tenant_id_matches\(tenant_id\)/.test(sql),
  "rls.helpers",
  "existing tenant/role helpers"
);
assert(
  /CREATE OR REPLACE FUNCTION public\.create_visit_handoff\(\s*p_visit_uuid uuid,\s*p_requirement_summary text,\s*p_needed_by date DEFAULT NULL/.test(
    sql
  ),
  "rpc.create.signature",
  "caller supplies visit + summary + optional needed_by"
);
assert(
  !/create_visit_handoff\([^)]*p_tenant_id/.test(sql) &&
    !/create_visit_handoff\([^)]*p_agent_id/.test(sql) &&
    !/create_visit_handoff\([^)]*p_lab_id/.test(sql) &&
    !/create_visit_handoff\([^)]*p_trigger_outcome/.test(sql),
  "rpc.create.no_spoof",
  "tenant/agent/lab/outcome are derived server-side"
);
assert(
  /agent_visit_row_writable_by_current_agent/.test(sql) &&
    /v_visit\.agent_id/.test(sql) &&
    /v_profile\.agent_id/.test(sql) &&
    /v_visit\.tenant_id IS DISTINCT FROM v_profile\.tenant_id/.test(sql),
  "rpc.create.authz",
  "own visit, own agent, same tenant"
);
assert(
  /v_outcome NOT IN \('REQUIREMENT', 'QUOTE_OPPORTUNITY'\)/.test(sql) &&
    /code', 'invalid_outcome'/.test(sql),
  "rpc.create.outcome",
  "FOLLOW_UP / NO_OPPORTUNITY / others rejected"
);
assert(/code', 'blank_requirement'/.test(sql), "rpc.create.blank", "blank requirement rejected");
assert(
  /status,\s+owner,[\s\S]*'OPEN_HQ',\s+'HQ'/.test(sql) && /code', 'already_exists'/.test(sql) && /unique_violation/.test(sql),
  "rpc.create.idempotent",
  "OPEN_HQ/HQ create; unique retry returns existing own handoff"
);
assert(/is_admin_or_executive\(\)/.test(sql.split("respond_visit_handoff")[1] || ""), "rpc.respond.hq_only", "HQ respond requires Admin/Executive");
assert(
  /AND status = 'OPEN_HQ'\s+AND owner = 'HQ'/.test(sql) && /code', 'already_responded'/.test(sql),
  "rpc.respond.concurrency",
  "second HQ response cannot overwrite first"
);
assert(
  /v_row\.agent_id IS DISTINCT FROM v_profile\.agent_id/.test(sql) &&
    /code', 'stale_or_closed'/.test(sql),
  "rpc.resolve.authz",
  "wrong Agent / OPEN_HQ / closed cannot resolve"
);
assert(
  /v_action = 'FOLLOWED_UP'/.test(sql) &&
    /UPDATE public\.agent_visits/.test(sql) &&
    /follow_up_required = true/.test(sql) &&
    /code', 'followed_up'/.test(sql) &&
    !/FOLLOWED_UP[\s\S]{0,200}status = 'CLOSED'/.test(sql),
  "rpc.resolve.followed_up",
  "FOLLOWED_UP updates existing visit follow-up and does not close"
);
assert(
  /close_reason = 'CONVERTED'/.test(sql) &&
    !/INSERT INTO public\.orders/.test(sql) &&
    /code', 'invalid_order'/.test(sql),
  "rpc.resolve.converted",
  "CONVERTED closes; never creates an order; fake/cross-lab order_id rejected"
);
assert(
  /invalid_loss_reason/.test(sql) && /other_note_required/.test(sql) && /close_reason = v_loss/.test(sql),
  "rpc.resolve.loss",
  "NOT_PROCEEDING requires a valid loss reason"
);
assert(/GRANT ALL ON TABLE public\.visit_handoffs TO service_role/.test(sql), "rpc.service_role", "service_role table grant separate from authenticated");

assert(HANDOFF_TRIGGER_OUTCOMES.includes("REQUIREMENT") && HANDOFF_TRIGGER_OUTCOMES.includes("QUOTE_OPPORTUNITY"), "contract.triggers", "REQUIREMENT + QUOTE_OPPORTUNITY");
assert(!isHandoffTriggerOutcome("FOLLOW_UP") && !isHandoffTriggerOutcome("NO_OPPORTUNITY"), "contract.reject_other_outcomes", "FOLLOW_UP and NO_OPPORTUNITY cannot create");
assert(handoffHumanStatus({ status: "OPEN_HQ" }) === "Waiting on PrimeCare", "ui.label.open", "OPEN_HQ → Waiting on PrimeCare");
assert(
  handoffHumanStatus({ status: "HQ_RESPONDED" }) === "PrimeCare Responded — Your Action",
  "ui.label.responded",
  "HQ_RESPONDED human label"
);
assert(handoffHumanStatus({ status: "CLOSED", closeReason: "CONVERTED" }) === "Converted", "ui.label.converted", "CLOSED/CONVERTED");
assert(handoffHumanStatus({ status: "CLOSED", closeReason: "PRICE" }) === "Not Proceeding", "ui.label.loss", "CLOSED/loss");
assert(
  !/monthly_spend|approx_price|selling_price|quote_amount/.test(contract.match(/function prefillRequirementSummary[\s\S]+?\n\}/)?.[0] || ""),
  "contract.prefill_no_quote",
  "prefill does not treat discovery ₹ as a quote"
);
const prefill = prefillRequirementSummary({
  notes: "",
  nextAction: "",
  discoveryLines: [{ lineKind: "REAGENT", brand: "Sysmex", monthlySpendInr: 50000, approxPricePack: 12 }],
});
assert(prefill.includes("Sysmex") && !/50000|₹/.test(prefill), "contract.prefill_safe", "prefill uses kind/name, not spend");
assert(
  HANDOFF_LOSS_REASONS.includes("PRICE") &&
    HANDOFF_LOSS_REASONS.includes("OTHER") &&
    !HANDOFF_LOSS_REASONS.includes("FOLLOWED_UP"),
  "contract.loss_reasons",
  "FOLLOWED_UP is not a close reason"
);
assert(parseHandoffRpcPayload({ success: true, code: "created", handoff: { id: "1", status: "OPEN_HQ" } }).success, "contract.rpc_parse", "RPC payload parse");

assert(/createVisitHandoffWrite/.test(api) && /p_visit_uuid/.test(api) && !/p_tenant_id/.test(api), "api.create", "create RPC does not accept tenant spoof");
assert(/respondVisitHandoffWrite/.test(api) && /resolveVisitHandoffWrite/.test(api), "api.actions", "respond + resolve");
assert(/listOpenVisitHandoffsRead/.test(api) && /\.eq\("status", "OPEN_HQ"\)/.test(api), "api.hq_open_only", "HQ list is OPEN_HQ");
assert(/from\("visit_handoffs"\)/.test(api) && !/\.insert\(/.test(api) && !/\.update\(/.test(api), "api.rpc_writes", "JS writes go through RPC");

assert(/PrimeCare Support Needed/.test(form) && /Send to PrimeCare/.test(form), "ui.visit.send", "Prospect/qualifying visit may Send to PrimeCare");
assert(/isHandoffTriggerOutcome\(outcome\)/.test(form) && /isHandoffTriggerOutcome\(form\.commercialOutcome\)/.test(form), "ui.visit.qualifying_only", "non-qualifying outcome does not mount send workflow");
assert(/data-ae1c-send/.test(form) && /step\.handoff/.test(form), "ui.visit.no_duplicate", "existing handoff hides Send CTA");
assert(/Waiting on PrimeCare/.test(form), "ui.visit.waiting_label", "OPEN_HQ displays Waiting on PrimeCare");
assert(!/Create Ticket|Create Handoff/.test(form), "ui.visit.plain_language", "no ticket/handoff jargon");

assert(/waiting_on_primecare/.test(hq) && /Waiting on PrimeCare/.test(hq), "ui.hq.tab", "HQ sibling tab");
assert(!/Operations Center/.test(hqPanel) && !/localStorage/.test(hqPanel), "ui.hq.not_ops_center", "not Operations Center / localStorage tasks");
assert(/data-ae1c-hq-queue/.test(hqPanel) && /OPEN_HQ/.test(hqPanel), "ui.hq.open_only", "HQ queue shows OPEN_HQ");
assert(/Send back to Agent/.test(hqPanel) && /PrimeCare Response/.test(hqPanel), "ui.hq.respond", "HQ response CTA");
assert(/listOpenVisitHandoffsRead/.test(hqPanel) && /respondVisitHandoffWrite/.test(hqPanel), "ui.hq.reload", "successful respond reloads OPEN_HQ list");
assert(
  !/selling_price|quote_amount|monthlySpendInr|approxPricePack/.test(hqPanel) &&
    /line\.brand/.test(hqPanel),
  "ui.hq.no_quote_rupees",
  "HQ review does not display discovery ₹ as quote/revenue"
);

assert(/PrimeCare Responded — Your Action/.test(mbPage) && /data-ae1c-primecare-responded/.test(mbPage), "ui.mb.responded", "HQ_RESPONDED appears in My Business");
assert(/Followed up — still deciding/.test(mbPage) && /Converted to order/.test(mbPage) && /Not proceeding/.test(mbPage), "ui.mb.actions", "Agent resolution actions");
assert(/Activate the Prospect/.test(mbPage) && /does not create an order/.test(mbPage), "ui.mb.prospect_converted", "Prospect conversion does not create an order");
assert(/LOSS_REASON_OPTIONS/.test(mbPage) && /NOT_PROCEEDING/.test(mbPage), "ui.mb.loss", "NOT_PROCEEDING requires loss reason");
assert(/visitWaitingOnHq/.test(mbModel) && /REQUIREMENT_FOLLOW_UP/.test(mbModel), "ae1a.suppress", "OPEN_HQ suppresses duplicate AE-1A REQUIREMENT_FOLLOW_UP nag");
assert(/listAgentOpenVisitHandoffsRead/.test(mbRead), "ae1a.read_coupling", "My Business reads handoffs for coupling");

const labs = [
  { labId: "LAB-A", labName: "Alpha", status: "ACTIVE", assignedAgentId: "AGT-A", sourcedByAgentId: "AGT-A", createdAt: "2026-01-01" },
];
const visits = [
  {
    id: "v-new",
    labId: "LAB-A",
    agentId: "AGT-A",
    visitDate: "2026-09-10",
    nextFollowUpDate: "2026-09-16",
    commercialOutcome: "REQUIREMENT",
    nextAction: "Call",
  },
];
const range = { from: "2026-09-01", to: "2026-09-16", todayYmd: "2026-09-16" };
const openModel = buildMyBusinessModel({
  range,
  subjectAgentId: "AGT-A",
  actor: { role: "agent", agentId: "AGT-A" },
  labs,
  visits,
  visitHandoffs: [{ id: "h1", visitUuid: "v-new", labId: "LAB-A", agentId: "AGT-A", status: "OPEN_HQ", owner: "HQ", requirementSummary: "Need stock" }],
});
const backModel = buildMyBusinessModel({
  range,
  subjectAgentId: "AGT-A",
  actor: { role: "agent", agentId: "AGT-A" },
  labs,
  visits,
  visitHandoffs: [
    {
      id: "h1",
      visitUuid: "v-new",
      labId: "LAB-A",
      agentId: "AGT-A",
      status: "HQ_RESPONDED",
      owner: "AGENT",
      requirementSummary: "Need stock",
      hqResponse: "Yes",
    },
  ],
});
assert(
  !openModel.attention.some((item) => item.reasons?.includes("REQUIREMENT_FOLLOW_UP")) &&
    openModel.waitingOnPrimecare.length === 1,
  "33.open_hq_suppress",
  "OPEN_HQ suppresses AE-1A requirement nag"
);
assert(
  backModel.attention.some((item) => item.reasons?.includes("REQUIREMENT_FOLLOW_UP")) &&
    backModel.primecareResponded.length === 1,
  "34.hq_responded_restores",
  "HQ_RESPONDED restores Agent-owned attention"
);
assert(
  !/selling_price|quote_amount|₹/.test(hqPanel) && !/monthlySpendInr/.test(form.match(/PrimeCareSupportNeeded[\s\S]+$/)?.[0] || ""),
  "35.no_discovery_rupees",
  "AE-1C UX does not display discovery ₹ as quote/revenue"
);
assert(/HQ_VISIT_HANDOFF_COLUMNS/.test(bounds) && !/selling_price/.test(bounds.match(/HQ_VISIT_HANDOFF_COLUMNS[\s\S]+?;/)?.[0] || ""), "api.columns", "handoff projection has no financial columns");
assert(/verify:ae-1c/.test(pkg), "pkg.script", "verify:ae-1c registered");

const pnFiles = [
  "supabase/functions/dispatch-notification-email/index.ts",
  "supabase/functions/dispatch-notification-email/policy.js",
  "src/pages/NotificationCenterPage.jsx",
];
for (const rel of pnFiles) {
  assert(existsSync(resolve(root, rel)), `pn.present.${rel}`, "PN-EMAIL file still present (no delete)");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — AE-1C Second Move static certification\n");
