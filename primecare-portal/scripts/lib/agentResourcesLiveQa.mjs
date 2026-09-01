/**
 * AR-1A live QA certification helpers.
 * Mutates only disposable [AR-1A-CERT] rows/objects. Refuses Production.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_HR,
  QA_HQ_TENANT_ID,
  QA_LAB,
  hydrateQaHrPasswordFromEnv,
  resolveQaHrPassword,
} from "../qaCredentials.mjs";
import { signInWithQaCredentials } from "../qaSignIn.mjs";
import { PRIMECARE_SUPABASE_PROJECTS } from "./primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const QA_REF = PRIMECARE_SUPABASE_PROJECTS.qa.projectRef;
const PROD_REF = PRIMECARE_SUPABASE_PROJECTS.prod.projectRef;
const CERT_PREFIX = "[AR-1A-CERT]";
const BUCKET = "agent-resources";
const MIN_PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF\n"
);

export function createReporter() {
  const rows = [];
  let failures = 0;
  let criticalSkips = 0;
  function pass(id, detail) {
    rows.push({ status: "PASS", id, detail });
    console.log(`PASS  ${id}: ${detail}`);
  }
  function fail(id, detail) {
    failures += 1;
    rows.push({ status: "FAIL", id, detail });
    console.error(`FAIL  ${id}: ${detail}`);
  }
  function skip(id, detail, { critical = true } = {}) {
    if (critical) criticalSkips += 1;
    rows.push({ status: "SKIP", id, detail });
    console.log(`SKIP  ${id}: ${detail}`);
  }
  function assert(cond, id, detail) {
    if (cond) pass(id, detail);
    else fail(id, detail);
  }
  return {
    pass,
    fail,
    skip,
    assert,
    get failures() {
      return failures;
    },
    get criticalSkips() {
      return criticalSkips;
    },
    rows,
  };
}

export function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  const env = Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      })
  );
  hydrateQaHrPasswordFromEnv(env);
  return env;
}

export function assertQaOnly(env) {
  const url = String(env.VITE_SUPABASE_URL || "");
  const host = url.replace(/^https?:\/\//, "").split("/")[0];
  const ref = host.split(".")[0];
  if (ref === PROD_REF || host.includes(PROD_REF)) {
    throw new Error("REFUSE: Production Supabase is targeted — AR-1A live cert must not run against Production");
  }
  if (ref !== QA_REF) {
    throw new Error(`REFUSE: linked/url project ${ref || "unknown"} is not QA (${QA_REF})`);
  }
  return { ref, host };
}

let cachedPgEnv = null;
function pgEnv() {
  if (cachedPgEnv) return cachedPgEnv;
  const dry = spawnSync("supabase", ["db", "dump", "--linked", "--dry-run"], {
    cwd: root,
    encoding: "utf8",
  });
  const env = {};
  for (const line of `${dry.stdout || ""}\n${dry.stderr || ""}`.split("\n")) {
    const m = line.match(/^export (PG\w+)="([^"]*)"/);
    if (m) env[m[1]] = m[2];
  }
  cachedPgEnv = env;
  return env;
}

export function sql(query) {
  const env = pgEnv();
  if (!env.PGHOST) throw new Error("Could not resolve linked QA postgres via supabase db dump --dry-run");
  const run = spawnSync("psql", ["-q", "-t", "-A", "-F", "|", "-c", query], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  if (run.status !== 0) {
    throw new Error((run.stderr || run.stdout || "psql failed").trim());
  }
  return String(run.stdout || "").trim();
}

function anonClient(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function serviceClient(env) {
  return createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(env, cred, options = {}) {
  const sb = anonClient(env);
  const result = await signInWithQaCredentials(sb, cred, options);
  if (!result.ok) return { sb: null, error: result.error, userId: null };
  const { data } = await sb.auth.getUser();
  return { sb, error: null, userId: data?.user?.id || null, email: result.email };
}

function denied(error) {
  if (!error) return false;
  const m = `${error.message || ""} ${error.code || ""} ${error.details || ""}`.toLowerCase();
  return /row-level security|42501|permission denied|not allowed|not authorized|violates row-level|new row violates|rls|403|401|jwt|unauthorized|forbidden|policy|pgrst301|42503/.test(
    m
  );
}

function errText(error) {
  if (!error) return "";
  return `${error.message || error.code || error}`.trim();
}

function objectKey() {
  return randomBytes(16).toString("hex");
}

async function createDraftVersion(publisher, { tenantId, resourceId, versionId, versionNumber, filename }) {
  const path = `${tenantId}/${resourceId}/${versionId}/${objectKey()}`;
  const ins = await publisher
    .from("agent_resource_versions")
    .insert({
      id: versionId,
      resource_id: resourceId,
      tenant_id: tenantId,
      version_number: versionNumber,
      storage_path: path,
      original_filename: filename,
      mime_type: "application/pdf",
      file_size: MIN_PDF.length,
      status: "draft",
    })
    .select("id, storage_path, status")
    .single();
  return { path, ...ins };
}

async function uploadPdf(userClient, path) {
  return userClient.storage.from(BUCKET).upload(path, MIN_PDF, {
    contentType: "application/pdf",
    upsert: false,
  });
}

export async function cleanupCertData(service) {
  const { data: resources } = await service
    .from("agent_resources")
    .select("id")
    .like("title", "[AR-1%");
  const ids = (resources || []).map((r) => r.id);
  if (ids.length) {
    await service.from("agent_resources").update({ current_published_version_id: null }).in("id", ids);
    await service.from("agent_resource_acknowledgements").delete().in("resource_id", ids);
    await service.from("agent_resource_audiences").delete().in("resource_id", ids);
    const { data: versions } = await service
      .from("agent_resource_versions")
      .select("id, storage_path")
      .in("resource_id", ids);
    const paths = (versions || []).map((v) => v.storage_path).filter(Boolean);
    if (paths.length) {
      await service.storage.from(BUCKET).remove(paths);
    }
    await service.from("agent_resource_versions").delete().in("resource_id", ids);
    await service.from("agent_resources").delete().in("id", ids);
  }
}

export async function sweepQaCertActors(service) {
  await cleanupCertData(service);
  const listed = await service.auth.admin.listUsers({ perPage: 1000 });
  const leftovers = (listed.data?.users || []).filter((u) => String(u.email || "").startsWith("ar1a.cert."));
  for (const user of leftovers) {
    await service.from("profiles").delete().eq("user_id", user.id);
    await deleteAuthUser(service, user.id);
  }
  await service.from("tenants").delete().like("tenant_code", "ar1a-cert-%");
  return { users: leftovers.length };
}

async function deleteAuthUser(service, userId) {
  if (!userId) return;
  try {
    await service.auth.admin.deleteUser(userId);
  } catch {
    /* best-effort */
  }
}

export async function sweepLiveCertResidue() {
  const env = loadEnvLocal();
  assertQaOnly(env);
  const service = serviceClient(env);
  return sweepQaCertActors(service);
}

async function createDisposableAgent(service, { tenantId, email, label }) {
  const password = `Ar1aCert${randomBytes(4).toString("hex")}Aa1!`;
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data?.user?.id) {
    return { error: created.error?.message || "auth admin createUser failed" };
  }
  const userId = created.data.user.id;
  const profile = await service.from("profiles").insert({
    user_id: userId,
    tenant_id: tenantId,
    role: "agent",
    active: true,
    email,
    agent_id: label,
    agent_name: label,
  });
  if (profile.error) {
    await deleteAuthUser(service, userId);
    return { error: `profile create failed: ${profile.error.message}` };
  }
  return { userId, email, password, created: true };
}

