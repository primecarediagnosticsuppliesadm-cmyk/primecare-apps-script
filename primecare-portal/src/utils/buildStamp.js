import { APP_ENV } from "@/config/environment.js";

/**
 * Internal build/runtime stamp for diagnostics (not shown to lab users).
 */
export function getAppBuildStamp() {
  return {
    stamp: String(import.meta.env.VITE_APP_BUILD_STAMP || "dev").trim() || "dev",
    commit: String(import.meta.env.VITE_APP_COMMIT_HASH || import.meta.env.VITE_APP_BUILD_STAMP || "dev").trim(),
    branch: String(import.meta.env.VITE_APP_GIT_BRANCH || "unknown").trim(),
    env: APP_ENV,
    mode: String(import.meta.env.MODE || "unknown"),
    viteProd: Boolean(import.meta.env.PROD),
  };
}

/**
 * Public, non-secret build identity for DevTools. No keys, tokens, or URLs.
 */
export function exposePrimeCareBuildIdentity(target = typeof window !== "undefined" ? window : null) {
  const stamp = getAppBuildStamp();
  if (!target) return stamp;
  target.__PRIMECARE_BUILD__ = {
    env: stamp.env,
    commit: stamp.commit,
    branch: stamp.branch,
    buildStamp: stamp.stamp,
  };
  return stamp;
}
