const rawAppEnv = String(import.meta.env.VITE_APP_ENV || "").trim().toLowerCase();

export const APP_ENV =
  rawAppEnv ||
  (import.meta.env.PROD ? "prod" : "dev");

export const IS_DEV = APP_ENV === "dev" || APP_ENV === "development";
export const IS_QA = APP_ENV === "qa" || APP_ENV === "staging";
export const IS_PROD = APP_ENV === "prod" || APP_ENV === "production";

function envFlag(name, defaultValue) {
  const value = import.meta.env[name];
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).trim().toLowerCase() === "true";
}

export const ALLOW_LEGACY_APPS_SCRIPT = envFlag(
  "VITE_ENABLE_LEGACY_APPS_SCRIPT",
  IS_DEV
);

export const ALLOW_EXPERIMENTAL_MODULES = envFlag(
  "VITE_ENABLE_EXPERIMENTAL_MODULES",
  IS_DEV
);

export const REQUIRE_SUPABASE_AUTH = IS_QA || IS_PROD;

/** Agent task queue completion (Apps Script only until Supabase agent_tasks exists). */
export const AGENT_TASK_COMPLETION_ENABLED = ALLOW_LEGACY_APPS_SCRIPT;
