import {
  buildAgentActionQueue,
  buildAgentDailyKpis,
} from "@/pages/agentDailyWorkspace.js";
import { computeSuggestedCollectionToday } from "@/pages/agentUxPresentation.js";

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Route stops in priority order (deduped by lab).
 * @param {Object} workspace
 */
export function buildAgentRouteStops(workspace) {
  const queue = buildAgentActionQueue(workspace, { limit: 15 });
  return queue.map((item, index) => ({
    ...item,
    stopNumber: index + 1,
  }));
}

/**
 * Daily execution state for Agent OS (presentation only).
 * @param {Object} workspace
 * @param {{ extraCollectionsToday?: number }} [options]
 */
export function buildAgentOsState(workspace, options = {}) {
  const routeStops = buildAgentRouteStops(workspace);
  const kpis = buildAgentDailyKpis(workspace);
  const todayYmd = localDateYmd();
  const recentVisits = workspace.recentVisits || [];

  const visitedTodayLabIds = new Set(
    recentVisits
      .filter((v) => String(v.visitDate || "").slice(0, 10) === todayYmd)
      .map((v) => String(v.labId || "").trim())
      .filter(Boolean)
  );

  const totalStops = routeStops.length;
  const completedStops = routeStops.filter((stop) =>
    visitedTodayLabIds.has(String(stop.labId))
  ).length;

  let collectionsRecordedToday = recentVisits
    .filter((v) => String(v.visitDate || "").slice(0, 10) === todayYmd)
    .reduce((sum, v) => {
      const type = String(v.visitType || "").toLowerCase();
      const amt = Number(v.amountCollected ?? v.collectionAmount ?? v.soldValue ?? 0);
      if (type.includes("collection") || type.includes("payment") || amt > 0) {
        return sum + amt;
      }
      return sum;
    }, 0);

  if (Number(options.extraCollectionsToday || 0) > 0) {
    collectionsRecordedToday += Number(options.extraCollectionsToday);
  }

  /** @type {Map<string, number>} */
  const orderByLabId = new Map(
    routeStops.map((stop) => [String(stop.labId), stop.stopNumber])
  );

  const currentStopIndex = routeStops.findIndex(
    (stop) => !visitedTodayLabIds.has(String(stop.labId))
  );
  const currentStop =
    currentStopIndex >= 0 ? routeStops[currentStopIndex] : routeStops[routeStops.length - 1] || null;

  const dayComplete = totalStops > 0 && completedStops >= totalStops;

  const visitProgressPct =
    totalStops > 0
      ? Math.min(100, Math.round((completedStops / totalStops) * 100))
      : kpis.visitsCompletedToday > 0
        ? 100
        : 0;

  return {
    routeStops,
    orderByLabId,
    totalStops,
    completedStops,
    visitsCompletedToday: Number(kpis.visitsCompletedToday ?? 0),
    collectionsRecordedToday,
    outstandingRemaining: Number(kpis.totalOutstanding ?? 0),
    visitProgressPct,
    dayComplete,
    currentStop,
    currentStopIndex: currentStopIndex >= 0 ? currentStopIndex : Math.max(0, totalStops - 1),
  };
}

/**
 * @param {Object[]} items
 * @param {Map<string, number>} orderByLabId
 * @param {(row: Object) => string} getLabId
 */
export function sortByAgentRouteOrder(items, orderByLabId, getLabId) {
  if (!orderByLabId?.size) return items;
  return [...items].sort((a, b) => {
    const aKey = String(getLabId(a) || "");
    const bKey = String(getLabId(b) || "");
    const aOrder = orderByLabId.get(aKey) ?? 999;
    const bOrder = orderByLabId.get(bKey) ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return 0;
  });
}

/**
 * @param {number} stopNumber
 */
export function formatRouteStopBadge(stopNumber) {
  if (!stopNumber || stopNumber < 1) return "";
  return `STOP #${stopNumber}`;
}

/**
 * @param {Object} stop
 */
export function getRouteStopTargetAmount(stop) {
  const outstanding = Number(stop?.outstanding ?? stop?.outstandingAmount ?? 0);
  return computeSuggestedCollectionToday(outstanding);
}