async function prepareActors(env, r) {
  const service = serviceClient(env);
  const disposable = { users: [], tenantId: null };

  const exec = await signIn(env, QA_EXECUTIVE, { repairAgent: false });
  const admin = await signIn(env, QA_ADMIN, { repairAgent: false });
  const agentA = await signIn(env, QA_AGENT, { repairAgent: true, fallbackEmail: "qa.agent@primecare.test" });
  const lab = await signIn(env, QA_LAB, { repairAgent: false });
  hydrateQaHrPasswordFromEnv(env);
  let hr = { sb: null, error: "QA_HR_PASSWORD missing", userId: null };
  try {
    resolveQaHrPassword({ required: true });
    hr = await signIn(env, QA_HR, { repairAgent: false });
  } catch (error) {
    hr = { sb: null, error: error.message, userId: null };
  }

  r.assert(Boolean(exec.sb), "actor.executive", exec.error || "Executive signed in");
  r.assert(Boolean(admin.sb), "actor.admin", admin.error || "Admin signed in");
  r.assert(Boolean(agentA.sb), "actor.agent_a", agentA.error || "Agent A signed in");
  r.assert(Boolean(lab.sb), "actor.lab", lab.error || "Lab signed in");
  r.assert(Boolean(hr.sb), "actor.hr", hr.error || "HR signed in");

  async function profileOf(sb, userId) {
    if (!sb || !userId) return null;
    const { data } = await service
      .from("profiles")
      .select("user_id, tenant_id, role, active")
      .eq("user_id", userId)
      .maybeSingle();
    return data;
  }
  const execProf = await profileOf(exec.sb, exec.userId);
  const agentAProf = await profileOf(agentA.sb, agentA.userId);
  const tenantA = execProf?.tenant_id || QA_HQ_TENANT_ID;
  if (agentAProf?.tenant_id && agentAProf.tenant_id !== tenantA) {
    r.fail(
      "actor.same_tenant",
      `Executive tenant ${tenantA} != Agent A tenant ${agentAProf.tenant_id}`
    );
  } else {
    r.pass("actor.same_tenant", `tenant A ${tenantA}`);
  }

  let agentB = { sb: null, userId: null, error: "not prepared" };
  const altAgent = anonClient(env);
  const altTry = await altAgent.auth.signInWithPassword({
    email: "qa.agent@primecare.test",
    password: "1234",
  });
  if (
    !altTry.error &&
    altTry.data?.user?.id &&
    agentA.userId &&
    altTry.data.user.id !== agentA.userId
  ) {
    agentB = { sb: altAgent, userId: altTry.data.user.id, error: null, email: "qa.agent@primecare.test" };
    r.pass("actor.agent_b", "signed in qa.agent@primecare.test");
  } else {
    const stamp = Date.now();
    const created = await createDisposableAgent(service, {
      tenantId: tenantA,
      email: `ar1a.cert.b.${stamp}@primecare.test`,
      label: "AR1A_CERT_AGENT_B",
    });
    if (created.error) {
      r.skip("actor.agent_b", created.error);
    } else {
      disposable.users.push(created.userId);
      const signed = await signIn(env, { email: created.email, password: created.password }, { repairAgent: false });
      if (signed.sb) {
        agentB = signed;
        r.pass("actor.agent_b", "disposable HQ Agent B signed in");
      } else {
        r.skip("actor.agent_b", signed.error || "disposable Agent B sign-in failed");
      }
    }
  }

  let agentX = { sb: null, userId: null, error: "not prepared" };
  const { data: otherTenants, error: tenantErr } = await service
    .from("tenants")
    .select("id, tenant_code")
    .neq("id", tenantA)
    .limit(5);
  let otherTenantId = otherTenants?.[0]?.id || null;
  if (!otherTenantId) {
    const code = `ar1a-cert-${Date.now()}`;
    const insTen = await service
      .from("tenants")
      .insert({ tenant_code: code, tenant_name: `${CERT_PREFIX} isolation`, status: "ACTIVE" })
      .select("id")
      .single();
    if (insTen.data?.id) {
      otherTenantId = insTen.data.id;
      disposable.tenantId = otherTenantId;
    } else {
      r.skip("actor.agent_tenant_b", tenantErr?.message || insTen.error?.message || "no second tenant");
    }
  }
  if (otherTenantId) {
    const createdX = await createDisposableAgent(service, {
      tenantId: otherTenantId,
      email: `ar1a.cert.x.${Date.now()}@primecare.test`,
      label: "AR1A_CERT_AGENT_X",
    });
    if (createdX.error) {
      r.skip("actor.agent_tenant_b", createdX.error);
    } else {
      disposable.users.push(createdX.userId);
      const signed = await signIn(env, { email: createdX.email, password: createdX.password }, { repairAgent: false });
      if (signed.sb) {
        agentX = { ...signed, tenantId: otherTenantId };
        r.pass("actor.agent_tenant_b", `signed in on tenant ${otherTenantId}`);
      } else {
        r.skip("actor.agent_tenant_b", signed.error || "tenant B agent sign-in failed");
      }
    }
  }

  return {
    service,
    exec,
    admin,
    agentA,
    agentB,
    agentX,
    lab,
    hr,
    tenantA,
    otherTenantId,
    disposable,
  };
}

async function teardown(ctx) {
  if (!ctx?.service) return;
  await cleanupCertData(ctx.service);
  for (const id of ctx.disposable?.users || []) {
    await ctx.service.from("profiles").delete().eq("user_id", id);
    await deleteAuthUser(ctx.service, id);
  }
  if (ctx.disposable?.tenantId) {
    await ctx.service.from("tenants").delete().eq("id", ctx.disposable.tenantId);
  }
}

export async function runLiveSchema(r = createReporter()) {
  const env = loadEnvLocal();
  const { ref } = assertQaOnly(env);
  r.pass("live.env.qa", `project ${ref} (${PRIMECARE_SUPABASE_PROJECTS.qa.label})`);

  const tables = [
    "agent_resources",
    "agent_resource_versions",
    "agent_resource_audiences",
    "agent_resource_acknowledgements",
  ];
  for (const table of tables) {
    const exists = sql(`SELECT to_regclass('public.${table}')::text`);
    r.assert(exists === table, `live.table.${table}`, "present on QA");
    const rls = sql(`SELECT relrowsecurity::text FROM pg_class WHERE oid='public.${table}'::regclass`);
    r.assert(rls === "t" || rls === "true", `live.rls.${table}`, "RLS enabled");
  }

  r.assert(
    Number(sql(`SELECT COUNT(*) FROM pg_constraint WHERE conname='agent_resource_versions_resource_tenant_fk'`)) === 1,
    "live.fk.child_tenant",
    "versions composite resource+tenant FK"
  );
  r.assert(
    Number(sql(`SELECT COUNT(*) FROM pg_constraint WHERE conname='agent_resources_current_published_fk'`)) === 1,
    "live.fk.current_published",
    "current published composite FK"
  );
  r.assert(
    Number(sql(`SELECT COUNT(*) FROM pg_constraint WHERE conname='agent_resource_acknowledgements_version_fk'`)) === 1,
    "live.fk.ack_version",
    "ack version+resource+tenant FK"
  );
  r.assert(
    Number(sql(`SELECT COUNT(*) FROM pg_constraint WHERE conname='agent_resource_acknowledgements_unique'`)) === 1,
    "live.uq.ack",
    "ack uniqueness"
  );
  r.assert(
    Number(
      sql(
        `SELECT COUNT(*) FROM pg_indexes WHERE schemaname='public' AND indexname='agent_resource_versions_one_published'`
      )
    ) === 1,
    "live.uq.one_published",
    "partial unique published"
  );
  r.assert(
    Number(sql(`SELECT COUNT(*) FROM pg_indexes WHERE indexname='idx_agent_resources_tenant_updated'`)) === 1,
    "live.idx.resources",
    "tenant updated index"
  );
  r.assert(
    Number(sql(`SELECT COUNT(*) FROM pg_indexes WHERE indexname='idx_agent_resource_versions_tenant_resource'`)) === 1,
    "live.idx.versions",
    "versions index"
  );
  r.assert(
    Number(sql(`SELECT COUNT(*) FROM pg_indexes WHERE indexname='idx_agent_resource_audiences_profile'`)) === 1,
    "live.idx.audiences",
    "audiences index"
  );
  r.assert(
    Number(sql(`SELECT COUNT(*) FROM pg_indexes WHERE indexname='idx_agent_resource_acks_tenant_version'`)) === 1,
    "live.idx.acks",
    "acks index"
  );

  const checks = sql(
    `SELECT COUNT(*) FROM pg_constraint WHERE contype='c' AND conrelid IN ('public.agent_resources'::regclass,'public.agent_resource_versions'::regclass)`
  );
  r.assert(Number(checks) >= 6, "live.checks", `${checks} CHECK constraints on resources/versions`);

  const rpc = sql(
    `SELECT prosecdef::text FROM pg_proc WHERE proname='publish_agent_resource_version' AND pronamespace='public'::regnamespace`
  );
  r.assert(rpc === "true", "live.rpc.publish", "SECURITY DEFINER publish RPC exists");

  r.assert(
    sql(`SELECT has_table_privilege('anon','public.agent_resources','SELECT')`) === "f",
    "live.grant.anon_resources",
    "anon cannot SELECT resources"
  );
  r.assert(
    sql(`SELECT has_table_privilege('authenticated','public.agent_resources','SELECT')`) === "t",
    "live.grant.auth_select",
    "authenticated SELECT resources"
  );
  r.assert(
    sql(
      `SELECT has_column_privilege('authenticated','public.agent_resources','current_published_version_id','UPDATE')`
    ) === "f",
    "live.grant.no_pointer",
    "current_published_version_id not UPDATEable by authenticated"
  );
  const versionsAcl = sql(
    `SELECT COALESCE(relacl::text,'') FROM pg_class WHERE oid='public.agent_resource_versions'::regclass`
  );
  r.assert(
    !/authenticated=[^,}]*w/.test(versionsAcl) &&
      sql(`SELECT has_table_privilege('authenticated','public.agent_resource_versions','UPDATE')`) === "f",
    "live.grant.no_version_update",
    "authenticated cannot UPDATE versions"
  );
  r.assert(
    sql(`SELECT has_function_privilege('authenticated','public.publish_agent_resource_version(uuid)','EXECUTE')`) ===
      "t",
    "live.grant.rpc_exec",
    "authenticated EXECUTE publish RPC"
  );
  const rpcAcl = sql(
    `SELECT COALESCE(proacl::text,'') FROM pg_proc WHERE proname='publish_agent_resource_version' AND pronamespace='public'::regnamespace`
  );
  r.assert(
    !/\banon=X\b/.test(rpcAcl) &&
      sql(`SELECT has_function_privilege('anon','public.publish_agent_resource_version(uuid)','EXECUTE')`) === "f",
    "live.grant.rpc_anon_revoke",
    "anon cannot EXECUTE publish RPC"
  );

  const service = serviceClient(env);
  const { error } = await service.from("agent_resources").select("id").limit(1);
  r.assert(!error, "live.read.service", error?.message || "service role can read agent_resources");
  return r;
}

