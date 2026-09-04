#!/usr/bin/env node
/**
 * STAB-1 client stability — stale-chunk recovery, auth apply generation,
 * profile-read timeout, NonPilotReleaseScreen crash path.
 *
 * Read-only. No database writes.
 *
 * Usage:
 *   node scripts/verify-stab-1-client-stability.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTH_PROFILE_FETCH_TIMEOUT_MS,
  createAuthApplyGate,
  runAuthApply,
  withTimeout,
} from "../src/utils/authSessionApply.js";
import {
  CHUNK_RELOAD_GUARD_KEY,
  clearChunkLoadRecoveryGuard,
  isChunkLoadError,
  recoverFromChunkLoadError,
} from "../src/utils/chunkLoadRecovery.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

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

function readSrc(rel) {
  return readFileSync(resolve(root, rel), "utf8");
}

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    removeItem(key) {
      delete data[key];
    },
    _data: data,
  };
}

function namedError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

async function main() {
  assert(
    "chunk-1",
    isChunkLoadError(namedError("ChunkLoadError", "Loading chunk 12 failed")),
    "ChunkLoadError is recognized"
  );
  assert(
    "chunk-2",
    isChunkLoadError(new Error("Failed to fetch dynamically imported module: /assets/foo.js")),
    "Failed to fetch dynamically imported module is recognized"
  );
  assert(
    "chunk-2b",
    isChunkLoadError(new Error("Importing a module script failed.")),
    "Importing a module script failed is recognized"
  );
  assert(
    "chunk-3",
    !isChunkLoadError(new Error("Cannot read foo")),
    "ordinary Error(Cannot read foo) is not a chunk error"
  );
  assert(
    "chunk-3b",
    !isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')")),
    "generic render TypeError is not a chunk error"
  );

  {
    const storage = memoryStorage();
    let reloads = 0;
    const first = recoverFromChunkLoadError(namedError("ChunkLoadError", "Loading chunk a failed"), {
      storage,
      reload: () => {
        reloads += 1;
      },
    });
    assert("chunk-4", first === true && reloads === 1, "first chunk failure triggers reload");
    assert(
      "chunk-4b",
      storage.getItem(CHUNK_RELOAD_GUARD_KEY) === "1",
      "guard is set after first reload"
    );

    const second = recoverFromChunkLoadError(namedError("ChunkLoadError", "Loading chunk a failed"), {
      storage,
      reload: () => {
        reloads += 1;
      },
    });
    assert("chunk-5", second === false && reloads === 1, "second failure with guard does not reload");

    clearChunkLoadRecoveryGuard(storage);
    assert(
      "chunk-6",
      storage.getItem(CHUNK_RELOAD_GUARD_KEY) == null,
      "guard cleanup removes the loop key"
    );

    const generic = recoverFromChunkLoadError(new Error("Cannot read foo"), {
      storage,
      reload: () => {
        reloads += 1;
      },
    });
    assert("chunk-6b", generic === false && reloads === 1, "generic errors never reload");
  }

  {
    const gate = createAuthApplyGate();
    let currentUser = null;
    let olderFailed = false;
    let newerApplied = false;

    const older = runAuthApply({
      gate,
      applyFn: () =>
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("stale profile failed")), 40);
        }),
      onSuccess: (user) => {
        currentUser = user;
      },
      onFailure: () => {
        olderFailed = true;
        currentUser = null;
      },
    });

    await new Promise((r) => setTimeout(r, 5));

    const newer = runAuthApply({
      gate,
      applyFn: async () => ({ id: "newer-user", role: "admin" }),
      onSuccess: (user) => {
        newerApplied = true;
        currentUser = user;
      },
      onFailure: () => {
        currentUser = null;
      },
    });

    const newerResult = await newer;
    const olderResult = await older;
    assert("auth-7-8", newerApplied && newerResult.status === "applied", "newer apply succeeds");
    assert(
      "auth-9-10",
      olderResult.status === "stale" && olderFailed === false && currentUser?.id === "newer-user",
      "older failed apply does not wipe newer currentUser"
    );
  }

  {
    const started = Date.now();
    let timedOut = false;
    try {
      await withTimeout(new Promise(() => {}), 40, "Profile lookup timed out. Refresh the page and try again.");
    } catch (error) {
      timedOut = /timed out/i.test(error?.message || "");
    }
    const elapsed = Date.now() - started;
    assert("auth-11", timedOut && elapsed >= 35 && elapsed < 1000, "profile timeout rejects instead of hanging");
    assert(
      "auth-11b",
      AUTH_PROFILE_FETCH_TIMEOUT_MS >= 10000 && AUTH_PROFILE_FETCH_TIMEOUT_MS <= 15000,
      `bootstrap profile timeout is ${AUTH_PROFILE_FETCH_TIMEOUT_MS}ms (10–15s)`
    );
  }

  const authSrc = readSrc("src/context/AuthContext.jsx");
  const tokenBlock = authSrc.match(/if \(event === "TOKEN_REFRESHED"\) \{[\s\S]*?return;[\s\S]*?\}/);
  assert(
    "auth-12",
    Boolean(tokenBlock) &&
      tokenBlock[0].includes("setAuthToken") &&
      !tokenBlock[0].includes("applySupabaseSession"),
    "TOKEN_REFRESHED updates token only and does not full-apply"
  );
  assert(
    "auth-12b",
    authSrc.includes("authToken intentionally omitted") &&
      authSrc.includes("re-bootstrapping would set authLoading=true"),
    "bootstrap deps still omit authToken to avoid shell remount"
  );
  assert(
    "auth-13",
    authSrc.includes('throw new Error("Your PrimeCare profile is inactive. Contact an administrator.")'),
    "inactive-profile fail-closed is unchanged"
  );
  assert(
    "auth-14",
    authSrc.includes('throw new Error("Your PrimeCare role is not authorized for pilot access.")') &&
      authSrc.includes("NON_PILOT_RELEASE_MESSAGE"),
    "unauthorized-role fail-closed is unchanged"
  );
  assert(
    "auth-15",
    /const login = useCallback\(async \(\{ loginId, password \}\) => \{[\s\S]*applySupabaseSession\(data\?\.session \|\| null, \{ recordLastLogin: true \}\)/.test(
      authSrc
    ),
    "successful login still applies the Supabase session"
  );
  assert(
    "auth-15b",
    authSrc.includes("createAuthApplyGate") &&
      authSrc.includes("gate.begin()") &&
      authSrc.includes("gate.isCurrent(generation)") &&
      authSrc.includes("withTimeout") &&
      authSrc.includes("AUTH_PROFILE_FETCH_TIMEOUT_MS"),
    "applySupabaseSession uses generation + profile timeout"
  );
  {
    const listenerCatch = authSrc.match(
      /applySupabaseSession\(session, \{ recordLastLogin \}\)\.catch\(\(err\) => \{[\s\S]*?\}\);/
    );
    assert(
      "auth-15c",
      Boolean(listenerCatch) && !listenerCatch[0].includes("setCurrentUser(null)"),
      "SIGNED_IN listener catch does not unguarded-wipe currentUser"
    );
  }

  const appSrc = readSrc("src/App.jsx");
  const boundarySrc = readSrc("src/components/AppErrorBoundary.jsx");
  const prefetchSrc = readSrc("src/utils/routePrefetch.js");

  assert(
    "nonpilot-16",
    !/\bNonPilotReleaseScreen\b/.test(appSrc) && !/\bNonPilotReleaseScreen\b/.test(readSrc("src/main.jsx")),
    "no unresolved NonPilotReleaseScreen symbol remains"
  );
  assert(
    "nonpilot-17",
    appSrc.includes("<UnauthorizedScreen message={NON_PILOT_RELEASE_MESSAGE} onLogout={signOut} />"),
    "non-pilot App branch renders existing UnauthorizedScreen"
  );
  assert(
    "boundary-1",
    boundarySrc.includes("recoverFromChunkLoadError") &&
      boundarySrc.includes('label="Refresh page"'),
    "ErrorBoundary recovers stale chunks and keeps manual Refresh page"
  );
  assert(
    "prefetch-1",
    !prefetchSrc.includes("recoverFromChunkLoadError") &&
      prefetchSrc.includes("swallowed on purpose"),
    "routePrefetch swallows import failures and does not reload"
  );
  assert(
    "guard-clear",
    appSrc.includes("clearChunkLoadRecoveryGuard"),
    "successful app load clears the chunk-reload guard"
  );

  console.log("");
  console.log(`STAB-1 client stability: ${results.length - failed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
