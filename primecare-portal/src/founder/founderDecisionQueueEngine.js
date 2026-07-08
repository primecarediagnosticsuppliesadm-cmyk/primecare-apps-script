/**
 * Phase 9.2 — Founder decision queue (compose existing queues; no workflow duplication).
 */
import { FOUNDER_DEEP_LINK_PAGES } from "@/founder/founderOperatingNavigation.js";
import { buildApprovalInbox } from "@/peopleOps/productivity/peopleOpsProductivityModel.js";

function str(value) {
  return String(value ?? "").trim();
}

function mapActionQueueItem(item = {}) {
  const page = str(item.page || item.navigateTo || "");
  return {
    id: str(item.id || item.issueId),
    category: str(item.sourceModule || item.category || "operations"),
    title: str(item.title),
    reason: str(item.description || item.subtitle || item.reason),
    businessImpact: str(item.impactLabel || item.severity || "medium"),
    recommendedAction: str(item.recommendedAction || item.ctaLabel || "Review"),
    deepLinkPage: page || FOUNDER_DEEP_LINK_PAGES.operations,
    deepLinkLabel: str(item.ctaLabel || "Open"),
    severity: str(item.severity || "medium"),
    source: "executive_action_queue",
  };
}

function mapApprovalItem(item = {}) {
  return {
    id: str(item.id),
    category: "approvals",
    title: str(item.title),
    reason: str(item.detail),
    businessImpact: item.tone === "warning" ? "high" : "medium",
    recommendedAction: "Open approval workflow",
    deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
    deepLinkLabel: "People Operations",
    severity: item.tone === "warning" ? "high" : "info",
    source: "people_ops_approval_inbox",
    peopleRoute: item.route || null,
  };
}

function mapPriorityCard(card = {}) {
  return {
    id: `priority-${str(card.id)}`,
    category: str(card.id),
    title: str(card.title),
    reason: str(card.description),
    businessImpact: str(card.severity),
    recommendedAction: str(card.actionNeeded),
    deepLinkPage: str(card.page) || FOUNDER_DEEP_LINK_PAGES.operations,
    deepLinkLabel: str(card.ctaLabel || "Review"),
    severity: str(card.severity),
    source: "hq_priority_cards",
    count: Number(card.count) || 0,
  };
}

/**
 * @param {{ actionQueue?: object, compensationModel?: object, priorityCards?: object[], contracts?: object[] }} input
 */
export function buildFounderDecisionQueue(input = {}) {
  const items = [];

  for (const item of input.actionQueue?.items || []) {
    items.push(mapActionQueueItem(item));
  }

  const approvalInbox = buildApprovalInbox({
    model: input.compensationModel,
    adminModel: input.compensationModel?.adminModel,
  });
  for (const item of approvalInbox) {
    items.push(mapApprovalItem(item));
  }

  for (const card of input.priorityCards || []) {
    if (Number(card.count) > 0) {
      items.push(mapPriorityCard(card));
    }
  }

  const pendingContracts = (input.contracts || []).filter((row) => {
    const status = str(row.status || row.contract_status);
    return status === "Under Review" || status === "Draft";
  });
  for (const contract of pendingContracts.slice(0, 8)) {
    items.push({
      id: `contract-${str(contract.id)}`,
      category: "commercial",
      title: `Approve contract · ${str(contract.labName || contract.lab_name) || "Lab"}`,
      reason: `Contract status: ${str(contract.status)}`,
      businessImpact: "high",
      recommendedAction: "Review contract terms before activation",
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.contracts,
      deepLinkLabel: "Contract Management",
      severity: "high",
      source: "lab_contracts",
    });
  }

  const severityRank = { critical: 0, high: 1, attention: 2, warning: 3, monitor: 4, info: 5, medium: 6, healthy: 9 };
  const sorted = [...items].sort((a, b) => {
    const sa = severityRank[str(a.severity).toLowerCase()] ?? 7;
    const sb = severityRank[str(b.severity).toLowerCase()] ?? 7;
    return sa - sb;
  });

  return {
    items: sorted,
    openCount: sorted.length,
    byCategory: sorted.reduce((acc, row) => {
      const key = row.category || "other";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };
}