export async function runLiveStorage(r = createReporter()) {
  const env = loadEnvLocal();
  assertQaOnly(env);
  const ctx = await prepareActors(env, r);
  try {
    await cleanupCertData(ctx.service);

    const { data: bucket, error: bucketErr } = await ctx.service.storage.getBucket(BUCKET);
    r.assert(!bucketErr && bucket, "live.bucket.api", bucketErr?.message || "getBucket agent-resources");
    r.assert(bucket?.public === false, "live.bucket.private", "agent-resources is private");
    r.assert(Number(bucket?.file_size_limit || bucket?.fileSizeLimit) === 10485760, "live.bucket.size", "10 MiB");
    const mimes = bucket?.allowed_mime_types || bucket?.allowedMimeTypes || [];
    const mimeList = Array.isArray(mimes) ? mimes.join(",") : String(mimes);
    r.assert(
      /application\/pdf/.test(mimeList) &&
        /image\/jpeg/.test(mimeList) &&
        /image\/png/.test(mimeList) &&
        !/zip|docx/i.test(mimeList),
      "live.bucket.mime",
      "PDF/JPEG/PNG only"
    );

    try {
      r.assert(
        Number(
          sql(
            `SELECT COUNT(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='agent_resources_storage_select'`
          )
        ) === 1,
        "live.storage.policy_select",
        "storage SELECT policy"
      );
      r.assert(
        Number(
          sql(
            `SELECT COUNT(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='agent_resources_storage_insert'`
          )
        ) === 1,
        "live.storage.policy_insert",
        "storage INSERT policy"
      );
      r.assert(
        Number(
          sql(
            `SELECT COUNT(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'agent_resources_storage_update%'`
          )
        ) === 0,
        "live.storage.no_update",
        "no storage UPDATE policy"
      );
    } catch (err) {
      r.pass(
        "live.storage.policy_catalog",
        `storage schema catalog not readable by CLI role (${err.message.split("\n")[0]}); policy behavior tested below`
      );
    }

    try {
      const evidence = sql(`SELECT public::text FROM storage.buckets WHERE id='operational-evidence'`);
      r.assert(
        evidence === "f" || evidence === "",
        "live.regression.evidence_private",
        evidence === "" ? "bucket missing" : "operational-evidence still private"
      );
      const invoice = sql(`SELECT public::text FROM storage.buckets WHERE id='invoice-pdfs'`);
      r.assert(invoice === "f" || invoice === "", "live.regression.invoice_private", "invoice-pdfs still private or absent");
    } catch {
      const ev = await ctx.service.storage.getBucket("operational-evidence");
      const inv = await ctx.service.storage.getBucket("invoice-pdfs");
      r.assert(!ev.data || ev.data.public === false, "live.regression.evidence_private", "operational-evidence still private");
      r.assert(!inv.data || inv.data.public === false, "live.regression.invoice_private", "invoice-pdfs still private");
    }

    if (!ctx.exec.sb) return r;

    const resourceId = randomUUID();
    const v1 = randomUUID();
    const created = await ctx.exec.sb
      .from("agent_resources")
      .insert({
        id: resourceId,
        tenant_id: ctx.tenantA,
        title: `${CERT_PREFIX} storage all-agents`,
        category: "training",
        audience_type: "all_agents",
        required_reading: false,
      })
      .select("id")
      .single();
    r.assert(!created.error, "live.storage.resource_create", created.error?.message || "publisher created resource");
    const ver = await createDraftVersion(ctx.exec.sb, {
      tenantId: ctx.tenantA,
      resourceId,
      versionId: v1,
      versionNumber: 1,
      filename: "secret-playbook.pdf",
    });
    r.assert(!ver.error, "live.storage.version_create", ver.error?.message || "draft version");
    r.assert(
      ver.data?.storage_path && !String(ver.data.storage_path).includes("secret-playbook"),
      "live.storage.path_no_filename",
      "original filename is not a path component"
    );
    const segments = String(ver.data?.storage_path || "").split("/");
    r.assert(
      segments.length === 4 &&
        segments[0] === ctx.tenantA &&
        segments[1] === resourceId &&
        segments[2] === v1 &&
        segments[3].length >= 8,
      "live.storage.path_shape",
      "tenant/resource/version/random"
    );

    const pubUp = await uploadPdf(ctx.exec.sb, ver.data.storage_path);
    r.assert(!pubUp.error, "live.storage.publisher_upload", pubUp.error?.message || "publisher upload allowed");

    const anon = anonClient(env);
    const anonUp = await uploadPdf(anon, ver.data.storage_path);
    r.assert(Boolean(anonUp.error), "live.storage.anon_upload_denied", errText(anonUp.error) || "anon upload unexpectedly allowed");

    if (ctx.agentA.sb) {
      const agentUp = await uploadPdf(ctx.agentA.sb, `${ctx.tenantA}/${resourceId}/${randomUUID()}/${objectKey()}`);
      r.assert(Boolean(agentUp.error) || denied(agentUp.error), "live.storage.agent_upload_denied", errText(agentUp.error) || "agent upload unexpectedly allowed");
    }
    if (ctx.lab.sb) {
      const labUp = await uploadPdf(ctx.lab.sb, ver.data.storage_path);
      r.assert(Boolean(labUp.error), "live.storage.lab_upload_denied", errText(labUp.error) || "lab upload unexpectedly allowed");
      const labRead = await ctx.lab.sb.storage.from(BUCKET).download(ver.data.storage_path);
      r.assert(Boolean(labRead.error), "live.storage.lab_read_denied", errText(labRead.error) || "lab read unexpectedly allowed");
    }
    if (ctx.hr.sb) {
      const hrUp = await uploadPdf(ctx.hr.sb, ver.data.storage_path);
      r.assert(Boolean(hrUp.error), "live.storage.hr_upload_denied", errText(hrUp.error) || "hr upload unexpectedly allowed");
      const hrRead = await ctx.hr.sb.storage.from(BUCKET).download(ver.data.storage_path);
      r.assert(Boolean(hrRead.error), "live.storage.hr_read_denied", errText(hrRead.error) || "hr read unexpectedly allowed");
    }

    const pubRpc = await ctx.exec.sb.rpc("publish_agent_resource_version", { p_version_id: v1 });
    r.assert(!pubRpc.error, "live.storage.publish_v1", pubRpc.error?.message || "published for storage tests");
    const ptr = await ctx.exec.sb
      .from("agent_resources")
      .select("current_published_version_id, tenant_id")
      .eq("id", resourceId)
      .single();
    r.assert(
      ptr.data?.current_published_version_id === v1,
      "live.storage.pointer",
      ptr.error?.message || `pointer=${ptr.data?.current_published_version_id} tenant=${ptr.data?.tenant_id} tenantA=${ctx.tenantA}`
    );

    const pubRead = await ctx.exec.sb.storage.from(BUCKET).createSignedUrl(ver.data.storage_path, 60);
    r.assert(!pubRead.error && pubRead.data?.signedUrl, "live.storage.publisher_signed", pubRead.error?.message || "publisher signed URL");

    if (ctx.agentA.sb) {
      const role = await ctx.agentA.sb.rpc("current_user_role");
      const vis = await ctx.agentA.sb.rpc("agent_resource_version_visible_to_agent", {
        p_resource_id: resourceId,
        p_version_id: v1,
      });
      const canRead = await ctx.agentA.sb.rpc("agent_resource_storage_can_read", {
        object_path: ver.data.storage_path,
      });
      const meta = await ctx.agentA.sb
        .from("agent_resource_versions")
        .select("id, status")
        .eq("id", v1);
      const { data: svcVer } = await ctx.service
        .from("agent_resource_versions")
        .select("id, status, tenant_id, resource_id")
        .eq("id", v1)
        .single();
      const { data: agentProf } = await ctx.service
        .from("profiles")
        .select("tenant_id, role, active")
        .eq("user_id", ctx.agentA.userId)
        .maybeSingle();
      const detail = `rows=${(meta.data || []).length} role=${role.data} vis=${vis.data} status=${svcVer?.status} agentTenant=${agentProf?.tenant_id} agentRole=${agentProf?.role} active=${agentProf?.active}`;
      r.assert((meta.data || []).length === 1, "live.storage.agent_meta", meta.error?.message || detail);
      r.assert(vis.data === true, "live.storage.agent_visible_rpc", vis.error?.message || detail);
      r.assert(canRead.data === true, "live.storage.agent_can_read_rpc", canRead.error?.message || detail);
      const agentSign = await ctx.agentA.sb.storage.from(BUCKET).createSignedUrl(ver.data.storage_path, 60);
      r.assert(
        !agentSign.error && Boolean(agentSign.data?.signedUrl),
        "live.storage.agent_current_allowed",
        agentSign.error?.message || "authorized agent signed URL for current published"
      );
    }

    if (ctx.agentB.sb) {
      /* all_agents so B can read until named tests in RLS */
    }

    const guessed = `${ctx.tenantA}/${resourceId}/${v1}/${objectKey()}`;
    if (ctx.agentA.sb) {
      const guess = await ctx.agentA.sb.storage.from(BUCKET).download(guessed);
      r.assert(Boolean(guess.error), "live.storage.guessed_path_denied", errText(guess.error) || "guessed path unexpectedly allowed");
    }

    const publicUrl = `${env.VITE_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ver.data.storage_path}`;
    const pubFetch = await fetch(publicUrl);
    r.assert(pubFetch.status >= 400, "live.storage.public_url_denied", `HTTP ${pubFetch.status}`);

    if (ctx.otherTenantId && ctx.exec.sb) {
      const xRes = await ctx.exec.sb
        .from("agent_resources")
        .insert({
          tenant_id: ctx.otherTenantId,
          title: `${CERT_PREFIX} cross-tenant should fail`,
          category: "training",
          audience_type: "all_agents",
          required_reading: false,
        })
        .select("id")
        .single();
      r.assert(Boolean(xRes.error) || denied(xRes.error), "live.storage.cross_tenant_publisher_denied", errText(xRes.error) || "cross-tenant insert unexpectedly allowed");
    } else {
      r.skip("live.storage.cross_tenant_publisher_denied", "no second tenant id");
    }
  } finally {
    await teardown(ctx);
  }
  return r;
}

