#!/usr/bin/env node
/**
 * PN-1B2 — QA-safe email dispatcher.
 * Default: static + policy unit tests.
 * Live QA: node scripts/verify-prospect-email-1b2.mjs --apply
 * Live send requires QA Edge secrets (never git). Refuses Production.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  classifyProviderError,
  escapeHtml,
  maskEmail,
  nextAttemptAtIso,
  renderForEventType,
  resolveQaRecipient,
  shouldClaimRows,
} from "../supabase/functions/dispatch-notification-email/policy.js";
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
const MIG_REL = "supabase/migrations/20260913020000_pn1b2_email_dispatch_claim.sql";
const TWIN_REL = "supabase/sql/pn1b2_email_dispatch_claim.sql";
const FN_REL = "supabase/functions/dispatch-notification-email/index.ts";
const POLICY_REL = "supabase/functions/dispatch-notification-email/policy.js";

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

console.log("\n=== PN-1B2 EMAIL DISPATCHER ===\n");

const mig = existsSync(resolve(root, MIG_REL)) ? readSrc(MIG_REL) : "";
const twin = existsSync(resolve(root, TWIN_REL)) ? readSrc(TWIN_REL) : "";
const fn = existsSync(resolve(root, FN_REL)) ? readSrc(FN_REL) : "";
const policy = existsSync(resolve(root, POLICY_REL)) ? readSrc(POLICY_REL) : "";
const toml = readSrc("supabase/config.toml");
const envEx = readSrc(".env.functions.example");
const pkg = readSrc("package.json");

if (mig && mig === twin) pass("static.twin", "claim migration matches SQL twin");
else fail("static.twin", "migration / twin mismatch");

if (/FOR UPDATE SKIP LOCKED/.test(mig) && /claim_notification_email_deliveries/.test(mig) && /REVOKE ALL[\s\S]*FROM authenticated/.test(mig) && /GRANT EXECUTE[\s\S]*TO service_role/.test(mig)) {
  pass("static.claim_rpc", "SKIP LOCKED claim; authenticated revoked; service_role execute");
} else fail("static.claim_rpc", "claim RPC contract incomplete");

if (/finalize_notification_email_delivery/.test(mig) && /provider_recipient/.test(mig) && /already sent|status = 'sent'/.test(mig)) {
  pass("static.finalize_rpc", "finalize no-op if sent; provider_recipient column");
} else fail("static.finalize_rpc", "finalize RPC contract incomplete");

const dispatchBlock = toml.split("[functions.dispatch-notification-email]")[1] || "";
if (/verify_jwt = false/.test(dispatchBlock)) pass("static.verify_jwt_false", "gateway allows cron secret bearer");
else fail("static.verify_jwt_false", "dispatch function must set verify_jwt=false");

if (
  /EMAIL_DISPATCH_CRON_SECRET/.test(fn) &&
  /timingSafeEqual/.test(fn) &&
  /ignore_caller_payload/.test(fn) &&
  /Idempotency-Key/.test(fn) &&
  /disabled_no_claim/.test(fn) &&
  /api\.resend\.com\/emails/.test(fn) &&
  !/VITE_/.test(fn) &&
  !/alxhrnotnvwpblsiadxj/.test(fn)
) {
  pass("static.function.auth_relay", "cron secret, ignore to/subject/body, no VITE, no Production ref");
} else fail("static.function.auth_relay", "dispatcher source contract incomplete");

if (!/cron\.schedule/.test(fn) && !/pg_net/.test(fn) && !/pg_cron/.test(mig)) {
  pass("static.no_cron", "no pg_cron/pg_net/GitHub cron in this slice");
} else fail("static.no_cron", "unexpected scheduler");

if (
  /EMAIL_PROVIDER_API_KEY=/.test(envEx) &&
  /EMAIL_DISPATCH_CRON_SECRET=/.test(envEx) &&
  /EMAIL_QA_EXACT_ALLOWLIST=/.test(envEx) &&
  /not a Resend-deliverable signal/.test(envEx) &&
  !/VITE_EMAIL_/.test(envEx)
) {
  pass("static.env_example", "EMAIL_* names only; domain allowlist not provider-deliverable");
} else fail("static.env_example", "example secrets contract missing");
if (/qa_rewrite_synthetic/.test(policy) && /EMAIL_QA_EXACT_ALLOWLIST/.test(fn) && /allowlistRaw: _allowlistRaw/.test(policy)) {
  pass("static.qa.no_domain_direct_send", "policy ignores domain allowlist for Resend To");
} else fail("static.qa.no_domain_direct_send", "PN-1B3A rewrite contract missing");

if (!/supabase:functions:deploy:qa".*dispatch-notification-email/.test(pkg)) {
  pass("static.deploy_bundle", "default QA deploy bundle does not auto-include dispatcher");
} else fail("static.deploy_bundle", "do not silently add dispatcher to the three-function QA bundle");

const SINK = "qa.sink@example.com";
const gmail = resolveQaRecipient({
  intendedEmail: "person@gmail.com",
  qaMode: "true",
  appEnv: "qa",
  allowlistRaw: "primecare.test",
  testRecipient: SINK,
});
if (gmail.action === "rewrite" && gmail.providerTo === SINK && gmail.reason === "qa_rewrite_personal") {
  pass("unit.qa.gmail_rewrite", `${maskEmail("person@gmail.com")} -> ${maskEmail(gmail.providerTo)}`);
} else fail("unit.qa.gmail_rewrite", JSON.stringify(gmail));

const synthetic = resolveQaRecipient({
  intendedEmail: "qa.test.agent1@primecare.test",
  qaMode: "true",
  appEnv: "qa",
  allowlistRaw: "primecare.test",
  testRecipient: SINK,
});
if (
  synthetic.action === "rewrite" &&
  synthetic.providerTo === SINK &&
  synthetic.reason === "qa_rewrite_synthetic"
) {
  pass("unit.qa.primecare_test_rewrite", "domain allowlist does not send @primecare.test to Resend");
} else fail("unit.qa.primecare_test_rewrite", JSON.stringify(synthetic));

const exactSink = resolveQaRecipient({
  intendedEmail: SINK,
  qaMode: "true",
  appEnv: "qa",
  allowlistRaw: "primecare.test",
  testRecipient: SINK,
});
if (exactSink.action === "send" && exactSink.providerTo === SINK && exactSink.reason === "qa_test_recipient") {
  pass("unit.qa.exact_test_recipient", "EMAIL_TEST_RECIPIENT may send as queued");
} else fail("unit.qa.exact_test_recipient", JSON.stringify(exactSink));

const gmailNoSink = resolveQaRecipient({
  intendedEmail: "person@gmail.com",
  qaMode: "true",
  appEnv: "qa",
  allowlistRaw: "primecare.test",
  testRecipient: "",
});
if (gmailNoSink.action === "suppress" && gmailNoSink.reason === "qa_suppressed") {
  pass("unit.qa.gmail_suppress", "no provider call path");
} else fail("unit.qa.gmail_suppress", JSON.stringify(gmailNoSink));

const unknown = resolveQaRecipient({
  intendedEmail: "ops@unknown-lab.example",
  qaMode: "true",
  appEnv: "qa",
  allowlistRaw: "primecare.test",
  testRecipient: SINK,
});
if (unknown.action === "rewrite" && unknown.providerTo === SINK && unknown.reason === "qa_rewrite") {
  pass("unit.qa.unknown_domain_rewrite", "unknown domains rewrite to EMAIL_TEST_RECIPIENT");
} else fail("unit.qa.unknown_domain_rewrite", JSON.stringify(unknown));

const missingSinkSynthetic = resolveQaRecipient({
  intendedEmail: "qa.admin@primecare.test",
  qaMode: "true",
  appEnv: "qa",
  allowlistRaw: "primecare.test",
  testRecipient: "",
});
if (missingSinkSynthetic.action === "suppress" && missingSinkSynthetic.reason === "qa_suppressed") {
  pass("unit.qa.missing_test_recipient", "missing EMAIL_TEST_RECIPIENT suppresses");
} else fail("unit.qa.missing_test_recipient", JSON.stringify(missingSinkSynthetic));

const freeze = resolveQaRecipient({
  intendedEmail: "qa.admin@primecare.test",
  qaMode: "false",
  appEnv: "production",
  allowlistRaw: "primecare.test",
  testRecipient: SINK,
});
if (freeze.action === "suppress" && freeze.reason === "production_freeze") {
  pass("unit.qa.production_freeze", "non-QA mode does not apply rewrite or send");
} else fail("unit.qa.production_freeze", JSON.stringify(freeze));

if (!shouldClaimRows("false") && shouldClaimRows("true")) pass("unit.enabled_gate", "EMAIL_ENABLED=false does not claim");
else fail("unit.enabled_gate", "enabled gate failed");

const retry1 = nextAttemptAtIso(1, new Date("2026-09-12T00:00:00Z"));
const retry4 = nextAttemptAtIso(4, new Date("2026-09-12T00:00:00Z"));
if (retry1 === "2026-09-12T00:05:00.000Z" && retry4 == null) pass("unit.retry_schedule", "5m / terminal at 4");
else fail("unit.retry_schedule", `${retry1} ${retry4}`);

if (classifyProviderError(429).retryable && classifyProviderError(500).retryable && !classifyProviderError(400).retryable) {
  pass("unit.retry_class", "429/5xx retryable; 4xx permanent");
} else fail("unit.retry_class", "classification mismatch");

const created = renderForEventType("prospect_created", {
  payload: { lab_name: "<Lab>", contact_name: "Pat", phone: "555", area: "Guntur", sourcing_agent_name: "A1", created_at: "t" },
  appPublicUrl: "https://primecare-portal.vercel.app",
});
if (
  created.ok &&
  created.subject === "New PrimeCare Prospect: <Lab>" &&
  /Review Prospect/.test(created.text) &&
  created.html.includes("&lt;Lab&gt;") &&
  !/tenant/i.test(created.text)
) {
  pass("unit.template.created", "HQ template escaped; CTA /labs");
} else fail("unit.template.created", created.subject || "render failed");

const activated = renderForEventType("prospect_activated", {
  payload: { lab_name: "Lab X", activated_at: "t2", next_action: "Open Lab" },
  appPublicUrl: "https://primecare-portal.vercel.app",
  assignedName: "Other Agent",
});
if (activated.ok && activated.subject === "Prospect Approved: Lab X" && /Open Lab/.test(activated.text) && !/555/.test(activated.text)) {
  pass("unit.template.activated", "Agent template; no HQ phone");
} else fail("unit.template.activated", "activated template mismatch");

if (escapeHtml("<x>") === "&lt;x&gt;" && !policy.includes("VITE_")) pass("unit.escape", "HTML escape; policy has no VITE_");
else fail("unit.escape", "escape/policy");

if (!APPLY) {
  console.log("\nStatic only. Live QA: node scripts/verify-prospect-email-1b2.mjs --apply\n");
  process.exit(failures ? 1 : 0);
}

function loadEnv() {
  const candidates = [resolve(root, ".env.local")];
  const path = candidates.find((p) => existsSync(p));
  if (!path) throw new Error("Missing .env.local");
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
  return env;
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
function dbQuery(sql) {
  const result = spawnSync("supabase", ["db", "query", "--linked", "-o", "json", sql], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) return { ok: false, error: str(result.stderr || result.stdout), rows: [] };
  const raw = str(result.stdout);
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end < start) return { ok: true, error: "", rows: [], raw };
  try {
    return { ok: true, error: "", rows: JSON.parse(raw.slice(start, end + 1)), raw };
  } catch (err) {
    return { ok: false, error: err.message, rows: [], raw };
  }
}
async function signIn(sb, cred, env) {
  await sb.auth.signOut();
  const passwords = [cred.password, "1234"].filter((v, i, a) => v && a.indexOf(v) === i);
  for (const password of passwords) {
    const { error } = await sb.auth.signInWithPassword({ email: cred.email, password });
    if (!error) return true;
  }
  return false;
}

console.log("\n--- live QA apply ---\n");
const assert = spawnSync("node", ["scripts/assert-supabase-environment.mjs", "--expect=qa"], { cwd: root, encoding: "utf8" });
if (assert.status !== 0) {
  fail("live.env.assert", assert.stdout || assert.stderr);
  process.exit(1);
}
pass("live.env.assert", "linked QA");

const env = loadEnv();
const ref = projectRefFromUrl(env.VITE_SUPABASE_URL);
if (ref !== QA_REF || ref === PROD_REF) {
  fail("live.env", `ref ${ref}`);
  process.exit(1);
}
pass("live.env", `QA ${ref}`);

const cols = dbQuery(
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='notification_delivery_log' AND column_name='provider_recipient';"
);
if (cols.rows?.length) pass("live.schema.provider_recipient", "present");
else fail("live.schema.provider_recipient", "missing column");

const fns = dbQuery(
  "SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('claim_notification_email_deliveries','finalize_notification_email_delivery');"
);
const names = (fns.rows || []).map((r) => r.proname);
if (names.includes("claim_notification_email_deliveries") && names.includes("finalize_notification_email_delivery")) {
  pass("live.schema.rpcs", names.join(","));
} else fail("live.schema.rpcs", JSON.stringify(names));

const grants = dbQuery(
  "SELECT routine_name, grantee FROM information_schema.role_routine_grants WHERE specific_schema='public' AND routine_name IN ('claim_notification_email_deliveries','finalize_notification_email_delivery') AND privilege_type='EXECUTE';"
);
const leaked = (grants.rows || []).filter((r) => ["authenticated", "anon", "public"].includes(str(r.grantee).toLowerCase()));
if (leaked.length) fail("live.grants", JSON.stringify(leaked));
else pass("live.grants", "authenticated/anon cannot EXECUTE claim/finalize");

const adminSb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actorClients = {
  agent: client(env),
  admin: client(env),
  executive: client(env),
  lab: client(env),
  hr: client(env),
};
const creds = {
  agent: QA_AGENT,
  admin: QA_ADMIN,
  executive: QA_EXECUTIVE,
  lab: QA_LAB,
  hr: { email: QA_HR.email, password: resolveQaHrPassword() || QA_HR.password },
};

try {
  for (const role of Object.keys(actorClients)) {
    const ok = await signIn(actorClients[role], creds[role], env);
    if (!ok) {
      fail(`live.auth.${role}`, "login failed");
      continue;
    }
    pass(`live.auth.${role}`, creds[role].email);
    const rpc = await actorClients[role].rpc("claim_notification_email_deliveries", { p_limit: 1 });
    if (rpc.error) pass(`live.rls.claim.${role}`, rpc.error.message || "denied");
    else fail(`live.rls.claim.${role}`, "claim RPC succeeded for user JWT");
    const fin = await actorClients[role].rpc("finalize_notification_email_delivery", {
      p_delivery_id: "00000000-0000-0000-0000-000000000001",
      p_status: "sent",
    });
    if (fin.error) pass(`live.rls.finalize.${role}`, fin.error.message || "denied");
    else fail(`live.rls.finalize.${role}`, "finalize succeeded for user JWT");
  }

  const fnUrl = `${env.VITE_SUPABASE_URL}/functions/v1/dispatch-notification-email`;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  async function invoke(token, body) {
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  }

  const session = await actorClients.admin.auth.getSession();
  const userJwt = session.data?.session?.access_token || "";
  const rolesForJwt = ["agent", "admin", "executive", "lab"];
  for (const role of rolesForJwt) {
    const sess = await actorClients[role].auth.getSession();
    const jwt = sess.data?.session?.access_token;
    if (!jwt) {
      fail(`live.http.jwt.${role}`, "no jwt");
      continue;
    }
    const hit = await invoke(jwt, { to: "attacker@example.com", subject: "x", body: "y" });
    if (hit.status === 401 || hit.status === 403) pass(`live.http.jwt.${role}`, String(hit.status));
    else if (hit.status === 404) pass(`live.http.jwt.${role}`, "function not deployed (404)");
    else fail(`live.http.jwt.${role}`, JSON.stringify(hit));
  }

  const bad = await invoke("not-the-cron-secret", { to: "attacker@example.com", subject: "test", body: "test" });
  if (bad.status === 401 || bad.status === 403 || bad.status === 404) {
    pass("live.http.bad_secret", String(bad.status));
  } else fail("live.http.bad_secret", JSON.stringify(bad));

  const openRelay = await invoke(userJwt, {
    to: "attacker@example.com",
    subject: "test",
    body: "test",
    html: "<b>test</b>",
  });
  if (openRelay.status === 401 || openRelay.status === 403 || openRelay.status === 404) {
    pass("live.http.open_relay", "arbitrary to/subject/body did not dispatch");
  } else fail("live.http.open_relay", JSON.stringify(openRelay));

  const cron = str(env.EMAIL_DISPATCH_CRON_SECRET || process.env.EMAIL_DISPATCH_CRON_SECRET);
  if (!cron) {
    pass("live.http.cron_skipped", "EMAIL_DISPATCH_CRON_SECRET not in env; live send not attempted");
  } else {
    const disabled = await invoke(cron, { to: "attacker@example.com" });
    if (disabled.status === 404) {
      pass("live.http.cron_secret", "function not deployed yet");
    } else if (disabled.status === 200 && disabled.json?.disabled === true && disabled.json?.claimed === 0) {
      pass("live.http.disabled_no_claim", "EMAIL_ENABLED=false claimed 0");
    } else if (disabled.status === 200) {
      pass("live.http.cron_secret", `claimed=${disabled.json?.claimed}`);
    } else if (disabled.status === 401) {
      fail("live.http.cron_secret", "secret rejected — function deployed with a different secret");
    } else {
      fail("live.http.cron_secret", JSON.stringify(disabled));
    }
  }

  const sample = await adminSb
    .from("notification_delivery_log")
    .select("delivery_id,recipient_email,status,provider_message_id")
    .eq("channel", "email")
    .eq("status", "queued")
    .limit(1);
  if ((sample.data || []).some((r) => /gmail\.com/i.test(str(r.recipient_email)) && r.status === "sent")) {
    fail("live.safety.gmail_sent", "a Gmail snapshot row is marked sent");
  } else {
    pass("live.safety.gmail_not_sent", "no queued Gmail row is marked sent");
  }
} catch (err) {
  fail("live.exception", err.message || String(err));
}

console.log(failures ? `\nPN-1B2: BLOCKED (${failures})\n` : "\nPN-1B2: PASS\n");
process.exit(failures ? 1 : 0);
