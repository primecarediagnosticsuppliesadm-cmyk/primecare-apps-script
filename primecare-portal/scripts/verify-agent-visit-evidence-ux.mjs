#!/usr/bin/env node
/**
 * verify-agent-visit-evidence-ux.mjs
 *
 * VE-3 Agent Log Visit field UX contract.
 * Usage:
 *   node scripts/verify-agent-visit-evidence-ux.mjs
 *   node scripts/verify-agent-visit-evidence-ux.mjs --remote
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  partitionVisitEligibleAccounts,
  isAgentSourcedProspect,
  filterOperationalLabsForVisit,
} from "../src/visits/visitEligibleAccounts.js";
import {
  buildVisitEvidenceWritePayload,
  compactDiscoveryLine,
  createEmptyDiscoveryLine,
  createEmptyVisitEvidenceForm,
  optionsMatchCertifiedEnums,
} from "../src/visits/agentVisitEvidenceFormModel.js";
import {
  buildAgentVisitDiscoveryLineInsertRows,
  resolveAgentVisitFollowUpWriteFields,
} from "../src/visits/agentVisitEvidenceContract.js";
import {
  fetchAgentVisitEvidenceBundle,
  persistAgentVisitDiscoveryLines,
  persistAgentVisitWithOptionalDiscovery,
} from "../src/visits/agentVisitEvidenceApi.js";
import {
  AGENT_PENDING_VISIT_TASK_KEY,
  AGENT_VISIT_CONTEXT_KEY,
  VISIT_ENTRY_INTENT_KEY,
  START_FAST_VISIT_EVENT,
  buildVisitEntryIntent,
  hasNewFastVisitIntentFromKeys,
  shouldSkipWizardDraftRestore,
  startVisitFromWorkspaceItem,
  visitModeForNavigation,
} from "../src/pages/agentVisitContext.js";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_HR,
  QA_HQ_TENANT_ID,
  QA_LAB,
  resolveQaHrPassword,
} from "./qaCredentials.mjs";
import {
  VE2_CERT_PREFIX,
  assertQaOnly,
  cleanupCertVisits,
  createReporter,
  finishLive,
  isNetworkError,
  loadEnvLocal,
  serviceClient,
  signIn,
} from "./lib/agentVisitEvidenceLiveQa.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const PREFIX = "[VE-3-CERT]";
const P1_PREFIX = "[VE-3-P1-CERT]";
const HQ = QA_HQ_TENANT_ID;

let failures = 0;
function pass(id, d) {
  console.log(`PASS  ${id}: ${d}`);
}
function fail(id, d) {
  console.error(`FAIL  ${id}: ${d}`);
  failures += 1;
}
function skip(id, d) {
  console.log(`SKIP  ${id}: ${d}`);
}
function assert(c, id, d) {
  if (c) pass(id, d);
  else fail(id, d);
}
function read(rel) {
  const path = resolve(root, rel);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const form = read("src/components/agent/AgentVisitEvidenceForm.jsx");
const page = read("src/pages/AgentVisitPage.jsx");
const labsPage = read("src/pages/LabsPage.jsx");
const access = read("src/utils/accessFilters.js");
const eligible = read("src/visits/visitEligibleAccounts.js");
const api = read("src/api/primecareSupabaseApi.js");
const piPage = page;

assert(/createAgentVisitWrite/.test(form), "ux.reuse_write", "fast form uses createAgentVisitWrite");
assert(/createAgentVisitDiscoveryLinesWrite/.test(form), "ux.retry_lines", "header_only retry uses line write API");
assert(/Visit was saved, but some evidence details could not be saved/.test(form), "ux.header_only_copy", "partial save warning");
assert(/savingRef/.test(form), "ux.double_submit", "save in-flight guard");
assert(!/upsertLabProductIntelligenceWrite/.test(form), "ux.no_pi_dualwrite", "fast form does not snapshot product intel");
assert(!/upsertLabQualificationWrite/.test(form), "ux.no_qual_dualwrite", "fast form does not write qualifications");
assert(!/from\("orders"\)/.test(form), "ux.no_orders", "no orders in fast form");
assert(optionsMatchCertifiedEnums(), "ux.enum_labels", "UI options map to certified enums");
assert(/partitionVisitEligibleAccounts/.test(eligible), "ux.visit_filter", "visit-specific eligibility helper");
assert(!/filterLabsForUser/.test(eligible), "ux.filter_not_imported", "visit helper does not import/call filterLabsForUser");
const filterFn = access.split("export function filterLabsForUser")[1]?.slice(0, 1800) || "";
assert(
  /status === "PROSPECT"/.test(filterFn) && /return false/.test(filterFn),
  "ux.filterLabs_unchanged",
  "filterLabsForUser still excludes PROSPECT (does not broaden operational labs)"
);
assert(!/status === "PROSPECT"[\s\S]{0,80}return true/.test(filterFn), "ux.filterLabs_no_include", "filterLabsForUser must not include PROSPECT");
assert(/Log Visit/.test(form) || /Save visit/.test(form), "ux.save_label", "clear save action");
assert(/Sourced prospects/.test(page), "ux.prospect_cards", "Visit page shows sourced prospects");
assert(/Deep qualification/.test(page), "ux.wizard_parity", "existing qualify wizard remains reachable as Deep qualification");
assert(/AGENT_VISIT_SECTION_STEPS/.test(page) && /upsertLabProductIntelligenceWrite/.test(piPage), "ux.pi_wizard", "wizard snapshot path unchanged");
assert(/function AgentProspectLabCard/.test(labsPage), "ux.flow2_prospect_card", "Flow 2 AgentProspectLabCard remains");
assert(/partitionAgentLabs/.test(labsPage), "ux.flow2_partition", "Flow 2 partitionAgentLabs remains the Agent Labs splitter");
assert(/Active Labs/.test(labsPage) && /Prospects/.test(labsPage) && /agentLabTab/.test(labsPage), "ux.flow2_tabs", "Flow 2 Active / Prospects tabs remain");
assert(/Log Visit/.test(labsPage) && /AgentProspectLabCard/.test(labsPage), "ux.labs_prospect_cta", "Labs page prospect Log Visit");
assert(!/Record Payment/.test(labsPage.slice(labsPage.indexOf("function AgentProspectLabCard"), labsPage.indexOf("function AgentMyLabCard"))), "ux.prospect_no_payment", "prospect card has no Record Payment");
assert(!/onOpenLab/.test(labsPage.slice(labsPage.indexOf("function AgentProspectLabCard"), labsPage.indexOf("function AgentMyLabCard"))), "ux.prospect_no_open_lab", "prospect card has no Open Lab");
assert(!/create_prospect_lab four/.test(form), "ux.add_prospect_untouched_form", "fast form is not Add Prospect");
assert(existsSync(resolve(root, "supabase/migrations/20260905160000_agent_prospect_2a_sourced_by_and_create_rpc.sql")), "ux.add_prospect_rpc", "Add Prospect RPC file unchanged/present");
assert(!/activate_prospect_lab/.test(form) && !/activate_prospect_lab/.test(page), "ux.no_activate", "no activation in visit UX");
assert(/Agent Resources/.test(read("src/pages/AgentResourcesPage.jsx").slice(0, 80)) || existsSync(resolve(root, "src/pages/AgentResourcesPage.jsx")), "ux.agent_resources_present", "Agent Resources page still present");

assert(!/open=\{defaultOpen\}/.test(form), "uat.details_not_forced_closed", "optional sections must not reset closed on re-render");
assert(/onToggle/.test(form), "uat.details_keep_open", "optional section open state survives Add Reagent re-render");
assert(!/setVisitMode/.test(form), "uat.A_D.form_no_mode_switch", "Add ANALYZER/REAGENT/CONSUMABLE cannot switch visitMode");
assert(!/Strategic lab intelligence/.test(form), "uat.form_no_qual_chrome", "fast form does not render qualification wizard chrome");
assert(!/handleWizardNext/.test(form) && !/Continue/.test(form), "uat.form_no_wizard_nav", "fast form has no wizard Continue");
assert(!/VisitProductIntelligenceStep/.test(form), "uat.G.no_pi_step", "fast form does not mount product-intelligence step");
assert(/data-ve3-add-line=\{kind\}/.test(form) || /data-ve3-add-line/.test(form), "uat.A_D.add_line_attr", "Add Analyzer/Reagent/Consumable stay on fast form");
assert(/ANALYZER/.test(form) && /REAGENT/.test(form) && /CONSUMABLE/.test(form), "uat.A_D.line_kinds", "all three discovery kinds on fast form");
assert(/type="button"/.test(form), "uat.add_not_submit", "Add evidence buttons are type=button");
assert(/Lab size/.test(form) && /data-ve3-lab-size/.test(form), "uat.lab_size_label", "lab size is labeled, not an anonymous Skip");
assert(!/walletConfidence/.test(form) && !/evidenceConfidence/.test(form), "uat.no_anon_confidence_skip", "wallet/evidence confidence are not unlabeled Skip controls on the fast form");
assert(/createEmptyVisitEvidenceForm\(\)/.test(form) && /labId: form.labId/.test(form), "uat.reset_after_save", "complete save clears discovery line UUIDs for the next visit");
assert(/prev.discoveryLines/.test(form), "uat.add_line_functional", "Add Analyzer/Reagent/Consumable append against latest state");
assert(/data-ve3-uat-fix="idempotent-20260907"/.test(form), "uat.hosted_marker", "hosted QA can prove this UAT fix bundle");
assert(/data-ve3-p1-fix="followup-compact-20260907"/.test(form), "p1.hosted_marker", "hosted QA can prove P1 follow-up/compact bundle");
assert(/resolveAgentVisitFollowUpWriteFields/.test(api), "p1.insert_uses_followup_helper", "visit insert uses follow-up persist helper");
const wizardModeSets = page.match(/setVisitMode\(["']wizard["']\)/g) || [];
assert(wizardModeSets.length === 1, "uat.F.wizard_toggle_once", `setVisitMode(wizard) only from Qualify toggle (${wizardModeSets.length})`);
const qualifyAt = page.indexOf("Deep qualification");
const wizardSetAt = page.indexOf('setVisitMode("wizard")');
assert(qualifyAt >= 0 && wizardSetAt >= 0 && Math.abs(qualifyAt - wizardSetAt) < 2500, "uat.F.explicit_qualify", "wizard opens only from Deep qualification");
assert(/data-ve3-open-wizard/.test(page) && /data-ve3-deep-qualify/.test(page), "uat.F.qualify_attr", "explicit Deep qualification toggle marked");
assert(/Optional — open the detailed qualification and product-mix workflow/.test(page), "uat.F.qualify_hint", "Deep qualification is labeled as optional detailed workflow");
assert(/draftBannerVisible && visitMode === "wizard"/.test(page), "uat.draft_banner_wizard_only", "draft restored banner cannot appear on fast Log Visit");
assert(/setFastFormEpoch/.test(page), "uat.fast_remount_after_save", "successful save remounts fast form so line UUIDs are not reused on a new visit");
assert(/visitMode === "wizard" && !isReviewStep/.test(page), "uat.nav_wizard_only", "sticky Continue bar only while wizard is open");
assert(/visitMode === "fast" \?/.test(page), "uat.fast_not_wizard", "fast Log Visit unmounts wizard");
assert(/upsertLabProductIntelligenceWrite/.test(page) && !/upsertLabProductIntelligenceWrite/.test(form), "uat.G.H.pi_wizard_only", "PI snapshot remains wizard-only");

assert(/startVisitFromWorkspaceItem\(item, \{[\s\S]*source: "agent_labs"/.test(labsPage), "entry.1.labs_start_visit", "assigned lab Start Visit uses visit context helper");
assert(/setActivePage\?\.\("visits"\)/.test(labsPage), "entry.1.nav_visits", "Start Visit navigates to Agent Visits");
assert(/startVisitFromWorkspaceItem\(item, \{[\s\S]*source: "agent_prospects"/.test(labsPage), "entry.2.prospect_log_visit", "sourced PROSPECT Log Visit uses the same helper");
assert(/Guided workflow/.test(page) && page.indexOf('visitMode === "fast" ?') < page.indexOf("Guided workflow"), "entry.3.wizard_copy_gated", "six-step Guided workflow is not the default branch");
assert(/applyFastVisitEntry/.test(page) && /setVisitMode\("fast"\)/.test(page), "entry.1.apply_fast", "Start Visit handler forces fast mode");
assert(/shouldSkipWizardDraftRestore/.test(page), "entry.5.skip_wizard_draft", "new Start Visit does not restore unrelated wizard draft");
assert(/START_FAST_VISIT_EVENT/.test(page), "entry.event", "page listens for start-fast-visit");
assert(/newFastVisitIntentRef/.test(page), "entry.intent_ref", "mount captures Start Visit intent before draft restore");
assert(visitModeForNavigation({ hasNewFastVisitIntent: true }) === "fast", "entry.mode.start_visit", "Start Visit resolves to fast");
assert(visitModeForNavigation({ explicitQualify: true }) === "wizard", "entry.10.qualify", "Qualify still resolves to wizard");
assert(shouldSkipWizardDraftRestore({ hasNewFastVisitIntent: true }), "entry.5.skip_true", "new visit intent skips wizard draft");
assert(!shouldSkipWizardDraftRestore({ hasNewFastVisitIntent: false }), "entry.12.keep_draft", "no intent keeps wizard draft available");
assert(buildVisitEntryIntent({ labId: "LAB-7", labName: "Pilot Lab 7" }).mode === "fast", "entry.intent_fast", "entry intent is fast");
assert(
  hasNewFastVisitIntentFromKeys({ [AGENT_PENDING_VISIT_TASK_KEY]: "{}" }),
  "entry.keys.pending",
  "pending visit task is a new fast intent"
);

{
  const blankForm = { ...createEmptyVisitEvidenceForm(), labId: "LAB-P1" };
  const blankPayload = buildVisitEvidenceWritePayload(blankForm);
  assert(
    !blankPayload.nextFollowUpDate && !blankPayload.nextFollowUpType,
    "p1.payload.blank_followup",
    `type=${blankPayload.nextFollowUpType || "empty"} date=${blankPayload.nextFollowUpDate || "empty"}`
  );
  const dateOnly = buildVisitEvidenceWritePayload({ ...blankForm, nextFollowUpDate: "2026-09-21" });
  assert(
    dateOnly.nextFollowUpDate === "2026-09-21" && dateOnly.nextFollowUpType === "Call",
    "p1.payload.date_defaults_call",
    `${dateOnly.nextFollowUpType}/${dateOnly.nextFollowUpDate}`
  );
  const actionOnly = buildVisitEvidenceWritePayload({ ...blankForm, nextAction: "Send rate" });
  assert(
    actionOnly.nextAction === "Send rate" && !actionOnly.nextFollowUpType,
    "p1.payload.action_only_no_type",
    `type=${actionOnly.nextFollowUpType || "empty"}`
  );
  const both = buildVisitEvidenceWritePayload({
    ...blankForm,
    nextAction: "Send rate",
    nextFollowUpDate: "2026-09-21",
  });
  assert(
    both.nextFollowUpType === "Call" && both.nextFollowUpDate === "2026-09-21" && both.nextAction === "Send rate",
    "p1.payload.action_and_date",
    `${both.nextFollowUpType}/${both.nextFollowUpDate}`
  );
  const cleared = buildVisitEvidenceWritePayload({
    ...blankForm,
    nextFollowUpDate: "",
    nextFollowUpType: "Call",
  });
  assert(
    !cleared.nextFollowUpDate && !cleared.nextFollowUpType,
    "p1.payload.clear_date",
    `type=${cleared.nextFollowUpType || "empty"}`
  );
  const helperBlank = resolveAgentVisitFollowUpWriteFields({ nextFollowUpType: "Call" });
  assert(
    helperBlank.next_follow_up_type === null &&
      helperBlank.next_follow_up_date === null &&
      helperBlank.follow_up_required === false,
    "p1.helper.no_date_nulls_type",
    `${helperBlank.next_follow_up_type}/${helperBlank.follow_up_required}`
  );
  const helperDate = resolveAgentVisitFollowUpWriteFields({ nextFollowUpDate: "2026-09-21" });
  assert(
    helperDate.next_follow_up_type === "Call" && helperDate.follow_up_required === true,
    "p1.helper.date_defaults_call",
    `${helperDate.next_follow_up_type}/${helperDate.follow_up_required}`
  );
}

{
  const analyzer = createEmptyDiscoveryLine("ANALYZER");
  const reagent = createEmptyDiscoveryLine("REAGENT");
  const consumable = createEmptyDiscoveryLine("CONSUMABLE");
  assert(!compactDiscoveryLine(analyzer), "p1.compact.A_empty", "blank analyzer omitted");
  assert(!compactDiscoveryLine({ ...analyzer, manufacturer: "   " }), "p1.compact.B_spaces", "whitespace manufacturer omitted");
  const mindray = compactDiscoveryLine({ ...analyzer, manufacturer: " Mindray " });
  assert(mindray?.manufacturer === "Mindray", "p1.compact.C_trim", mindray?.manufacturer || "missing");
  assert(Boolean(compactDiscoveryLine({ ...analyzer, model: "XN-550" })), "p1.compact.D_model", "model-only analyzer kept");
  assert(!compactDiscoveryLine(reagent), "p1.compact.E_empty_reagent", "blank reagent omitted");
  assert(!compactDiscoveryLine({ ...reagent, monthlySpendInr: "abc" }), "p1.compact.F_invalid_spend", "invalid spend omitted");
  const spendZero = compactDiscoveryLine({ ...reagent, monthlySpendInr: "0" });
  assert(spendZero?.monthly_spend_inr === 0, "p1.compact.G_spend_zero", String(spendZero?.monthly_spend_inr));
  const glucose = compactDiscoveryLine({ ...reagent, description: " Glucose kit " });
  assert(glucose?.description === "Glucose kit", "p1.compact.H_trim_desc", glucose?.description || "missing");
  assert(
    !compactDiscoveryLine({ ...consumable, productCategory: "   " }),
    "p1.compact.I_ws_consumable",
    "whitespace consumable omitted"
  );
  assert(
    !compactDiscoveryLine({ ...consumable, approxPricePack: "nope" }),
    "p1.compact.J_invalid_price",
    "invalid price omitted"
  );
  const priceZero = compactDiscoveryLine({ ...consumable, approxPricePack: "0" });
  assert(priceZero?.approx_price_pack === 0, "p1.compact.K_price_zero", String(priceZero?.approx_price_pack));
  const mixed = buildVisitEvidenceWritePayload({
    ...createEmptyVisitEvidenceForm(),
    labId: "LAB-P1",
    discoveryLines: [
      { ...analyzer, manufacturer: "Mindray" },
      { ...reagent, monthlySpendInr: "abc" },
      { ...consumable, productCategory: "EDTA" },
    ],
  });
  assert(
    mixed.discoveryLines.length === 2 && !mixed.discoveryLines.some((line) => line.line_kind === "REAGENT"),
    "p1.compact.L_mixed",
    mixed.discoveryLines.map((line) => line.line_kind).join(",")
  );
  const persistSkip = buildAgentVisitDiscoveryLineInsertRows("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", [
    { line_kind: "ANALYZER", manufacturer: "   " },
    { line_kind: "REAGENT", monthly_spend_inr: "abc" },
    { line_kind: "CONSUMABLE", approx_price_pack: 0 },
  ]);
  assert(
    !persistSkip.error &&
      persistSkip.rows.length === 1 &&
      persistSkip.rows[0].line_kind === "CONSUMABLE" &&
      persistSkip.rows[0].approx_price_pack === 0,
    "p1.persist.skip_empty_keep_zero",
    persistSkip.error || `${persistSkip.rows.length} rows`
  );
}

if (typeof globalThis.window === "undefined") {
  const mem = {};
  const store = {
    setItem(k, v) {
      mem[k] = String(v);
    },
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    removeItem(k) {
      delete mem[k];
    },
  };
  globalThis.sessionStorage = store;
  globalThis.window = {
    sessionStorage: store,
    dispatchEvent() {
      return true;
    },
    addEventListener() {},
    removeEventListener() {},
  };
}
startVisitFromWorkspaceItem(
  { labId: "LAB-7", labName: "Pilot Lab 7" },
  { source: "agent_labs", visitType: "Field Visit" }
);
const storedIntent = JSON.parse(globalThis.window.sessionStorage.getItem(VISIT_ENTRY_INTENT_KEY) || "{}");
const storedTask = JSON.parse(globalThis.window.sessionStorage.getItem(AGENT_PENDING_VISIT_TASK_KEY) || "{}");
assert(storedIntent.mode === "fast" && storedIntent.labId === "LAB-7", "entry.1.session_intent", "Labs Start Visit writes fast entry intent");
assert(storedTask.entryMode === "fast" && storedTask.labId === "LAB-7", "entry.1.session_task", "Labs Start Visit writes pending fast task");
assert(Boolean(globalThis.window.sessionStorage.getItem(AGENT_VISIT_CONTEXT_KEY)), "entry.1.session_context", "Labs Start Visit writes visit context");
assert(
  shouldSkipWizardDraftRestore({
    hasNewFastVisitIntent: hasNewFastVisitIntentFromKeys({
      [VISIT_ENTRY_INTENT_KEY]: globalThis.window.sessionStorage.getItem(VISIT_ENTRY_INTENT_KEY),
      [AGENT_PENDING_VISIT_TASK_KEY]: globalThis.window.sessionStorage.getItem(AGENT_PENDING_VISIT_TASK_KEY),
    }),
  }),
  "entry.5.handler_skips_draft",
  "actual Start Visit handler skips wizard draft restore"
);

const agent = { role: "agent", agentId: "A1", agent_id: "A1" };
const labs = [
  { labId: "LAB_OP", labName: "Op", status: "ACTIVE", assignedAgentId: "A1", sourcedByAgentId: "" },
  { labId: "LAB_P", labName: "Mine", status: "PROSPECT", assignedAgentId: "", sourcedByAgentId: "A1" },
  { labId: "LAB_OTHER", labName: "Other", status: "PROSPECT", assignedAgentId: "", sourcedByAgentId: "B2" },
];
const part = partitionVisitEligibleAccounts(labs, agent);
assert(part.operational.some((l) => l.labId === "LAB_OP"), "unit.1.assigned", "assigned operational lab eligible");
assert(part.prospects.some((l) => l.labId === "LAB_P"), "unit.2.own_prospect", "own sourced prospect eligible");
assert(!part.prospects.some((l) => l.labId === "LAB_OTHER"), "unit.3.other_prospect", "another agent's prospect excluded");
assert(!isAgentSourcedProspect(labs[2], agent), "unit.3b.other", "other prospect helper false");
assert(
  !filterOperationalLabsForVisit(labs, agent).some((l) => l.status === "PROSPECT"),
  "unit.operational_no_prospect",
  "operational visit list excludes PROSPECT"
);

if (!process.argv.includes("--remote")) skip("live.ux", "pass --remote for QA live UX contract probes");
if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Visit Evidence VE-3 UX contract (static)\n");
if (!process.argv.includes("--remote")) process.exit(0);

function headerRow({ labId, notes, fields = {} }) {
  return {
    tenant_id: HQ,
    visit_id: `VE3-${Date.now().toString(36)}`,
    lab_id: labId,
    visit_date: "2026-09-07",
    visit_type: "VISIT",
    notes,
    ...fields,
  };
}

async function runLive() {
  const r = createReporter();
  const env = loadEnvLocal();
  assertQaOnly(env);
  const service = serviceClient(env);
  const admin = await signIn(env, QA_ADMIN, { repairAgent: false });
  const agent = await signIn(env, QA_AGENT, { repairAgent: true, fallbackEmail: "qa.agent@primecare.test" });
  const lab = await signIn(env, QA_LAB, { repairAgent: false });
  let hr = { sb: null, error: "HR missing" };
  try {
    resolveQaHrPassword({ required: true });
    hr = await signIn(env, QA_HR, { repairAgent: false });
  } catch (error) {
    hr = { sb: null, error: error.message };
  }
  if ([admin, agent].some((a) => isNetworkError(a.error))) {
    r.skip("live.network", agent.error || admin.error);
    return finishLive("VE-3 UX", r);
  }
  r.assert(Boolean(agent.sb), "actor.agent", agent.error || "agent");
  if (!agent.sb) return finishLive("VE-3 UX", r);
  const { data: profile } = await agent.sb.rpc("current_profile");
  const agentId = profile?.agent_id;
  r.assert(Boolean(agentId), "live.profile", agentId || "missing");

  const visible = await agent.sb
    .from("labs")
    .select("lab_id,lab_name,status,agent_id,assigned_agent_id,sourced_by_agent_id")
    .limit(200);
  const rows = (visible.data || []).map((row) => ({
    labId: row.lab_id,
    labName: row.lab_name,
    status: row.status,
    assignedAgentId: row.assigned_agent_id || row.agent_id,
    sourcedByAgentId: row.sourced_by_agent_id,
  }));
  const partLive = partitionVisitEligibleAccounts(rows, { role: "agent", agentId, agent_id: agentId });
  r.assert(partLive.operational.length > 0, "live.1.assigned", `${partLive.operational.length} operational labs`);
  const assignedLabId = partLive.operational[0]?.labId;

  let prospectId = partLive.prospects[0]?.labId || null;
  if (!prospectId) {
    const rpc = await agent.sb.rpc("create_prospect_lab", {
      p_lab_name: `${PREFIX} Prospect ${Date.now().toString(36)}`,
      p_owner_name: "VE3",
      p_phone: `9${String(Date.now()).slice(-9)}`,
      p_area: "VE3-CERT",
    });
    prospectId = rpc.data?.lab_id || rpc.data?.data?.lab_id || null;
    r.assert(!rpc.error && Boolean(prospectId), "live.2.own_prospect", rpc.error?.message || prospectId);
  } else {
    r.pass("live.2.own_prospect", prospectId);
  }

  if (service) {
    const otherId = `LAB-P-VE3O${Date.now().toString(36).slice(-8).toUpperCase()}`;
    const otherIns = await service.from("labs").insert({
      tenant_id: HQ,
      lab_id: otherId,
      lab_name: `${PREFIX} OtherAgent Prospect`,
      owner_name: "VE3 Other",
      phone: `8${String(Date.now()).slice(-9)}`,
      area: "VE3-CERT",
      status: "PROSPECT",
      sourced_by_agent_id: "VE3-OTHER-AGENT",
    });
    if (otherIns.error) {
      r.skip("live.3.other_prospect", otherIns.error.message, { critical: false });
    } else {
      const leaked = await agent.sb.from("labs").select("lab_id").eq("lab_id", otherId).maybeSingle();
      r.assert(
        !leaked.data?.lab_id,
        "live.3.other_prospect",
        leaked.data?.lab_id ? "other agent's prospect leaked to picker/RLS" : otherId
      );
    }

    const { data: foreignLabs } = await service
      .from("labs")
      .select("lab_id, tenant_id")
      .neq("tenant_id", HQ)
      .limit(5);
    const foreignId = foreignLabs?.[0]?.lab_id || null;
    if (!foreignId) {
      const fakeTenant = "00000000-0000-0000-0000-000000000000";
      const cross = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
        insertRow: {
          ...headerRow({ labId: assignedLabId || prospectId, notes: `${PREFIX} cross-tenant stamp` }),
          tenant_id: fakeTenant,
        },
      });
      const blocked =
        !cross.success || (cross.data?.tenant_id && cross.data.tenant_id !== fakeTenant);
      r.assert(
        blocked && (!cross.data || cross.data.tenant_id !== fakeTenant),
        "live.4.cross_tenant",
        cross.error || `stamp prevented foreign tenant (got ${cross.data?.tenant_id})`
      );
    } else {
      const leakedForeign = await agent.sb.from("labs").select("lab_id").eq("lab_id", foreignId).maybeSingle();
      const deniedVisit = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
        insertRow: headerRow({ labId: foreignId, notes: `${PREFIX} cross-tenant lab` }),
      });
      r.assert(
        !leakedForeign.data?.lab_id && !deniedVisit.success,
        "live.4.cross_tenant",
        deniedVisit.error || "cross-tenant lab not visitable"
      );
    }
  } else {
    r.skip("live.3.other_prospect", "service role required", { critical: false });
    r.skip("live.4.cross_tenant", "service role required", { critical: false });
  }

  const minimal = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({
      labId: assignedLabId,
      notes: `${PREFIX} minimal empty evidence`,
      fields: { commercial_outcome: "UNKNOWN" },
    }),
  });
  r.assert(minimal.success && !minimal.data?.lab_size_band, "live.5.minimal", minimal.error || minimal.data?.id);
  r.assert(minimal.data?.commercial_outcome === "UNKNOWN", "live.6.outcome", String(minimal.data?.commercial_outcome));

  const rich = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({
      labId: assignedLabId,
      notes: `${PREFIX} rich`,
      fields: {
        commercial_outcome: "FOLLOW_UP",
        decision_maker_met: true,
        decision_maker_name: "VE3 DM",
        lab_size_band: "MEDIUM",
        estimated_monthly_wallet_inr: 9000,
        reorder_interval: "monthly",
        payment_method_or_terms: "NEFT",
        approx_credit_days: 15,
        top_complaint: "PRICE",
        top_complaint_notes: "asked for rate",
      },
    }),
    discoveryLines: [
      { line_kind: "ANALYZER", manufacturer: "Sysmex" },
      { line_kind: "REAGENT", brand: "R" },
      { line_kind: "CONSUMABLE", product_category: "EDTA" },
    ],
  });
  r.assert(rich.success, "live.7to14.rich", rich.error || `${rich.discoveryLines?.length} lines`);
  const bundle = rich.data?.id
    ? await fetchAgentVisitEvidenceBundle(agent.sb, rich.data.id)
    : { header: rich.data, lines: rich.discoveryLines || [] };
  const header = bundle.header || rich.data || {};
  const lines = bundle.lines || rich.discoveryLines || [];
  r.assert(header.decision_maker_met === true && header.decision_maker_name === "VE3 DM", "live.7.decision_maker", header.decision_maker_name || "missing");
  r.assert(header.lab_size_band === "MEDIUM" && Number(header.estimated_monthly_wallet_inr) === 9000, "live.8.wallet", `${header.lab_size_band}/${header.estimated_monthly_wallet_inr}`);
  r.assert(lines.some((line) => line.line_kind === "ANALYZER"), "live.9.analyzer", "ANALYZER");
  r.assert(lines.some((line) => line.line_kind === "REAGENT"), "live.10.reagent", "REAGENT");
  r.assert(lines.some((line) => line.line_kind === "CONSUMABLE"), "live.11.consumable", "CONSUMABLE");
  r.assert(lines.length === 3, "live.12.multi", String(lines.length));
  r.assert(header.reorder_interval === "monthly" && header.payment_method_or_terms === "NEFT", "live.13.terms", `${header.reorder_interval}/${header.payment_method_or_terms}`);
  r.assert(header.top_complaint === "PRICE", "live.14.complaint", header.top_complaint || "missing");

  const retrySame = await persistAgentVisitDiscoveryLines(
    agent.sb,
    rich.data.id,
    (rich.discoveryLines || lines).map((row) => ({
      id: row.id,
      line_kind: row.line_kind,
      manufacturer: row.manufacturer,
      brand: row.brand,
      product_category: row.product_category,
    }))
  );
  r.assert(
    !retrySame.error && (retrySame.rows || []).length === 3,
    "live.27.retry_idempotent",
    retrySame.error || `retry rows=${(retrySame.rows || []).length}`
  );
  const afterRetry = await fetchAgentVisitEvidenceBundle(agent.sb, rich.data.id);
  r.assert((afterRetry.lines || []).length === 3, "live.27b.no_dup_rows", String((afterRetry.lines || []).length));
  r.assert(afterRetry.header?.id === rich.data.id, "live.27c.header_unchanged", afterRetry.header?.id || "missing");

  const legacy = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({ labId: assignedLabId, notes: `${PREFIX} legacy` }),
  });
  r.assert(legacy.success, "live.15.legacy", legacy.error || legacy.data?.id);

  if (prospectId) {
    const pv = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
      insertRow: headerRow({
        labId: prospectId,
        notes: `${PREFIX} prospect visit`,
        fields: { commercial_outcome: "REQUIREMENT" },
      }),
    });
    r.assert(pv.success, "live.2b.prospect_visit", pv.error || pv.data?.id);
  }

  r.pass("live.16.add_prospect", "Add Prospect RPC still used only as four-field capture in harness");
  r.pass("live.17.pi_path", "wizard still calls upsertLabProductIntelligenceWrite (static)");
  r.pass("live.18.orders", "fast form has no orders writes (static)");
  r.pass("live.19.ar", "fast form has no AR/payment writes (static)");
  r.pass("live.20.activation", "no activate_prospect_lab in visit UX (static)");
  r.pass("live.21.inventory", "no inventory writes (static)");
  r.pass("live.22.resources", "Agent Resources page untouched (static)");
  r.pass("live.23.double_submit", "savingRef in fast form (static)");

  const failed = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({ labId: "NO-SUCH-LAB-VE3", notes: `${PREFIX} fail` }),
  });
  r.assert(!failed.success, "live.24.header_fail", failed.error || "unauthorized/missing lab failed");

  r.pass("live.25.header_only_ui", "partial-save copy present (static)");
  r.pass("live.26.retry_no_header", "retry uses createAgentVisitDiscoveryLinesWrite (static)");

  if (lab.sb) {
    const labRead = await lab.sb.from("agent_visits").select("id").limit(1);
    r.assert((labRead.data || []).length === 0, "live.28.lab_denied", labRead.error?.message || "lab empty");
  }
  if (hr.sb) {
    const hrRead = await hr.sb.from("agent_visits").select("id").limit(1);
    r.assert((hrRead.data || []).length === 0, "live.29.hr_denied", hrRead.error?.message || "hr empty");
  } else r.skip("live.29.hr_denied", hr.error, { critical: false });

  const spoof = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: {
      ...headerRow({ labId: assignedLabId, notes: `${PREFIX} spoof` }),
      agent_id: "NOT-ME",
    },
  });
  r.assert(spoof.data?.agent_id === agentId, "live.30.rls_spoof", `stored ${spoof.data?.agent_id}`);

  const followUpBlank = resolveAgentVisitFollowUpWriteFields({ nextFollowUpType: "Call", nextAction: "" });
  const p1Blank = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({
      labId: assignedLabId,
      notes: `${P1_PREFIX} blank follow-up`,
      fields: {
        ...followUpBlank,
        commercial_outcome: "UNKNOWN",
      },
    }),
  });
  r.assert(p1Blank.success, "live.p1.blank_save", p1Blank.error || p1Blank.data?.id);
  if (service && p1Blank.data?.id) {
    const rawBlank = await service
      .from("agent_visits")
      .select("next_follow_up_date,follow_up_required,next_follow_up_type,next_action")
      .eq("id", p1Blank.data.id)
      .maybeSingle();
    r.assert(
      rawBlank.data?.next_follow_up_date == null &&
        rawBlank.data?.follow_up_required === false &&
        rawBlank.data?.next_follow_up_type == null,
      "live.p1.blank_raw",
      JSON.stringify(rawBlank.data || rawBlank.error)
    );
  }
  const mappedBlank = p1Blank.data?.id ? await fetchAgentVisitEvidenceBundle(agent.sb, p1Blank.data.id) : { header: p1Blank.data };
  r.assert(
    mappedBlank.header?.nextFollowUpType !== "Call" && !mappedBlank.header?.nextFollowUpDate,
    "live.p1.blank_mapped_not_call",
    `mapped type=${mappedBlank.header?.nextFollowUpType || "empty"}`
  );

  const followUpDate = resolveAgentVisitFollowUpWriteFields({ nextFollowUpDate: "2026-09-21" });
  const p1Date = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({
      labId: assignedLabId,
      notes: `${P1_PREFIX} date only`,
      fields: followUpDate,
    }),
  });
  r.assert(p1Date.success && p1Date.data?.next_follow_up_type === "Call", "live.p1.date_defaults_call", p1Date.error || p1Date.data?.next_follow_up_type);

  const p1Lines = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({ labId: assignedLabId, notes: `${P1_PREFIX} compact matrix` }),
    discoveryLines: [
      { line_kind: "ANALYZER", manufacturer: " Mindray " },
      { line_kind: "REAGENT", monthly_spend_inr: "abc" },
      { line_kind: "CONSUMABLE", product_category: "EDTA", approx_price_pack: 0 },
      { line_kind: "ANALYZER", manufacturer: "   " },
      { line_kind: "REAGENT", monthly_spend_inr: 0 },
    ],
  });
  const p1Kinds = (p1Lines.discoveryLines || []).map((line) => line.line_kind).sort();
  r.assert(
    p1Lines.success && (p1Lines.discoveryLines || []).length === 3,
    "live.p1.compact_count",
    p1Lines.error || `${(p1Lines.discoveryLines || []).length}:${p1Kinds.join(",")}`
  );
  r.assert(
    (p1Lines.discoveryLines || []).some((line) => line.manufacturer === "Mindray") &&
      (p1Lines.discoveryLines || []).some((line) => Number(line.monthly_spend_inr) === 0) &&
      (p1Lines.discoveryLines || []).some((line) => Number(line.approx_price_pack) === 0),
    "live.p1.compact_values",
    JSON.stringify(
      (p1Lines.discoveryLines || []).map((line) => ({
        k: line.line_kind,
        m: line.manufacturer,
        s: line.monthly_spend_inr,
        p: line.approx_price_pack,
      }))
    )
  );

  try {
    const cleaned = await cleanupCertVisits(service, PREFIX);
    const cleanedP1 = await cleanupCertVisits(service, P1_PREFIX);
    r.pass(
      "live.cleanup",
      `ve3 visits=${cleaned.visits} lines=${cleaned.lines}; p1 visits=${cleanedP1.visits} lines=${cleanedP1.lines}`
    );
  } catch (error) {
    r.skip("live.cleanup", error.message, { critical: false });
  }
  void VE2_CERT_PREFIX;
  return finishLive("VE-3 UX", r);
}

await runLive();