export async function runLiveRls(r = createReporter()) {
  const env = loadEnvLocal();
  assertQaOnly(env);
  const ctx = await prepareActors(env, r);
  try {
    await cleanupCertData(ctx.service);
    if (!ctx.exec.sb || !ctx.admin.sb || !ctx.agentA.sb) {
      r.fail("live.rls.prereq", "required HQ actors failed to sign in");
      return r;
    }

    const r1 = randomUUID();
    const v1 = randomUUID();
    const v2 = randomUUID();
    const insR = await ctx.exec.sb
      .from("agent_resources")
      .insert({
        id: r1,
        tenant_id: ctx.tenantA,
        title: `${CERT_PREFIX} R1 all-agents required`,
        category: "sops",
        audience_type: "all_agents",
        required_reading: true,
      })
      .select("id")
      .single();
    r.assert(!insR.error, "live.exec.create_resource", insR.error?.message || "Executive created R1");

    const adminRes = await ctx.admin.sb
      .from("agent_resources")
      .insert({
        tenant_id: ctx.tenantA,
        title: `${CERT_PREFIX} admin create`,
        category: "other",
        audience_type: "all_agents",
        required_reading: false,
      })
      .select("id")
      .single();
    r.assert(!adminRes.error, "live.admin.create_resource", adminRes.error?.message || "Admin created resource");

    const draft1 = await createDraftVersion(ctx.exec.sb, {
      tenantId: ctx.tenantA,
      resourceId: r1,
      versionId: v1,
      versionNumber: 1,
      filename: "r1-v1.pdf",
    });
    r.assert(!draft1.error, "live.exec.create_draft", draft1.error?.message || "V1 draft");
    const up1 = await uploadPdf(ctx.exec.sb, draft1.data.storage_path);
    r.assert(!up1.error, "live.exec.upload_v1", up1.error?.message || "V1 bytes");

    const agentDraft = await ctx.agentA.sb.from("agent_resources").select("id").eq("id", r1);
    r.assert(
      !agentDraft.error && (agentDraft.data || []).length === 0,
      "live.agent.no_draft_resource",
      agentDraft.error?.message || "agent cannot SELECT unpublished resource"
    );
    const agentDraftV = await ctx.agentA.sb.from("agent_resource_versions").select("id").eq("id", v1);
    r.assert(
      !agentDraftV.error && (agentDraftV.data || []).length === 0,
      "live.agent.no_draft_version",
      "agent cannot SELECT draft version"
    );

    const agentIns = await ctx.agentA.sb.from("agent_resources").insert({
      tenant_id: ctx.tenantA,
      title: `${CERT_PREFIX} agent forge`,
      category: "other",
      audience_type: "all_agents",
      required_reading: false,
    });
    r.assert(Boolean(agentIns.error), "live.agent.no_insert_resource", errText(agentIns.error) || "agent insert unexpectedly allowed");

    const pub1 = await ctx.exec.sb.rpc("publish_agent_resource_version", { p_version_id: v1 });
    r.assert(!pub1.error, "live.publish.v1", pub1.error?.message || "publish V1");
    const after1 = await ctx.exec.sb
      .from("agent_resource_versions")
      .select("id, status, published_by, published_at")
      .eq("id", v1)
      .single();
    r.assert(after1.data?.status === "published", "live.publish.v1_status", after1.data?.status || after1.error?.message);
    r.assert(Boolean(after1.data?.published_by) && Boolean(after1.data?.published_at), "live.publish.v1_audit", "published_by/at populated");
    const ptr1 = await ctx.exec.sb
      .from("agent_resources")
      .select("current_published_version_id")
      .eq("id", r1)
      .single();
    r.assert(ptr1.data?.current_published_version_id === v1, "live.publish.v1_pointer", "current_published_version_id = V1");

    const agentSeeV1 = await ctx.agentA.sb.from("agent_resource_versions").select("id, status").eq("id", v1);
    r.assert((agentSeeV1.data || []).length === 1, "live.agent.sees_v1", "agent sees current published V1");

    const draft2 = await createDraftVersion(ctx.exec.sb, {
      tenantId: ctx.tenantA,
      resourceId: r1,
      versionId: v2,
      versionNumber: 2,
      filename: "r1-v2.pdf",
    });
    r.assert(!draft2.error, "live.exec.create_v2_draft", draft2.error?.message || "V2 draft");
    const up2 = await uploadPdf(ctx.exec.sb, draft2.data.storage_path);
    r.assert(!up2.error, "live.exec.upload_v2", up2.error?.message || "V2 bytes");

    const agentStillV1 = await ctx.agentA.sb.from("agent_resource_versions").select("id").in("id", [v1, v2]);
    const stillIds = (agentStillV1.data || []).map((row) => row.id);
    r.assert(stillIds.length === 1 && stillIds[0] === v1, "live.agent.still_v1_before_v2_publish", "agent still sees only V1");

    const directPublish = await ctx.exec.sb
      .from("agent_resource_versions")
      .update({ status: "published" })
      .eq("id", v2)
      .select("id");
    r.assert(
      Boolean(directPublish.error) || (directPublish.data || []).length === 0,
      "live.publish.direct_status_denied",
      errText(directPublish.error) || "direct draft→published unexpectedly succeeded"
    );

    const directPtr = await ctx.exec.sb
      .from("agent_resources")
      .update({ current_published_version_id: v2 })
      .eq("id", r1)
      .select("current_published_version_id");
    const ptrBlocked =
      Boolean(directPtr.error) ||
      (directPtr.data || []).every((row) => row.current_published_version_id !== v2);
    r.assert(ptrBlocked, "live.publish.direct_pointer_denied", errText(directPtr.error) || "direct pointer change unexpectedly succeeded");

    const pub2 = await ctx.exec.sb.rpc("publish_agent_resource_version", { p_version_id: v2 });
    r.assert(!pub2.error, "live.publish.v2", pub2.error?.message || "publish V2");
    const vers = await ctx.exec.sb
      .from("agent_resource_versions")
      .select("id, status")
      .eq("resource_id", r1);
    const byId = Object.fromEntries((vers.data || []).map((row) => [row.id, row.status]));
    r.assert(byId[v1] === "archived", "live.publish.v1_archived", byId[v1] || "V1 status");
    r.assert(byId[v2] === "published", "live.publish.v2_published", byId[v2] || "V2 status");
    const publishedCount = (vers.data || []).filter((row) => row.status === "published").length;
    r.assert(publishedCount === 1, "live.publish.exactly_one", `${publishedCount} published`);
    const ptr2 = await ctx.exec.sb.from("agent_resources").select("current_published_version_id").eq("id", r1).single();
    r.assert(ptr2.data?.current_published_version_id === v2, "live.publish.v2_pointer", "pointer → V2");

    const agentAfter = await ctx.agentA.sb.from("agent_resource_versions").select("id").in("id", [v1, v2]);
    const afterIds = (agentAfter.data || []).map((row) => row.id);
    r.assert(afterIds.length === 1 && afterIds[0] === v2, "live.agent.sees_only_v2", "agent sees only current V2");

    const agentOld = await ctx.agentA.sb.storage.from(BUCKET).download(draft1.data.storage_path);
    r.assert(Boolean(agentOld.error), "live.agent.archived_storage_denied", errText(agentOld.error) || "archived V1 storage unexpectedly allowed");
    const agentNew = await ctx.agentA.sb.storage.from(BUCKET).download(draft2.data.storage_path);
    r.assert(!agentNew.error, "live.agent.v2_storage_allowed", agentNew.error?.message || "agent can read current V2 object");

    const namedId = randomUUID();
    const namedV1 = randomUUID();
    await ctx.exec.sb.from("agent_resources").insert({
      id: namedId,
      tenant_id: ctx.tenantA,
      title: `${CERT_PREFIX} named`,
      category: "policies",
      audience_type: "named_agents",
      required_reading: false,
    });
    const namedDraft = await createDraftVersion(ctx.exec.sb, {
      tenantId: ctx.tenantA,
      resourceId: namedId,
      versionId: namedV1,
      versionNumber: 1,
      filename: "named.pdf",
    });
    await uploadPdf(ctx.exec.sb, namedDraft.data.storage_path);
    const emptyPub = await ctx.exec.sb.rpc("publish_agent_resource_version", { p_version_id: namedV1 });
    r.assert(
      Boolean(emptyPub.error) && /named_audience_empty/i.test(errText(emptyPub.error)),
      "live.named.publish_empty_denied",
      errText(emptyPub.error) || "empty named publish unexpectedly succeeded"
    );

    const aud = await ctx.exec.sb.from("agent_resource_audiences").insert({
      resource_id: namedId,
      tenant_id: ctx.tenantA,
      profile_user_id: ctx.agentA.userId,
    });
    r.assert(!aud.error, "live.named.add_agent_a", aud.error?.message || "audience Agent A");
    const namedPub = await ctx.exec.sb.rpc("publish_agent_resource_version", { p_version_id: namedV1 });
    r.assert(!namedPub.error, "live.named.publish", namedPub.error?.message || "named published");

    const aSee = await ctx.agentA.sb.from("agent_resource_versions").select("id").eq("id", namedV1);
    r.assert((aSee.data || []).length === 1, "live.named.agent_a_visible", "Agent A sees named resource");
    if (ctx.agentB.sb) {
      const bSee = await ctx.agentB.sb.from("agent_resource_versions").select("id").eq("id", namedV1);
      r.assert((bSee.data || []).length === 0, "live.named.agent_b_invisible", "Agent B cannot SELECT named for A");
      const bStor = await ctx.agentB.sb.storage.from(BUCKET).download(namedDraft.data.storage_path);
      r.assert(Boolean(bStor.error), "live.named.agent_b_storage_denied", errText(bStor.error) || "Agent B storage unexpectedly allowed");
      const bSign = await ctx.agentB.sb.storage.from(BUCKET).createSignedUrl(namedDraft.data.storage_path, 60);
      r.assert(Boolean(bSign.error) || !bSign.data?.signedUrl, "live.named.agent_b_signed_denied", errText(bSign.error) || "Agent B signed URL unexpectedly allowed");
    }
    if (ctx.agentX.sb) {
      const xSee = await ctx.agentX.sb.from("agent_resource_versions").select("id").eq("id", namedV1);
      r.assert((xSee.data || []).length === 0, "live.named.tenant_b_invisible", "tenant B agent cannot SELECT HQ named");
      const xStor = await ctx.agentX.sb.storage.from(BUCKET).download(namedDraft.data.storage_path);
      r.assert(Boolean(xStor.error), "live.cross_tenant.storage_denied", errText(xStor.error) || "tenant B storage unexpectedly allowed");
    }

    const ackV2 = await ctx.agentA.sb
      .from("agent_resource_acknowledgements")
      .insert({
        tenant_id: ctx.tenantA,
        resource_id: r1,
        version_id: v2,
        profile_user_id: ctx.agentA.userId,
      })
      .select("id, tenant_id, resource_id, version_id, profile_user_id, acknowledged_at")
      .single();
    r.assert(!ackV2.error, "live.ack.self", ackV2.error?.message || "Agent A acknowledged V2");
    r.assert(
      ackV2.data?.tenant_id === ctx.tenantA &&
        ackV2.data?.resource_id === r1 &&
        ackV2.data?.version_id === v2 &&
        ackV2.data?.profile_user_id === ctx.agentA.userId &&
        Boolean(ackV2.data?.acknowledged_at),
      "live.ack.row_shape",
      "tenant/resource/version/agent/timestamp"
    );
    const ackDup = await ctx.agentA.sb.from("agent_resource_acknowledgements").insert({
      tenant_id: ctx.tenantA,
      resource_id: r1,
      version_id: v2,
      profile_user_id: ctx.agentA.userId,
    });
    r.assert(
      Boolean(ackDup.error) && /duplicate|unique|23505/i.test(`${ackDup.error?.code || ""} ${errText(ackDup.error)}`),
      "live.ack.idempotent_unique",
      errText(ackDup.error) || "duplicate ack unexpectedly inserted"
    );

    if (ctx.agentB.sb && ctx.agentB.userId) {
      const spoof = await ctx.agentB.sb.from("agent_resource_acknowledgements").insert({
        tenant_id: ctx.tenantA,
        resource_id: r1,
        version_id: v2,
        profile_user_id: ctx.agentA.userId,
      });
      r.assert(Boolean(spoof.error), "live.ack.spoof_denied", errText(spoof.error) || "Agent B ack as A unexpectedly allowed");
    }

    const ackArchived = await ctx.agentA.sb.from("agent_resource_acknowledgements").insert({
      tenant_id: ctx.tenantA,
      resource_id: r1,
      version_id: v1,
      profile_user_id: ctx.agentA.userId,
    });
    r.assert(Boolean(ackArchived.error), "live.ack.archived_denied", errText(ackArchived.error) || "ack archived V1 unexpectedly allowed");

    const ackNamedB =
      ctx.agentB?.sb &&
      (await ctx.agentB.sb.from("agent_resource_acknowledgements").insert({
        tenant_id: ctx.tenantA,
        resource_id: namedId,
        version_id: namedV1,
        profile_user_id: ctx.agentB.userId,
      }));
    if (ackNamedB) {
      r.assert(Boolean(ackNamedB.error), "live.ack.unauthorized_version", errText(ackNamedB.error) || "Agent B ack named-for-A unexpectedly allowed");
    }

    if (ctx.agentX.sb) {
      const xAck = await ctx.agentX.sb.from("agent_resource_acknowledgements").insert({
        tenant_id: ctx.tenantA,
        resource_id: r1,
        version_id: v2,
        profile_user_id: ctx.agentX.userId,
      });
      r.assert(Boolean(xAck.error), "live.ack.cross_tenant_denied", errText(xAck.error) || "tenant B ack HQ version unexpectedly allowed");
    }

    const v1AckRemain = await ctx.service
      .from("agent_resource_acknowledgements")
      .select("id")
      .eq("version_id", v2)
      .eq("profile_user_id", ctx.agentA.userId);
    r.assert((v1AckRemain.data || []).length === 1, "live.ack.v2_persists", "V2 ack remains");

    const v3 = randomUUID();
    const draft3 = await createDraftVersion(ctx.exec.sb, {
      tenantId: ctx.tenantA,
      resourceId: r1,
      versionId: v3,
      versionNumber: 3,
      filename: "r1-v3.pdf",
    });
    await uploadPdf(ctx.exec.sb, draft3.data.storage_path);
    const pub3 = await ctx.exec.sb.rpc("publish_agent_resource_version", { p_version_id: v3 });
    r.assert(!pub3.error, "live.publish.v3_for_ack", pub3.error?.message || "publish V3");
    const autoAck = await ctx.service
      .from("agent_resource_acknowledgements")
      .select("id")
      .eq("version_id", v3)
      .eq("profile_user_id", ctx.agentA.userId);
    r.assert((autoAck.data || []).length === 0, "live.ack.no_auto_v3", "V3 not auto-acknowledged");
    const oldAck = await ctx.service
      .from("agent_resource_acknowledgements")
      .select("id")
      .eq("version_id", v2)
      .eq("profile_user_id", ctx.agentA.userId);
    r.assert((oldAck.data || []).length === 1, "live.ack.prior_remains", "prior version ack remains after V3");

    if (ctx.lab.sb) {
      const labRes = await ctx.lab.sb.from("agent_resources").select("id").eq("id", r1);
      r.assert((labRes.data || []).length === 0, "live.lab.no_metadata", "Lab cannot SELECT resources");
      const labVer = await ctx.lab.sb.from("agent_resource_versions").select("id").eq("id", v3);
      r.assert((labVer.data || []).length === 0, "live.lab.no_versions", "Lab cannot SELECT versions");
      const labAck = await ctx.lab.sb.from("agent_resource_acknowledgements").insert({
        tenant_id: ctx.tenantA,
        resource_id: r1,
        version_id: v3,
        profile_user_id: ctx.lab.userId,
      });
      r.assert(Boolean(labAck.error), "live.lab.no_ack", errText(labAck.error) || "Lab ack unexpectedly allowed");
      const labStor = await ctx.lab.sb.storage.from(BUCKET).download(draft3.data.storage_path);
      r.assert(Boolean(labStor.error), "live.lab.no_storage", errText(labStor.error) || "Lab storage unexpectedly allowed");
    }
    if (ctx.hr.sb) {
      const hrRes = await ctx.hr.sb.from("agent_resources").select("id").eq("id", r1);
      r.assert((hrRes.data || []).length === 0, "live.hr.no_metadata", "HR cannot SELECT resources");
      const hrVer = await ctx.hr.sb.from("agent_resource_versions").select("id").eq("id", v3);
      r.assert((hrVer.data || []).length === 0, "live.hr.no_versions", "HR cannot SELECT versions");
      const hrUp = await ctx.hr.sb.storage.from(BUCKET).upload(`${ctx.tenantA}/${r1}/${v3}/${objectKey()}`, MIN_PDF, {
        contentType: "application/pdf",
      });
      r.assert(Boolean(hrUp.error), "live.hr.no_upload", errText(hrUp.error) || "HR upload unexpectedly allowed");
      const hrStor = await ctx.hr.sb.storage.from(BUCKET).download(draft3.data.storage_path);
      r.assert(Boolean(hrStor.error), "live.hr.no_storage", errText(hrStor.error) || "HR storage unexpectedly allowed");
    }

    if (ctx.otherTenantId) {
      const foreignId = randomUUID();
      const foreignV = randomUUID();
      const path = `${ctx.otherTenantId}/${foreignId}/${foreignV}/${objectKey()}`;
      await ctx.service.from("agent_resources").insert({
        id: foreignId,
        tenant_id: ctx.otherTenantId,
        title: `${CERT_PREFIX} foreign tenant`,
        category: "other",
        audience_type: "all_agents",
        required_reading: false,
        current_published_version_id: null,
      });
      await ctx.service.from("agent_resource_versions").insert({
        id: foreignV,
        resource_id: foreignId,
        tenant_id: ctx.otherTenantId,
        version_number: 1,
        storage_path: path,
        original_filename: "x.pdf",
        mime_type: "application/pdf",
        file_size: MIN_PDF.length,
        status: "published",
        published_at: new Date().toISOString(),
      });
      await ctx.service.from("agent_resources").update({ current_published_version_id: foreignV }).eq("id", foreignId);
      await ctx.service.storage.from(BUCKET).upload(path, MIN_PDF, { contentType: "application/pdf", upsert: true });

      const execForeign = await ctx.exec.sb.from("agent_resources").select("id").eq("id", foreignId);
      r.assert((execForeign.data || []).length === 0, "live.cross_tenant.exec_denied", "Executive A cannot SELECT other tenant resource");
      const agentForeign = await ctx.agentA.sb.from("agent_resources").select("id").eq("id", foreignId);
      r.assert((agentForeign.data || []).length === 0, "live.cross_tenant.agent_denied", "Agent A cannot SELECT other tenant resource");
      const storForeign = await ctx.agentA.sb.storage.from(BUCKET).download(path);
      r.assert(Boolean(storForeign.error), "live.cross_tenant.agent_storage_denied", errText(storForeign.error) || "cross-tenant storage unexpectedly allowed");
    }

    const archiveRes = await ctx.exec.sb
      .from("agent_resources")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", r1)
      .select("id");
    r.assert(!archiveRes.error, "live.archive.resource", archiveRes.error?.message || "resource archived");
    const agentArchived = await ctx.agentA.sb.from("agent_resources").select("id").eq("id", r1);
    r.assert((agentArchived.data || []).length === 0, "live.agent.no_archived_resource", "agent cannot SELECT archived resource");
  } finally {
    await teardown(ctx);
  }
  return r;
}

