/**
 * Distributor lifecycle V2 — status, transitions, contract expiry, operation rules.
 */

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const LIFECYCLE_STATUS = {
  DRAFT: "draft",
  PENDING_LAUNCH: "pending_launch",
  ACTIVE: "active",
  SUSPENDED: "suspended",
  DEACTIVATED: "deactivated",
};

export const LIFECYCLE_STATUS_LABELS = {
  draft: "Draft",
  pending_launch: "Pending Launch",
  active: "Active",
  suspended: "Suspended",
  deactivated: "Deactivated",
};

export const LIFECYCLE_DB_STATUS = {
  draft: "PENDING",
  pending_launch: "PENDING",
  active: "ACTIVE",
  suspended: "SUSPENDED",
  deactivated: "INACTIVE",
};

const VALID_LIFECYCLE = new Set(Object.values(LIFECYCLE_STATUS));

export const BILLING_MODELS = [
  { id: "fixed_monthly", label: "Fixed monthly" },
  { id: "revenue_share", label: "Revenue share" },
  { id: "per_lab", label: "Per lab" },
  { id: "hybrid", label: "Hybrid" },
];

export function parseContractDate(iso) {
  const s = str(iso).slice(0, 10);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

export function daysUntilDate(iso) {
  const end = parseContractDate(iso);
  if (!end) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

export function isContractExpired(config = {}) {
  const end = str(config.contractEndDate || config.contract_end_date);
  if (!end) return false;
  const days = daysUntilDate(end);
  return days !== null && days < 0;
}

/**
 * Resolve V2 lifecycle from tenant row + config overrides.
 */
export function resolveDistributorLifecycleStatus(tenant = {}) {
  const config = tenant.config || {};
  const explicit = str(config.lifecycleStatus).toLowerCase();
  if (VALID_LIFECYCLE.has(explicit)) return explicit;

  const prov = str(tenant.provisioning?.lifecycle).toLowerCase();
  const db = str(tenant.status).toUpperCase();

  if (db === "SUSPENDED") return LIFECYCLE_STATUS.SUSPENDED;
  if (db === "INACTIVE" || db === "DEACTIVATED") return LIFECYCLE_STATUS.DEACTIVATED;
  if (db === "ACTIVE") return LIFECYCLE_STATUS.ACTIVE;
  if (prov === "activated") return LIFECYCLE_STATUS.ACTIVE;
  if (prov === "draft") return LIFECYCLE_STATUS.DRAFT;
  if (db === "PENDING") return LIFECYCLE_STATUS.PENDING_LAUNCH;
  return LIFECYCLE_STATUS.DRAFT;
}

export function lifecycleStatusLabel(status) {
  return LIFECYCLE_STATUS_LABELS[status] || status || "Unknown";
}

export function lifecycleStatusVariant(status) {
  if (status === LIFECYCLE_STATUS.ACTIVE) return "success";
  if (status === LIFECYCLE_STATUS.SUSPENDED) return "warning";
  if (status === LIFECYCLE_STATUS.DEACTIVATED) return "neutral";
  if (status === LIFECYCLE_STATUS.PENDING_LAUNCH) return "info";
  return "neutral";
}

export function contractExpiryState(config = {}) {
  const end = str(config.contractEndDate || config.contract_end_date);
  if (!end) return { expired: false, daysLeft: null, label: null };
  const daysLeft = daysUntilDate(end);
  if (daysLeft === null) return { expired: false, daysLeft: null, label: null };
  if (daysLeft < 0) {
    return { expired: true, daysLeft, label: "Expired · Renewal needed" };
  }
  if (daysLeft <= 30) {
    return { expired: false, daysLeft, label: `Expires in ${daysLeft}d` };
  }
  if (daysLeft <= 60) return { expired: false, daysLeft, label: `Expires in ${daysLeft}d (60d window)` };
  if (daysLeft <= 90) return { expired: false, daysLeft, label: `Expires in ${daysLeft}d (90d window)` };
  return { expired: false, daysLeft, label: null };
}

/** Active distributors can operate unless contract expired. */
export function canDistributorOperate(lifecycleStatus, config = {}) {
  if (lifecycleStatus !== LIFECYCLE_STATUS.ACTIVE) return false;
  return !isContractExpired(config);
}

export function isHistoricalOnly(lifecycleStatus) {
  return lifecycleStatus === LIFECYCLE_STATUS.DEACTIVATED;
}

export function blocksNewOrdersCollections(lifecycleStatus) {
  return (
    lifecycleStatus === LIFECYCLE_STATUS.SUSPENDED ||
    lifecycleStatus === LIFECYCLE_STATUS.DEACTIVATED ||
    lifecycleStatus === LIFECYCLE_STATUS.DRAFT ||
    lifecycleStatus === LIFECYCLE_STATUS.PENDING_LAUNCH
  );
}

export function allowedLifecycleTransitions(current) {
  const map = {
    [LIFECYCLE_STATUS.DRAFT]: ["pending_launch", "active", "deactivated"],
    [LIFECYCLE_STATUS.PENDING_LAUNCH]: ["active", "deactivated"],
    [LIFECYCLE_STATUS.ACTIVE]: ["suspended", "deactivated"],
    [LIFECYCLE_STATUS.SUSPENDED]: ["active", "deactivated"],
    [LIFECYCLE_STATUS.DEACTIVATED]: ["active", "pending_launch"],
  };
  return map[current] || [];
}

export function lifecycleActionLabel(action) {
  const labels = {
    activate: "Activate",
    suspend: "Suspend",
    deactivate: "Deactivate",
    reactivate: "Reactivate",
  };
  return labels[action] || action;
}

export function actionToLifecycleStatus(action, current) {
  if (action === "activate" || action === "reactivate") return LIFECYCLE_STATUS.ACTIVE;
  if (action === "suspend") return LIFECYCLE_STATUS.SUSPENDED;
  if (action === "deactivate") return LIFECYCLE_STATUS.DEACTIVATED;
  return current;
}

export function isValidLifecycleTransition(current, next) {
  return allowedLifecycleTransitions(current).includes(next);
}

export function enrichRegistryRowLifecycle(row = {}) {
  const lifecycleStatus = resolveDistributorLifecycleStatus(row);
  const config = row.config || {};
  const expiry = contractExpiryState(config);
  const lifecycleLabel = lifecycleStatusLabel(lifecycleStatus);
  return {
    ...row,
    lifecycleStatus,
    lifecycleLabel,
    canOperate: canDistributorOperate(lifecycleStatus, config),
    contractExpired: expiry.expired,
    contractExpiryLabel: expiry.label,
    contractDaysLeft: expiry.daysLeft,
  };
}

export function buildLifecycleTimelineEntry(action, lifecycleStatus) {
  return {
    id: `lifecycle_${action}_${Date.now()}`,
    kind: "lifecycle",
    label: `${lifecycleActionLabel(action)} → ${lifecycleStatusLabel(lifecycleStatus)}`,
    at: new Date().toISOString(),
  };
}

export function defaultBillingDueDate(config = {}) {
  const existing = str(config.billingDueDate);
  if (existing) return existing;
  const start = str(config.contractStartDate);
  if (start) {
    const d = parseContractDate(start);
    if (d) {
      d.setMonth(d.getMonth() + 1);
      return d.toISOString().slice(0, 10);
    }
  }
  const now = new Date();
  now.setMonth(now.getMonth() + 1);
  return now.toISOString().slice(0, 10);
}

export function normalizeCommercialConfig(form = {}) {
  const territories = str(form.territories || form.territory)
    .split(/[,;]+/)
    .map((t) => str(t))
    .filter(Boolean);

  return {
    legalName: str(form.legalName),
    territories,
    territory: str(form.territory),
    adminName: str(form.adminName || form.ownerAdmin),
    adminEmail: str(form.adminEmail),
    adminPhone: str(form.adminPhone || form.phone),
    contractStartDate: str(form.contractStartDate),
    contractEndDate: str(form.contractEndDate),
    billingModel: str(form.billingModel || "fixed_monthly"),
    monthlyPlatformFee: num(form.monthlyPlatformFee),
    revenueSharePct: num(form.revenueSharePct),
    perLabFee: num(form.perLabFee),
    lifecycleStatus: str(form.lifecycleStatus || LIFECYCLE_STATUS.DRAFT),
    billingCollected: num(form.billingCollected),
    billingDueDate: str(form.billingDueDate) || defaultBillingDueDate(form),
  };
}
