/**
 * Shared QA sign-in with agent auth repair (reset-platform-user-password).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { QA_ADMIN, QA_AGENT, QA_HQ_TENANT_ID, hydrateQaHrPasswordFromEnv } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

export function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return {};
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

async function repairAgentAuthIfNeeded(env) {
  const admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: adminAuth, error: adminErr } = await admin.auth.signInWithPassword({
    email: QA_ADMIN.email,
    password: QA_ADMIN.password,
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
    body: JSON.stringify({ tenantId: QA_HQ_TENANT_ID, email: QA_AGENT.email }),
  });
  const body = await res.json().catch(() => ({}));
  await admin.auth.signOut();
  return body?.data?.temporaryPassword || null;
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ email: string, password: string }} cred
 * @param {{ repairAgent?: boolean, fallbackEmail?: string }} [options]
 */
export async function signInWithQaCredentials(supabase, cred, options = {}) {
  const { repairAgent = true, fallbackEmail = null } = options;
  await supabase.auth.signOut();

  let email = cred.email;
  let password = cred.password;

  let { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return { ok: true, email, password };

  if (fallbackEmail) {
    const retry = await supabase.auth.signInWithPassword({
      email: fallbackEmail,
      password: cred.password,
    });
    if (!retry.error) return { ok: true, email: fallbackEmail, password: cred.password };
  }

  if (repairAgent && cred.email === QA_AGENT.email) {
    const env = loadEnvLocal();
    if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
      const tempPassword = await repairAgentAuthIfNeeded(env);
      if (tempPassword) {
        const retry = await supabase.auth.signInWithPassword({
          email: QA_AGENT.email,
          password: tempPassword,
        });
        if (!retry.error) {
          return { ok: true, email: QA_AGENT.email, password: tempPassword, repaired: true };
        }
      }
    }
  }

  return { ok: false, error: error?.message || "sign-in failed" };
}