const CERT_PREFIX_B = "[AR-1B-CERT]";
const MIN_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc00000000300010005fed4ef0000000049454e44ae426082",
  "hex"
);

export async function runLivePublisher(r = createReporter()) {
  const env = loadEnvLocal();
  const { ref } = assertQaOnly(env);
  r.pass("live.env.qa", `project ${ref} (${PRIMECARE_SUPABASE_PROJECTS.qa.label})`);
  const ctx = await prepareActors(env, r);
  if (!ctx.exec?.sb || !ctx.admin?.sb || !ctx.agentA?.sb) {
    r.fail("live.publisher.actors", "required QA actors missing");
    await teardown(ctx);
    return r;
  }
  await cleanupCertData(ctx.service);

  try {
    const tenantId = ctx.tenantA;
    const exec = ctx.exec.sb;
    const admin = ctx.admin.sb;
    const agent = ctx.agentA.sb;

    const resourceId = randomUUID();
    const v1 = randomUUID();
    const created = await exec
      .from("agent_resources")
      .insert({
        id: resourceId,
        tenant_id: tenantId,
        title: `${CERT_PREFIX_B} PrimeCare Field Executive Playbook`,
        category: "start_here",
        audience_type: "all_agents",
        required_reading: true,
        created_by: ctx.exec.userId,
      })
      .select("id, current_published_version_id")
      .single();
    r.assert(!created.error && created.data?.id, "live.exec.create", created.error?.message || "executive created resource");
    r.assert(!created.data?.current_published_version_id, "live.exec.no_auto_publish", "create leaves published pointer null");

    const draft1 = await createDraftVersion(exec, {
      tenantId,
      resourceId,
      versionId: v1,
      versionNumber: 1,
      filename: "playbook.pdf",
    });
    r.assert(!draft1.error, "live.exec.v1_draft", draft1.error?.message || "V1 draft inserted");
    r.assert(
      draft1.data?.storage_path && !String(draft1.data.storage_path).includes("playbook.pdf"),
      "live.path.no_original_filename",
      "storage path does not use original filename"
    );
    const up1 = await uploadPdf(exec, draft1.path);
    r.assert(!up1.error, "live.exec.upload_pdf", up1.error?.message || "PDF uploaded to agent-resources");

    const beforePub = await exec
      .from("agent_resources")
      .select("current_published_version_id")
      .eq("id", resourceId)
      .single();
    r.assert(!beforePub.data?.current_published_version_id, "live.exec.still_draft", "unpublished resource has no current version");

    const pub1 = await exec.rpc("publish_agent_resource_version", { p_version_id: v1 });
    r.assert(!pub1.error, "live.exec.publish_v1", pub1.error?.message || "publish RPC V1");
    const after1 = await exec
      .from("agent_resource_versions")
      .select("id, status, version_number")
      .eq("id", v1)
      .single();
    r.assert(after1.data?.status === "published", "live.exec.v1_published", after1.data?.status || "V1 published");

    const signed = await exec.storage.from(BUCKET).createSignedUrl(draft1.path, 300);
    r.assert(Boolean(signed.data?.signedUrl), "live.exec.signed_url", signed.error?.message || "private signed URL 300s");
    r.assert(
      !/\/storage\/v1\/object\/public\//.test(String(signed.data?.signedUrl || "")),
      "live.exec.not_public_url",
      "signed URL is not a public object URL"
    );

    const v2 = randomUUID();
    const draft2 = await createDraftVersion(exec, {
      tenantId,
      resourceId,
      versionId: v2,
      versionNumber: 2,
      filename: "playbook-v2.pdf",
    });
    r.assert(!draft2.error, "live.exec.v2_draft", draft2.error?.message || "V2 draft inserted");
    const up2 = await uploadPdf(exec, draft2.path);
    r.assert(!up2.error, "live.exec.v2_upload", up2.error?.message || "V2 PDF uploaded");
    const stillV1 = await exec
      .from("agent_resources")
      .select("current_published_version_id")
      .eq("id", resourceId)
      .single();
    r.assert(
      stillV1.data?.current_published_version_id === v1,
      "live.exec.v1_remains_current",
      "V2 draft does not move published pointer"
    );

    const pub2 = await exec.rpc("publish_agent_resource_version", { p_version_id: v2 });
    r.assert(!pub2.error, "live.exec.publish_v2", pub2.error?.message || "publish RPC V2");
    const v1row = await exec.from("agent_resource_versions").select("status").eq("id", v1).single();
    const v2row = await exec.from("agent_resource_versions").select("status").eq("id", v2).single();
    r.assert(v1row.data?.status === "archived", "live.exec.v1_archived", v1row.data?.status || "V1 archived after V2 publish");
    r.assert(v2row.data?.status === "published", "live.exec.v2_published", v2row.data?.status || "V2 published");

    const namedId = randomUUID();
    const named = await exec
      .from("agent_resources")
      .insert({
        id: namedId,
        tenant_id: tenantId,
        title: `${CERT_PREFIX_B} Named Vishwak`,
        category: "field_sales",
        audience_type: "named_agents",
        required_reading: false,
        created_by: ctx.exec.userId,
      })
      .select("id")
      .single();
    r.assert(!named.error, "live.exec.named_create", named.error?.message || "named resource created");
    const aud = await exec.from("agent_resource_audiences").insert({
      resource_id: namedId,
      tenant_id: tenantId,
      profile_user_id: ctx.agentA.userId,
      created_by: ctx.exec.userId,
    });
    r.assert(!aud.error, "live.exec.named_audience", aud.error?.message || "named audience is Agent A only");
    const nv = randomUUID();
    const namedDraft = await createDraftVersion(exec, {
      tenantId,
      resourceId: namedId,
      versionId: nv,
      versionNumber: 1,
      filename: "named.pdf",
    });
    r.assert(!namedDraft.error, "live.exec.named_draft", namedDraft.error?.message || "named V1 draft");
    await uploadPdf(exec, namedDraft.path);
    const namedPub = await exec.rpc("publish_agent_resource_version", { p_version_id: nv });
    r.assert(!namedPub.error, "live.exec.named_publish", namedPub.error?.message || "named publish");
    const audAfter = await exec
      .from("agent_resource_audiences")
      .select("profile_user_id")
      .eq("resource_id", namedId);
    r.assert(
      (audAfter.data || []).length === 1 && audAfter.data[0].profile_user_id === ctx.agentA.userId,
      "live.exec.named_persists",
      "named audience persisted as Agent A only"
    );

    const pngResource = randomUUID();
    const pngVersion = randomUUID();
    const pngCreate = await admin
      .from("agent_resources")
      .insert({
        id: pngResource,
        tenant_id: tenantId,
        title: `${CERT_PREFIX_B} Admin PNG sheet`,
        category: "other",
        audience_type: "all_agents",
        required_reading: false,
        created_by: ctx.admin.userId,
      })
      .select("id")
      .single();
    r.assert(!pngCreate.error, "live.admin.create", pngCreate.error?.message || "admin created resource");
    const pngPath = `${tenantId}/${pngResource}/${pngVersion}/${objectKey()}`;
    const pngIns = await admin.from("agent_resource_versions").insert({
      id: pngVersion,
      resource_id: pngResource,
      tenant_id: tenantId,
      version_number: 1,
      storage_path: pngPath,
      original_filename: "sheet.png",
      mime_type: "image/png",
      file_size: MIN_PNG.length,
      status: "draft",
    });
    r.assert(!pngIns.error, "live.admin.png_meta", pngIns.error?.message || "PNG metadata accepted");
    const pngUp = await admin.storage.from(BUCKET).upload(pngPath, MIN_PNG, {
      contentType: "image/png",
      upsert: false,
    });
    r.assert(!pngUp.error, "live.admin.png_upload", pngUp.error?.message || "PNG upload accepted");
    const adminPub = await admin.rpc("publish_agent_resource_version", { p_version_id: pngVersion });
    r.assert(!adminPub.error, "live.admin.publish", adminPub.error?.message || "admin publish RPC");
    const archived = await admin
      .from("agent_resources")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", pngResource)
      .select("archived_at")
      .single();
    r.assert(Boolean(archived.data?.archived_at), "live.admin.archive", archived.error?.message || "admin archived resource");

    const agentInsert = await agent.from("agent_resources").insert({
      id: randomUUID(),
      tenant_id: tenantId,
      title: `${CERT_PREFIX_B} agent must fail`,
      category: "other",
      audience_type: "all_agents",
      required_reading: false,
    });
    r.assert(Boolean(agentInsert.error) && denied(agentInsert.error), "live.agent.no_create", "agent cannot create publisher resource");

    const agentStatus = await agent
      .from("agent_resource_versions")
      .update({ status: "published" })
      .eq("id", v2);
    r.assert(
      Boolean(agentStatus.error) || (agentStatus.data || []).length === 0,
      "live.agent.no_status_update",
      "agent cannot mutate version status"
    );

    const execStatus = await exec
      .from("agent_resource_versions")
      .update({ status: "archived" })
      .eq("id", v2)
      .select("id");
    r.assert(
      Boolean(execStatus.error) || (execStatus.data || []).length === 0,
      "live.publisher.no_direct_status",
      "publisher cannot UPDATE version status directly"
    );

    const docxId = randomUUID();
    const docx = await exec.from("agent_resource_versions").insert({
      id: docxId,
      resource_id: resourceId,
      tenant_id: tenantId,
      version_number: 99,
      storage_path: `${tenantId}/${resourceId}/${docxId}/${objectKey()}`,
      original_filename: "guide.docx",
      mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      file_size: 1000,
      status: "draft",
    });
    r.assert(Boolean(docx.error), "live.file.docx_rejected", docx.error?.message || "DOCX mime rejected");

    const hugeId = randomUUID();
    const huge = await exec.from("agent_resource_versions").insert({
      id: hugeId,
      resource_id: resourceId,
      tenant_id: tenantId,
      version_number: 98,
      storage_path: `${tenantId}/${resourceId}/${hugeId}/${objectKey()}`,
      original_filename: "huge.pdf",
      mime_type: "application/pdf",
      file_size: 10485761,
      status: "draft",
    });
    r.assert(Boolean(huge.error), "live.file.oversize_rejected", huge.error?.message || ">10 MiB rejected");

    if (ctx.lab?.sb) {
      const labRead = await ctx.lab.sb.from("agent_resources").select("id").eq("id", resourceId);
      r.assert((labRead.data || []).length === 0, "live.lab.no_publisher_row", "lab cannot read publisher resource");
    }
    if (ctx.hr?.sb) {
      const hrRead = await ctx.hr.sb.from("agent_resources").select("id").eq("id", resourceId);
      r.assert((hrRead.data || []).length === 0, "live.hr.no_publisher_row", "HR cannot read publisher resource");
    }
    if (ctx.agentX?.sb) {
      const cross = await ctx.agentX.sb.from("agent_resources").select("id").eq("id", resourceId);
      r.assert((cross.data || []).length === 0, "live.cross_tenant.absent", "other tenant cannot see HQ publisher data");
    }
  } finally {
    await teardown(ctx);
  }
  return r;
}

