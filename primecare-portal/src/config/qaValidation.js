import { IS_DEV, IS_PROD, IS_QA } from "@/config/environment.js";

function envFlagOrDefault(name, defaultValue) {
  const value = import.meta.env[name];
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  return normalized === "true" || normalized === "1";
}

export function hasSupabaseForValidation() {
  return (
    String(import.meta.env.VITE_SUPABASE_URL || "").trim() !== "" &&
    String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim() !== ""
  );
}

/** Phase 1: enabled on QA/dev; hidden in production unless VITE_QA_VALIDATION_LAYER=true. */
export function isQaValidationLayerEnabled() {
  if (!hasSupabaseForValidation()) return false;
  if (IS_PROD) {
    return envFlagOrDefault("VITE_QA_VALIDATION_LAYER", false);
  }
  return envFlagOrDefault("VITE_QA_VALIDATION_LAYER", false);
}

/** QA Command Center — executive-only; hidden in production unless explicitly enabled. */
export function isQaCommandCenterEnabled() {
  if (!hasSupabaseForValidation()) return false;
  if (IS_PROD) {
    return envFlagOrDefault("VITE_QA_COMMAND_CENTER", false);
  }
  return envFlagOrDefault("VITE_QA_COMMAND_CENTER", IS_QA || IS_DEV);
}

/** Phase 2: tenant + role isolation — re-export for config consumers. */
export { isTenantRoleIsolationValidationEnabled } from "@/validation/tenantRoleIsolationValidation.js";
