#!/usr/bin/env node
/**
 * verify-agent-visit-evidence-api.mjs
 *
 * Purpose: VE-2 application write/read contract for Visit Evidence.
 * Module owner: Agent Visit Evidence
 *
 * Usage:
 *   node scripts/verify-agent-visit-evidence-api.mjs
 *   node scripts/verify-agent-visit-evidence-api.mjs --remote
 */
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAgentVisitDiscoveryLineInsertRows,
  pickVisitEvidenceHeaderFields,
} from "../src/visits/agentVisitEvidenceContract.js";
import {
  fetchAgentVisitEvidenceBundle,
  persistAgentVisitDiscoveryLines,
  persistAgentVisitWithOptionalDiscovery,
} from "../src/visits/agentVisitEvidenceApi.js";
import { HQ_AGENT_VISIT_COLUMNS } from "../src/api/hqReadBounds.js";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_HR,
  QA_HQ_TENANT_ID,
  QA_LAB,
  resolveQaHrPassword,
} from "./qaCredentials.mjs";
import {
  VE2_CERT_PREFIX,
  anonClient,
  assertQaOnly,
  cleanupCertVisits,
  createDisposableAgent,
  createReporter,
  finishLive,
  isNetworkError,
  loadEnvLocal,
  serviceClient,
  signIn,
} from "./lib/agentVisitEvidenceLiveQa.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = QA_HQ_TENANT_ID;
const PREFIX = VE2_CERT_PREFIX;

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

const api = read("src/api/primecareSupabaseApi.js");
const evidenceApi = read("src/visits/agentVisitEvidenceApi.js");
const contract = read("src/visits/agentVisitEvidenceContract.js");
const bounds = read("src/api/hqReadBounds.js");
const bounded = read("src/api/hqBoundedReads.js");
const page = read("src/pages/AgentVisitPage.jsx");
const access = read("src/utils/accessFilters.js");
const awareness = read("src/predator/schemaAwareness.js");

