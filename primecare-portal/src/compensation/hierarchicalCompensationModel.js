/**
 * Phase 9.3 — Hierarchical compensation display (ownership tree + payroll reads).
 * Display-only overrides — no payroll mutation.
 */
import { formatInr, num, roundMoney, str } from "./analytics/analyticsFormatters.js";

const DISPLAY_ADMIN_OVERRIDE_BPS = 50;
const DISPLAY_EXEC_OVERRIDE_BPS = 25;

function displayOverride(amount, bps) {
  return roundMoney((num(amount) * num(bps)) / 10000);
}

function mapNode(node = {}, depth = 0) {
  const collections = num(node.collections);
  const agentCommission = num(node.compensationPreview?.agentDirectCommissionAmount ?? node.payrollImpact);
  const adminOverride = displayOverride(collections, DISPLAY_ADMIN_OVERRIDE_BPS);
  const executiveOverride = displayOverride(collections, DISPLAY_EXEC_OVERRIDE_BPS);

  return {
    id: node.id,
    type: node.type,
    entityId: node.entityId,
    label: node.label,
    subtitle: node.subtitle,
    depth,
    collections,
    collectionsLabel: node.collectionsLabel || formatInr(collections),
    managedRevenueLabel: node.collectionsLabel || formatInr(collections),
    managedLabCount: (node.children || []).reduce(
      (sum, child) => sum + (child.type === "lab" ? 1 : num(child.managedLabCount)),
      node.type === "lab" ? 1 : 0
    ),
    agentCommission,
    agentCommissionLabel: formatInr(agentCommission),
    adminOverride,
    adminOverrideLabel: formatInr(adminOverride),
    executiveOverride,
    executiveOverrideLabel: formatInr(executiveOverride),
    potentialPayrollLabel: formatInr(roundMoney(agentCommission + adminOverride + executiveOverride)),
    futurePromotion: node.type === "agent" ? "Review promotion pipeline in Payroll" : "—",
    previewOnly: true,
    displayOnly: true,
    children: (node.children || []).map((child) => mapNode(child, depth + 1)),
  };
}

function flattenAgents(nodes = [], acc = []) {
  for (const node of nodes) {
    if (node.type === "agent") acc.push(node);
    if (node.children?.length) flattenAgents(node.children, acc);
  }
  return acc;
}

/**
 * @param {{ orgTree?: object[], reportingContext?: object }} input
 */
export function buildHierarchicalCompensation(input = {}) {
  const orgTree = (input.orgTree || []).map((node) => mapNode(node, 0));
  const agents = flattenAgents(orgTree);
  const teamCollections = roundMoney(orgTree.reduce((sum, n) => sum + num(n.collections), 0));
  const teamCommission = roundMoney(agents.reduce((sum, n) => sum + num(n.agentCommission), 0));

  return {
    previewOnly: true,
    displayOnly: true,
    period: input.reportingContext?.periodYm || "—",
    hierarchy: orgTree,
    summary: {
      teamCollections,
      teamCollectionsLabel: formatInr(teamCollections),
      teamCommission,
      teamCommissionLabel: formatInr(teamCommission),
      adminOverrideLabel: formatInr(displayOverride(teamCollections, DISPLAY_ADMIN_OVERRIDE_BPS)),
      executiveOverrideLabel: formatInr(displayOverride(teamCollections, DISPLAY_EXEC_OVERRIDE_BPS)),
      agentCount: agents.length,
      managedLabs: agents.reduce((sum, a) => sum + num(a.managedLabCount), 0),
    },
    futureOverrideNote:
      "Admin and executive override amounts are explanatory display projections only. Payroll engine rules are unchanged.",
  };
}
