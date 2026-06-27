#!/usr/bin/env node
/**
 * Agent collections ownership filter — QA Gamma must appear when ownership rows are passed.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
import { QA_AGENT } from "./qaCredentials.mjs";

const AGENT_EMAIL = QA_AGENT.email;
const AGENT_PASSWORD = QA_AGENT.password;
const QA_GAMMA_LAB = "QA_LAB_003";

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

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const auth = await sb.auth.signInWithPassword({
    email: AGENT_EMAIL,
    password: AGENT_PASSWORD,
  });
  assert(!auth.error, `Agent login failed: ${auth.error?.message}`);

  const server = await createServer({
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
  });

  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  if (supabase && auth.data.session) {
    await supabase.auth.setSession({
      access_token: auth.data.session.access_token,
      refresh_token: auth.data.session.refresh_token,
    });
  }

  const { filterCollectionsForUser } = await server.ssrLoadModule(
    "/src/utils/accessFilters.js"
  );
  const { getCollectionsRead } = await server.ssrLoadModule(
    "/src/api/primecareSupabaseApi.js"
  );
  const { getAgentActiveLabOwnershipRowsRead } = await server.ssrLoadModule(
    "/src/api/labOwnershipApi.js"
  );
  const { ROLES } = await server.ssrLoadModule("/src/config/roles.js");

  const profileRes = await sb
    .from("profiles")
    .select("role, tenant_id, agent_id")
    .eq("email", AGENT_EMAIL)
    .maybeSingle();
  const currentUser = {
    role: ROLES.AGENT,
    tenantId: profileRes.data?.tenant_id,
    tenant_id: profileRes.data?.tenant_id,
    agentId: profileRes.data?.agent_id,
    agent_id: profileRes.data?.agent_id,
  };

  const ownershipRes = await getAgentActiveLabOwnershipRowsRead();
  const ownershipRows = ownershipRes?.data?.rows || [];
  assert(ownershipRows.length > 0, "Expected agent ownership rows from lab_ownership");

  const ownsGamma = ownershipRows.some(
    (r) =>
      String(r.lab_id ?? r.labId) === QA_GAMMA_LAB &&
      String(r.primary_agent_id ?? r.primaryAgentId) === String(currentUser.agent_id)
  );
  assert(ownsGamma, `Agent should own ${QA_GAMMA_LAB} via lab_ownership`);

  const collRes = await getCollectionsRead();
  const allRows = collRes?.data?.collections || [];
  assert(allRows.length > 0, "Expected collections read rows for agent tenant");

  const withoutOwnership = filterCollectionsForUser(allRows, currentUser);
  const withOwnership = filterCollectionsForUser(allRows, currentUser, ownershipRows);

  const gammaWithout = withoutOwnership.find(
    (r) => String(r.labId ?? r.lab_id) === QA_GAMMA_LAB
  );
  const gammaWith = withOwnership.find(
    (r) => String(r.labId ?? r.lab_id) === QA_GAMMA_LAB
  );

  console.log("\n=== Agent Collections Ownership Filter ===\n");
  console.log(`Ownership rows: ${ownershipRows.length}`);
  console.log(`Collections without ownership filter: ${withoutOwnership.length}`);
  console.log(`Collections with ownership filter: ${withOwnership.length}`);
  console.log(
    `QA Gamma without ownership: ${gammaWithout ? "visible" : "hidden (expected when agent_id null)"}`
  );
  console.log(
    `QA Gamma with ownership: ${gammaWith ? `visible outstanding=${gammaWith.outstandingAmount ?? gammaWith.outstanding}` : "MISSING"}`
  );

  assert(
    !gammaWithout,
    "Without ownership rows, QA Gamma should stay hidden when ar_credit_control.agent_id is null"
  );
  assert(gammaWith, "With ownership rows, QA Gamma collection must be visible");
  assert(
    Number(gammaWith.outstandingAmount ?? gammaWith.outstanding ?? 0) > 0,
    "QA Gamma outstanding should be > 0"
  );

  console.log("\nPASS — agent collections ownership fallback works\n");
  await server?.close?.();
}

main().catch((err) => {
  console.error("FAIL:", err.message);
  process.exit(1);
});
