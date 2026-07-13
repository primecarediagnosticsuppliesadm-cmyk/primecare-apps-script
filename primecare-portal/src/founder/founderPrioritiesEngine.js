/**
 * Phase 9.2 — Top 5 Founder Priorities from decisions + insights.
 */
import { buildFounderInsights } from "@/founder/founderInsightsEngine.js";
import { buildFounderDecisionQueue } from "@/founder/founderDecisionQueueEngine.js";

const IMPACT_RANK = { critical: 0, high: 1, attention: 2, warning: 3, medium: 4, info: 5, monitor: 6 };

function str(value) {
  return String(value ?? "").trim();
}

function impactRank(value) {
  return IMPACT_RANK[str(value).toLowerCase()] ?? 7;
}

/**
 * @param {object} readBundle — output of loadFounderWorkspaceRead + buildFounderWorkspace
 */
export function buildFounderPriorities(readBundle = {}) {
  const decisionQueue = readBundle.decisionQueue || buildFounderDecisionQueue({
    actionQueue: readBundle.actionQueue,
    compensationModel: readBundle.compensationModel,
    priorityCards: readBundle.priorityCards,
    contracts: readBundle.commercialRaw?.contracts,
  });

  const insights = readBundle.insights || buildFounderInsights({
    dailySnapshot: readBundle.dailySnapshot,
    opsPayload: readBundle.opsPayload,
    commercialWorkspace: readBundle.commercialWorkspace,
    compensationModel: readBundle.compensationModel,
    actionQueue: readBundle.actionQueue,
  });

  const fromDecisions = (decisionQueue.items || []).map((item) => ({
    id: `dec-${item.id}`,
    priority: item.title,
    reason: item.reason,
    businessImpact: item.businessImpact,
    recommendedAction: item.recommendedAction,
    deepLinkPage: item.deepLinkPage,
    deepLinkLabel: item.deepLinkLabel,
    rankScore: impactRank(item.severity),
    source: item.source,
  }));

  const fromInsights = (insights.items || []).map((item) => ({
    id: `ins-${item.id}`,
    priority: item.title,
    reason: item.reason,
    businessImpact: item.impact,
    recommendedAction: item.actionLabel,
    deepLinkPage: item.actionPage,
    deepLinkLabel: item.actionLabel,
    rankScore: impactRank(item.impact),
    source: "founder_insights",
  }));

  const merged = [...fromDecisions, ...fromInsights]
    .sort((a, b) => a.rankScore - b.rankScore || str(a.priority).localeCompare(str(b.priority)))
    .slice(0, 5);

  return {
    items: merged,
    generatedAt: new Date().toISOString(),
    previewOnly: true,
  };
}