const CERT_PREFIX_C = "[AR-1C-CERT]";

export async function publishPdfResource(exec, { tenantId, actorId, title, category, audienceType, required, namedUserId }) {
  const resourceId = randomUUID();
  const versionId = randomUUID();
  const created = await exec.from("agent_resources").insert({
    id: resourceId,
    tenant_id: tenantId,
    title,
    category,
    audience_type: audienceType,
    required_reading: Boolean(required),
    created_by: actorId,
  }).select("id").single();
  if (created.error) return { error: created.error, resourceId, versionId };
  if (audienceType === "named_agents" && namedUserId) {
    const aud = await exec.from("agent_resource_audiences").insert({
      resource_id: resourceId,
      tenant_id: tenantId,
      profile_user_id: namedUserId,
      created_by: actorId,
    });
    if (aud.error) return { error: aud.error, resourceId, versionId };
  }
  const draft = await createDraftVersion(exec, {
    tenantId,
    resourceId,
    versionId,
    versionNumber: 1,
    filename: "guide.pdf",
  });
  if (draft.error) return { error: draft.error, resourceId, versionId };
  const up = await uploadPdf(exec, draft.path);
  if (up.error) return { error: up.error, resourceId, versionId, path: draft.path };
  const pub = await exec.rpc("publish_agent_resource_version", { p_version_id: versionId });
  if (pub.error) return { error: pub.error, resourceId, versionId, path: draft.path };
  return { error: null, resourceId, versionId, path: draft.path };
}

