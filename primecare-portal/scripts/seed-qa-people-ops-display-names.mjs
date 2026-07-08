#!/usr/bin/env node
/**
 * QA-only People Operations display name cleanup.
 * Updates profiles.display_name / agent_name for realistic demo personas.
 *
 * Usage:
 *   node scripts/seed-qa-people-ops-display-names.mjs
 *   node scripts/seed-qa-people-ops-display-names.mjs --apply
 */
import { createServer } from "vite";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { QA_EXECUTIVE, QA_HQ_TENANT_ID } from "./qaCredentials.mjs";
import { signInWithQaCredentials } from "./qaSignIn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");

const PERSONA_NAMES = [
  { role: "agent", agent_id: "QA_AGENT_001", display_name: "QA Agent One", agent_name: "QA Agent One" },
  { role: "agent", agent_id: "QA_AGENT_002", display_name: "QA Agent Two", agent_name: "QA Agent Two" },
  { role: "executive", display_name: "QA Executive", agent_name: null },
  { role: "hr", display_name: "QA HR", agent_name: null },
  { role: "admin", display_name: "QA Admin", agent_name: null },
  { role: "agent", agent_id: "QA_WAREHOUSE_001", display_name: "QA Warehouse", agent_name: "QA Warehouse" },
  { role: "agent", agent_id: "QA_DELIVERY_001", display_name: "QA Delivery", agent_name: "QA Delivery" },
  { role: "admin", display_name: "QA Operations", agent_name: null },
];

function section(title) {
  console.log(`\n=== ${title} ===\n`);
}

async function main() {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  const auth = await signInWithQaCredentials(supabase, QA_EXECUTIVE);
  if (!auth.ok) {
    console.error("Executive auth failed:", auth.error);
    process.exit(1);
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("user_id,role,agent_id,display_name,agent_name")
    .eq("tenant_id", QA_HQ_TENANT_ID);

  if (error) {
    console.error("profiles read failed:", error.message);
    process.exit(1);
  }

  const probeLike = (profiles || []).filter((row) => {
    const name = `${row.display_name || ""} ${row.agent_name || ""}`.toLowerCase();
    return name.includes("probe") && !name.includes("qa ");
  });

  section("QA People Operations display names");
  console.log(`Profiles in tenant: ${profiles?.length || 0}`);
  console.log(`Probe-like names to review: ${probeLike.length}`);

  const updates = [];
  for (const persona of PERSONA_NAMES) {
    const match = (profiles || []).find((row) => {
      if (persona.agent_id) return row.agent_id === persona.agent_id;
      return row.role === persona.role && !updates.some((item) => item.user_id === row.user_id);
    });
    if (!match) continue;
    updates.push({
      user_id: match.user_id,
      display_name: persona.display_name,
      agent_name: persona.agent_name,
      previous: match.display_name || match.agent_name || "—",
    });
  }

  for (const row of updates) {
    console.log(`${APPLY ? "APPLY" : "DRY"}  ${row.previous} -> ${row.display_name}`);
  }

  if (!APPLY) {
    console.log("\nDry run only. Pass --apply to update QA profiles.");
    await server.close();
    return;
  }

  for (const row of updates) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: row.display_name,
        ...(row.agent_name ? { agent_name: row.agent_name } : {}),
      })
      .eq("user_id", row.user_id)
      .eq("tenant_id", QA_HQ_TENANT_ID);
    if (updateError) {
      console.error(`Update failed for ${row.user_id}:`, updateError.message);
      process.exit(1);
    }
  }

  console.log(`\nUpdated ${updates.length} QA profile display names.`);
  await server.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
