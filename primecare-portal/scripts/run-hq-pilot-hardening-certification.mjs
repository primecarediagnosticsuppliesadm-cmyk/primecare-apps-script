#!/usr/bin/env node
/**
 * HQ Pilot Hardening certification — executive session + SQL probes.
 * Usage: node scripts/run-hq-pilot-hardening-certification.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createServer } from "vite";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const OUT = resolve(root, "docs/hq-certification/HQ_PILOT_HARDENING_CERTIFICATION.md");
const HQ = "f168b98f-47a6-42c3-b788-24c00436fac2";

function loadEnv() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) throw new Error("Missing .env.local");
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

function queryTempAnonCount() {
  try {
    const dry = execSync("supabase db dump --linked --dry-run 2>/dev/null", {
      cwd: root,
      encoding: "utf8",
    });
    const exports = {};
    for (const line of dry.split("\n")) {
      const m = line.match(/^export (PG\w+)="([^"]*)"/);
      if (m) exports[m[1]] = m[2];
    }
    const sql = `SELECT COUNT(*)::int AS n FROM pg_policies WHERE schemaname='public' AND policyname ILIKE 'temp_anon%' AND tablename IN ('orders','payments','inventory','inventory_ledger','ar_credit_control','labs','lab_ownership');`;
    const out = execSync(`psql -t -A -c "${sql}"`, {
      env: { ...process.env, ...exports },
      encoding: "utf8",
    });
    return Number(out.trim()) || 0;
  } catch {
    return null;
  }
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({
    email: "qa.executive@primecare.test",
    password: "1234",
  });
  if (error) throw new Error(`Executive auth failed: ${error.message}`);

  const userId = data.user.id;
  const { data: profile } = await sb
    .from("profiles")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  const currentUser = {
    id: userId,
    tenantId: profile?.tenant_id,
    role: profile?.role || "executive",
  };

  const server = await createServer({
    configFile: resolve(root, "vite.config.js"),
    server: { middlewareMode: true },
  });
  const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
  if (supabase) {
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  }

  const mod = await server.ssrLoadModule("/src/readiness/pilotHardeningChecks.js");
  await server.close();

  const tempAnonPolicyCount = queryTempAnonCount();
  const bundle = await mod.loadPilotHardeningCheckData(currentUser, {
    tenantId: HQ,
    hqTenantId: HQ,
  });
  bundle.rlsProbe = { ...(bundle.rlsProbe || {}), tempAnonPolicyCount };

  const result = mod.buildPilotHardeningChecks({
    ...bundle,
    distributorId: "",
    tenantId: HQ,
  });

  const failChecks = result.checks.filter((c) => c.status === "FAIL");
  const warnChecks = result.checks.filter((c) => c.status === "WARN");
  const criticalWarn = warnChecks.filter((c) =>
    ["rls_active", "labs_owned", "ownership_active"].includes(c.id)
  );
  const pass = failChecks.length === 0 && criticalWarn.length === 0;

  const lines = [
    "# HQ Pilot Hardening Certification",
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Tenant:** ${HQ}`,
    `**Actor:** qa.executive@primecare.test`,
    "",
    `## Result: ${pass ? "PASS" : "FAIL"}`,
    "",
    `**Aggregate status:** ${result.status}`,
    "",
    "### Checks",
    "",
    "| ID | Label | Status | Detail |",
    "|----|-------|--------|--------|",
    ...result.checks.map(
      (c) => `| ${c.id} | ${c.label} | ${c.status} | ${c.detail} |`
    ),
    "",
    "### Summary",
    "",
    `- Labs: ${result.summary?.labCount ?? 0}`,
    `- Unassigned: ${result.summary?.unassignedLabs ?? 0}`,
    `- Agents: ${result.summary?.agentCount ?? 0}`,
    `- Active contracts: ${result.summary?.activeContractCount ?? 0}`,
    `- Qualified labs: ${result.summary?.qualifiedLabCount ?? 0}`,
    `- SKUs in stock: ${result.summary?.skusInStock ?? 0}`,
    `- temp_anon policies: ${tempAnonPolicyCount ?? "unknown"}`,
    "",
  ];

  if (failChecks.length) {
    lines.push("### FAIL findings", "");
    for (const c of failChecks) {
      lines.push(`- **${c.id}**: ${c.detail} — ${(c.missingItems || []).join("; ")}`);
    }
    lines.push("");
  }
  if (criticalWarn.length) {
    lines.push("### Critical warnings", "");
    for (const c of criticalWarn) {
      lines.push(`- **${c.id}**: ${c.detail}`);
    }
    lines.push("");
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join("\n"));
  console.log(lines.join("\n"));
  await server.close();
  await sb.auth.signOut();
  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