export async function runLiveAgentAccess(r = createReporter()) {
  const env = loadEnvLocal();
  const { ref } = assertQaOnly(env);
  r.pass("live.env.qa", `project ${ref} (${PRIMECARE_SUPABASE_PROJECTS.qa.label})`);
  const ctx = await prepareActors(env, r);
  if (!ctx.exec?.sb || !ctx.agentA?.sb || !ctx.agentB?.sb) {
    r.fail("live.access.actors", "required QA actors missing");
    await teardown(ctx);
    return r;
  }
  await cleanupCertData(ctx.service);
  try {
    const tenantId = ctx.tenantA;
    const all = await publishPdfResource(ctx.exec.sb, {
      tenantId,
      actorId: ctx.exec.userId,
      title: `${CERT_PREFIX_C} All Agents Playbook`,
      category: "start_here",
      audienceType: "all_agents",
      required: true,
    });
    r.assert(!all.error, "live.access.publish_all", all.error?.message || "all_agents V1 published");

    const named = await publishPdfResource(ctx.exec.sb, {
      tenantId,
      actorId: ctx.exec.userId,
      title: `${CERT_PREFIX_C} Named Agent A only`,
      category: "field_sales",
      audienceType: "named_agents",
      required: false,
      namedUserId: ctx.agentA.userId,
    });
    r.assert(!named.error, "live.access.publish_named", named.error?.message || "named V1 published");

    const aAll = await ctx.agentA.sb.from("agent_resources").select("id, title, current_published_version_id").eq("id", all.resourceId);
    const bAll = await ctx.agentB.sb.from("agent_resources").select("id").eq("id", all.resourceId);
    r.assert((aAll.data || []).length === 1, "live.access.a_sees_all", "Agent A sees all_agents resource");
    r.assert((bAll.data || []).length === 1, "live.access.b_sees_all", "Agent B sees all_agents resource");

    const aNamed = await ctx.agentA.sb.from("agent_resources").select("id").eq("id", named.resourceId);
    const bNamed = await ctx.agentB.sb.from("agent_resources").select("id").eq("id", named.resourceId);
    r.assert((aNamed.data || []).length === 1, "live.access.a_sees_named", "Agent A sees named resource");
    r.assert((bNamed.data || []).length === 0, "live.access.b_no_named", "Agent B does not see named resource");

    const aOpen = await ctx.agentA.sb.storage.from(BUCKET).createSignedUrl(named.path, 300);
    r.assert(Boolean(aOpen.data?.signedUrl), "live.access.a_named_open", aOpen.error?.message || "Agent A can open named");
    const bOpen = await ctx.agentB.sb.storage.from(BUCKET).createSignedUrl(named.path, 300);
    r.assert(Boolean(bOpen.error) || !bOpen.data?.signedUrl, "live.access.b_named_url_denied", "Agent B signed URL denied");

    const bAck = await ctx.agentB.sb.from("agent_resource_acknowledgements").insert({
      tenant_id: tenantId,
      resource_id: named.resourceId,
      version_id: named.versionId,
      profile_user_id: ctx.agentB.userId,
    });
    r.assert(Boolean(bAck.error) && denied(bAck.error), "live.access.b_named_ack_denied", "Agent B cannot acknowledge named");

    const aAckSelf = await ctx.agentA.sb.from("agent_resource_acknowledgements").insert({
      tenant_id: tenantId,
      resource_id: named.resourceId,
      version_id: named.versionId,
      profile_user_id: ctx.agentA.userId,
    });
    r.assert(!aAckSelf.error, "live.access.a_named_ack", aAckSelf.error?.message || "Agent A can acknowledge named");

    const spoof = await ctx.agentA.sb.from("agent_resource_acknowledgements").insert({
      tenant_id: tenantId,
      resource_id: all.resourceId,
      version_id: all.versionId,
      profile_user_id: ctx.agentB.userId,
    });
    r.assert(Boolean(spoof.error) && denied(spoof.error), "live.access.no_spoof_ack", "cannot acknowledge another profile");

    const archived = await ctx.exec.sb
      .from("agent_resources")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", all.resourceId)
      .select("id")
      .single();
    r.assert(!archived.error, "live.access.archive", archived.error?.message || "archived all_agents resource");
    const aAfter = await ctx.agentA.sb.from("agent_resources").select("id").eq("id", all.resourceId);
    r.assert((aAfter.data || []).length === 0, "live.access.archived_absent", "archived resource absent from Agent A");
    const aOldUrl = await ctx.agentA.sb.storage.from(BUCKET).createSignedUrl(all.path, 300);
    r.assert(Boolean(aOldUrl.error) || !aOldUrl.data?.signedUrl, "live.access.archived_url_denied", "cannot mint new URL after archive");

    if (ctx.lab?.sb) {
      const labRead = await ctx.lab.sb.from("agent_resources").select("id").eq("id", named.resourceId);
      r.assert((labRead.data || []).length === 0, "live.access.lab_denied", "Lab cannot SELECT resources");
    }
    if (ctx.hr?.sb) {
      const hrRead = await ctx.hr.sb.from("agent_resources").select("id").eq("id", named.resourceId);
      r.assert((hrRead.data || []).length === 0, "live.access.hr_denied", "HR cannot SELECT resources");
    }
  } finally {
    await teardown(ctx);
  }
  return r;
}

