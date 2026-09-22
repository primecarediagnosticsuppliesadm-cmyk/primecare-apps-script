/**
 * Node ESM loader: map "@/…" to primecare-portal/src and stub Vite env.
 * Used by static certifiers that import portal modules outside Vite.
 */
import { existsSync } from "node:fs";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const portalRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../..");

function candidate(rel) {
  const base = resolvePath(portalRoot, "src", rel);
  if (existsSync(base)) return base;
  if (!extname(base) && existsSync(`${base}.js`)) return `${base}.js`;
  if (!extname(base) && existsSync(`${base}.jsx`)) return `${base}.jsx`;
  return base;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    return { url: pathToFileURL(candidate(specifier.slice(2))).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.includes("/src/config/environment.js")) {
    return {
      format: "module",
      shortCircuit: true,
      source: `
        export const APP_ENV = "test";
        export const IS_DEV = true;
        export const IS_QA = false;
        export const IS_PROD = false;
        export const ALLOW_LEGACY_APPS_SCRIPT = false;
        export const ALLOW_EXPERIMENTAL_MODULES = false;
        export const REQUIRE_SUPABASE_AUTH = false;
        export const QA_DIAGNOSTICS_ENABLED = false;
        export const AGENT_TASK_COMPLETION_ENABLED = false;
        export const LOGISTICS_DELIVERY_CHARGE_FINANCE_ENABLED = false;
      `,
    };
  }
  return nextLoad(url, context);
}
