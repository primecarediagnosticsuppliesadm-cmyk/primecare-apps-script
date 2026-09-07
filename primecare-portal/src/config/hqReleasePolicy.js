/**
 * HQ Year-1 release policy — structural freeze vs daily operations.
 * UI/UX guards only; no business logic, SQL, RLS, or API changes.
 */

import { IS_DEV, IS_PROD, IS_QA } from "@/config/environment.js";
import { ROLES } from "@/config/roles.js";
import { resolveHqOrderFulfillWriteBlocked } from "@/config/hqOrderFulfillFreezePolicy.js";

function envFlag(name, defaultValue) {
  const value = import.meta.env[name];
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "false" || normalized === "0") return false;
  return normalized === "true" || normalized === "1";
}

/** Production defaults to frozen after HQ certification — structural/config writes disabled. */
export function isHqAdminFrozen() {
  if (IS_PROD) return envFlag("VITE_HQ_ADMIN_FROZEN", true);
  return envFlag("VITE_HQ_ADMIN_FROZEN", false);
}

export const HQ_FREEZE_BANNER_DEFAULT =
  "HQ configuration is frozen. Daily operations such as review, invoices, and payment collection remain available.";

/** Scope-specific freeze banner copy. */
export function getHqFreezeBannerMessage(scope = "default") {
  switch (scope) {
    case "orders":
      return `${HQ_FREEZE_BANNER_DEFAULT} Order status changes and reversals are disabled.`;
    case "operations":
      return `${HQ_FREEZE_BANNER_DEFAULT} User provisioning and ownership changes are disabled.`;
    case "catalog":
      return `${HQ_FREEZE_BANNER_DEFAULT} Master catalog edits are disabled.`;
    case "procurement":
      return "Frozen: procurement writes disabled. Review inventory and PO history remains available.";
    default:
      return HQ_FREEZE_BANNER_DEFAULT;
  }
}

/** Order status mutations (fulfill, cancel, reset) blocked during freeze. */
export function isHqOrderStatusWriteBlocked() {
  return isHqAdminFrozen();
}

function envString(name) {
  const value = import.meta.env[name];
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/**
 * Production Flow 3A Gold: exactly one configured business `order_id`.
 * Unset / empty → freeze behavior unchanged (no fulfill exception).
 */
export function getFlow3aCertFulfillOrderId() {
  return envString("VITE_FLOW3A_CERT_FULFILL_ORDER_ID");
}

/**
 * Mark Fulfilled during HQ freeze is blocked unless this exact Production
 * certification order_id matches VITE_FLOW3A_CERT_FULFILL_ORDER_ID.
 * Does not weaken cancel / reset / processing. Empty env = no exception.
 */
export function isHqOrderFulfillWriteBlocked(orderId, currentStatus) {
  return resolveHqOrderFulfillWriteBlocked({
    hqAdminFrozen: isHqAdminFrozen(),
    isProd: IS_PROD,
    certFulfillOrderId: getFlow3aCertFulfillOrderId(),
    orderId,
    currentStatus,
  });
}

/** User provisioning, ownership, security, and tenant structural writes. */
export function isHqStructuralWriteBlocked() {
  return isHqAdminFrozen();
}

/**
 * Prospect Activate Lab is a certified HQ operational exception.
 * Does not globally unfreeze catalog, order status, or user provisioning.
 */
export function isHqProspectActivationWriteBlocked() {
  return false;
}

/** Master catalog create/edit/enable-disable blocked during freeze. */
export function isHqCatalogWriteBlocked() {
  return isHqAdminFrozen();
}

/**
 * Procurement PO/receive writes — allowed by default during freeze (daily stock ops).
 * Set VITE_HQ_PROCUREMENT_FROZEN=true to block PO create/receive/cancel.
 */
export function isHqProcurementWriteBlocked() {
  return envFlag("VITE_HQ_PROCUREMENT_FROZEN", false);
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
