/**
 * HQ Year-1 release policy — daily ops view, QA visibility, visit access, post-cert freeze.
 * UI/UX guards only; no business logic changes.
 */

import { IS_DEV, IS_PROD, IS_QA } from "@/config/environment.js";
import { ROLES } from "@/config/roles.js";

function envFlag(name, defaultValue) {
  const value = import.meta.env[name];
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  return normalized === "true" || normalized === "1";
}

/** Production defaults to frozen after HQ certification — provisioning writes disabled. */
export function isHqAdminFrozen() {
  if (IS_PROD) return envFlag("VITE_HQ_ADMIN_FROZEN", true);
  return envFlag("VITE_HQ_ADMIN_FROZEN", false);
}

/** Hide probe/QA/debug filters and KPIs unless explicitly enabled. */
export function showQaProbeComplexity() {
  if (IS_PROD) return envFlag("VITE_SHOW_QA_COMPLEXITY", false);
  return envFlag("VITE_SHOW_QA_COMPLEXITY", IS_QA || IS_DEV);
}

/** Compact Operations Center layout for daily HQ review. */
export function isOperationsCenterDailyViewDefault() {
  return envFlag("VITE_OPS_CENTER_DAILY_VIEW", IS_PROD || IS_QA);
}

/** Default directory audience when QA complexity is hidden. */
export function getDirectoryDefaultAudience() {
  return showQaProbeComplexity() ? "" : "real";
}

/** Agent Visit flow is for field agents (and distributor managers), not HQ Admin. */
export function canAccessAgentVisitFlow(role) {
  const r = String(role || "").trim().toLowerCase();
  return r === ROLES.AGENT || r === ROLES.DISTRIBUTOR_MANAGER;
}

export function agentVisitBlockedMessage(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r === ROLES.ADMIN) return "HQ Admin accounts use Operations Center and Labs — field visit logging is for Agents only.";
  if (r === ROLES.EXECUTIVE) return "Executive accounts review field activity on the Dashboard — visit logging is for Agents only.";
  return "This workspace cannot open the Agent Visit flow. Use the Agent portal for field visit logging.";
}
