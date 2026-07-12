import { ROLES } from "@/config/roles";

export const COLLECTIONS_WORKSPACES = Object.freeze({
  LAB_ACCOUNT: "lab_account",
  AGENT: "agent_collections",
  HQ_CREDIT_RISK: "hq_credit_risk",
  HQ_RECEIVABLES: "hq_receivables",
});

const WORKSPACE_META = Object.freeze({
  [COLLECTIONS_WORKSPACES.LAB_ACCOUNT]: {
    title: "Payments & account",
    primaryQuestion: "What is my account health, balance, and payment activity?",
    workspaceLabel: "Lab account workspace",
    searchSectionLabel: null,
  },
  [COLLECTIONS_WORKSPACES.AGENT]: {
    title: "Collection work queue",
    primaryQuestion: "Who should I collect from today, and how much is owed?",
    workspaceLabel: "Agent collections workspace",
    searchSectionLabel: "Find accounts",
  },
  [COLLECTIONS_WORKSPACES.HQ_CREDIT_RISK]: {
    title: "Credit & risk operations",
    primaryQuestion: "Which labs need credit intervention or payment follow-up?",
    workspaceLabel: "Credit & risk workspace",
    searchSectionLabel: "Filter labs",
  },
  [COLLECTIONS_WORKSPACES.HQ_RECEIVABLES]: {
    title: "HQ receivables",
    primaryQuestion: "What is our outstanding receivables position by lab?",
    workspaceLabel: "Receivables workspace",
    searchSectionLabel: "Find receivables",
  },
});

function roleKey(role) {
  return String(role || "").trim().toLowerCase();
}

export function isLabAccountViewMode(viewMode, role) {
  return viewMode === "labAccount" || roleKey(role) === ROLES.LAB;
}

export function isAgentCollectionsView(currentUser, isLabAccount) {
  return !isLabAccount && roleKey(currentUser?.role) === ROLES.AGENT;
}

export function isHqCreditRiskView(currentUser, isLabAccount, isAgentView) {
  if (isLabAccount || isAgentView) return false;
  const role = roleKey(currentUser?.role);
  return role === ROLES.ADMIN || role === ROLES.EXECUTIVE;
}

/**
 * Resolve which Collections workspace the current session should render.
 * Routing unchanged — persona is still role/viewMode driven.
 */
export function resolveCollectionsWorkspace({
  viewMode,
  currentUser,
  isLabAccount,
  isAgentView,
  isHqCreditRisk,
} = {}) {
  const labAccount =
    typeof isLabAccount === "boolean"
      ? isLabAccount
      : isLabAccountViewMode(viewMode, currentUser?.role);
  if (labAccount) return COLLECTIONS_WORKSPACES.LAB_ACCOUNT;

  const agent =
    typeof isAgentView === "boolean"
      ? isAgentView
      : isAgentCollectionsView(currentUser, labAccount);
  if (agent) return COLLECTIONS_WORKSPACES.AGENT;

  const creditRisk =
    typeof isHqCreditRisk === "boolean"
      ? isHqCreditRisk
      : isHqCreditRiskView(currentUser, labAccount, agent);
  if (creditRisk) return COLLECTIONS_WORKSPACES.HQ_CREDIT_RISK;

  return COLLECTIONS_WORKSPACES.HQ_RECEIVABLES;
}

export function getCollectionsWorkspaceMeta(workspaceId) {
  return WORKSPACE_META[workspaceId] || WORKSPACE_META[COLLECTIONS_WORKSPACES.HQ_RECEIVABLES];
}
