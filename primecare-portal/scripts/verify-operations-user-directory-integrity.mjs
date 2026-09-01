#!/usr/bin/env node
/**
 * Operations Center user directory integrity — classification, KPIs, ownership alignment.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";
import { QA_ADMIN, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const HQ = process.env.TENANT_ID || QA_HQ_TENANT_ID;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function str(v) {
  return String(v ?? "").trim();
}

function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}

function warn(id, detail) {
  console.warn(`WARN  ${id}: ${detail}`);
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

async function loadModules(server) {
  const classification = await server.ssrLoadModule(
    "/src/operations/userDirectoryClassification.js"
  );
  const userEngine = await server.ssrLoadModule("/src/operations/userProvisioningEngine.js");
  const integrityEngine = await server.ssrLoadModule(
    "/src/operations/userDirectoryIntegrityEngine.js"
  );
  const opsEngine = await server.ssrLoadModule("/src/operations/operationsCenterAdminEngine.js");
  const adminData = await server.ssrLoadModule("/src/operations/operationsCenterAdminData.js");
  const certificationUi = await server.ssrLoadModule(
    "/src/operations/operationsCenterCertificationUi.js"
  );
  const supabaseApi = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
  return {
    classification,
    userEngine,
    integrityEngine,
    opsEngine,
    adminData,
    certificationUi,
    supabaseApi,
  };
}

function staticUiChecks() {
  const panel = readFileSync(resolve(root, "src/components/operations/UserProvisioningPanel.jsx"), "utf8");
  assert(/DIRECTORY_AUDIENCE_FILTERS/.test(panel), "audience filter wired");
  assert(/DIRECTORY_DEFAULT_AUDIENCE/.test(panel), "default directory audience filter");
  assert(/EnvironmentSummaryBanner/.test(panel), "environment summary banner");
  assert(/OperationsHealthPanel/.test(panel), "operations health panel");
  assert(/OperationalAttentionStrip/.test(panel), "operational attention strip");
  assert(/buildOperationsAttentionItems/.test(panel), "attention strip items");
  assert(/buildOperationsReadinessFooterState/.test(panel), "readiness footer state");
  assert(!/OperationsCertificationFooter/.test(panel), "certification footer removed");
  assert(!/VITE_OPS_BUILD_SHA/.test(readFileSync(resolve(root, "vite.config.js"), "utf8")), "does not invent VITE_OPS_BUILD_SHA");
  assert(/VITE_APP_COMMIT_HASH/.test(readFileSync(resolve(root, "vite.config.js"), "utf8")), "reuses VITE_APP_COMMIT_HASH");
  assert(/aria-label="Build identity"/.test(panel), "build identity visible outside Daily/Advanced gate");
  assert(/\{user\.lastLogin\}/.test(panel), "directory table renders user.lastLogin");
  const mainSrc = readFileSync(resolve(root, "src/main.jsx"), "utf8");
  assert(/exposePrimeCareBuildIdentity/.test(mainSrc), "boot exposes window.__PRIMECARE_BUILD__");
  const stampSrc = readFileSync(resolve(root, "src/utils/buildStamp.js"), "utf8");
  assert(/__PRIMECARE_BUILD__/.test(stampSrc), "DevTools handle writes public stamp only");
  assert(!/SERVICE_ROLE|anon key|ANON_KEY|access_token/i.test(stampSrc), "DevTools handle has no secrets");
  assert(/Agent Workload Health/.test(readFileSync(resolve(root, "src/components/operations/LabOwnershipPanel.jsx"), "utf8")), "agent workload health table");
  assert(/summarizeAgentWorkloadRow/.test(readFileSync(resolve(root, "src/components/operations/LabOwnershipPanel.jsx"), "utf8")), "agent workload row summary");
  assert(/IntegrityWarningsBanner/.test(panel), "actionable integrity warnings");
  assert(/Deployment Readiness/.test(readFileSync(resolve(root, "src/components/operations/PilotHardeningChecksPanel.jsx"), "utf8")), "deployment readiness panel");
  assert(/resolveDirectoryRowActions/.test(panel), "role-aware row actions");
  assert(/Production Users/.test(panel), "production users KPI");
  assert(/Not assigned/.test(panel), "not assigned badge");
  assert(/Never/.test(panel) || /formatLastLogin/.test(panel), "last login never state");
  const engineSrc = readFileSync(resolve(root, "src/operations/userProvisioningEngine.js"), "utf8");
  assert(/normalizeLastLoginTimestamp/.test(engineSrc), "last login timestamp normalizer");
  assert(engineSrc.includes("(?=[Zz+-])"), "truncates >3 fractional second digits before timezone");
  const drawer = readFileSync(resolve(root, "src/components/operations/UserDetailDrawer.jsx"), "utf8");
  assert(/formatLastLogin\(user\.lastLoginAt\)/.test(drawer), "drawer formats raw lastLoginAt once");
  assert(!/formatLastLogin\(user\?\.lastLoginAt \?\? user\?\.lastLogin\)/.test(drawer), "drawer does not reformat lastLogin label");
  const mapper = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
  assert(
    /PROFILES_IDENTITY_SELECT[\s\S]*last_login_at/.test(mapper),
    "directory select includes last_login_at"
  );
  assert(
    /last_login_at:\s*row\.last_login_at/.test(mapper),
    "mapProfilesPlatformUserRow passes last_login_at"
  );
  assert(/Probe/.test(panel), "probe badge");
  pass("UDI-10", "User Directory UI wiring");
}

async function staticEngineChecks({
  classification,
  userEngine,
  integrityEngine,
  certificationUi,
  supabaseApi,
  opsEngine,
}) {
  const { USER_DIRECTORY_CLASS, classifyDirectoryUser } = classification;
  const {
    computeProvisioningKpis,
    enrichDirectoryUsers,
    filterDirectoryUsers,
    resolveDirectoryRowActions,
    formatLastLogin,
    normalizeLastLoginTimestamp,
  } = userEngine;
  const { mapProfilesPlatformUserRow } = supabaseApi;
  const { mapPlatformUserRow } = opsEngine;
  const { computeUserDirectoryIntegrityWarnings } = integrityEngine;

  assert(
    classifyDirectoryUser({ email: "user@invalid.example.com" }) === USER_DIRECTORY_CLASS.PROBE_DEBUG,
    "probe email detected"
  );
  assert(
    classifyDirectoryUser({ email: "qa.admin@primecare.test" }) === USER_DIRECTORY_CLASS.QA_TEST,
    "qa email detected"
  );
  assert(
    classifyDirectoryUser({ email: "real.user@acme-lab.in", name: "Real User" }) === USER_DIRECTORY_CLASS.REAL,
    "real user detected"
  );

  const agentActions = resolveDirectoryRowActions({
    role: "agent",
    active: true,
    email: "a@b.com",
    loginEnabled: true,
    hasStoredEmail: true,
  });
  assert(agentActions.transferLab && agentActions.assign, "agent actions include transfer");

  const labActions = resolveDirectoryRowActions({
    role: "lab",
    active: true,
    email: "a@b.com",
    loginEnabled: true,
    hasStoredEmail: true,
  });
  assert(labActions.assignLab && !labActions.transferLab, "lab user assign lab only");

  const probeActions = resolveDirectoryRowActions(
    { role: "agent", email: "user@invalid.example.com", active: true, loginEnabled: true },
    { allowProbeActions: false }
  );
  assert(probeActions.review && probeActions.probeRestricted && !probeActions.deactivate, "probe review only");

  assert(formatLastLogin(null) === "Never", "null last login is Never");
  assert(formatLastLogin("not-a-date") === "Never", "invalid non-date last login is Never");

  const prodMicroOffset = "2026-09-01T11:50:45.321813+00:00";
  const prodMicroZ = "2026-09-01T11:50:45.321813Z";
  const prodMilliOffset = "2026-09-01T11:50:45.321+00:00";
  assert(
    normalizeLastLoginTimestamp(prodMicroOffset) === prodMilliOffset,
    "microsecond +00:00 truncates to 3 fractional digits"
  );
  assert(
    normalizeLastLoginTimestamp(prodMicroZ) === "2026-09-01T11:50:45.321Z",
    "microsecond Z truncates to 3 fractional digits"
  );
  assert(
    normalizeLastLoginTimestamp(prodMilliOffset) === prodMilliOffset,
    "millisecond +00:00 timestamp remains unchanged"
  );
  assert(formatLastLogin(prodMicroOffset) !== "Never", "microsecond +00:00 parses");
  assert(formatLastLogin(prodMicroZ) !== "Never", "microsecond Z parses");
  assert(formatLastLogin(prodMilliOffset) !== "Never", "millisecond +00:00 parses");

  const populatedAt = "2026-09-01T11:50:45.321Z";
  const mappedPopulated = mapProfilesPlatformUserRow({
    user_id: "user-vishwak",
    role: "agent",
    email: "vishwak@primecarediagnostics.in",
    last_login_at: populatedAt,
    created_at: "2026-09-01T11:00:31.089Z",
    active: true,
  });
  assert(mappedPopulated.last_login_at === populatedAt, "profile mapper keeps last_login_at");
  const platformPopulated = mapPlatformUserRow(mappedPopulated);
  assert(platformPopulated.lastLoginAt === populatedAt, "mapPlatformUserRow receives last_login_at");
  const [dirPopulated] = enrichDirectoryUsers([platformPopulated], {
    labAssignments: [],
    distributorAssignments: [],
  });
  assert(dirPopulated.lastLogin !== "Never", "populated last login is not Never");
  assert(dirPopulated.lastLoginAt === populatedAt, "directory lastLoginAt matches profile");

  const mappedEmpty = mapProfilesPlatformUserRow({
    user_id: "user-never",
    role: "agent",
    email: "never@example.com",
    last_login_at: null,
    active: true,
  });
  assert(mappedEmpty.last_login_at === null, "profile mapper keeps null last_login_at");
  const platformEmpty = mapPlatformUserRow(mappedEmpty);
  assert(platformEmpty.lastLoginAt === null, "mapPlatformUserRow keeps null last_login_at");
  const [dirEmpty] = enrichDirectoryUsers([platformEmpty], {
    labAssignments: [],
    distributorAssignments: [],
  });
  assert(dirEmpty.lastLogin === "Never", "null last login still renders Never");

  const mappedProdShape = mapProfilesPlatformUserRow({
    user_id: "user-vishwak-prod",
    role: "agent",
    email: "vishwak@primecarediagnostics.in",
    last_login_at: prodMicroOffset,
    created_at: "2026-09-01T11:00:31.089Z",
    active: true,
  });
  const [dirProdShape] = enrichDirectoryUsers([mapPlatformUserRow(mappedProdShape)], {
    labAssignments: [],
    distributorAssignments: [],
  });
  assert(dirProdShape.lastLoginAt === prodMicroOffset, "directory keeps PostgREST microsecond last_login_at");
  assert(dirProdShape.lastLogin !== "Never", "populated PostgREST timestamp never renders Never");

  const prodLiveShape = "2026-09-01T13:02:39.168204+00:00";
  const mappedLive = mapProfilesPlatformUserRow({
    user_id: "user-vishwak-live",
    role: "agent",
    email: "vishwak@primecarediagnostics.in",
    last_login_at: prodLiveShape,
    created_at: "2026-09-01T11:00:31.089Z",
    active: true,
  });
  assert(mappedLive.last_login_at === prodLiveShape, "live fixture last_login_at survives mapProfilesPlatformUserRow");
  const platformLive = mapPlatformUserRow(mappedLive);
  assert(platformLive.lastLoginAt === prodLiveShape, "live fixture lastLoginAt survives mapPlatformUserRow");
  const [dirLive] = enrichDirectoryUsers([platformLive], {
    labAssignments: [],
    distributorAssignments: [],
  });
  assert(dirLive.lastLoginAt === prodLiveShape, "live fixture lastLoginAt survives enrichDirectoryUsers");
  assert(dirLive.lastLogin !== "Never", "live production timestamp must not format as Never");

  const identityRaw = {
    user_id: "user-identity-contract",
    role: "agent",
    email: "identity@primecarediagnostics.in",
    phone: "9999999999",
    username: "identity.user",
    display_name: "Identity User",
    territory: "Guntur",
    created_at: "2026-09-01T10:00:00.000Z",
    last_login_at: prodLiveShape,
    active: true,
  };
  const mappedIdentity = mapProfilesPlatformUserRow(identityRaw);
  assert(mappedIdentity.profile_email === identityRaw.email, "identity email survives profile mapper");
  assert(mappedIdentity.phone === identityRaw.phone, "identity phone survives profile mapper");
  assert(mappedIdentity.username === identityRaw.username, "identity username survives profile mapper");
  assert(mappedIdentity.display_name === identityRaw.display_name, "identity display_name survives profile mapper");
  assert(mappedIdentity.territory === identityRaw.territory, "identity territory survives profile mapper");
  assert(mappedIdentity.created_at === identityRaw.created_at, "identity created_at survives profile mapper");
  assert(mappedIdentity.last_login_at === identityRaw.last_login_at, "identity last_login_at survives profile mapper");
  const platformIdentity = mapPlatformUserRow(mappedIdentity);
  assert(platformIdentity.email === identityRaw.email, "identity email survives platform mapper");
  assert(platformIdentity.phone === identityRaw.phone, "identity phone survives platform mapper");
  assert(platformIdentity.username === identityRaw.username, "identity username survives platform mapper");
  assert(platformIdentity.displayName === identityRaw.display_name, "identity displayName survives platform mapper");
  assert(platformIdentity.territory === identityRaw.territory, "identity territory survives platform mapper");
  assert(platformIdentity.createdAt === identityRaw.created_at, "identity createdAt survives platform mapper");
  assert(platformIdentity.lastLoginAt === identityRaw.last_login_at, "identity lastLoginAt survives platform mapper");
  pass("UDI-12", "Last Login last_login_at mapping");

  const users = [
    { userId: "1", email: "user@invalid.example.com", role: "agent", active: true },
    { userId: "2", email: "real@acme.in", role: "agent", active: true },
    { userId: "3", email: "qa.admin@primecare.test", role: "admin", active: true },
  ];
  const enriched = enrichDirectoryUsers(users, { labAssignments: [], distributorAssignments: [] });
  const kpis = computeProvisioningKpis(enriched, []);
  assert(kpis.totalUsers === 3, "total users all");
  assert(kpis.productionUsers === 1 || kpis.realUsers === 1, "production users separated");
  assert(kpis.probeDebugUsers === 1, "probe counted");
  assert(kpis.realActiveUsers === 1, "real active excludes probe/qa");

  const filtered = filterDirectoryUsers(enriched, { audience: "probe_debug" });
  assert(filtered.length === 1, "probe filter");

  const integrity = computeUserDirectoryIntegrityWarnings({
    directoryUsers: enriched,
    labAssignments: [{ labId: "L1", assignedAgentId: "AGT1", primaryAgentId: "AGT2" }],
    ownershipRows: [],
  });
  assert(Array.isArray(integrity.warnings), "integrity warnings array");

  const { buildOperationsAttentionItems, buildOperationsReadinessFooterState, formatOperationsBuildIdentity } =
    certificationUi;
  const attention = buildOperationsAttentionItems({
    labAssignments: [
      { labId: "L1", creditStatus: "HOLD", outstanding: 100, daysOverdue: 0 },
      { labId: "L2", outstanding: 50, daysOverdue: 3 },
    ],
    kpis: { unassignedLabs: 1 },
    directoryUsers: enriched,
    directoryIntegrity: integrity,
  });
  assert(attention.some((a) => a.id === "credit_hold"), "attention credit hold");
  assert(attention.some((a) => a.id === "unassigned_labs"), "attention unassigned");
  assert(!attention.some((a) => a.count === 0), "zero-count attention hidden");
  const identity = formatOperationsBuildIdentity();
  assert(typeof identity === "string" && identity.includes(" · "), "build identity formatter uses env · commit · branch");
  const footerState = buildOperationsReadinessFooterState({});
  assert(str(footerState.buildMetadata) === identity, "readiness footer exposes build identity");

  pass("UDI-11", "Classification, KPI, filter, and integrity engine");
}

async function liveChecks(bundle, modules) {
  const { userEngine, opsEngine, certificationUi } = modules;
  const { buildOperationsAttentionItems } = certificationUi;
  const { computeProvisioningKpis } = userEngine;
  const { labsForAgent } = opsEngine;
  const { classifyDirectoryUser, USER_DIRECTORY_CLASS } = modules.classification;

  const directoryUsers = bundle.directoryUsers || [];
  const labAssignments = bundle.labAssignments || [];
  const ownershipRows = bundle.ownershipRows || [];
  const integrity = bundle.directoryIntegrity || { warnings: [], summary: {} };

  const probeUsers = directoryUsers.filter(
    (u) => classifyDirectoryUser(u) === USER_DIRECTORY_CLASS.PROBE_DEBUG
  );
  pass("UDI-20", `Detected ${probeUsers.length} probe/debug user(s) in tenant`);

  const recomputed = computeProvisioningKpis(directoryUsers, labAssignments);
  for (const field of [
    "totalUsers",
    "productionUsers",
    "realUsers",
    "realActiveUsers",
    "fieldAgents",
    "labUsers",
    "hqAdmins",
    "inactiveAccounts",
    "labsAssigned",
    "inactiveUsers",
    "unassignedLabs",
  ]) {
    assert(
      Number(recomputed[field]) === Number(bundle.kpis?.[field]),
      `KPI mismatch ${field}: ${recomputed[field]} vs ${bundle.kpis?.[field]}`
    );
  }
  pass("UDI-21", `KPIs reconcile: ${recomputed.realUsers} real / ${recomputed.totalUsers} total`);

  const attention = buildOperationsAttentionItems({
    labAssignments,
    kpis: recomputed,
    directoryUsers,
    directoryIntegrity: integrity,
  });
  const unassignedCard = attention.find((item) => item.id === "unassigned_labs");
  if (unassignedCard) {
    assert(
      unassignedCard.count === recomputed.unassignedLabs,
      "attention unassigned matches KPI unassignedLabs"
    );
  }
  assert(!attention.some((item) => item.count === 0), "live attention strip hides zero counts");
  pass("UDI-21a", `Attention strip: ${attention.length} active item(s)`);

  const agents = directoryUsers.filter((u) => str(u.role).toLowerCase() === "agent");
  let mismatchCount = 0;
  for (const agent of agents) {
    const { countAgentLabsPortalAligned, countOwnershipLabsForAgent } = modules.integrityEngine;
    const fromPortal = countAgentLabsPortalAligned(agent, labAssignments, ownershipRows);
    const fromOwnership = countOwnershipLabsForAgent(agent, ownershipRows, { labAssignments });
    const fromLabs = modules.opsEngine.labsForAgent(agent, labAssignments).length;
    const reported = Number(agent.assignedLabsCount) || 0;
    if (fromPortal !== reported || fromLabs !== fromPortal || fromOwnership !== fromPortal) {
      mismatchCount += 1;
      warn(
        "UDI-22",
        `${agent.name || agent.email}: portal=${fromPortal} labs=${fromLabs} ownership=${fromOwnership} reported=${reported}`
      );
    }
  }
  if (!mismatchCount) {
    pass("UDI-22", `Agent lab counts align for ${agents.length} agent(s)`);
  }

  if (integrity.summary?.probeWithLabs > 0) {
    warn("UDI-30", `${integrity.summary.probeWithLabs} probe/debug user(s) with lab assignments`);
  } else {
    pass("UDI-30", "No probe/debug users with active lab assignments");
  }

  if (integrity.summary?.duplicateActiveOwnership > 0) {
    warn("UDI-31", `${integrity.summary.duplicateActiveOwnership} duplicate ACTIVE ownership key(s)`);
  } else {
    pass("UDI-31", "No duplicate ACTIVE ownership rows");
  }

  if (integrity.summary?.assignedVsOwnershipMismatch > 0) {
    warn("UDI-32", `${integrity.summary.assignedVsOwnershipMismatch} assigned vs ownership mismatch(es)`);
  } else {
    pass("UDI-32", "labs.assigned_agent_id aligns with ownership primary");
  }

  if (integrity.summary?.agentLabCountMismatch > 0) {
    warn("UDI-33", `${integrity.summary.agentLabCountMismatch} agent lab count mismatch(es)`);
  } else {
    pass("UDI-33", "Agent lab counts align across sources");
  }
}

async function main() {
  console.log("\n=== Operations User Directory Integrity ===\n");
  staticUiChecks();

  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await sb.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
  });
  if (error) throw new Error(`auth: ${error.message}`);

  const server = await createServer({
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
  });

  try {
    const modules = await loadModules(server);
    await staticEngineChecks(modules);

    const { supabase: apiSb } = await server.ssrLoadModule("/src/api/supabaseClient.js");
    const { data: adminSession } = await sb.auth.getSession();
    if (apiSb && adminSession?.session) {
      await apiSb.auth.setSession({
        access_token: adminSession.session.access_token,
        refresh_token: adminSession.session.refresh_token,
      });
    }

    const bundle = await modules.adminData.loadOperationsCenterAdminBundle(HQ);
    assert(bundle?.ok !== false, "bundle loads");
    await liveChecks(bundle, modules);
  } finally {
    await server.close();
  }

  console.log("\nPASS — operations user directory integrity\n");
}

main().catch((err) => {
  console.error("FAIL —", err.message || err);
  process.exit(1);
});
