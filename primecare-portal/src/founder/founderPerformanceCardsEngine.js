/**
 * Phase 9.3 — Founder performance decision cards (rule-based; no AI).
 */
import { sortRankingRows } from "@/compensation/analytics/rankingMetrics.js";
import { FOUNDER_DEEP_LINK_PAGES } from "@/founder/founderOperatingNavigation.js";
import { formatInr, num, str } from "@/compensation/analytics/analyticsFormatters.js";

function card({ id, title, answer, reason, deepLinkPage, deepLinkLabel = "Open" }) {
  return { id, title, answer, reason, deepLinkPage, deepLinkLabel, previewOnly: true };
}

/**
 * @param {{ compensationModel?: object, commercialWorkspace?: object, opsPayload?: object }} input
 */
export function buildFounderPerformanceCards(input = {}) {
  const intelligence = input.compensationModel?.intelligence || {};
  const performance = input.compensationModel?.executivePerformance || {};
  const rows = intelligence.employeeRows || [];
  const territories = intelligence.territoryRows || [];
  const collections = input.opsPayload?.collections || [];

  const byRevenue = sortRankingRows(rows, "revenue", "desc");
  const byCollections = sortRankingRows(rows, "collections", "desc");
  const byCommission = sortRankingRows(rows, "commission", "desc");
  const byPayroll = sortRankingRows(rows, "payrollCost", "desc");

  const topTerritory = [...territories].sort((a, b) => num(b.collections) - num(a.collections))[0];
  const bottomTerritory = [...territories].sort((a, b) => num(a.collections) - num(b.collections))[0];

  const highestOutstanding = [...collections]
    .sort((a, b) => num(b.outstandingAmount ?? b.outstanding) - num(a.outstandingAmount ?? a.outstanding))[0];

  const promotionCandidates = rows.filter((row) => row.promotionEligible);
  const lowPerformers = sortRankingRows(rows, "collections", "asc").slice(0, 3);

  const admins = rows.filter((row) => str(row.employeeRole) === "admin");
  const topAdmin = sortRankingRows(admins.length ? admins : rows, "collections", "desc")[0];

  const cards = [
    card({
      id: "top-revenue",
      title: "Who generated the most revenue?",
      answer: byRevenue[0]?.agentName || "—",
      reason: `${byRevenue[0]?.revenueLabel || "—"} in reporting period`,
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
    }),
    card({
      id: "top-collections",
      title: "Who generated the most collections?",
      answer: byCollections[0]?.agentName || performance.topAgent?.agentName || "—",
      reason: `${byCollections[0]?.collectionsLabel || "—"} collected`,
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
    }),
    card({
      id: "top-commission",
      title: "Highest commission?",
      answer: byCommission[0]?.agentName || "—",
      reason: `${byCommission[0]?.commissionLabel || "—"} commission`,
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
    }),
    card({
      id: "lowest-territory",
      title: "Lowest performing territory?",
      answer: bottomTerritory?.territoryName || bottomTerritory?.territory || "—",
      reason: `${bottomTerritory?.collectionsLabel || formatInr(bottomTerritory?.collections)} collections`,
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
    }),
    card({
      id: "highest-outstanding",
      title: "Highest outstanding?",
      answer: highestOutstanding?.labName || highestOutstanding?.labId || "—",
      reason: formatInr(highestOutstanding?.outstandingAmount ?? highestOutstanding?.outstanding),
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.risk,
      deepLinkLabel: "Credit & Risk",
    }),
    card({
      id: "strongest-admin-portfolio",
      title: "Which admin manages the strongest portfolio?",
      answer: topAdmin?.agentName || "—",
      reason: `${topAdmin?.collectionsLabel || "—"} team collections`,
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
    }),
    card({
      id: "promotion-candidate",
      title: "Who should be promoted?",
      answer: promotionCandidates[0]?.agentName || "No eligible candidates",
      reason: promotionCandidates.length
        ? `${promotionCandidates.length} eligible in payroll context`
        : "Review promotion pipeline in People Operations",
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
    }),
    card({
      id: "intervention-needed",
      title: "Who needs intervention?",
      answer: lowPerformers.map((row) => row.agentName).join(", ") || "—",
      reason: "Lowest collection performers in current reporting context",
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.commercial,
      deepLinkLabel: "Commercial",
    }),
    card({
      id: "top-territory",
      title: "Highest territory?",
      answer: topTerritory?.territoryName || performance.highestTerritory || "—",
      reason: topTerritory?.collectionsLabel || "—",
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
    }),
    card({
      id: "top-earner",
      title: "Highest earner?",
      answer: byPayroll[0]?.agentName || performance.highestEarner?.agentName || "—",
      reason: byPayroll[0]?.payrollCostLabel || "—",
      deepLinkPage: FOUNDER_DEEP_LINK_PAGES.people,
    }),
  ];

  return { previewOnly: true, cards };
}
