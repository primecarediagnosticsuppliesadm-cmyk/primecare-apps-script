import { IS_DEV, IS_QA } from "@/config/environment.js";

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

/** Phase 1: enabled by default on QA; opt-in on dev via VITE_QA_VALIDATION_LAYER=true. */
export function isQaValidationLayerEnabled() {
  if (!hasSupabaseForValidation()) return false;
  return envFlagOrDefault("VITE_QA_VALIDATION_LAYER", IS_QA || IS_DEV);
}
