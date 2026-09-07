#!/usr/bin/env node
/**
 * generate-invoice-pdf CORS allowlist — static contract + optional live OPTIONS.
 *
 * Read-only. Does not generate PDFs, post payments, or mutate invoices/AR.
 *
 * Usage:
 *   node scripts/verify-generate-invoice-pdf-cors.mjs
 *   node scripts/verify-generate-invoice-pdf-cors.mjs --remote --expect=qa
 *   node scripts/verify-generate-invoice-pdf-cors.mjs --remote --expect=prod
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PRIMECARE_SUPABASE_PROJECTS } from "./lib/primecareReleaseManifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const EDGE_PATH = resolve(root, "supabase/functions/generate-invoice-pdf/index.ts");

const CANONICAL_PROD_ORIGIN = "https://app.primecarediagnostics.in";
const REQUIRED_ORIGINS = [
  CANONICAL_PROD_ORIGIN,
  "https://primecare-portal-prod.vercel.app",
  "https://primecare-portal.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];
const EVIL_ORIGIN = "https://evil.example";
const CORS_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";
const CORS_ALLOW_METHODS = "POST, OPTIONS";

const REMOTE = process.argv.includes("--remote");
const expectArg = process.argv.find((a) => a.startsWith("--expect="));
const EXPECT = String(expectArg?.slice("--expect=".length) || (REMOTE ? "qa" : "")).trim().toLowerCase();

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

function extractAllowedOrigins(src) {
  const match = src.match(/const ALLOWED_ORIGINS = new Set\(\[([\s\S]*?)\]\s*\)/);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function corsHeadersFor(allowed, origin) {
  const headers = {
    "Access-Control-Allow-Headers": CORS_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": CORS_ALLOW_METHODS,
    Vary: "Origin",
  };
  if (origin && allowed.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function loadEnvLocal() {
  const path = resolve(root, ".env.local");
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      })
  );
}

function verifyStatic() {
  assert("S-01", existsSync(EDGE_PATH), "generate-invoice-pdf edge function exists");
  const src = existsSync(EDGE_PATH) ? readFileSync(EDGE_PATH, "utf8") : "";
  const origins = extractAllowedOrigins(src);
  const allowed = new Set(origins);

  assert(
    "S-10",
    origins.includes(CANONICAL_PROD_ORIGIN),
    `canonical Production origin is allowlisted: ${CANONICAL_PROD_ORIGIN}`
  );

  for (const origin of REQUIRED_ORIGINS) {
    const id = `S-11:${origin.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "-")}`;
    assert(id, origins.includes(origin), `required origin remains: ${origin}`);
  }

  assert("S-12", !origins.includes(EVIL_ORIGIN), "arbitrary origin is not allowlisted");
  assert(
    "S-13",
    !/Access-Control-Allow-Origin["'\s:,]+?\*/.test(src) && !origins.includes("*"),
    "no wildcard Access-Control-Allow-Origin"
  );
  assert(
    "S-14",
    !/\*\.primecarediagnostics/.test(src) && !/endsWith\(["']\.primecarediagnostics/.test(src),
    "no wildcard subdomain matching"
  );
  assert(
    "S-15",
    /if\s*\(\s*origin\s*&&\s*ALLOWED_ORIGINS\.has\(\s*origin\s*\)\s*\)\s*\{[\s\S]*?Access-Control-Allow-Origin["']\]\s*=\s*origin/.test(
      src
    ),
    "Allow-Origin is set only after explicit allowlist membership"
  );
  assert(
    "S-16",
    /if\s*\(\s*req\.method\s*===\s*"OPTIONS"\s*\)/.test(src) && /corsHeadersFor\(\s*req\s*\)/.test(src),
    "OPTIONS uses corsHeadersFor"
  );
  assert(
    "S-17",
    /function jsonResponse[\s\S]*corsHeadersFor\(\s*req\s*\)/.test(src),
    "POST jsonResponse includes corsHeadersFor"
  );
  assert(
    "S-18",
    /auth\.getUser\(/.test(src) && /Bearer /.test(src) && /from\("invoices"\)/.test(src),
    "JWT + invoice RLS access gate unchanged"
  );

  const canonicalHeaders = corsHeadersFor(allowed, CANONICAL_PROD_ORIGIN);
  assert(
    "S-20",
    canonicalHeaders["Access-Control-Allow-Origin"] === CANONICAL_PROD_ORIGIN &&
      canonicalHeaders["Access-Control-Allow-Headers"] === CORS_ALLOW_HEADERS &&
      canonicalHeaders["Access-Control-Allow-Methods"] === CORS_ALLOW_METHODS,
    "simulated OPTIONS/POST headers allow canonical origin"
  );

  const vercelHeaders = corsHeadersFor(allowed, "https://primecare-portal.vercel.app");
  assert(
    "S-21",
    vercelHeaders["Access-Control-Allow-Origin"] === "https://primecare-portal.vercel.app",
    "simulated headers still allow QA Vercel origin"
  );

  const localhostHeaders = corsHeadersFor(allowed, "http://localhost:5173");
  assert(
    "S-22",
    localhostHeaders["Access-Control-Allow-Origin"] === "http://localhost:5173",
    "simulated localhost origin unchanged"
  );

  const evilHeaders = corsHeadersFor(allowed, EVIL_ORIGIN);
  assert(
    "S-23",
    evilHeaders["Access-Control-Allow-Origin"] === undefined,
    "simulated evil origin is not granted Access-Control-Allow-Origin"
  );

  const missingOrigin = corsHeadersFor(allowed, "");
  assert(
    "S-24",
    missingOrigin["Access-Control-Allow-Origin"] === undefined,
    "missing Origin is not reflected"
  );
}

function headerMap(res) {
  const out = {};
  res.headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

async function probe(url, anonKey, { method, origin, body = undefined, token = "" }) {
  const headers = {
    Origin: origin,
    apikey: anonKey,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": CORS_ALLOW_HEADERS,
  };
  if (method === "POST") {
    headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? body ?? JSON.stringify({}) : undefined,
  });
  const headersOut = headerMap(res);
  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  return { status: res.status, headers: headersOut, body: parsed, text: text.slice(0, 180) };
}

async function verifyRemote() {
  const envName = EXPECT === "prod" || EXPECT === "production" ? "prod" : "qa";
  const project = PRIMECARE_SUPABASE_PROJECTS[envName];
  const env = loadEnvLocal();
  const urlFromEnv = String(env.VITE_SUPABASE_URL || "").trim();
  const expectedHost = `https://${project.projectRef}.supabase.co`;
  const supabaseUrl =
    envName === "qa" && urlFromEnv.includes(project.projectRef) ? urlFromEnv.replace(/\/$/, "") : expectedHost;
  const anonKey = String(env.VITE_SUPABASE_ANON_KEY || "").trim();

  if (envName === "prod" && urlFromEnv.includes("zipuzmfkwwucbchlphcj")) {
    pass("R-00", "local .env.local is QA; Production probes use Production project host only");
  }

  if (envName === "qa" && !supabaseUrl.includes(project.projectRef)) {
    fail("R-01", `QA remote URL is not the QA project (${project.projectRef})`);
    return;
  }
  if (envName === "prod" && !supabaseUrl.includes(project.projectRef)) {
    fail("R-01", `Production remote URL is not the Production project (${project.projectRef})`);
    return;
  }
  if (!anonKey) {
    fail("R-02", "VITE_SUPABASE_ANON_KEY missing from .env.local (needed as apikey header only)");
    return;
  }
  if (envName === "prod") {
    fail(
      "R-02",
      "refusing to send QA anon key to Production; live Production CORS is certified from the canonical browser Origin"
    );
    return;
  }

  const fnUrl = `${supabaseUrl}/functions/v1/generate-invoice-pdf`;
  pass("R-01", `probing ${envName} generate-invoice-pdf (project ${project.projectRef})`);

  const optCanonical = await probe(fnUrl, anonKey, {
    method: "OPTIONS",
    origin: CANONICAL_PROD_ORIGIN,
  });
  assert(
    "R-10",
    optCanonical.status >= 200 &&
      optCanonical.status < 400 &&
      optCanonical.headers["access-control-allow-origin"] === CANONICAL_PROD_ORIGIN,
    `OPTIONS canonical origin allowed (HTTP ${optCanonical.status})`
  );
  assert(
    "R-11",
    String(optCanonical.headers["access-control-allow-headers"] || "").toLowerCase().includes("authorization") &&
      String(optCanonical.headers["access-control-allow-methods"] || "").toUpperCase().includes("POST"),
    "OPTIONS Allow-Headers / Allow-Methods remain correct"
  );

  const optVercel = await probe(fnUrl, anonKey, {
    method: "OPTIONS",
    origin: "https://primecare-portal.vercel.app",
  });
  assert(
    "R-12",
    optVercel.headers["access-control-allow-origin"] === "https://primecare-portal.vercel.app",
    "OPTIONS QA Vercel origin remains allowed"
  );

  const optLocal = await probe(fnUrl, anonKey, {
    method: "OPTIONS",
    origin: "http://localhost:5173",
  });
  assert(
    "R-13",
    optLocal.headers["access-control-allow-origin"] === "http://localhost:5173",
    "OPTIONS localhost origin remains allowed"
  );

  const optEvil = await probe(fnUrl, anonKey, {
    method: "OPTIONS",
    origin: EVIL_ORIGIN,
  });
  assert(
    "R-20",
    optEvil.headers["access-control-allow-origin"] !== EVIL_ORIGIN,
    `unapproved origin is not granted ACAO (saw ${optEvil.headers["access-control-allow-origin"] || "none"})`
  );

  const postNoAuth = await probe(fnUrl, anonKey, {
    method: "POST",
    origin: CANONICAL_PROD_ORIGIN,
    body: JSON.stringify({ invoiceId: "00000000-0000-4000-8000-000000000000" }),
  });
  assert(
    "R-30",
    postNoAuth.status === 401,
    `unauthenticated POST remains denied (HTTP ${postNoAuth.status})`
  );
  assert(
    "R-31",
    postNoAuth.headers["access-control-allow-origin"] === CANONICAL_PROD_ORIGIN,
    "401 POST still includes canonical Allow-Origin"
  );
  assert(
    "R-32",
    !String(postNoAuth.text || "").includes("pdf_storage_path"),
    "unauthenticated POST did not generate a PDF"
  );
}

async function main() {
  verifyStatic();
  if (REMOTE) {
    await verifyRemote();
  }
  console.log("");
  if (failed) {
    console.log(`Overall: NO-GO (${failed} check(s) failed)`);
    process.exit(1);
  }
  console.log(`Overall: GO (${results.length} checks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
