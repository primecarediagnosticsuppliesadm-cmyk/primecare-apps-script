import { IS_DEV, IS_PROD, IS_QA } from "@/config/environment.js";
import { hasSupabaseForValidation } from "@/config/qaValidation.js";
import { ROLES } from "@/config/roles.js";

function envFlagOrDefault(name, defaultValue) {
  const value = import.meta.env[name];
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  return normalized === "true" || normalized === "1";
}

/**
 * Predator Debug Layer — off in production unless explicitly enabled.
 * Never exposes service role or secrets.
 */
export function isPredatorEnabled() {
  if (!hasSupabaseForValidation()) return false;
  if (IS_PROD) {
    return envFlagOrDefault("VITE_PREDATOR_DEBUG", false);
  }
  return envFlagOrDefault("VITE_PREDATOR_DEBUG", IS_QA || IS_DEV);
}

/** Debug Console page: ADMIN / EXECUTIVE only, QA/dev predator enabled. */
export function canAccessPredatorDebugConsole(role) {
  if (!isPredatorEnabled()) return false;
  const r = String(role || "").toLowerCase();
  return r === ROLES.ADMIN || r === ROLES.EXECUTIVE;
}

export function isPredatorReadOnly() {
  return true;
}
