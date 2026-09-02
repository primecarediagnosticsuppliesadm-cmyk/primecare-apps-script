#!/usr/bin/env node
/**
 * Operations Center agent merge — profile-wins same-auth-user dedupe.
 * Read-model only. No database writes.
 *
 * Usage:
 *   node scripts/verify-operations-center-agent-merge.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const VISHWAK_USER_ID = "685b0ff4-e8ed-40bc-8eb4-8d0dad66e7d4";
const VISHWAK_AGENT_ID = "AGT_VISHWAK_RATA_36CC";
const USER_UUID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const AGT_CANONICAL = "AGT_CANONICAL";

const results = [];
let failed = 0;

function pass(id, detail) {
  results.push({ id, status: "PASS", detail });
  console.log(`PASS  ${id}: ${detail}`);
}

function fail(id, detail) {
  failed += 1;
  results.push({ id, status: "FAIL", detail });
  console.error(`FAIL  ${id}: ${detail}`);
}

function assert(id, cond, detail) {
  if (cond) pass(id, detail);
  else fail(id, detail);
}

function profileAgent(overrides = {}) {
  return {
    id: USER_UUID,
    userId: USER_UUID,
    agentId: AGT_CANONICAL,
    name: "Canonical Agent",
    email: "canonical@example.test",
    source: "profile",
    ...overrides,
  };
}

function operationalAgent(overrides = {}) {
  return {
    id: "users-row-1",
    userId: USER_UUID,
    agentId: USER_UUID,
    name: "Canonical Agent",
    email: "canonical@example.test",
    source: "users",
    ...overrides,
  };
}

function vishwakProfileRow() {
  return {
    user_id: VISHWAK_USER_ID,
    agent_id: VISHWAK_AGENT_ID,
    display_name: "vishwak ratan sen",
    role: "agent",
    email: "vishwak@primecarediagnostics.in",
    active: true,
    tenant_id: "hq-tenant",
  };
}

function vishwakOperationalMappedRow() {
  return {
    id: "6040b0f6-c78f-4834-afbd-7556f9a092a1",
    userId: VISHWAK_USER_ID,
    agentId: VISHWAK_USER_ID,
    name: "vishwak ratan sen",
    email: "vishwak@primecarediagnostics.in",
    phone: "",
    active: true,
    createdAt: null,
    tenantId: "hq-tenant",
  };
}

async function main() {
  console.log("\n=== Operations Center agent merge (profile-wins) ===\n");

  const server = await createServer({
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
    appType: "custom",
  });

  const engine = await server.ssrLoadModule("/src/operations/operationsCenterAdminEngine.js");
  const {
    mergeAgentsByAgentId,
    composeOperationsCenterMergedAgents,
    mapOperationsAgentRow,
    platformUserToAgentRow,
    normalizeIdentityKey,
  } = engine;

  const apiSource = readFileSync(resolve(root, "src/api/primecareSupabaseApi.js"), "utf8");
  const adminDataSource = readFileSync(
    resolve(root, "src/operations/operationsCenterAdminData.js"),
    "utf8"
  );
  const engineSource = readFileSync(
    resolve(root, "src/operations/operationsCenterAdminEngine.js"),
    "utf8"
  );
  const assignModal = readFileSync(
    resolve(root, "src/components/operations/AssignLabOwnerPromptModal.jsx"),
    "utf8"
  );
  const ownershipDrawer = readFileSync(
    resolve(root, "src/components/operations/LabOwnershipDrawer.jsx"),
    "utf8"
  );
  const provisioningPanel = readFileSync(
    resolve(root, "src/components/operations/UserProvisioningPanel.jsx"),
    "utf8"
  );
  const ownershipApi = readFileSync(resolve(root, "src/api/labOwnershipApi.js"), "utf8");

  assert(
    "mapper.users.userId_from_user_code",
    /function mapUsersTableAgentRow\([\s\S]*?userId:\s*str\(row\.user_code\)/.test(apiSource),
    "mapUsersTableAgentRow preserves users.user_code as userId"
  );
  assert(
    "mapper.users.agentId_still_user_code",
    /function mapUsersTableAgentRow\([\s\S]*?agentId:\s*str\(row\.user_code\)/.test(apiSource),
    "mapUsersTableAgentRow still maps agentId from user_code (no rewrite of stored IDs)"
  );
  assert(
    "bundle.uses_compose",
    /composeOperationsCenterMergedAgents\(/.test(adminDataSource),
    "loadOperationsCenterAdminBundle uses composeOperationsCenterMergedAgents"
  );
  assert(
    "normalize.helper",
    typeof normalizeIdentityKey === "function" &&
      normalizeIdentityKey("  ABC  ") === "abc" &&
      normalizeIdentityKey(null) === "",
    "normalizeIdentityKey trims and lowercases without mutating callers"
  );

  const mappedFromUsersTable = mapOperationsAgentRow({
    id: "users-row-uuid",
    userId: VISHWAK_USER_ID,
    agentId: VISHWAK_USER_ID,
    name: "vishwak ratan sen",
    email: "vishwak@primecarediagnostics.in",
    tenantId: "hq-tenant",
  });
  assert(
    "mapper.ops.userId_survives",
    mappedFromUsersTable.userId === VISHWAK_USER_ID,
    `operational mapOperationsAgentRow keeps userId=${mappedFromUsersTable.userId}`
  );
  assert(
    "mapper.ops.source_stays_users",
    mappedFromUsersTable.source === "users" && mappedFromUsersTable.id === "users-row-uuid",
    "users-table identity does not flip source/id to profile"
  );

  const mappedFromUserCode = mapOperationsAgentRow({
    id: "users-row-uuid",
    user_code: VISHWAK_USER_ID,
    user_name: "vishwak ratan sen",
  });
  assert(
    "mapper.ops.user_code_fallback",
    mappedFromUserCode.userId === VISHWAK_USER_ID && mappedFromUserCode.source === "users",
    "raw user_code fills userId without source=profile"
  );

  const profileShape = platformUserToAgentRow({
    userId: VISHWAK_USER_ID,
    agentId: VISHWAK_AGENT_ID,
    displayName: "vishwak ratan sen",
    role: "agent",
  });
  assert(
    "shape.profile.userId",
    profileShape.userId === VISHWAK_USER_ID && profileShape.agentId === VISHWAK_AGENT_ID,
    "profile-derived agent exposes userId + canonical agentId"
  );

  // TEST 1 — same auth user, different agentId
  const test1 = mergeAgentsByAgentId(
    [profileAgent()],
    [operationalAgent()]
  );
  assert("test1.count", test1.length === 1, `same person different agentId → ${test1.length}`);
  assert(
    "test1.canonical",
    test1[0]?.agentId === AGT_CANONICAL,
    `returned agentId=${test1[0]?.agentId}`
  );

  // TEST 2 — exact same agentId; profile wins
  const test2 = mergeAgentsByAgentId(
    [profileAgent({ agentId: "AGT_001", name: "Profile Name" })],
    [operationalAgent({ agentId: "AGT_001", name: "Users Name", userId: "other-user" })]
  );
  assert("test2.count", test2.length === 1, `same agentId → ${test2.length}`);
  assert(
    "test2.profile_wins",
    test2[0]?.name === "Profile Name" && test2[0]?.source === "profile",
    "exact agentId match keeps the profile-derived row"
  );

  // TEST 3 — different people
  const test3 = mergeAgentsByAgentId(
    [profileAgent({ userId: "USER_A", agentId: "AGT_A", name: "Agent A" })],
    [operationalAgent({ userId: "USER_B", agentId: "AGT_B", name: "Agent B" })]
  );
  const test3Ids = test3.map((a) => a.agentId).sort();
  assert(
    "test3.both",
    test3.length === 2 && test3Ids[0] === "AGT_A" && test3Ids[1] === "AGT_B",
    `unrelated agents remain: ${test3Ids.join(",")}`
  );

  // TEST 4 — same display name, different identities
  const test4 = mergeAgentsByAgentId(
    [profileAgent({ userId: "USER_A", agentId: "AGT_A", name: "vishwak ratan sen" })],
    [operationalAgent({ userId: "USER_B", agentId: "AGT_B", name: "vishwak ratan sen" })]
  );
  assert(
    "test4.no_name_dedupe",
    test4.length === 2,
    `same display name with different identities → ${test4.length}`
  );

  // TEST 5 — missing operational auth identity, unique agentId
  const test5 = mergeAgentsByAgentId(
    [profileAgent()],
    [operationalAgent({ userId: "", agentId: "OPS_ORPHAN_001", name: "Orphan Ops" })]
  );
  assert(
    "test5.orphan_retained",
    test5.length === 2 && test5.some((a) => a.agentId === "OPS_ORPHAN_001"),
    "operational row with no auth identity and unique agentId remains"
  );

  // TEST 6 — Vishwak canonical ID
  const test6 = mergeAgentsByAgentId(
    [
      profileAgent({
        userId: VISHWAK_USER_ID,
        agentId: VISHWAK_AGENT_ID,
        name: "vishwak ratan sen",
      }),
    ],
    [
      operationalAgent({
        userId: VISHWAK_USER_ID,
        agentId: VISHWAK_USER_ID,
        name: "vishwak ratan sen",
      }),
    ]
  );
  assert("test6.count", test6.length === 1, `Vishwak merge count=${test6.length}`);
  assert(
    "test6.canonical_id",
    test6[0]?.agentId === VISHWAK_AGENT_ID,
    `agentId=${test6[0]?.agentId}`
  );
  assert(
    "test6.not_auth_uuid",
    test6[0]?.agentId !== VISHWAK_USER_ID,
    "canonical agentId is not the auth UUID"
  );

  // TEST 7 — name sort preserved
  const test7 = mergeAgentsByAgentId(
    [profileAgent({ userId: "USER_Z", agentId: "AGT_Z", name: "Zeta Agent" })],
    [operationalAgent({ userId: "USER_A", agentId: "AGT_A", name: "Alpha Agent" })]
  );
  assert(
    "test7.sort",
    test7.length === 2 && test7[0]?.name === "Alpha Agent" && test7[1]?.name === "Zeta Agent",
    `sorted names: ${test7.map((a) => a.name).join(" | ")}`
  );

  // TEST 8 — Production Agent-style unrelated operational row
  const test8 = mergeAgentsByAgentId(
    [
      profileAgent({
        userId: VISHWAK_USER_ID,
        agentId: VISHWAK_AGENT_ID,
        name: "vishwak ratan sen",
      }),
    ],
    [
      operationalAgent({
        userId: "prod-agent-auth",
        agentId: "PROD_AGENT_001",
        name: "Production Agent",
      }),
    ]
  );
  assert(
    "test8.both",
    test8.length === 2 &&
      test8.some((a) => a.agentId === VISHWAK_AGENT_ID) &&
      test8.filter((a) => a.agentId === "PROD_AGENT_001").length === 1,
    "Vishwak + Production Agent both remain once"
  );

  // Integration: compose path used by loadOperationsCenterAdminBundle
  const composed = composeOperationsCenterMergedAgents(
    [
      vishwakProfileRow(),
      {
        user_id: "prod-agent-auth",
        agent_id: "PROD_AGENT_001",
        display_name: "Production Agent",
        role: "agent",
        email: "agent@primecare.local",
        active: true,
        tenant_id: "hq-tenant",
      },
    ],
    [
      vishwakOperationalMappedRow(),
      {
        id: "users-prod-agent",
        userId: "unrelated-ops-user",
        agentId: "OPS_ONLY_009",
        name: "Ops Only Agent",
        email: "ops-only@example.test",
        active: true,
        tenantId: "hq-tenant",
      },
    ]
  );
  const vishwakHits = composed.agents.filter(
    (a) =>
      a.userId === VISHWAK_USER_ID ||
      a.agentId === VISHWAK_AGENT_ID ||
      a.agentId === VISHWAK_USER_ID
  );
  assert(
    "compose.vishwak_once",
    vishwakHits.length === 1 && vishwakHits[0].agentId === VISHWAK_AGENT_ID,
    `bundle compose Vishwak count=${vishwakHits.length} agentId=${vishwakHits[0]?.agentId}`
  );
  assert(
    "compose.unrelated_ops",
    composed.agents.some((a) => a.agentId === "OPS_ONLY_009"),
    "unrelated operational-only agent remains in compose output"
  );
  assert(
    "compose.prod_agent",
    composed.agents.filter((a) => a.agentId === "PROD_AGENT_001").length === 1,
    "Production Agent remains exactly once"
  );

  assert(
    "writes.assign_modal_uses_agentId",
    /value=\{a\.agentId\}/.test(assignModal) && /primaryAgentId/.test(assignModal),
    "Assign primary owner still writes selected agentId"
  );
  assert(
    "writes.ownership_drawer_uses_agentId",
    /value=\{a\.agentId\}/.test(ownershipDrawer),
    "Lab Ownership drawer still binds option value to agentId"
  );
  assert(
    "writes.provisioning_uses_agentId",
    /value=\{a\.agentId\}/.test(provisioningPanel),
    "UserProvisioningPanel assign/transfer still uses agentId"
  );
  assert(
    "writes.ownership_api_untouched_rpc",
    /p_primary_agent_id:\s*primaryAgentId/.test(ownershipApi),
    "assignLabOwnership still persists selected primaryAgentId"
  );
  assert(
    "merge.no_name_key",
    !/localeCompare[\s\S]{0,80}byAgentId\.set/.test(engineSource) &&
      /authUserIdentityKey/.test(engineSource),
    "merge indexes auth identity, not display name"
  );

  await server.close();

  const passed = results.filter((r) => r.status === "PASS").length;
  console.log(`\n${passed} PASS / ${failed} FAIL\n`);
  if (failed) {
    process.exit(1);
  }
  console.log("Operations Center agent merge assertions passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
