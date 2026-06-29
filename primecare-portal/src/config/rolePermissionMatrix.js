/**
 * User & Role Provisioning — single source of truth for roles, permissions,
 * menu allowlists, and provisioning boundaries (Phase 3A).
 */

import { IS_DEV } from "@/config/environment.js";

export const ROLES = {
  EXECUTIVE: "executive",
  ADMIN: "admin",
  DISTRIBUTOR_ADMIN: "distributor_admin",
  DISTRIBUTOR_MANAGER: "distributor_manager",
  AGENT: "agent",
  LAB: "lab",
  READ_ONLY_AUDITOR: "read_only_auditor",
};

/** @type {string[]} */
export const ALL_ROLE_SLUGS = Object.values(ROLES);

export const ROLE_LABELS = {
  [ROLES.EXECUTIVE]: "HQ Executive",
  [ROLES.ADMIN]: "HQ Admin",
  [ROLES.DISTRIBUTOR_ADMIN]: "Distributor Admin",
  [ROLES.DISTRIBUTOR_MANAGER]: "Distributor Manager",
  [ROLES.AGENT]: "Field Agent",
  [ROLES.LAB]: "Lab User",
  [ROLES.READ_ONLY_AUDITOR]: "Read Only Auditor",
};

/** Roles that may authenticate into the portal (provisioning + auth matrix). */
export const LOGIN_ENABLED_ROLES = new Set([
  ROLES.ADMIN,
  ROLES.EXECUTIVE,
  ROLES.AGENT,
  ROLES.LAB,
  ROLES.DISTRIBUTOR_ADMIN,
  ROLES.DISTRIBUTOR_MANAGER,
  ROLES.READ_ONLY_AUDITOR,
]);

/** HQ pilot launch — only these roles may sign in on QA/PROD (RC-9). */
export const PILOT_LAUNCH_ROLES = new Set([
  ROLES.EXECUTIVE,
  ROLES.ADMIN,
  ROLES.AGENT,
  ROLES.LAB,
]);

export const NON_PILOT_RELEASE_MESSAGE =
  "Your workspace is not enabled for this release. Contact HQ Admin.";

/** Roles scoped to a distributor tenant via profiles.distributor_id. */
export const DISTRIBUTOR_SCOPED_ROLES = new Set([
  ROLES.DISTRIBUTOR_ADMIN,
  ROLES.DISTRIBUTOR_MANAGER,
]);

/**
 * Page permission map — permission key → roles allowed to view the page.
 * Drives PERMISSIONS in permissions.js and route guards.
 */
export const PERMISSION_BY_KEY = {
  dashboard: [
    ROLES.AGENT,
    ROLES.ADMIN,
    ROLES.EXECUTIVE,
    ROLES.DISTRIBUTOR_ADMIN,
    ROLES.DISTRIBUTOR_MANAGER,
    ROLES.READ_ONLY_AUDITOR,
  ],
  founderNavigation: [ROLES.EXECUTIVE],
  founderStrategy: [ROLES.EXECUTIVE],
  founderFinancialIntelligence: [ROLES.EXECUTIVE],
  revenueFunnel: [ROLES.EXECUTIVE],
  pilotReadiness: [ROLES.EXECUTIVE],
  tenantManagement: [ROLES.EXECUTIVE],
  distributorManagement: [ROLES.EXECUTIVE],
  distributorOs: [ROLES.EXECUTIVE, ROLES.ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.DISTRIBUTOR_MANAGER],
  distributorProvisioning: [ROLES.EXECUTIVE],
  commissionEngine: [ROLES.EXECUTIVE],
  labContractEngine: [ROLES.ADMIN, ROLES.EXECUTIVE],
  operationsCenter: [
    ROLES.ADMIN,
    ROLES.EXECUTIVE,
    ROLES.DISTRIBUTOR_ADMIN,
    ROLES.DISTRIBUTOR_MANAGER,
    ROLES.READ_ONLY_AUDITOR,
  ],
  accessAudit: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.READ_ONLY_AUDITOR],
  visits: [ROLES.AGENT, ROLES.DISTRIBUTOR_MANAGER],
  collections: [ROLES.AGENT, ROLES.ADMIN, ROLES.READ_ONLY_AUDITOR],
  labAccount: [ROLES.LAB],
  labInvoices: [ROLES.LAB],
  labs: [ROLES.AGENT, ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.DISTRIBUTOR_ADMIN, ROLES.DISTRIBUTOR_MANAGER, ROLES.READ_ONLY_AUDITOR],
  masterCatalog: [ROLES.ADMIN, ROLES.EXECUTIVE],
  inventory: [ROLES.ADMIN, ROLES.EXECUTIVE],
  orders: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.READ_ONLY_AUDITOR],
  risk: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.READ_ONLY_AUDITOR],
  performance: [ROLES.ADMIN, ROLES.EXECUTIVE],
  insights: [ROLES.ADMIN, ROLES.EXECUTIVE],
  labOrders: [ROLES.LAB],
  purchase: [ROLES.ADMIN, ROLES.EXECUTIVE],
  reorder: [ROLES.ADMIN, ROLES.EXECUTIVE],
  qualificationReview: [ROLES.ADMIN, ROLES.EXECUTIVE, ROLES.READ_ONLY_AUDITOR],
  notifications: [
    ROLES.AGENT,
    ROLES.ADMIN,
    ROLES.EXECUTIVE,
    ROLES.LAB,
    ROLES.DISTRIBUTOR_ADMIN,
    ROLES.DISTRIBUTOR_MANAGER,
    ROLES.READ_ONLY_AUDITOR,
  ],
  predatorDebug: [ROLES.ADMIN, ROLES.EXECUTIVE],
  qaCommandCenter: [ROLES.EXECUTIVE],
};

