import { APP_ENV } from "@/config/environment.js";

/**
 * Internal build/runtime stamp for diagnostics (not shown to lab users).
 */
export function getAppBuildStamp() {
  return {
    stamp: String(import.meta.env.VITE_APP_BUILD_STAMP || "dev").trim() || "dev",
    env: APP_ENV,
    mode: String(import.meta.env.MODE || "unknown"),
    viteProd: Boolean(import.meta.env.PROD),
  };
}