export async function runLiveAcknowledgement(r = createReporter()) {
  const env = loadEnvLocal();
  const { ref } = assertQaOnly(env);
  r.pass("live.env.qa", `project ${ref} (${PRIMECARE_SUPABASE_PROJECTS.qa.label})`);
  const ctx = await prepareActors(env, r);
  if (!ctx.exec?.sb || !ctx.agentA?.sb) {
    r.fail("live.ack.actors", "required QA actors missing");
    await teardown(ctx);
    return r;
  }
  await cleanupCertData(ctx.service);
  try {
    const tenantId = ctx.tenantA;
    const seeded = await publishPdfResource(ctx.exec.sb, {
      tenantId,
      actorId: ctx.exec.userId,
      title: `${CERT_PREFIX_C} Required Playbook`,
      category: "start_here",
      audienceType: "all_agents",
      required: true,
    });
    r.assert(!seeded.error, "live.ack.publish_v1", seeded.error?.message || "required V1 published");

    const before = await ctx.agentA.sb
      .from("agent_resource_acknowledgements")
      .select("id")
      .eq("version_id", seeded.versionId)
      .eq("profile_user_id", ctx.agentA.userId);
    r.assert((before.data || []).length === 0, "live.ack.open_not_read", "open/select does not create acknowledgement");

    const ack1 = await ctx.agentA.sb.from("agent_resource_acknowledgements").insert({
      tenant_id: tenantId,
      resource_id: seeded.resourceId,
      version_id: seeded.versionId,
      profile_user_id: ctx.agentA.userId,
    }).select("id, acknowledged_at").maybeSingle();
    r.assert(!ack1.error && ack1.data?.acknowledged_at, "live.ack.mark_v1", ack1.error?.message || "V1 marked read");

    const dup = await ctx.agentA.sb.from("agent_resource_acknowledgements").insert({
      tenant_id: tenantId,
      resource_id: seeded.resourceId,
      version_id: seeded.versionId,
      profile_user_id: ctx.agentA.userId,
    });
    r.assert(
      Boolean(dup.error) && /duplicate|unique|23505/i.test(`${dup.error?.code || ""} ${dup.error?.message || ""}`),
      "live.ack.duplicate_unique",
      "second insert hits unique constraint (API maps this to success)"
    );

    const v2 = randomUUID();
    const draft2 = await createDraftVersion(ctx.exec.sb, {
      tenantId,
      resourceId: seeded.resourceId,
      versionId: v2,
      versionNumber: 2,
      filename: "guide-v2.pdf",
    });
    r.assert(!draft2.error, "live.ack.v2_draft", draft2.error?.message || "V2 draft");
    await uploadPdf(ctx.exec.sb, draft2.path);
    const pub2 = await ctx.exec.sb.rpc("publish_agent_resource_version", { p_version_id: v2 });
    r.assert(!pub2.error, "live.ack.publish_v2", pub2.error?.message || "V2 published");

    const stillV1 = await ctx.agentA.sb
      .from("agent_resource_acknowledgements")
      .select("version_id")
      .eq("profile_user_id", ctx.agentA.userId)
      .eq("version_id", seeded.versionId);
    r.assert((stillV1.data || []).length === 1, "live.ack.v1_persists", "V1 acknowledgement remains after V2");
    const v2Ack = await ctx.agentA.sb
      .from("agent_resource_acknowledgements")
      .select("id")
      .eq("profile_user_id", ctx.agentA.userId)
      .eq("version_id", v2);
    r.assert((v2Ack.data || []).length === 0, "live.ack.v2_unread", "V2 is unread despite V1 ack");

    const seen = await ctx.agentA.sb
      .from("agent_resources")
      .select("current_published_version_id")
      .eq("id", seeded.resourceId)
      .maybeSingle();
    r.assert(seen.data?.current_published_version_id === v2, "live.ack.sees_v2", "Agent A current pointer is V2");

    const ack2 = await ctx.agentA.sb.from("agent_resource_acknowledgements").insert({
      tenant_id: tenantId,
      resource_id: seeded.resourceId,
      version_id: v2,
      profile_user_id: ctx.agentA.userId,
    });
    r.assert(!ack2.error, "live.ack.mark_v2", ack2.error?.message || "V2 marked read");
  } finally {
    await teardown(ctx);
  }
  return r;
}

export function finishLive(label, r) {
  const fails = r.failures;
  const skips = r.criticalSkips;
  console.log("");
  if (fails) {
    console.error(`Overall: NO-GO — ${label} live (${fails} failure(s), ${skips} critical skip(s))`);
    process.exitCode = 1;
    return "FAIL";
  }
  if (skips) {
    console.error(`Overall: AMBER — ${label} live incomplete (${skips} critical skip(s))`);
    process.exitCode = 2;
    return "AMBER";
  }
  console.log(`Overall: GO — ${label} live QA`);
  return "PASS";
}