/** Sidebar allowlist for distributor-scoped roles (HQ executive/admin use menuConfig HQ sets). */
export const DISTRIBUTOR_ADMIN_MENU_KEYS = [
  "dashboard",
  "distributorOs",
  "operationsCenter",
  "labs",
  "notifications",
];

export const DISTRIBUTOR_MANAGER_MENU_ORDER = [
  "dashboard",
  "visits",
  "collections",
  "labs",
  "distributorOs",
  "operationsCenter",
  "notifications",
];

export const READ_ONLY_AUDITOR_MENU_ORDER = [
  "dashboard",
  "labs",
  "orders",
  "risk",
  "collections",
  "qualificationReview",
  "operationsCenter",
  "accessAudit",
  "notifications",
];

/** Pages that must never appear in the sidebar for a role (Predator unauthorized checks). */
export const UNAUTHORIZED_MENU_PAGES_BY_ROLE = {
  [ROLES.READ_ONLY_AUDITOR]: [
    "predatorDebug",
    "qaCommandCenter",
    "founderNavigation",
    "founderStrategy",
    "founderFinancialIntelligence",
    "revenueFunnel",
    "pilotReadiness",
    "tenantManagement",
    "distributorManagement",
    "distributorProvisioning",
    "commissionEngine",
    "labContractEngine",
    "visits",
    "purchase",
    "inventory",
    "masterCatalog",
    "performance",
    "insights",
    "reorder",
    "distributorOs",
  ],
  [ROLES.DISTRIBUTOR_MANAGER]: [
    "predatorDebug",
    "qaCommandCenter",
    "founderNavigation",
    "founderStrategy",
    "founderFinancialIntelligence",
    "revenueFunnel",
    "pilotReadiness",
    "tenantManagement",
    "distributorManagement",
    "distributorProvisioning",
    "commissionEngine",
    "labContractEngine",
    "accessAudit",
    "purchase",
    "inventory",
    "masterCatalog",
    "orders",
    "risk",
    "qualificationReview",
    "performance",
    "insights",
    "reorder",
  ],
  [ROLES.DISTRIBUTOR_ADMIN]: [
    "predatorDebug",
    "qaCommandCenter",
    "founderNavigation",
    "founderStrategy",
    "founderFinancialIntelligence",
    "revenueFunnel",
    "pilotReadiness",
    "tenantManagement",
    "distributorManagement",
    "distributorProvisioning",
    "commissionEngine",
    "labContractEngine",
    "visits",
    "collections",
    "purchase",
    "inventory",
    "masterCatalog",
    "orders",
    "risk",
    "qualificationReview",
    "accessAudit",
    "performance",
    "insights",
    "reorder",
  ],
};

/** Minimum menu pages expected when role is active (Predator visibility checks). */
export const REQUIRED_MENU_PAGES_BY_ROLE = {
  [ROLES.READ_ONLY_AUDITOR]: ["dashboard", "accessAudit", "operationsCenter"],
  [ROLES.DISTRIBUTOR_MANAGER]: ["dashboard", "visits", "operationsCenter"],
  [ROLES.DISTRIBUTOR_ADMIN]: ["distributorOs", "operationsCenter"],
  [ROLES.LAB]: ["labOrders", "labAccount", "labInvoices"],
  [ROLES.AGENT]: ["dashboard", "collections", "visits"],
};

/**
 * Which roles an actor may provision (Phase 3A boundaries).
 * @type {Record<string, { canProvision: string[], cannotProvision?: string[] }>}
 */
export const PROVISION_RULES_BY_ACTOR = {
  [ROLES.EXECUTIVE]: {
    canProvision: [...ALL_ROLE_SLUGS],
  },
  [ROLES.ADMIN]: {
    canProvision: ALL_ROLE_SLUGS.filter((r) => r !== ROLES.EXECUTIVE),
    cannotProvision: [ROLES.EXECUTIVE],
  },
  [ROLES.DISTRIBUTOR_ADMIN]: {
    canProvision: [ROLES.AGENT, ROLES.DISTRIBUTOR_MANAGER],
    cannotProvision: [
      ROLES.EXECUTIVE,
      ROLES.ADMIN,
      ROLES.LAB,
      ROLES.DISTRIBUTOR_ADMIN,
      ROLES.READ_ONLY_AUDITOR,
    ],
  },
};

/** All roles accepted by provision-platform-user Edge Function. */
export const PROVISIONABLE_ROLES = new Set(ALL_ROLE_SLUGS);

