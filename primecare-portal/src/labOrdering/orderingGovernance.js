/**
 * Lab ordering governance — who may initiate orders (not finance/logistics).
 */

function str(v) {
  return String(v ?? "").trim();
}

export const ORDERING_MODE = {
  HQ_MANAGED: "hq_managed",
  HYBRID: "hybrid",
  SELF_SERVICE: "self_service",
  SUSPENDED: "suspended",
};

export const ORDERING_MODE_LABELS = {
  [ORDERING_MODE.HQ_MANAGED]: "HQ Managed",
  [ORDERING_MODE.HYBRID]: "Hybrid",
  [ORDERING_MODE.SELF_SERVICE]: "Self Service",
  [ORDERING_MODE.SUSPENDED]: "Suspended",
};

export const ORDERING_MODE_HELP = {
  [ORDERING_MODE.HQ_MANAGED]:
    "PrimeCare places orders during onboarding. Lab can track orders, invoices, and payments.",
  [ORDERING_MODE.HYBRID]:
    "Lab and PrimeCare can both place orders. Assisted ordering mode.",
  [ORDERING_MODE.SELF_SERVICE]:
    "Lab self-service checkout enabled. Admin may still place orders on behalf of the lab.",
  [ORDERING_MODE.SUSPENDED]:
    "Lab checkout suspended. Admin override still allowed. Track and finance paths remain open.",
};

export const ORDERING_MODE_OPTIONS = Object.values(ORDERING_MODE).map((value) => ({
  value,
  label: ORDERING_MODE_LABELS[value],
  help: ORDERING_MODE_HELP[value],
}));

const LAB_INITIATE_MODES = new Set([ORDERING_MODE.HYBRID, ORDERING_MODE.SELF_SERVICE]);

export function normalizeOrderingMode(value) {
  const key = str(value).toLowerCase();
  if (Object.values(ORDERING_MODE).includes(key)) return key;
  return ORDERING_MODE.HQ_MANAGED;
}

export function orderingModeLabel(mode) {
  return ORDERING_MODE_LABELS[normalizeOrderingMode(mode)] || "HQ Managed";
}

export function canLabInitiateOrder(mode) {
  return LAB_INITIATE_MODES.has(normalizeOrderingMode(mode));
}

/** HQ admin / executive override — always allowed to initiate. */
export function canAdminInitiateOrder() {
  return true;
}

export function isHqManagedOrdering(mode) {
  return normalizeOrderingMode(mode) === ORDERING_MODE.HQ_MANAGED;
}

export function isSuspendedOrdering(mode) {
  return normalizeOrderingMode(mode) === ORDERING_MODE.SUSPENDED;
}

export function isHybridOrdering(mode) {
  return normalizeOrderingMode(mode) === ORDERING_MODE.HYBRID;
}

export function labOrderingBlockedMessage(mode) {
  const normalized = normalizeOrderingMode(mode);
  if (normalized === ORDERING_MODE.SUSPENDED) {
    return "Lab ordering is suspended. Contact PrimeCare to place your next order.";
  }
  if (normalized === ORDERING_MODE.HQ_MANAGED) {
    return "Orders are currently managed by your PrimeCare account manager during onboarding.";
  }
  return "Lab ordering is not enabled for your account.";
}

export function labOrderingBannerMessage(mode) {
  if (isHybridOrdering(mode)) {
    return "You are currently in assisted ordering mode. PrimeCare may also place orders on your behalf.";
  }
  return "";
}

export function labCatalogOrderingDisabled(mode) {
  const normalized = normalizeOrderingMode(mode);
  return normalized === ORDERING_MODE.HQ_MANAGED || normalized === ORDERING_MODE.SUSPENDED;
}

export function isHqOpsRole(role) {
  const r = str(role).toLowerCase();
  return r === "admin" || r === "executive";
}