assert(/export async function createAgentVisitWrite/.test(api), "path.canonical", "createAgentVisitWrite remains the Visit write path");
assert(
  /persistAgentVisitWithOptionalDiscovery/.test(api),
  "path.reuse",
  "canonical write delegates to VE-2 persist helper"
);
assert(
  !/export async function createVisitEvidenceWrite/.test(api),
  "path.no_second_api",
  "no parallel Visit Evidence write API"
);
assert(/pickVisitEvidenceHeaderFields/.test(api), "header.builder", "header builder maps VE-1 fields");
assert(/createAgentVisitDiscoveryLinesWrite/.test(api), "lines.write_api", "discovery-line write API");
assert(/getAgentVisitEvidenceRead/.test(api), "read.api", "bounded evidence read API");
assert(/visit_uuid/.test(evidenceApi) && !/visit_id text/.test(evidenceApi), "lines.uuid_fk", "child relationship is visit_uuid");
assert(
  /discovery lines must use visit_uuid, not visit_id text/.test(contract),
  "lines.forbid_text_fk",
  "builder rejects visit_id as child FK"
);
assert(
  /select\(HQ_AGENT_VISIT_COLUMNS\)/.test(evidenceApi),
  "write.select_bounded",
  "header insert RETURNING uses bounded columns, not SELECT *"
);
assert(
  !/\.insert\(\[insertRow\]\)\.select\(\)/.test(api),
  "write.no_select_star",
  "createAgentVisitWrite no longer uses unbounded .select()"
);
assert(
  /fetchAgentVisitEvidenceBundle/.test(bounded) && /HQ_AGENT_VISIT_EVIDENCE_COLUMNS/.test(bounds),
  "read.bounds_wired",
  "hqBoundedReads exposes dedicated evidence readers"
);
assert(
  /export const HQ_AGENT_VISIT_COLUMNS =\s*\n\s*"id,lab_id,agent_id,agent_name,visit_date,created_at,notes,visit_type,tenant_id,visit_id,follow_up_required,next_follow_up_date,next_follow_up_type,next_action";/.test(
    bounds
  ),
  "read.dashboard_unchanged",
  "dashboard HQ_AGENT_VISIT_COLUMNS remains production-safe"
);
assert(
  /fetchAgentVisitsBoundedRows[\s\S]*select\(HQ_AGENT_VISIT_COLUMNS\)/.test(bounded),
  "read.list_production_safe",
  "visit list reads stay on HQ_AGENT_VISIT_COLUMNS"
);
assert(
  /persistence: "header_only"/.test(evidenceApi),
  "partial.header_only",
  "line failure returns header_only, not complete success"
);
assert(!/from\("lab_qualifications"\)/.test(evidenceApi), "firewall.no_qual", "evidence persist does not write qualifications");
assert(
  !/from\("lab_product_intelligence"\)/.test(evidenceApi),
  "firewall.no_pi",
  "evidence persist does not write product intelligence"
);
assert(!/from\("orders"\)/.test(evidenceApi), "firewall.no_orders", "no orders writes");
assert(!/from\("invoices"\)/.test(evidenceApi), "firewall.no_invoices", "no invoice writes");
assert(!/from\("payments"\)/.test(evidenceApi), "firewall.no_payments", "no payment writes");
assert(!/from\("ar_credit_control"\)/.test(evidenceApi), "firewall.no_ar", "no AR writes");
assert(!/from\("inventory"\)/.test(evidenceApi), "firewall.no_inventory", "no inventory writes");
assert(!/from\("inventory_ledger"\)/.test(evidenceApi), "firewall.no_ledger", "no ledger writes");
assert(!/from\("purchase_orders"\)/.test(evidenceApi), "firewall.no_po", "no PO writes");
assert(!/activate_prospect_lab/.test(evidenceApi), "firewall.no_activate", "no activation");
assert(!/from\("labs"\)/.test(evidenceApi), "firewall.no_labs_write", "evidence persist does not mutate labs");
assert(
  !/\.update\([^)]*sourced_by_agent_id/.test(evidenceApi),
  "firewall.no_sourced_by",
  "no sourced_by mutation path"
);
assert(!/ordering_mode/.test(evidenceApi), "firewall.no_ordering_mode", "no ordering_mode");
assert(!/CREATE OR REPLACE FUNCTION/.test(evidenceApi), "arch.no_rpc", "no new RPC in VE-2 persist layer");
assert(/upsertLabProductIntelligenceWrite/.test(page), "compat.pi_path", "AgentVisitPage still uses snapshot product-intel path");
assert(
  /createAgentVisitWrite\(\{[\s\S]*labId: normalizedLabId/.test(page) && !/discoveryLines/.test(page),
  "compat.legacy_page",
  "AgentVisitPage still sends legacy payload (no VE-3 discoveryLines)"
);
assert(/export function filterLabsForUser/.test(access), "compat.filter_fn", "filterLabsForUser still exported");
assert(
  !/status.*PROSPECT/.test(access.split("export function filterLabsForUser")[1]?.slice(0, 1200) || ""),
  "compat.filter_no_prospect",
  "VE-2 does not add PROSPECT to filterLabsForUser"
);
assert(
  existsSync(resolve(root, "supabase/migrations/20260905160000_agent_prospect_2a_sourced_by_and_create_rpc.sql")),
  "compat.prospect_rpc",
  "create_prospect_lab migration still present (Add Prospect unchanged)"
);
assert(!/create_prospect_lab/.test(evidenceApi) && !/activate_prospect_lab/.test(evidenceApi), "compat.no_prospect_rpc_in_ve2", "VE-2 persist does not call prospect/activation RPCs");
assert(awareness.includes("AGENT_VISIT_DISCOVERY_LINE_INSERT_COLUMNS"), "awareness.lines", "insert whitelist for lines");
assert(!/\bSELECT \*/.test(HQ_AGENT_VISIT_COLUMNS), "bounds.no_star_const", "HQ_AGENT_VISIT_COLUMNS is explicit");

const legacyEvidence = pickVisitEvidenceHeaderFields({
  labId: "LAB_X",
  visitDate: "2026-09-07",
  visitType: "VISIT",
  notes: "legacy",
});
assert(!legacyEvidence.error, "unit.legacy_omit", "legacy payload has no evidence builder error");
assert(
  Object.values(legacyEvidence.fields).every((v) => v === null),
  "unit.legacy_nulls",
  "omitted discovery fields stay null/optional"
);

const headerOk = pickVisitEvidenceHeaderFields({
  commercial_outcome: "FOLLOW_UP",
  lab_size_band: "SMALL",
  estimated_monthly_wallet_inr: 12000,
  wallet_confidence: "ESTIMATED",
  top_complaint: "PRICE",
});
assert(
  headerOk.fields.commercial_outcome === "FOLLOW_UP" && headerOk.fields.lab_size_band === "SMALL",
  "unit.header_enums",
  "header enums uppercase and persistable"
);

const badEnum = pickVisitEvidenceHeaderFields({ commercial_outcome: "WINNER" });
assert(Boolean(badEnum.error), "unit.invalid_enum", badEnum.error || "invalid enum rejected");

const badLine = buildAgentVisitDiscoveryLineInsertRows("abc", [
  { line_kind: "ANALYZER", visit_id: "VIS-1" },
]);
assert(Boolean(badLine.error), "unit.line_rejects_visit_id", badLine.error || "visit_id child rejected");

const kinds = buildAgentVisitDiscoveryLineInsertRows("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", [
  { line_kind: "ANALYZER", manufacturer: "Sysmex" },
  { line_kind: "REAGENT", brand: "BrandA", monthly_spend_inr: 1000 },
  { line_kind: "CONSUMABLE", product_category: "EDTA", approx_volume: 2 },
]);
assert(
  !kinds.error && kinds.rows.length === 3 && kinds.rows.every((row) => row.visit_uuid.startsWith("aaaaaaaa")),
  "unit.multi_lines",
  "ANALYZER/REAGENT/CONSUMABLE rows attach to visit uuid"
);

if (!process.argv.includes("--remote")) {
  skip("live.api", "pass --remote to run QA application contract probes");
}

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO — Agent Visit Evidence VE-2 API contract (static)\n");

if (!process.argv.includes("--remote")) {
  process.exit(0);
}

function headerRow({ labId, notes, extra = {}, fields = {}, agent_id } = {}) {
  return {
    tenant_id: HQ,
    visit_id: `VE2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    lab_id: labId,
    agent_id: agent_id || extra.agent_id || "SPOOF-OTHER-AGENT",
    visit_date: "2026-09-07",
    visit_type: "VISIT",
    notes,
    ...(extra.fields || {}),
    ...fields,
  };
}

async function countTable(client, table, labId, idColumn = "id") {
  const { count, error } = await client
    .from(table)
    .select(idColumn, { count: "exact", head: true })
    .eq("lab_id", labId);
  return { count: count ?? 0, error };
}

async function runLive() {
  const r = createReporter();
  const env = loadEnvLocal();
  const { ref } = assertQaOnly(env);
  r.pass("live.env.qa", `VITE_SUPABASE_URL project ${ref}`);

  const service = serviceClient(env);
  const admin = await signIn(env, QA_ADMIN, { repairAgent: false });
  const exec = await signIn(env, QA_EXECUTIVE, { repairAgent: false });
  const agent = await signIn(env, QA_AGENT, { repairAgent: true, fallbackEmail: "qa.agent@primecare.test" });
  const lab = await signIn(env, QA_LAB, { repairAgent: false });
  let hr = { sb: null, error: "QA_HR_PASSWORD missing" };
  try {
    resolveQaHrPassword({ required: true });
    hr = await signIn(env, QA_HR, { repairAgent: false });
  } catch (error) {
    hr = { sb: null, error: error.message };
  }

  if ([admin, exec, agent].some((a) => isNetworkError(a.error))) {
    r.skip("live.network", `QA unreachable (${admin.error || agent.error})`);
    return finishLive("VE-2 API", r);
  }

  r.assert(Boolean(admin.sb), "actor.admin", admin.error || "Admin signed in");
  r.assert(Boolean(exec.sb), "actor.executive", exec.error || "Executive signed in");
  r.assert(Boolean(agent.sb), "actor.agent", agent.error || "Agent signed in");
  r.assert(Boolean(lab.sb), "actor.lab", lab.error || "Lab signed in");
  if (hr.sb) r.pass("actor.hr", "HR signed in");
  else r.skip("actor.hr", hr.error, { critical: false });

  if (!agent.sb) return finishLive("VE-2 API", r);

  const { data: profile } = await agent.sb.rpc("current_profile");
  const agentId = profile?.agent_id || null;
  r.assert(Boolean(agentId), "live.agent.profile", agentId || "current_profile().agent_id missing");
  if (!agentId) return finishLive("VE-2 API", r);

  let assignedLabId = null;
  let invisibleLabId = null;
  let createdProspectLabId = null;

  let visible = await agent.sb
    .from("labs")
    .select("lab_id, status, agent_id, assigned_agent_id, sourced_by_agent_id")
    .limit(200);
  if (visible.error && /sourced_by_agent_id/.test(visible.error.message || "")) {
    visible = await agent.sb.from("labs").select("lab_id, status, agent_id, assigned_agent_id").limit(200);
  }
  for (const row of visible.data || []) {
    const assigned = (row.agent_id || row.assigned_agent_id || "") === agentId;
    const status = String(row.status || "").toUpperCase();
    if (!assignedLabId && assigned && status !== "PROSPECT") assignedLabId = row.lab_id;
  }
  if (!assignedLabId) {
    assignedLabId =
      (visible.data || []).find((row) => String(row.status || "").toUpperCase() !== "PROSPECT")?.lab_id || null;
  }

  if (service) {
    const { data: others } = await service
      .from("labs")
      .select("lab_id, agent_id, assigned_agent_id, sourced_by_agent_id, tenant_id")
      .eq("tenant_id", HQ)
      .limit(80);
    invisibleLabId =
      (others || []).find((row) => {
        const assigned = (row.agent_id || row.assigned_agent_id || "") === agentId;
        const sourced = (row.sourced_by_agent_id || "") === agentId;
        return !assigned && !sourced;
      })?.lab_id || null;
  }

  if (!assignedLabId) {
    r.skip("live.assigned_lab", "no assigned non-PROSPECT lab visible to QA agent");
    return finishLive("VE-2 API", r);
  }
  r.pass("live.assigned_lab", assignedLabId);

  const ordersBefore = await countTable(admin.sb, "orders", assignedLabId, "order_id");
  const qualBefore = await countTable(admin.sb, "lab_qualifications", assignedLabId);
  const piBefore = await countTable(admin.sb, "lab_product_intelligence", assignedLabId);

  const legacy = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({ labId: assignedLabId, notes: `${PREFIX} legacy payload` }),
    discoveryLines: [],
  });
  r.assert(
    legacy.success && Boolean(legacy.data?.id) && !legacy.data?.commercial_outcome,
    "live.1.legacy",
    legacy.error || `legacy visit ${legacy.data?.id}`
  );

  const header = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({
      labId: assignedLabId,
      notes: `${PREFIX} header evidence`,
      fields: {
        commercial_outcome: "FOLLOW_UP",
        lab_size_band: "SMALL",
        estimated_monthly_wallet_inr: 15000,
        wallet_range_band: "agent-stated band",
        wallet_confidence: "ESTIMATED",
        evidence_confidence: "CUSTOMER_STATED",
        decision_maker_met: true,
        decision_maker_name: "VE2 DM",
        top_complaint: "PRICE",
        approx_credit_days: 30,
      },
    }),
  });
  r.assert(
    header.success &&
      header.data?.commercial_outcome === "FOLLOW_UP" &&
      header.data?.lab_size_band === "SMALL" &&
      Number(header.data?.estimated_monthly_wallet_inr) === 15000,
    "live.2.header_fields",
    header.error ||
      `outcome=${header.data?.commercial_outcome} size=${header.data?.lab_size_band} wallet=${header.data?.estimated_monthly_wallet_inr}`
  );
  r.assert(
    header.data?.agent_id === agentId,
    "live.11.spoof_stamped",
    `client sent SPOOF-OTHER-AGENT; stored ${header.data?.agent_id}`
  );

  const omitted = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({ labId: assignedLabId, notes: `${PREFIX} optional omitted` }),
  });
  r.assert(
    omitted.success && omitted.data?.commercial_outcome == null && omitted.data?.lab_size_band == null,
    "live.3.optional_omit",
    omitted.error || "optional discovery omitted"
  );

  const analyzerId = randomUUID();
  const reagentId = randomUUID();
  const consumableId = randomUUID();
  const multi = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({ labId: assignedLabId, notes: `${PREFIX} header+lines` }),
    discoveryLines: [
      { id: analyzerId, line_kind: "ANALYZER", manufacturer: "Sysmex", model: "XN" },
      { id: reagentId, line_kind: "REAGENT", brand: "BrandR", monthly_spend_inr: 8000 },
      { id: consumableId, line_kind: "CONSUMABLE", product_category: "EDTA", approx_volume: 4 },
    ],
  });
  r.assert(multi.success && multi.persistence === "complete", "live.7.multi_success", multi.error || "header+lines complete");
  const lineKinds = (multi.discoveryLines || []).map((row) => row.line_kind).sort().join(",");
  r.assert(lineKinds === "ANALYZER,CONSUMABLE,REAGENT", "live.4.5.6.kinds", lineKinds || "three kinds persisted");
  r.assert(
    (multi.discoveryLines || []).every((row) => row.visit_uuid === multi.data?.id),
    "live.8.uuid_attach",
    "all lines attach to canonical visit uuid"
  );
  r.assert(
    (multi.discoveryLines || []).every((row) => !row.visit_id),
    "live.9.no_text_fk",
    "returned lines have no visit_id child key"
  );

  const retryDup = await persistAgentVisitDiscoveryLines(agent.sb, multi.data.id, [
    { id: analyzerId, line_kind: "ANALYZER", manufacturer: "Sysmex" },
  ]);
  r.assert(
    Boolean(retryDup.error),
    "live.retry.no_duplicate",
    retryDup.error || "retry with same line id unexpectedly inserted a duplicate"
  );
  const afterDup = await fetchAgentVisitEvidenceBundle(agent.sb, multi.data.id);
  r.assert(
    (afterDup.lines || []).length === 3,
    "live.retry.still_three",
    `${(afterDup.lines || []).length} lines after failed retry`
  );

  const emptyOptional = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({ labId: assignedLabId, notes: `${PREFIX} empty optional lines` }),
    discoveryLines: [],
  });
  r.assert(emptyOptional.success, "live.empty_optional_lines", emptyOptional.error || "empty discoveryLines saves");

  const invalidEnum = pickVisitEvidenceHeaderFields({ commercial_outcome: "NOT_A_VALUE" });
  r.assert(Boolean(invalidEnum.error), "live.invalid_enum_client", invalidEnum.error || "invalid enum blocked before write");
  const invalidLive = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: headerRow({
      labId: assignedLabId,
      notes: `${PREFIX} invalid enum`,
      fields: { commercial_outcome: "NOT_A_VALUE" },
    }),
  });
  r.assert(!invalidLive.success, "live.invalid_enum_db", invalidLive.error || "invalid enum unexpectedly saved");

  if (!invisibleLabId) {
    r.skip("live.10.unauthorized_lab", "could not locate an HQ lab invisible to QA agent");
  } else {
    const deniedLab = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
      insertRow: headerRow({ labId: invisibleLabId, notes: `${PREFIX} unauthorized lab` }),
    });
    r.assert(!deniedLab.success, "live.10.unauthorized_lab", deniedLab.error || "invisible lab write unexpectedly allowed");
  }

  const fakeTenant = "00000000-0000-0000-0000-000000000000";
  const cross = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
    insertRow: {
      ...headerRow({ labId: assignedLabId, notes: `${PREFIX} cross-tenant` }),
      tenant_id: fakeTenant,
    },
  });
  const crossBlocked =
    !cross.success || (cross.data?.tenant_id && cross.data.tenant_id !== fakeTenant);
  r.assert(
    crossBlocked && (!cross.data || cross.data.tenant_id !== fakeTenant),
    "live.12.cross_tenant",
    cross.error || `stamp/RLS prevented foreign tenant (got ${cross.data?.tenant_id})`
  );

  const orphan = await persistAgentVisitDiscoveryLines(agent.sb, randomUUID(), [
    { line_kind: "REAGENT", brand: "orphan" },
  ]);
  r.assert(Boolean(orphan.error), "live.13.missing_parent", orphan.error || "line on missing visit unexpectedly allowed");

  if (service && multi.data?.id) {
    const createdB = await createDisposableAgent(service, {
      tenantId: HQ,
      email: `ve2.cert.b.${Date.now()}@primecare.test`,
      label: `VE2_CERT_B_${Date.now().toString(36)}`,
    });
    if (createdB.error) {
      r.skip("live.13.second_agent", createdB.error);
    } else {
      const agentB = anonClient(env);
      const bTry = await agentB.auth.signInWithPassword({
        email: createdB.email,
        password: createdB.password,
      });
      if (bTry.error) {
        r.skip("live.13.second_agent", bTry.error.message);
      } else {
        const attachB = await persistAgentVisitDiscoveryLines(agentB, multi.data.id, [
          { line_kind: "CONSUMABLE", brand: "VE2-B" },
        ]);
        r.assert(
          Boolean(attachB.error),
          "live.13.unauthorized_child",
          attachB.error || "second agent attached line to first agent's visit"
        );
      }
      try {
        await service.from("profiles").delete().eq("user_id", createdB.userId);
        await service.auth.admin.deleteUser(createdB.userId);
      } catch {
        /* best-effort */
      }
    }
  } else {
    r.skip("live.13.second_agent", "service role required for disposable second agent");
  }

  const agentRead = await fetchAgentVisitEvidenceBundle(agent.sb, multi.data.id);
  r.assert(
    Boolean(agentRead.header) && (agentRead.lines || []).length === 3,
    "live.14.agent_bounded_read",
    agentRead.error || `agent read header+${(agentRead.lines || []).length} lines`
  );

  const hqRead = await fetchAgentVisitEvidenceBundle(admin.sb, multi.data.id, { tenantId: HQ });
  r.assert(
    Boolean(hqRead.header) && (hqRead.lines || []).length === 3,
    "live.15.hq_bounded_read",
    hqRead.error || `admin read header+${(hqRead.lines || []).length} lines`
  );
  const execRead = await fetchAgentVisitEvidenceBundle(exec.sb, multi.data.id, { tenantId: HQ });
  r.assert(Boolean(execRead.header), "live.15.exec_bounded_read", execRead.error || "executive evidence read");

  if (lab.sb) {
    const labRead = await fetchAgentVisitEvidenceBundle(lab.sb, multi.data.id);
    r.assert(
      !labRead.header,
      "live.16.lab_denied",
      labRead.error || "Lab unexpectedly read visit evidence"
    );
  }
  if (hr.sb) {
    const hrRead = await fetchAgentVisitEvidenceBundle(hr.sb, multi.data.id);
    r.assert(!hrRead.header, "live.16.hr_denied", hrRead.error || "HR unexpectedly read visit evidence");
  }
  const anon = anonClient(env);
  const anonRead = await fetchAgentVisitEvidenceBundle(anon, multi.data.id);
  r.assert(!anonRead.header, "live.16.anon_denied", anonRead.error || "anon unexpectedly read visit evidence");

  const ordersAfter = await countTable(admin.sb, "orders", assignedLabId, "order_id");
  const qualAfter = await countTable(admin.sb, "lab_qualifications", assignedLabId);
  const piAfter = await countTable(admin.sb, "lab_product_intelligence", assignedLabId);
  r.assert(
    !qualAfter.error && qualAfter.count === qualBefore.count,
    "live.17.no_qual_dualwrite",
    `qualifications ${qualBefore.count} → ${qualAfter.count}`
  );
  r.assert(
    !piAfter.error && piAfter.count === piBefore.count,
    "live.17.no_pi_dualwrite",
    `product intelligence ${piBefore.count} → ${piAfter.count}`
  );
  r.assert(
    !ordersAfter.error && ordersAfter.count === ordersBefore.count,
    "live.18.no_order_write",
    `orders ${ordersBefore.count} → ${ordersAfter.count}`
  );
  r.pass("live.19.pi_path_untouched", "AgentVisitPage still calls upsertLabProductIntelligenceWrite separately (static)");
  r.pass("live.20.prospect_rpc_untouched", "create_prospect_lab remains the Add Prospect path (static)");

  const rpc = await agent.sb.rpc("create_prospect_lab", {
    p_lab_name: `${PREFIX} Prospect ${Date.now().toString(36)}`,
    p_owner_name: "VE2 Cert",
    p_phone: `9${String(Date.now()).slice(-9)}`,
    p_area: "VE2-CERT",
  });
  const rpcLabId = rpc.data?.lab_id || rpc.data?.data?.lab_id;
  if (rpc.error || !rpcLabId) {
    r.skip("live.prospect.contract", rpc.error?.message || "create_prospect_lab did not return lab_id");
  } else {
    createdProspectLabId = rpcLabId;
    const prospectVisit = await persistAgentVisitWithOptionalDiscovery(agent.sb, {
      insertRow: headerRow({
        labId: rpcLabId,
        notes: `${PREFIX} prospect visit`,
        fields: { commercial_outcome: "REQUIREMENT" },
      }),
      discoveryLines: [{ line_kind: "ANALYZER", manufacturer: "ProspectScope" }],
    });
    r.assert(
      prospectVisit.success && prospectVisit.data?.lab_id === rpcLabId,
      "live.prospect.visit",
      prospectVisit.error || `prospect visit ${prospectVisit.data?.id}`
    );
  }

  void createdProspectLabId;
  try {
    const cleaned = await cleanupCertVisits(service, PREFIX);
    r.pass(
      "live.cleanup",
      `removed VE-2 cert visits=${cleaned.visits} lines=${cleaned.lines} prospects=${cleaned.prospects}`
    );
  } catch (error) {
    r.skip("live.cleanup", error.message, { critical: false });
  }

  return finishLive("VE-2 API", r);
}

await runLive();
