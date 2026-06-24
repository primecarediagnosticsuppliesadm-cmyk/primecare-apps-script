#!/usr/bin/env node
/**
 * HQ RLS read verification across Admin / Executive / Agent / Lab roles.
 * Requires .env.local with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
 *
 * Usage:
 *   node scripts/verify-hq-rls-reads.mjs
 *   node scripts/verify-hq-rls-reads.mjs > docs/hq-audit/RLS_VERIFICATION_REPORT.md
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return {};
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

function str(v) {
  return String(v ?? "").trim();
}

const HQ_TENANT = "f168b98f-47a6-42c3-b788-24c00436fac2";

const ROLES = [
  { key: "admin", email: "qa.admin@primecare.test", password: "1234" },
  { key: "executive", email: "qa.executive@primecare.test", password: "1234" },
  {
    key: "agent",
    email: "qa.test.agent1@primecare.test",
    password: "07a2b8cb3661Aa1!",
    fallbackEmail: "qa.agent@primecare.test",
    repairEmail: "qa.test.agent1@primecare.test",
  },
  { key: "lab", email: "qa.lab@primecare.test", password: "1234" },
];

/** Canonical QA agent credentials for browser certification (see docs/supabase-functions-deploy.md). */
export const QA_AGENT_CANONICAL = {
  email: "qa.test.agent1@primecare.test",
  password: "07a2b8cb3661Aa1!",
};

async function repairAgentAuthIfNeeded(env, roleSpec) {
  if (roleSpec.key !== "agent" || !roleSpec.repairEmail) return null;

  const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: adminAuth, error: adminErr } = await admin.auth.signInWithPassword({
    email: "qa.admin@primecare.test",
    password: "1234",
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
    body: JSON.stringify({ tenantId: HQ_TENANT, email: roleSpec.repairEmail }),
  });
  const body = await res.json().catch(() => ({}));
  await admin.auth.signOut();
  return body?.data?.temporaryPassword || null;
}

const MODULES = [
  { module: "Orders", table: "orders", select: "order_id, lab_id, status", limit: 100 },
  { module: "Labs", table: "v_labs_credit", select: "lab_id, lab_name, tenant_id" },
  { module: "Collections", table: "ar_credit_control", select: "lab_id, outstanding, total_paid" },
  { module: "Inventory", table: "v_stock_dashboard", select: "product_id, product_name, current_stock" },
  { module: "Users", table: "profiles", select: "user_id, role, display_name, tenant_id" },
];

const env = loadEnvLocal();
const url = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

async function verifyRole(roleSpec) {
  const supabase = createClient(url, anonKey);
  let emailUsed = roleSpec.email;
  let passwordUsed = roleSpec.password;
  let { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: emailUsed,
    password: passwordUsed,
  });
  if (authErr && roleSpec.fallbackEmail) {
    const retry = await supabase.auth.signInWithPassword({
      email: roleSpec.fallbackEmail,
      password: passwordUsed,
    });
    auth = retry.data;
    authErr = retry.error;
    if (!authErr) emailUsed = roleSpec.fallbackEmail;
  }
  if (authErr && roleSpec.key === "agent") {
    const tempPassword = await repairAgentAuthIfNeeded(env, roleSpec);
    if (tempPassword) {
      passwordUsed = tempPassword;
      const retry = await supabase.auth.signInWithPassword({
        email: roleSpec.repairEmail || roleSpec.email,
        password: passwordUsed,
      });
      auth = retry.data;
      authErr = retry.error;
      if (!authErr) emailUsed = roleSpec.repairEmail || roleSpec.email;
    }
  }
  if (authErr) {
    return {
      role: roleSpec.key,
      email: emailUsed,
      authOk: false,
      authError: authErr.message,
      modules: [],
    };
  }

  const userId = auth.user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .maybeSingle();

  const moduleResults = [];
  const tenantScope = str(profile?.tenant_id);
  for (const mod of MODULES) {
    let query = supabase.from(mod.table).select(mod.select);
    if (mod.limit) query = query.limit(mod.limit);
    if (tenantScope && roleSpec.key !== "executive" && mod.module === "Orders") {
      query = query.eq("tenant_id", tenantScope);
    }
    const { data, error } = await query;
    moduleResults.push({
      module: mod.module,
      table: mod.table,
      rowCount: Array.isArray(data) ? data.length : 0,
      error: error?.message || null,
      ok: !error,
    });
  }

  await supabase.auth.signOut();

  return {
    role: roleSpec.key,
    email: emailUsed,
    authOk: true,
    profileRole: str(profile?.role),
    tenantId: str(profile?.tenant_id),
    modules: moduleResults,
  };
}

const results = [];
for (const roleSpec of ROLES) {
  results.push(await verifyRole(roleSpec));
}

const generatedAt = new Date().toISOString();
let failures = 0;

console.log("# HQ RLS Read Verification Report");
console.log("");
console.log(`Generated: ${generatedAt}`);
console.log(`Environment: ${url}`);
console.log("");
console.log("## Summary");
console.log("");
console.log("| Role | Auth | Profile role | Tenant | Modules OK |");
console.log("|------|------|--------------|--------|------------|");

for (const row of results) {
  const okCount = row.modules?.filter((m) => m.ok).length ?? 0;
  const total = MODULES.length;
  if (!row.authOk) failures += 1;
  for (const m of row.modules || []) {
    if (!m.ok) failures += 1;
  }
  console.log(
    `| ${row.role} | ${row.authOk ? "PASS" : "FAIL"} | ${row.profileRole || "—"} | ${row.tenantId || "—"} | ${row.authOk ? `${okCount}/${total}` : "—"} |`
  );
}

console.log("");
console.log("## Module matrix");
console.log("");
console.log("| Role | Module | Table | Rows | Status | Error |");
console.log("|------|--------|-------|------|--------|-------|");

for (const row of results) {
  if (!row.authOk) {
    console.log(`| ${row.role} | — | — | — | AUTH_FAIL | ${row.authError} |`);
    continue;
  }
  for (const m of row.modules) {
    console.log(
      `| ${row.role} | ${m.module} | ${m.table} | ${m.rowCount} | ${m.ok ? "PASS" : "FAIL"} | ${m.error || "—"} |`
    );
  }
}

console.log("");
console.log("## Expectations (QA seed)");
console.log("");
console.log("- **Admin / Executive**: broad read on orders, labs, collections, inventory, tenant users.");
console.log("- **Agent**: scoped reads (assigned labs/orders); zero rows is OK when RLS restricts.");
console.log("- **Lab**: own-lab scope on orders/collections; inventory/users may be empty or denied.");
console.log("");
console.log(`## Result: ${failures === 0 ? "PASS (no read errors)" : `FAIL (${failures} error(s))`}`);

if (failures > 0) process.exit(1);
