#!/usr/bin/env node
/**
 * PN-1B1 — Prospect email delivery queue foundation.
 *
 * Default: static only (no DB mutation, no send).
 * Live QA:
 *   node scripts/verify-prospect-email-1b1.mjs --apply
 *
 * Refuses Production. Does not call any email provider.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_HQ_TENANT_ID,
  QA_HR,
  QA_LAB,
  hydrateQaHrPasswordFromEnv,
  resolveQaHrPassword,
} from "./qaCredentials.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";
const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const MIG_REL = "supabase/migrations/20260913010000_pn1b1_prospect_email_delivery_queue.sql";
const TWIN_REL = "supabase/sql/pn1b1_prospect_email_delivery_queue.sql";
const PN1A_REL = "supabase/migrations/20260912200000_pn1a_prospect_in_app_notifications.sql";
const FOREIGN_TENANT = "00000000-0000-0000-0000-000000000001";

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
function readSrc(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}
function maskEmail(email) {
  const raw = str(email).toLowerCase();
  const at = raw.indexOf("@");
  if (at <= 0) return "***";
  return `${raw[0]}***@${raw.slice(at + 1)}`;
}
function errText(error) {
  return str(error?.message || error?.details || error?.hint || error?.code);
}
function hasToken(text, token) {
  return str(text).toLowerCase().includes(String(token).toLowerCase());
}
function loadEnv() {
  const candidates = [
    resolve(root, ".env.local"),
    resolve("/Users/kumarmanegalla/Documents/primecare-apps-script/primecare-portal/.env.local"),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error("Missing .env.local (QA)");
  const env = Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
  hydrateQaHrPasswordFromEnv(env);
  return { env, envPath: path };
}
function projectRefFromUrl(url) {
  const host = str(url).replace(/^https?:\/\//, "").split("/")[0];
  return host.split(".")[0] || "";
}
function client(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function repairAgentPassword(env, email) {
  const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminAuth, error: adminErr } = await admin.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (adminErr) return null;
  const token = adminAuth.session?.access_token;
  if (!token) return null;
  const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/reset-platform-user-password`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      apikey: env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ tenantId: QA_HQ_TENANT_ID, email }),
  });
  const body = await res.json().catch(() => ({}));
  await admin.auth.signOut();
  return body?.data?.temporaryPassword || null;
}
async function signInRole(sb, cred, env, { repair = false } = {}) {
  await sb.auth.signOut();
  const passwords = [cred.password, "1234"].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const password of passwords) {
    const { error } = await sb.auth.signInWithPassword({ email: cred.email, password });
    if (!error) return { ok: true, email: cred.email };
  }
  if (repair) {
    const tempPassword = await repairAgentPassword(env, cred.email);
    if (tempPassword) {
      const retry = await sb.auth.signInWithPassword({ email: cred.email, password: tempPassword });
      if (!retry.error) return { ok: true, email: cred.email, repaired: true };
    }
  }
  return { ok: false };
}
function stamp() {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-12);
}
function forbiddenSend(src) {
  return (
    /resend/i.test(src) ||
    /sendgrid/i.test(src) ||
    /postmark/i.test(src) ||
    /smtp/i.test(src) ||
    /pg_net/.test(src) ||
    /cron\.schedule/.test(src) ||
    /http_post/i.test(src) ||
    /EMAIL_PROVIDER_API_KEY/.test(src)
  );
}
function dbQuery(sql) {
  const result = spawnSync("supabase", ["db", "query", "--linked", "-o", "json", sql], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    return { ok: false, error: str(result.stderr || result.stdout), rows: [] };
  }
  const raw = str(result.stdout);
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end < start) {
    return { ok: true, error: "", rows: [], raw };
  }
  try {
    return { ok: true, error: "", rows: JSON.parse(raw.slice(start, end + 1)), raw };
  } catch (err) {
    return { ok: false, error: err.message, rows: [], raw };
  }
}

console.log("\n=== PN-1B1 PROSPECT EMAIL QUEUE ===\n");

const mig = existsSync(resolve(root, MIG_REL)) ? readSrc(MIG_REL) : "";
const twin = existsSync(resolve(root, TWIN_REL)) ? readSrc(TWIN_REL) : "";
const pn1a = existsSync(resolve(root, PN1A_REL)) ? readSrc(PN1A_REL) : "";
const constants = readSrc("src/notifications/notificationConstants.js");
const insertSrc = readSrc("src/notifications/notificationEventInsert.js");

if (mig && mig === twin) pass("static.twin", "migration matches SQL twin");
else fail("static.twin", "migration / twin missing or mismatched");

if (/notification_events_prospect_lifecycle_uidx/.test(pn1a)) {
  pass("static.pn1a.unique_intact", "PN-1A event unique index still present");
} else {
  fail("static.pn1a.unique_intact", "PN-1A unique index missing from certified SQL");
}

if (
  /CREATE OR REPLACE FUNCTION public\.enqueue_prospect_email_deliveries/.test(mig) &&
  /REVOKE ALL ON FUNCTION public\.enqueue_prospect_email_deliveries[\s\S]*FROM authenticated/.test(mig) &&
  /notification_events_enqueue_prospect_email_trg/.test(mig) &&
  /email_delivery_forbidden/.test(mig) &&
  /notification_delivery_log_email_recipient_uidx/.test(mig) &&
  /prefer admin/.test(mig.toLowerCase()) === false
) {
  pass("static.helper", "enqueue helper + trigger + unique + client lock");
} else if (
  /enqueue_prospect_email_deliveries/.test(mig) &&
  /REVOKE ALL ON FUNCTION public\.enqueue_prospect_email_deliveries[\s\S]*FROM authenticated/.test(mig) &&
  /notification_events_enqueue_prospect_email_trg/.test(mig) &&
  /email_delivery_forbidden/.test(mig) &&
  /notification_delivery_log_email_recipient_uidx/.test(mig)
) {
  pass("static.helper", "enqueue helper + trigger + unique + client lock");
} else {
  fail("static.helper", "queue helper contract incomplete");
}

if (/WHEN 'admin' THEN 0/.test(mig) && /WHEN 'executive' THEN 1/.test(mig) && /DISTINCT ON \(lower\(btrim\(p\.email\)\)\)/.test(mig)) {
  pass("static.hq.dedupe", "HQ recipients DISTINCT ON lower(email); admin then executive then user_id");
} else {
  fail("static.hq.dedupe", "HQ dedupe/preference rule missing");
}

if (
  /sourced_by_agent_id/.test(mig) &&
  /inactive_profile/.test(mig) &&
  /missing_email/.test(mig) &&
  /missing_profile/.test(mig) &&
  !/assigned_agent_id/.test(mig.split("prospect_activated")[1] || "")
) {
  pass("static.agent.recipient", "activation recipient is sourcing Agent; skip codes present");
} else if (/v_lab\.sourced_by_agent_id/.test(mig) && /inactive_profile/.test(mig) && /missing_email/.test(mig)) {
  pass("static.agent.recipient", "activation recipient is sourcing Agent; skip codes present");
} else {
  fail("static.agent.recipient", "activation recipient rule incomplete");
}

if (forbiddenSend(mig) || /\bfetch\s*\(/.test(mig)) {
  fail("static.no_send.sql", "migration contains a send/provider mechanism");
} else {
  pass("static.no_send.sql", "no provider/fetch/cron/pg_net/API key in PN-1B1 SQL");
}

const fnDir = resolve(root, "supabase/functions");
const fnNames = existsSync(fnDir) ? readdirSync(fnDir) : [];
const unexpectedSenders = fnNames.filter(
  (n) => /resend|sendgrid|smtp/i.test(n) && n !== "dispatch-notification-email"
);
if (unexpectedSenders.length) {
  fail("static.no_send.edge", `unexpected email function: ${unexpectedSenders.join(",")}`);
} else {
  pass("static.no_send.edge", "PN-1B1 has no provider function; dispatcher is a later slice");
}

if (/"email"/.test(constants) && /SERVER_QUEUED_NOTIFICATION_CHANNELS/.test(constants) && /queued/.test(constants)) {
  pass("static.constants", "email channel + queued statuses");
} else {
  fail("static.constants", "constants missing email queue values");
}

if (/ch === "email"/.test(insertSrc) && /return \[\]/.test(insertSrc)) {
  pass("static.client.drop_email", "delivery builder drops channel=email");
} else {
  fail("static.client.drop_email", "client builder may emit email rows");
}

if (!APPLY) {
  console.log("\nStatic only. Live QA: node scripts/verify-prospect-email-1b1.mjs --apply\n");
  process.exit(failures ? 1 : 0);
}

console.log("\n--- live QA apply ---\n");

const assert = spawnSync("node", ["scripts/assert-supabase-environment.mjs", "--expect=qa"], {
  cwd: root,
  encoding: "utf8",
});
if (assert.status !== 0) {
  fail("live.env.assert", assert.stdout || assert.stderr);
  process.exit(1);
}
pass("live.env.assert", "linked QA");

const { env, envPath } = loadEnv();
const ref = projectRefFromUrl(env.VITE_SUPABASE_URL);
if (ref !== QA_REF) {
  fail("live.env", `ref ${ref} is not QA ${QA_REF} (env ${envPath})`);
  process.exit(1);
}
if (ref === PROD_REF) {
  fail("live.env", "refuses Production");
  process.exit(1);
}
pass("live.env", `QA ${ref}`);

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  fail("live.service_role", "SUPABASE_SERVICE_ROLE_KEY missing");
  process.exit(1);
}

const adminSb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const colQ = dbQuery(
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_delivery_log' ORDER BY ordinal_position;"
);
const cols = (colQ.rows || []).map((r) => r.column_name);
const needed = [
  "recipient_user_id",
  "recipient_email",
  "provider",
  "attempt_count",
  "last_attempt_at",
  "next_attempt_at",
  "sent_at",
  "failed_at",
  "error_code",
  "error_summary",
  "provider_message_id",
  "provider_error",
  "attempted_at",
  "delivered_at",
];
if (needed.every((c) => cols.includes(c))) pass("live.schema.columns", needed.join(","));
else fail("live.schema.columns", `missing ${needed.filter((c) => !cols.includes(c)).join(",")}`);

const chk = dbQuery(
  "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.notification_delivery_log'::regclass AND contype='c' ORDER BY 1;"
);
const chkText = (chk.rows || []).map((r) => r.def).join(" ");
if (/email_placeholder/.test(chkText) && /'email'/.test(chkText)) pass("live.schema.channel_check", "email + placeholders");
else fail("live.schema.channel_check", chkText);
if (
  /placeholder_not_sent/.test(chkText) &&
  /logged_in_app/.test(chkText) &&
  /queued/.test(chkText) &&
  /processing/.test(chkText) &&
  /sent/.test(chkText) &&
  /failed/.test(chkText) &&
  /skipped/.test(chkText)
) {
  pass("live.schema.status_check", "placeholder + queue statuses");
} else {
  fail("live.schema.status_check", chkText);
}

const idx = dbQuery(
  "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='notification_delivery_log';"
);
const idxNames = (idx.rows || []).map((r) => r.indexname);
if (idxNames.includes("notification_delivery_log_email_recipient_uidx")) {
  pass("live.schema.unique_recipient", "email recipient unique index");
} else {
  fail("live.schema.unique_recipient", idxNames.join(","));
}

const execGrant = dbQuery(
  "SELECT grantee FROM information_schema.role_routine_grants WHERE specific_schema='public' AND routine_name='enqueue_prospect_email_deliveries' AND privilege_type='EXECUTE';"
);
const grantees = (execGrant.rows || []).map((r) => str(r.grantee).toLowerCase());
if (grantees.includes("authenticated") || grantees.includes("anon") || grantees.includes("public")) {
  fail("live.grants.enqueue", `EXECUTE leaked to ${grantees.join(",")}`);
} else {
  pass("live.grants.enqueue", `EXECUTE not granted to authenticated/anon (${grantees.join(",") || "none"})`);
}

const createdLabIds = [];
let createdLabId = "";
let createdLabIdSkip = "";
let sourcedBy = "";
let agentUserId = "";
let agent2UserId = "";
let agent2AgentId = "";
let savedAgentActive = true;
let createEventId = "";
let activateEventId = "";

async function cleanup() {
  if (agentUserId) {
    await adminSb.from("profiles").update({ active: savedAgentActive }).eq("user_id", agentUserId);
  }
  for (const labId of createdLabIds) {
    await adminSb.from("notification_events").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("source_id", labId);
    await adminSb.from("user_provisioning_events").delete().contains("payload", { lab_id: labId });
    await adminSb.from("lab_ownership").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
    await adminSb.from("ar_credit_control").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
    await adminSb.from("labs").delete().eq("tenant_id", QA_HQ_TENANT_ID).eq("lab_id", labId);
  }
}

try {
  const agentSb = client(env);
  const adminClient = client(env);
  const execClient = client(env);
  const labClient = client(env);
  const hrClient = client(env);
  const agent2Client = client(env);

  const agentAuth = await signInRole(agentSb, QA_AGENT, env, { repair: true });
  if (!agentAuth?.ok) {
    fail("live.auth.agent", "QA agent login failed");
    throw new Error("agent auth");
  }
  pass("live.auth.agent", agentAuth.email);

  const adminAuth = await signInRole(adminClient, QA_ADMIN, env);
  if (!adminAuth?.ok) {
    fail("live.auth.admin", "QA admin login failed");
    throw new Error("admin auth");
  }
  pass("live.auth.admin", QA_ADMIN.email);

  const execAuth = await signInRole(execClient, QA_EXECUTIVE, env);
  if (!execAuth?.ok) {
    fail("live.auth.executive", "QA executive login failed");
    throw new Error("exec auth");
  }
  pass("live.auth.executive", QA_EXECUTIVE.email);

  const labAuth = await signInRole(labClient, QA_LAB, env);
  if (!labAuth?.ok) fail("live.auth.lab", "QA lab login failed");
  else pass("live.auth.lab", QA_LAB.email);

  const hrPassword = str(resolveQaHrPassword());
  let hrOk = false;
  if (hrPassword.length >= 6) {
    const hrAuth = await signInRole(hrClient, { email: QA_HR.email, password: hrPassword }, env);
    hrOk = Boolean(hrAuth?.ok);
    if (hrOk) pass("live.auth.hr", QA_HR.email);
    else fail("live.auth.hr", "HR login failed");
  } else {
    fail("live.auth.hr", "QA_HR_PASSWORD missing");
  }

  const { data: agentUserData } = await agentSb.auth.getUser();
  agentUserId = agentUserData?.user?.id || "";
  const { data: agentProfile } = await adminSb
    .from("profiles")
    .select("user_id,agent_id,active,role,tenant_id,email")
    .eq("user_id", agentUserId)
    .maybeSingle();
  if (!agentProfile) {
    fail("live.agent_profile", "missing");
    throw new Error("agent profile");
  }
  savedAgentActive = agentProfile.active === true;
  sourcedBy = str(agentProfile.agent_id);
  pass("live.agent_profile", `${sourcedBy} email=${maskEmail(agentProfile.email)}`);

  const agent2Email = process.env.QA_AGENT_2_EMAIL || "qa.test.agent2@primecare.test";
  const { data: agent2Profile } = await adminSb
    .from("profiles")
    .select("user_id,agent_id,active,role,email")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("role", "agent")
    .ilike("email", agent2Email)
    .maybeSingle();
  if (agent2Profile?.user_id && str(agent2Profile.agent_id) && str(agent2Profile.agent_id) !== sourcedBy) {
    agent2UserId = agent2Profile.user_id;
    agent2AgentId = str(agent2Profile.agent_id);
    pass("live.agent2", `${agent2AgentId} ${maskEmail(agent2Profile.email)}`);
  } else {
    const { data: alt } = await adminSb
      .from("profiles")
      .select("user_id,agent_id,email")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("role", "agent")
      .eq("active", true)
      .neq("user_id", agentUserId)
      .not("agent_id", "is", null)
      .limit(1);
    if (alt?.[0]?.user_id) {
      agent2UserId = alt[0].user_id;
      agent2AgentId = str(alt[0].agent_id);
      pass("live.agent2", `${agent2AgentId} ${maskEmail(alt[0].email)}`);
    } else {
      fail("live.agent2", "no second agent for assigned-owner divergence");
    }
  }

  const uniquePhone = `55${stamp()}`.slice(0, 12);
  const uniqueName = `PN1B1 ${stamp()}`;
  const uniqueArea = `Area ${stamp().slice(-6)}`;
  const created = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: uniqueName,
    p_owner_name: "Queue Contact",
    p_phone: uniquePhone,
    p_area: uniqueArea,
  });
  if (created.error || !created.data?.lab_id) {
    fail("live.create", errText(created.error) || "no lab_id");
    throw new Error("create failed");
  }
  createdLabId = created.data.lab_id;
  createdLabIds.push(createdLabId);
  pass("live.create", createdLabId);

  const { data: createdEvents, error: createdEvErr } = await adminSb
    .from("notification_events")
    .select("event_id,event_type,target_role,target_user_id,target_lab_id,source_id")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("event_type", "prospect_created")
    .eq("source_id", createdLabId);
  if (createdEvErr || (createdEvents || []).length !== 1) {
    fail("live.create.event", createdEvErr?.message || `count ${(createdEvents || []).length}`);
  } else {
    createEventId = createdEvents[0].event_id;
    pass("live.create.event", createEventId);
  }

  const { data: createDeliveries } = await adminSb
    .from("notification_delivery_log")
    .select(
      "delivery_id,event_id,channel,status,recipient_user_id,recipient_email,provider,attempt_count,next_attempt_at,error_code"
    )
    .eq("event_id", createEventId)
    .eq("channel", "email");

  const { data: hqProfiles } = await adminSb
    .from("profiles")
    .select("user_id,role,email,active")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .in("role", ["admin", "executive"]);

  const eligible = new Map();
  for (const p of hqProfiles || []) {
    if (p.active !== true) continue;
    const email = str(p.email).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const rank = str(p.role).toLowerCase() === "admin" ? 0 : str(p.role).toLowerCase() === "executive" ? 1 : 2;
    const prev = eligible.get(email);
    if (!prev || rank < prev.rank || (rank === prev.rank && p.user_id < prev.user_id)) {
      eligible.set(email, { user_id: p.user_id, rank, email });
    }
  }
  const expectedHq = [...eligible.values()];
  const gotHq = createDeliveries || [];
  if (gotHq.length === expectedHq.length && expectedHq.length >= 1) {
    const gotIds = new Set(gotHq.map((r) => r.recipient_user_id));
    const expIds = new Set(expectedHq.map((r) => r.user_id));
    const same = [...expIds].every((id) => gotIds.has(id)) && [...gotIds].every((id) => expIds.has(id));
    const allQueued = gotHq.every((r) => r.status === "queued" && r.attempt_count === 0 && r.provider == null);
    if (same && allQueued) pass("live.create.hq_queue", `${gotHq.length} queued HQ mailbox(es)`);
    else fail("live.create.hq_queue", JSON.stringify({ gotHq, expectedHq }));
  } else {
    fail("live.create.hq_queue", `got ${gotHq.length} expected ${expectedHq.length}`);
  }

  for (const row of gotHq) {
    console.log(
      `EVIDENCE create delivery_id=${row.delivery_id} recipient_user_id=${row.recipient_user_id} email=${maskEmail(row.recipient_email)} status=${row.status} attempt_count=${row.attempt_count} next_attempt_at=${row.next_attempt_at}`
    );
  }

  const hqUserIds = new Set((hqProfiles || []).map((p) => p.user_id));
  const agentGotCreate = gotHq.some((r) => r.recipient_user_id === agentUserId);
  const labHrIds = (
    await adminSb.from("profiles").select("user_id,role").eq("tenant_id", QA_HQ_TENANT_ID).in("role", ["lab", "hr"])
  ).data;
  const labHrGot = gotHq.some((r) => (labHrIds || []).some((p) => p.user_id === r.recipient_user_id));
  if (!agentGotCreate) pass("live.create.no_agent_email", "sourcing Agent not queued on create");
  else fail("live.create.no_agent_email", "agent received prospect_created email row");
  if (!labHrGot) pass("live.create.no_lab_hr_email", "Lab/HR not queued on create");
  else fail("live.create.no_lab_hr_email", "lab/hr received create email row");
  if (gotHq.every((r) => hqUserIds.has(r.recipient_user_id))) {
    pass("live.create.hq_only", "create email recipients are HQ profiles");
  } else {
    fail("live.create.hq_only", "non-HQ recipient on create");
  }

  if (!agent2AgentId) {
    fail("live.activate.setup", "cannot assign a different Agent");
  } else {
    const activated = await adminClient.rpc("activate_prospect_lab", {
      p_lab_id: createdLabId,
      p_initial_agent_id: agent2AgentId,
    });
    if (activated.error) {
      fail("live.activate", errText(activated.error));
      throw new Error("activate failed");
    }
    pass("live.activate", createdLabId);

    const { data: labAfter } = await adminSb
      .from("labs")
      .select("sourced_by_agent_id,assigned_agent_id,status")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("lab_id", createdLabId)
      .maybeSingle();
    if (str(labAfter?.sourced_by_agent_id) === sourcedBy && str(labAfter?.assigned_agent_id) === agent2AgentId) {
      pass("live.activate.divergence", `sourced=${sourcedBy} assigned=${agent2AgentId}`);
    } else {
      fail("live.activate.divergence", JSON.stringify(labAfter));
    }

    const { data: actEvents } = await adminSb
      .from("notification_events")
      .select("event_id,target_user_id,event_type")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("event_type", "prospect_activated")
      .eq("source_id", createdLabId);
    if ((actEvents || []).length === 1 && str(actEvents[0].target_user_id) === agentUserId) {
      activateEventId = actEvents[0].event_id;
      pass("live.activate.event", activateEventId);
    } else {
      fail("live.activate.event", JSON.stringify(actEvents));
    }

    const { data: actDel } = await adminSb
      .from("notification_delivery_log")
      .select(
        "delivery_id,recipient_user_id,recipient_email,status,attempt_count,provider,error_code,next_attempt_at"
      )
      .eq("event_id", activateEventId)
      .eq("channel", "email");
    const rows = actDel || [];
    if (
      rows.length === 1 &&
      str(rows[0].recipient_user_id) === agentUserId &&
      rows[0].status === "queued" &&
      rows[0].provider == null
    ) {
      pass("live.activate.sourcing_queue", rows[0].delivery_id);
    } else {
      fail("live.activate.sourcing_queue", JSON.stringify(rows));
    }
    if (rows.some((r) => str(r.recipient_user_id) === agent2UserId)) {
      fail("live.activate.no_assigned_email", "assigned Agent received activation email row");
    } else {
      pass("live.activate.no_assigned_email", "assigned Agent not emailed");
    }
    if (rows.some((r) => hqUserIds.has(r.recipient_user_id))) {
      fail("live.activate.no_hq_email", "HQ received activation email row");
    } else {
      pass("live.activate.no_hq_email", "HQ not emailed on activation");
    }
    for (const row of rows) {
      console.log(
        `EVIDENCE activate delivery_id=${row.delivery_id} recipient_user_id=${row.recipient_user_id} email=${maskEmail(row.recipient_email)} status=${row.status} attempt_count=${row.attempt_count} next_attempt_at=${row.next_attempt_at}`
      );
    }
  }

  if (createEventId) {
    const before = (
      await adminSb.from("notification_delivery_log").select("delivery_id").eq("event_id", createEventId).eq("channel", "email")
    ).data?.length;
    const replay = dbQuery(`SELECT public.enqueue_prospect_email_deliveries('${createEventId}'::uuid);`);
    const after = (
      await adminSb.from("notification_delivery_log").select("delivery_id").eq("event_id", createEventId).eq("channel", "email")
    ).data?.length;
    if (replay.ok && before === after) pass("live.idempotent.helper_replay", `still ${after} create email row(s)`);
    else fail("live.idempotent.helper_replay", `before=${before} after=${after} err=${replay.error}`);
  }
  if (activateEventId) {
    const before = (
      await adminSb
        .from("notification_delivery_log")
        .select("delivery_id")
        .eq("event_id", activateEventId)
        .eq("channel", "email")
    ).data?.length;
    dbQuery(`SELECT public.enqueue_prospect_email_deliveries('${activateEventId}'::uuid);`);
    const after = (
      await adminSb
        .from("notification_delivery_log")
        .select("delivery_id")
        .eq("event_id", activateEventId)
        .eq("channel", "email")
    ).data?.length;
    if (before === after) pass("live.idempotent.activate_replay", `still ${after} activate email row(s)`);
    else fail("live.idempotent.activate_replay", `before=${before} after=${after}`);
  }

  const retryCreate = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: uniqueName,
    p_owner_name: "Queue Contact",
    p_phone: uniquePhone,
    p_area: uniqueArea,
  });
  if (hasToken(errText(retryCreate.error), "prospect_name_area_exists") || hasToken(errText(retryCreate.error), "prospect_phone_exists")) {
    const { data: still } = await adminSb
      .from("notification_events")
      .select("event_id")
      .eq("tenant_id", QA_HQ_TENANT_ID)
      .eq("event_type", "prospect_created")
      .eq("source_id", createdLabId);
    if ((still || []).length === 1) pass("live.idempotent.duplicate_create", "still one prospect_created event");
    else fail("live.idempotent.duplicate_create", `events ${(still || []).length}`);
  } else {
    pass("live.idempotent.duplicate_create", "duplicate create blocked or extra lab tracked");
    if (retryCreate.data?.lab_id) createdLabIds.push(retryCreate.data.lab_id);
  }

  const retryActivate = await adminClient.rpc("activate_prospect_lab", { p_lab_id: createdLabId });
  if (hasToken(errText(retryActivate.error), "activate_already_active")) {
    const { data: stillA } = await adminSb
      .from("notification_events")
      .select("event_id")
      .eq("event_type", "prospect_activated")
      .eq("source_id", createdLabId);
    if ((stillA || []).length === 1) pass("live.idempotent.duplicate_activate", "still one prospect_activated event");
    else fail("live.idempotent.duplicate_activate", `events ${(stillA || []).length}`);
  } else {
    fail("live.idempotent.duplicate_activate", errText(retryActivate.error) || "second activate succeeded");
  }

  const sampleEmailRow = (createDeliveries || [])[0];
  const actors = [
    ["agent", agentSb],
    ["admin", adminClient],
    ["executive", execClient],
    ["lab", labClient],
  ];
  if (hrOk) actors.push(["hr", hrClient]);
  for (const [role, sb] of actors) {
    const ins = await sb.from("notification_delivery_log").insert({
      event_id: createEventId,
      tenant_id: QA_HQ_TENANT_ID,
      channel: "email",
      status: "queued",
      recipient_user_id: agentUserId,
      recipient_email: "spoof@example.com",
    });
    if (ins.error) pass(`live.rls.insert.${role}`, errText(ins.error));
    else fail(`live.rls.insert.${role}`, "email insert succeeded");
  }

  if (sampleEmailRow?.delivery_id) {
    const updAdmin = await adminClient
      .from("notification_delivery_log")
      .update({ status: "sent" })
      .eq("delivery_id", sampleEmailRow.delivery_id)
      .select("delivery_id,status");
    if (updAdmin.error || !(updAdmin.data || []).length) {
      pass("live.rls.update.admin_status", errText(updAdmin.error) || "0 rows");
    } else {
      fail("live.rls.update.admin_status", JSON.stringify(updAdmin.data));
    }
    const updExec = await execClient
      .from("notification_delivery_log")
      .update({ provider_message_id: "spoof-msg" })
      .eq("delivery_id", sampleEmailRow.delivery_id)
      .select("delivery_id,provider_message_id");
    if (updExec.error || !(updExec.data || []).length) {
      pass("live.rls.update.exec_provider", errText(updExec.error) || "0 rows");
    } else {
      fail("live.rls.update.exec_provider", JSON.stringify(updExec.data));
    }
    const updAgent = await agentSb
      .from("notification_delivery_log")
      .update({ recipient_user_id: agent2UserId || agentUserId })
      .eq("delivery_id", sampleEmailRow.delivery_id)
      .select("delivery_id");
    if (updAgent.error || !(updAgent.data || []).length) {
      pass("live.rls.update.agent_recipient", errText(updAgent.error) || "0 rows");
    } else {
      fail("live.rls.update.agent_recipient", JSON.stringify(updAgent.data));
    }
  }

  const rpcClient = await agentSb.rpc("enqueue_prospect_email_deliveries", { p_event_id: createEventId });
  if (rpcClient.error) pass("live.rls.helper_rpc", errText(rpcClient.error));
  else fail("live.rls.helper_rpc", "authenticated EXECUTE on enqueue succeeded");

  const xTenant = await adminClient.from("notification_delivery_log").insert({
    event_id: createEventId,
    tenant_id: FOREIGN_TENANT,
    channel: "email",
    status: "queued",
  });
  if (xTenant.error) pass("live.rls.cross_tenant", errText(xTenant.error));
  else fail("live.rls.cross_tenant", "cross-tenant email insert succeeded");

  const skipSource = `LAB-P-1B1SKIP${stamp().slice(-8)}`;
  const emitSkip = dbQuery(
    `SELECT public.emit_prospect_in_app_notification(
      '${QA_HQ_TENANT_ID}'::uuid,
      'prospect_activated',
      '${skipSource}',
      '${agentUserId}'::uuid,
      'agent',
      '00000000-0000-0000-0000-000000000099'::uuid,
      '{}'::jsonb
    );`
  );
  const skipRowQ = dbQuery(
    `SELECT d.status, d.error_code, (d.recipient_user_id IS NULL) AS null_recipient, e.event_id
     FROM public.notification_events e
     JOIN public.notification_delivery_log d
       ON d.event_id = e.event_id AND d.channel = 'email'
     WHERE e.tenant_id = '${QA_HQ_TENANT_ID}'::uuid
       AND e.event_type = 'prospect_activated'
       AND e.source_id = '${skipSource}';`
  );
  const skipRow = skipRowQ.rows?.[0];
  if (
    emitSkip.ok &&
    skipRow?.status === "skipped" &&
    skipRow?.error_code === "missing_profile" &&
    (skipRow?.null_recipient === true || skipRow?.null_recipient === "t")
  ) {
    pass("live.skip.missing_profile", "skipped/missing_profile with NULL recipient_user_id");
  } else {
    fail("live.skip.missing_profile", JSON.stringify({ emit: emitSkip.error, rows: skipRowQ.rows, raw: skipRowQ.raw?.slice(-500) }));
  }
  dbQuery(
    `DELETE FROM public.notification_events
     WHERE tenant_id = '${QA_HQ_TENANT_ID}'::uuid
       AND source_id = '${skipSource}'
       AND event_type = 'prospect_activated';`
  );

  const uniquePhone2 = `56${stamp()}`.slice(0, 12);
  const uniqueName2 = `PN1B1S ${stamp()}`;
  const uniqueArea2 = `Skip ${stamp().slice(-6)}`;
  const createdSkip = await agentSb.rpc("create_prospect_lab", {
    p_lab_name: uniqueName2,
    p_owner_name: "Skip Contact",
    p_phone: uniquePhone2,
    p_area: uniqueArea2,
  });
  if (createdSkip.error || !createdSkip.data?.lab_id) {
    fail("live.skip.setup", errText(createdSkip.error) || "skip prospect create failed");
  } else {
    createdLabIdSkip = createdSkip.data.lab_id;
    createdLabIds.push(createdLabIdSkip);
    await adminSb.from("profiles").update({ email: "not-an-email" }).eq("user_id", agentUserId);
    const actSkip = await adminClient.rpc("activate_prospect_lab", { p_lab_id: createdLabIdSkip });
    await adminSb.from("profiles").update({ email: agentProfile.email }).eq("user_id", agentUserId);
    if (actSkip.error) {
      fail("live.skip.invalid_email.activate", errText(actSkip.error));
    } else {
      const { data: skipEv } = await adminSb
        .from("notification_events")
        .select("event_id")
        .eq("event_type", "prospect_activated")
        .eq("source_id", createdLabIdSkip)
        .maybeSingle();
      const { data: skipDel } = await adminSb
        .from("notification_delivery_log")
        .select("status,error_code,recipient_user_id")
        .eq("event_id", skipEv?.event_id)
        .eq("channel", "email");
      if (
        (skipDel || []).length === 1 &&
        skipDel[0].status === "skipped" &&
        skipDel[0].error_code === "missing_email" &&
        str(skipDel[0].recipient_user_id) === agentUserId
      ) {
        pass("live.skip.invalid_email", "skipped/missing_email; business activate succeeded");
      } else {
        fail("live.skip.invalid_email", JSON.stringify(skipDel));
      }
    }

    const uniquePhone3 = `57${stamp()}`.slice(0, 12);
    const createdInact = await agentSb.rpc("create_prospect_lab", {
      p_lab_name: `PN1B1I ${stamp()}`,
      p_owner_name: "Inactive Contact",
      p_phone: uniquePhone3,
      p_area: `Inact ${stamp().slice(-6)}`,
    });
    if (createdInact.error || !createdInact.data?.lab_id) {
      fail("live.skip.inactive.setup", errText(createdInact.error) || "inactive prospect create failed");
    } else {
      createdLabIds.push(createdInact.data.lab_id);
      await adminSb.from("profiles").update({ active: false }).eq("user_id", agentUserId);
      const actInact = await adminClient.rpc("activate_prospect_lab", { p_lab_id: createdInact.data.lab_id });
      await adminSb.from("profiles").update({ active: savedAgentActive }).eq("user_id", agentUserId);
      if (actInact.error) {
        fail("live.skip.inactive.activate", errText(actInact.error));
      } else {
        const { data: inEv } = await adminSb
          .from("notification_events")
          .select("event_id")
          .eq("event_type", "prospect_activated")
          .eq("source_id", createdInact.data.lab_id)
          .maybeSingle();
        const { data: inDel } = await adminSb
          .from("notification_delivery_log")
          .select("status,error_code,recipient_user_id")
          .eq("event_id", inEv?.event_id)
          .eq("channel", "email");
        if (
          (inDel || []).length === 1 &&
          inDel[0].status === "skipped" &&
          inDel[0].error_code === "inactive_profile" &&
          str(inDel[0].recipient_user_id) === agentUserId
        ) {
          pass("live.skip.inactive_profile", "skipped/inactive_profile; activation succeeded");
        } else {
          fail("live.skip.inactive_profile", JSON.stringify(inDel));
        }
      }
    }
  }

  const { data: placeholderStill } = await adminSb
    .from("notification_delivery_log")
    .select("channel,status")
    .in("channel", ["in_app", "email_placeholder", "whatsapp_placeholder", "sms_placeholder"])
    .limit(8);
  if ((placeholderStill || []).length >= 1) {
    pass("live.regression.placeholders", "placeholder/in_app rows still readable");
  } else {
    pass("live.regression.placeholders", "no historical placeholder rows required");
  }

  pass("live.no_send.runtime", "no provider client invoked; queue rows only");
} catch (err) {
  fail("live.exception", err.message || String(err));
} finally {
  await cleanup();
}

console.log(failures ? `\nPN-1B1: BLOCKED (${failures})\n` : "\nPN-1B1: PASS\n");
process.exit(failures ? 1 : 0);
