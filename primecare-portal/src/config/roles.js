export const ROLES = {
  AGENT: "agent",
  ADMIN: "admin",
  EXECUTIVE: "executive",
  LAB: "lab",
  /** Directory-only in Year-1 — excluded from AuthContext VALID_ROLES */
  DISTRIBUTOR_ADMIN: "distributor_admin",
};

export const ROLE_LABELS = {
  agent: "Agent",
  admin: "HQ Admin",
  executive: "Executive",
  lab: "Lab User",
  distributor_admin: "Distributor Admin",
};

/** Roles that may receive portal login (AuthContext uses its own VALID_ROLES set). */
export const LOGIN_ENABLED_ROLES = new Set(["admin", "executive", "agent", "lab"]);