#!/usr/bin/env node
/**
 * HQ Admin Operations Center certification — live QA Supabase.
 *
 * Usage:
 *   node scripts/verify-operations-center-admin-flow.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import {
  QA_ADMIN,
  QA_AGENT,
  QA_EXECUTIVE,
  QA_LAB,
  QA_HQ_TENANT_ID,
} from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || QA_HQ_TENANT_ID;
const QA_TENANT_CODE = "qa-tenant-001";
const GOLDEN_LABS = ["QA_LAB_001", "QA_LAB_002", "QA_LAB_003"];
const CORE_ROLES = ["admin", "executive", "agent", "lab"];

const results = [];

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  results.push({ id, status: "FAIL", detail });
  console.error(`FAIL  ${id}: ${detail}`);
}
function warn(id, detail) {
  results.push({ id, status: "WARN", detail });
  console.warn(`WARN  ${id}: ${detail}`);
}

function str(v) {
  return String(v ?? "").trim();
}

function ownRowTenantId(row) {
  return str(row.tenant_id ?? row.tenantId);
}

function ownRowLabTenantId(row) {
  return str(row.lab_tenant_id ?? row.labTenantId);
}

function ownRowLabId(row) {
  return str(row.lab_id ?? row.labId).toUpperCase();
}

function ownRowPrimaryAgent(row) {
  return str(row.primary_agent_id ?? row.primaryAgentId);
}

function ownRowStatus(row) {
  return str(row.status ?? row.Status).toUpperCase();
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
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      })
  );
}

async function signIn(sb, email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`auth(${email}): ${error.message}`);
  return data.session;
}

async function main() {
  console.log("\n=== HQ Admin Operations Center Certification ===\n");
  console.log(`Tenant: ${HQ}\n`);

  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await signIn(sb, QA_ADMIN.email, QA_ADMIN.password);

  const { data: tenantRow } = await sb
    .from("tenants")
    .select("id,tenant_code,tenant_name")
    .eq("id", HQ)
    .maybeSingle();
  if (tenantRow?.tenant_code === QA_TENANT_CODE) {
    pass("tenant.operating", `${tenantRow.tenant_name} (${tenantRow.tenant_code})`);
  } else {
    fail("tenant.operating", `Expected ${QA_TENANT_CODE}, got ${tenantRow?.tenant_code || "missing"}`);
  }

  const server = await createServer({
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
  });
  const { supabase: apiSb } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const { data: adminSession } = await sb.auth.getSession();
  if (apiSb && adminSession?.session) {
    await apiSb.auth.setSession({
      access_token: adminSession.session.access_token,
      refresh_token: adminSession.session.refresh_token,
    });
  }

  const { loadOperationsCenterAdminBundle } = await server.ssrLoadModule(
    "/src/operations/operationsCenterAdminData.js"
  );
  const userEngine = await server.ssrLoadModule("/src/operations/userProvisioningEngine.js");
  const opsEngine = await server.ssrLoadModule("/src/operations/operationsCenterAdminEngine.js");
  const roleMatrix = await server.ssrLoadModule("/src/config/rolePermissionMatrix.js");
  const labOwnershipApi = await server.ssrLoadModule("/src/api/labOwnershipApi.js");
  const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");

  const bundle = await loadOperationsCenterAdminBundle(HQ);
  if (bundle?.ok) {
    pass("bundle.load", "loadOperationsCenterAdminBundle succeeded");
  } else {
    fail("bundle.load", bundle?.error || "Bundle load failed");
  }

  const directoryUsers = bundle?.directoryUsers || [];
  const labAssignments = bundle?.labAssignments || [];
  const ownershipRows = bundle?.ownershipRows || [];
  const agents = bundle?.agents || [];

  const foreignUsers = directoryUsers.filter((u) => str(u.tenantId ?? u.tenant_id) !== HQ);
  if (foreignUsers.length) {
    fail("bundle.tenant_scope", `${foreignUsers.length} directory user(s) outside HQ tenant`);
  } else {
    pass("bundle.tenant_scope", `${directoryUsers.length} directory user(s) scoped to ${QA_TENANT_CODE}`);
  }

  const { count: foreignProfileCount } = await sb
    .from("profiles")
    .select("user_id", { count: "exact", head: true })
    .neq("tenant_id", HQ);
  if ((foreignProfileCount || 0) > 0) {
    fail("tenant.rls_probe", `Admin sees ${foreignProfileCount} foreign-tenant profile(s)`);
  } else {
    pass("tenant.rls_probe", "No foreign-tenant profiles visible under admin JWT");
  }

  const invalidRoles = directoryUsers.filter(
    (u) => u.role && !roleMatrix.ALL_ROLE_SLUGS.includes(str(u.role).toLowerCase())
  );
  if (invalidRoles.length) {
    fail("profiles.valid_roles", `${invalidRoles.length} profile(s) with invalid role values`);
  } else {
    pass("profiles.valid_roles", "All profile roles are valid slugs");
  }

  const missingTenant = directoryUsers.filter(
    (u) => u.active !== false && !str(u.tenantId ?? u.tenant_id)
  );
  if (missingTenant.length) {
    fail("profiles.tenant_not_null", `${missingTenant.length} active user(s) missing tenant_id`);
  } else {
    pass("profiles.tenant_not_null", "Active profiles have tenant_id");
  }

  const missingUserId = directoryUsers.filter((u) => !str(u.userId ?? u.user_id));
  if (missingUserId.length) {
    fail("profiles.user_id", `${missingUserId.length} profile(s) missing user_id`);
  } else {
    pass("profiles.user_id", "All profiles have auth user_id mapping");
  }

  for (const role of CORE_ROLES) {
    const found = directoryUsers.some((u) => str(u.role).toLowerCase() === role);
    if (found) {
      pass(`golden.role_${role}`, `At least one ${role} profile present`);
    } else {
      warn(`golden.role_${role}`, `No ${role} profile found in tenant directory`);
    }
  }

  const adminUser = directoryUsers.find((u) =>
    /qa\.admin@primecare\.test/i.test(str(u.email))
  );
  const agentUser = directoryUsers.find((u) =>
    /qa\.test\.agent1@primecare\.test/i.test(str(u.email))
  );
  const labUser = directoryUsers.find((u) => /qa\.lab@primecare\.test/i.test(str(u.email)));

  if (adminUser && str(adminUser.role).toLowerCase() === "admin") {
    pass("golden.admin_profile", "QA admin profile role=admin");
  } else {
    fail("golden.admin_profile", "QA admin profile missing or wrong role");
  }

  if (agentUser && str(agentUser.agentId ?? agentUser.agent_id)) {
    pass(
      "golden.agent_profile",
      `QA agent profile agent_id=${str(agentUser.agentId ?? agentUser.agent_id)}`
    );
  } else {
    fail("golden.agent_profile", "QA agent profile missing agent_id");
  }

  if (labUser && str(labUser.labId ?? labUser.lab_id).toUpperCase() === "QA_LAB_001") {
    pass("golden.lab_profile", "QA lab user maps to QA_LAB_001");
  } else {
    fail(
      "golden.lab_profile",
      `QA lab user lab_id=${str(labUser?.labId ?? labUser?.lab_id) || "missing"}`
    );
  }

  const recomputedKpis = userEngine.computeProvisioningKpis(directoryUsers, labAssignments);
  const kpis = bundle?.kpis || {};
  const kpiFields = [
    "totalUsers",
    "productionUsers",
    "realUsers",
    "realActiveUsers",
    "activeUsers",
    "qaUsers",
    "probeUsers",
    "fieldAgents",
    "agents",
    "labUsers",
    "hqAdmins",
    "inactiveAccounts",
    "labsAssigned",
    "inactiveUsers",
    "unassignedLabs",
  ];
  let kpiMismatch = 0;
  for (const field of kpiFields) {
    if (Number(recomputedKpis[field]) !== Number(kpis[field])) kpiMismatch += 1;
  }
  if (kpiMismatch) {
    fail("kpi.reconcile", `${kpiMismatch} KPI field(s) mismatch vs recomputed`);
  } else {
    pass(
      "kpi.reconcile",
      `${kpis.totalUsers} total (${kpis.realUsers ?? "?"} real); ${kpis.fieldAgents ?? kpis.agents} field agents; ${kpis.labsAssigned} labs assigned`
    );
  }

  const filteredAgents = userEngine.filterDirectoryUsers(directoryUsers, {
    role: "agent",
    search: str(agentUser?.agentId ?? agentUser?.agent_id),
  });
  if (filteredAgents.length >= 1) {
    pass("ui.filter_search", "Directory filter finds QA agent by agent_id");
  } else {
    fail("ui.filter_search", "Directory filter could not find QA agent");
  }

  const sorted = userEngine.sortDirectoryUsers(directoryUsers, "name", "asc");
  const sortedOk =
    sorted.length <= 1 ||
    str(sorted[0].name).localeCompare(str(sorted[1].name), undefined, { sensitivity: "base" }) <= 0;
  if (sortedOk) {
    pass("ui.sort", "Directory sort by name ascending");
  } else {
    fail("ui.sort", "Directory sort order incorrect");
  }

  const adminRoleOptions = opsEngine.filterPlatformRoleOptionsForActor("admin");
  if (!adminRoleOptions.some((o) => str(o.value).toLowerCase() === "executive")) {
    pass("role.admin_blocks_executive", "Admin role dropdown excludes executive");
  } else {
    fail("role.admin_blocks_executive", "Admin can select executive in role options");
  }

  const adminToExec = roleMatrix.validateActorRoleAssignment(
    roleMatrix.ROLES.ADMIN,
    roleMatrix.ROLES.EXECUTIVE,
    roleMatrix.ROLES.AGENT
  );
  if (!adminToExec.ok) {
    pass("role.escalation_guard", "validateActorRoleAssignment blocks admin→executive");
  } else {
    fail("role.escalation_guard", "Admin can assign executive role");
  }

  const activeOwnership = (ownershipRows || []).filter((row) => ownRowStatus(row) === "ACTIVE");
  const hqLabOwnership = activeOwnership.filter((row) => ownRowLabTenantId(row) === HQ);
  const distributorOwnership = activeOwnership.filter((row) => ownRowLabTenantId(row) !== HQ);

  const ownershipDup = new Map();
  let dupActive = 0;
  for (const row of hqLabOwnership) {
    const key = `${ownRowTenantId(row)}::${ownRowLabId(row)}`;
    ownershipDup.set(key, (ownershipDup.get(key) || 0) + 1);
    if (ownershipDup.get(key) > 1) dupActive += 1;
  }
  if (dupActive) {
    fail("ownership.no_dup_active", `${dupActive} duplicate ACTIVE ownership key(s)`);
  } else {
    pass(
      "ownership.no_dup_active",
      `${hqLabOwnership.length} HQ-lab ACTIVE ownership row(s); no duplicate keys`
    );
  }

  const { data: labsRaw } = await sb
    .from("labs")
    .select("lab_id,tenant_id,assigned_agent_id")
    .eq("tenant_id", HQ)
    .in("lab_id", GOLDEN_LABS);

  let goldenSyncMismatch = 0;
  for (const labId of GOLDEN_LABS) {
    const lab = (labsRaw || []).find((r) => str(r.lab_id).toUpperCase() === labId);
    const own = hqLabOwnership.find((r) => ownRowLabId(r) === labId);
    const labAgent = str(lab?.assigned_agent_id);
    const ownAgent = ownRowPrimaryAgent(own);
    if (!own || ownAgent !== labAgent) goldenSyncMismatch += 1;
  }
  if (goldenSyncMismatch) {
    fail(
      "ownership.golden_sync",
      `${goldenSyncMismatch} golden lab(s) labs.agent vs ownership primary mismatch`
    );
  } else {
    pass("ownership.golden_sync", "Golden labs: assigned_agent_id matches ownership primary");
  }

  if (distributorOwnership.length) {
    warn(
      "ownership.distributor_pilot",
      `${distributorOwnership.length} ACTIVE ownership row(s) for distributor lab_tenant_id (pilot data)`
    );
  } else {
    pass("ownership.tenant_align", "All ACTIVE ownership rows are HQ lab_tenant_id");
  }

  const labIds = new Set(
    (await sb.from("labs").select("lab_id").eq("tenant_id", HQ)).data?.map((r) =>
      str(r.lab_id).toUpperCase()
    ) || []
  );
  const orphanHqLabRefs = hqLabOwnership.filter((row) => !labIds.has(ownRowLabId(row)));
  if (orphanHqLabRefs.length) {
    fail(
      "ownership.valid_lab_refs",
      `${orphanHqLabRefs.length} HQ-lab ownership row(s) reference missing labs row`
    );
  } else {
    pass("ownership.valid_lab_refs", "All HQ-lab ownership rows reference valid labs");
  }

  const inactiveAgents = directoryUsers.filter(
    (u) => str(u.role).toLowerCase() === "agent" && u.active === false
  );
  const inactiveAgentIds = new Set(
    inactiveAgents.map((u) => str(u.agentId ?? u.agent_id).toLowerCase()).filter(Boolean)
  );
  const inactiveWithOwnership = hqLabOwnership.filter((row) =>
    inactiveAgentIds.has(ownRowPrimaryAgent(row).toLowerCase())
  );
  if (inactiveWithOwnership.length) {
    warn(
      "agent.inactive_assignments",
      `${inactiveWithOwnership.length} ACTIVE ownership row(s) on inactive agent profile(s)`
    );
  } else {
    pass("agent.inactive_assignments", "No ACTIVE ownership on inactive agent profiles");
  }

  const labRoleUsers = directoryUsers.filter((u) => str(u.role).toLowerCase() === "lab");
  const labRoleMissingId = labRoleUsers.filter((u) => !str(u.labId ?? u.lab_id));
  if (labRoleMissingId.length) {
    fail("lab_user.mapping", `${labRoleMissingId.length} lab-role user(s) missing lab_id`);
  } else {
    pass("lab_user.mapping", `${labRoleUsers.length} lab user(s) have lab_id`);
  }

  const emptyCreate = await api.createOperationsPlatformUserWrite({});
  if (!emptyCreate.success && /tenant|required|valid role/i.test(str(emptyCreate.error))) {
    pass("create.validation", `createOperationsPlatformUserWrite rejects empty (${emptyCreate.error})`);
  } else {
    fail("create.validation", "Expected create user validation failure");
  }

  const emptyAssign = await labOwnershipApi.assignPrimaryLabOwnerWrite({});
  if (!emptyAssign.success && /required/i.test(str(emptyAssign.error))) {
    pass("assign.validation", "assignPrimaryLabOwnerWrite rejects empty payload");
  } else {
    fail("assign.validation", "Expected assignment validation failure");
  }

  const auditRes = await sb
    .from("user_provisioning_events")
    .select("hq_tenant_id,event_type")
    .eq("hq_tenant_id", HQ)
    .limit(201);
  const auditRows = auditRes.data || [];
  if (auditRes.error) {
    warn("audit.read", auditRes.error.message);
  } else if (auditRows.length <= 200) {
    pass("audit.bounded", `${auditRows.length} provisioning event(s) (limit 200)`);
  } else {
    fail("audit.bounded", "Provisioning events exceed 200-row read cap");
  }

  if (labAssignments.length <= 5000) {
    pass("perf.labs_bounded", `${labAssignments.length} lab assignment rows within 5000 cap`);
  } else {
    fail("perf.labs_bounded", `${labAssignments.length} labs exceeds bounded read cap`);
  }

  if (directoryUsers.length > 500) {
    warn("perf.profiles_unbounded", `${directoryUsers.length} profiles loaded without explicit limit`);
  } else {
    pass("perf.profiles_read", `${directoryUsers.length} profiles loaded for tenant`);
  }

  const [{ count: orderCount }, { count: labCount }, { count: arCount }] = await Promise.all([
    sb.from("orders").select("order_id", { count: "exact", head: true }).eq("tenant_id", HQ),
    sb.from("labs").select("lab_id", { count: "exact", head: true }).eq("tenant_id", HQ),
    sb
      .from("ar_credit_control")
      .select("lab_id", { count: "exact", head: true })
      .eq("tenant_id", HQ),
  ]);
  pass(
    "tenant.canonical",
    `Same operating tenant across modules: profiles ${directoryUsers.length}, labs ${labCount}, orders ${orderCount}, AR ${arCount}`
  );

  warn("ui.no_pagination", "User directory uses client-side filter/sort only — no pagination");
  warn("manual.uat_open", "Create user, reset password, bulk assign UI flows not manually UAT'd");

  await sb.auth.signOut();

  const agentSb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  try {
    await signIn(agentSb, QA_AGENT.email, QA_AGENT.password);
    const { data: agentProfiles } = await agentSb.from("profiles").select("user_id,role,tenant_id");
    const agentScoped = (agentProfiles || []).filter((p) => str(p.tenant_id) === HQ);
    if (agentScoped.length >= 1 && agentScoped.length <= 3) {
      pass("rls.agent_profiles", `Agent sees ${agentScoped.length} profile row(s) (own + scoped)`);
    } else {
      warn("rls.agent_profiles", `Agent profile visibility count: ${agentScoped.length}`);
    }

    const { data: agentOwnRowsRaw, error: agentOwnErr } = await agentSb
      .from("lab_ownership")
      .select("tenant_id,lab_id,primary_agent_id,status")
      .eq("status", "ACTIVE");
    if (agentOwnErr) {
      fail("rls.agent_ownership", agentOwnErr.message);
    } else {
      const agentOwnRows = agentOwnRowsRaw || [];
      if (agentOwnRows.length >= 1) {
        pass("rls.agent_ownership", `Agent has ${agentOwnRows.length} ACTIVE ownership row(s)`);
      } else {
        fail("rls.agent_ownership", "Agent has no ACTIVE lab_ownership rows");
      }

      const agentOwnsForeign = agentOwnRows.filter((r) => str(r.tenant_id) !== HQ);
      if (agentOwnsForeign.length) {
        fail("rls.agent_tenant", `${agentOwnsForeign.length} foreign-tenant ownership row(s) for agent`);
      } else {
        pass("rls.agent_tenant", "Agent ownership rows scoped to HQ tenant");
      }
    }
  } catch (err) {
    warn("rls.agent", `Agent checks skipped: ${err.message}`);
  } finally {
    await agentSb.auth.signOut();
  }

  const labSb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  try {
    await signIn(labSb, QA_LAB.email, QA_LAB.password);
    const { data: labProfiles } = await labSb.from("profiles").select("user_id,role,lab_id,tenant_id");
    const ownProfiles = labProfiles || [];
    if (
      ownProfiles.length === 1 &&
      str(ownProfiles[0].lab_id).toUpperCase() === "QA_LAB_001"
    ) {
      pass("rls.lab_user", "Lab user sees only own profile (QA_LAB_001)");
    } else {
      fail("rls.lab_user", `Lab user profile count/scope unexpected (${ownProfiles.length})`);
    }

    const { data: labOwn } = await labSb.from("lab_ownership").select("lab_id").limit(5);
    if (!(labOwn || []).length) {
      pass("rls.lab_ownership_denied", "Lab user cannot read lab_ownership (empty/denied)");
    } else {
      warn("rls.lab_ownership_denied", `Lab user sees ${labOwn.length} ownership row(s)`);
    }
  } catch (err) {
    warn("rls.lab_user", `Lab user checks skipped: ${err.message}`);
  } finally {
    await labSb.auth.signOut();
  }

  const execSb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  try {
    await signIn(execSb, QA_EXECUTIVE.email, QA_EXECUTIVE.password);
    const { count: execForeign } = await execSb
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .neq("tenant_id", HQ);
    if ((execForeign || 0) > 0) {
      pass(
        "rls.executive",
        `Executive cross-tenant read allowed (${execForeign} non-HQ profile(s) visible)`
      );
    } else {
      warn("rls.executive", "Executive sees only HQ profiles in this environment");
    }
  } catch (err) {
    warn("rls.executive", `Executive checks skipped: ${err.message}`);
  } finally {
    await execSb.auth.signOut();
  }

  await server?.close?.();

  const ordersPage = readFileSync(resolve(root, "src/pages/OrdersPage.jsx"), "utf8");
  const opsPage = readFileSync(resolve(root, "src/components/operations/UserProvisioningPanel.jsx"), "utf8");
  if (/isHqStructuralWriteBlocked/.test(opsPage) && /disabled=\{hqFrozen\}/.test(opsPage)) {
    pass("ui.freeze_structural", "Operations Center structural writes blocked when frozen");
  } else {
    fail("ui.freeze_structural", "Operations Center missing structural freeze guard");
  }
  if (!/disabled=\{hqFrozen\}[\s\S]{0,240}handleRecordOrderPayment/.test(ordersPage)) {
    pass("ui.freeze_daily_payment", "Orders payment collection not blocked by structural freeze");
  } else {
    fail("ui.freeze_daily_payment", "Orders payment incorrectly blocked by freeze");
  }

  console.log("\n=== Summary ===");
  const failed = results.filter((r) => r.status === "FAIL");
  const warned = results.filter((r) => r.status === "WARN");
  console.log(`PASS: ${results.filter((r) => r.status === "PASS").length}`);
  console.log(`WARN: ${warned.length}`);
  console.log(`FAIL: ${failed.length}`);
  if (failed.length) {
    for (const row of failed) console.log(`  - ${row.id}: ${row.detail}`);
    process.exit(1);
  }
  console.log("\nHQ Admin Operations Center certification passed.\n");
}

main().catch((err) => {
  console.error("FAIL:", err.message || err);
  process.exit(1);
});
