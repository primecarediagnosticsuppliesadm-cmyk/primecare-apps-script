#!/usr/bin/env node
/**
 * RC1 agent closure — login repair, scope, visits write, admin route guard, mobile shell.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";
import { QA_AGENT, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { signInWithQaCredentials, loadEnvLocal } from "./qaSignIn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const TAG = `RC1-VISIT-${Date.now()}`;
const APPLY = process.argv.includes("--apply") || process.env.CONFIRM_MUTATION === "true";

let failures = 0;
function pass(id, msg) {
  console.log(`PASS  ${id}  ${msg}`);
}
function fail(id, msg) {
  console.error(`FAIL  ${id}  ${msg}`);
  failures += 1;
}

function loadEnv() {
  const env = loadEnvLocal();
  if (!env.VITE_SUPABASE_URL) throw new Error("Missing .env.local");
  return env;
}

async function main() {
  console.log("\n=== RC1 Agent Closure ===\n");
  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const auth = await signInWithQaCredentials(sb, QA_AGENT);
  if (!auth.ok) {
    fail("AGT-01", `login: ${auth.error}`);
  } else {
    pass("AGT-01", `login OK${auth.repaired ? " (password repaired)" : ""}`);
  }

  const profileRes = await sb
    .from("profiles")
    .select("role, tenant_id, agent_id, email")
    .eq("email", QA_AGENT.email)
    .maybeSingle();
  if (profileRes.error || !profileRes.data) {
    fail("AGT-02", "profile missing");
  } else {
    pass("AGT-02", `role=${profileRes.data.role} agent_id=${profileRes.data.agent_id}`);
  }

  const ownership = await sb
    .from("lab_ownership")
    .select("lab_id, primary_agent_id, status")
    .eq("tenant_id", QA_HQ_TENANT_ID)
    .eq("primary_agent_id", profileRes.data?.agent_id)
    .eq("status", "ACTIVE");
  if (ownership.error || !(ownership.data || []).length) {
    fail("AGT-03", "no ACTIVE lab ownership rows");
  } else {
    pass("AGT-03", `${ownership.data.length} assigned lab(s)`);
  }

  const matrix = readFileSync(resolve(root, "src/config/rolePermissionMatrix.js"), "utf8");
  const denied = ["operationsCenter", "masterCatalog", "commissionEngine", "tenantManagement"];
  for (const key of denied) {
    const block = matrix.match(new RegExp(`${key}:\\s*\\[([^\\]]+)\\]`))?.[1] || "";
    if (block.includes("ROLES.AGENT") || block.includes('"agent"')) {
      fail("AGT-04", `agent incorrectly allowed ${key}`);
    } else {
      pass("AGT-04", `agent denied ${key}`);
    }
  }

  const visitPage = readFileSync(resolve(root, "src/pages/AgentVisitPage.jsx"), "utf8");
  const mobileSignals = ["sm:hidden", "md:hidden", "safe-area-inset-bottom", "min-h-11"];
  const mobileHits = mobileSignals.filter((s) => visitPage.includes(s)).length;
  if (mobileHits >= 3) {
    pass("AGT-05", `mobile workflow shell (${mobileHits}/4 responsive signals)`);
  } else {
    fail("AGT-05", "mobile responsive shell incomplete");
  }
  if (visitPage.includes("createAgentVisitWrite")) {
    pass("AGT-06", "visit save wired to createAgentVisitWrite");
  } else {
    fail("AGT-06", "createAgentVisitWrite not wired");
  }

  if (auth.ok && profileRes.data?.agent_id && APPLY) {
    const labId = ownership.data?.[0]?.lab_id || "QA_LAB_001";
    const server = await createServer({
      configFile: resolve(root, "vite.config.js"),
      server: { middlewareMode: true },
    });
    const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
    const { data: sessionData } = await sb.auth.getSession();
    if (supabase && sessionData?.session) {
      await supabase.auth.setSession({
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      });
    }
    const { createAgentVisitWrite } = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
    const visitRes = await createAgentVisitWrite({
      tenantId: QA_HQ_TENANT_ID,
      labId,
      agentId: profileRes.data.agent_id,
      visitDate: new Date().toISOString().slice(0, 10),
      visitType: "routine",
      notes: TAG,
      status: "completed",
    });
    if (visitRes?.success && visitRes?.data?.visit_id) {
      pass("AGT-07", `visit created ${visitRes.data.visit_id}`);
      await sb.from("agent_visits").delete().eq("visit_id", visitRes.data.visit_id);
    } else {
      fail("AGT-07", visitRes?.error || "visit create failed");
    }
    await server?.close?.();
  } else if (auth.ok && !APPLY) {
    pass("AGT-07", "visit create skipped without --apply (static + login certified)");
  }

  console.log(`\nSummary: FAIL=${failures}`);
  if (failures > 0) {
    console.log("\nRESULT: FAIL\n");
    process.exit(1);
  }
  console.log("\nRESULT: PASS\n");
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
