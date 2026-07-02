#!/usr/bin/env node
/**
 * Measure projection adapter reads vs transactional baseline.
 * Usage: node scripts/measure-projection-reads.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { QA_ADMIN } from "./qaCredentials.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

async function timed(label, fn) {
  const t0 = performance.now();
  const res = await fn();
  const ms = Math.round(performance.now() - t0);
  return { label, ms, ok: res?.success !== false, error: res?.error };
}

loadEnv();

console.log("\n=== Projection read performance ===\n");

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "error",
});
const { supabase } = await server.ssrLoadModule("/src/api/supabaseClient.js");
const api = await server.ssrLoadModule("/src/api/primecareSupabaseApi.js");
const adapters = await server.ssrLoadModule("/src/api/projectionReadAdapters.js");
await server.close();

await supabase.auth.signInWithPassword({
  email: QA_ADMIN.email,
  password: QA_ADMIN.password,
});

const rows = [];
rows.push(await timed("getOrdersRead (transactional)", () => api.getOrdersRead({ force: true })));
rows.push(
  await timed("readOrdersListV1 (projection)", () => adapters.readOrdersListV1({ force: true }))
);
rows.push(
  await timed("getCollectionsRead (transactional)", () => api.getCollectionsRead({ force: true }))
);
rows.push(
  await timed("readLabReceivablesListV1 (projection)", () =>
    adapters.readLabReceivablesListV1({ force: true })
  )
);

console.log("| API | ms | status |");
console.log("|-----|-----|--------|");
for (const r of rows) {
  console.log(`| ${r.label} | ${r.ms} | ${r.ok ? "OK" : r.error || "FAIL"} |`);
}
console.log("");