const KNOWN_ROLE_ALIASES = {
  "hq admin": ROLES.ADMIN,
  "hq executive": ROLES.EXECUTIVE,
  "field agent": ROLES.AGENT,
  "lab user": ROLES.LAB,
  "read only auditor": ROLES.READ_ONLY_AUDITOR,
  auditor: ROLES.READ_ONLY_AUDITOR,
  "distributor manager": ROLES.DISTRIBUTOR_MANAGER,
  "distributor admin": ROLES.DISTRIBUTOR_ADMIN,
};

/**
 * @param {string} [role]
 * @returns {string}
 */
export function normalizePlatformRole(role) {
  const r = String(role ?? "").trim().toLowerCase();
  if (!r) return "";
  if (ALL_ROLE_SLUGS.includes(r)) return r;
  if (KNOWN_ROLE_ALIASES[r]) return KNOWN_ROLE_ALIASES[r];
  return "";
}

/**
 * @param {string} [role]
 * @returns {boolean}
 */
export function isLoginEnabledRole(role) {
  return LOGIN_ENABLED_ROLES.has(normalizePlatformRole(role));
}

/**
 * @param {string} [role]
 * @returns {boolean}
 */
export function isPilotLaunchRole(role) {
  return PILOT_LAUNCH_ROLES.has(normalizePlatformRole(role));
}

/**
 * Environment-aware portal login gate. Dev allows all LOGIN_ENABLED roles for Distributor OS work.
 * QA/PROD restrict to PILOT_LAUNCH_ROLES only (RC-9).
 * @param {string} [role]
 * @returns {boolean}
 */
export function canAuthenticateRole(role) {
  const normalized = normalizePlatformRole(role);
  if (!LOGIN_ENABLED_ROLES.has(normalized)) return false;
  if (IS_DEV) return true;
  return isPilotLaunchRole(normalized);
}

/**
 * @param {string} [role]
 * @param {string} [permissionKey]
 * @returns {boolean}
 */
export function roleHasPermission(role, permissionKey) {
  const normalized = normalizePlatformRole(role);
  const key = String(permissionKey ?? "").trim();
  if (!normalized || !key) return false;
  const allowed = PERMISSION_BY_KEY[key];
  return Array.isArray(allowed) && allowed.includes(normalized);
}

/**
 * @param {string} [actorRole]
 * @param {string} [targetRole]
 * @returns {boolean}
 */
export function canActorProvisionRole(actorRole, targetRole) {
  const actor = normalizePlatformRole(actorRole);
  const target = normalizePlatformRole(targetRole);
  if (!actor || !target || !PROVISIONABLE_ROLES.has(target)) return false;

  const rules = PROVISION_RULES_BY_ACTOR[actor];
  if (!rules) return false;
  if (rules.cannotProvision?.includes(target)) return false;
  return rules.canProvision.includes(target);
}

/**
 * Roles an actor may assign when creating or updating platform users.
 * @param {string} [actorRole]
 * @returns {string[]}
 */
export function getProvisionableRolesForActor(actorRole) {
  const actor = normalizePlatformRole(actorRole);
  const rules = PROVISION_RULES_BY_ACTOR[actor];
  if (!rules) return [];
  return rules.canProvision.filter((r) => PROVISIONABLE_ROLES.has(r));
}

/**
 * Validate role change for profile update — blocks privilege escalation.
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateActorRoleAssignment(actorRole, targetRole, previousRole = "") {
  const next = normalizePlatformRole(targetRole);
  const prev = normalizePlatformRole(previousRole);
  if (!next) return { ok: true };
  if (!canActorProvisionRole(actorRole, next)) {
    return {
      ok: false,
      error: `Role '${next}' cannot be assigned by your account. Contact an HQ Executive.`,
    };
  }
  if (prev === ROLES.EXECUTIVE && next !== ROLES.EXECUTIVE) {
    const actor = normalizePlatformRole(actorRole);
    if (actor !== ROLES.EXECUTIVE) {
      return {
        ok: false,
        error: "Only an HQ Executive can change roles for Executive users.",
      };
    }
  }
  return { ok: true };
}

/**
 * @param {string} [role]
 * @returns {boolean}
 */
export function isProvisionableRole(role) {
  return PROVISIONABLE_ROLES.has(normalizePlatformRole(role));
}

/**
 * @param {string} [role]
 * @returns {boolean}
 */
export function isDistributorScopedRole(role) {
  return DISTRIBUTOR_SCOPED_ROLES.has(normalizePlatformRole(role));
}

/**
 * Map platform role slug to legacy users.role directory value.
 * @param {string} [role]
 */
export function directoryRoleFromPlatformRole(role) {
  const normalized = normalizePlatformRole(role);
  if (!normalized) return String(role ?? "").toUpperCase();
  return normalized.toUpperCase();
}

/**
 * @param {string} [role]
 * @returns {string}
 */
export function platformRoleLabel(role) {
  const normalized = normalizePlatformRole(role);
  return ROLE_LABELS[normalized] || String(role ?? "").trim() || "—";
}
