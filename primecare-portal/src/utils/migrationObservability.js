import {
  formatMetricDependencyTrail,
  METRIC_DEPENDENCY_GRAPH,
} from "@/metrics/metricDependencyGraph.js";

const RISK_LEVELS = new Set(["SAFE", "WARNING", "DANGEROUS"]);

const FEATURE_METRIC_KEYS = {
  "AdminDashboard.load": ["todaysRevenue", "totalSoldValue", "outstandingReceivablesTotal", "inventoryBuckets", "topLabsByRevenue"],
  "AdminDashboard.merge": ["todaysRevenue", "totalSoldValue", "outstandingReceivablesTotal", "inventoryBuckets", "topLabsByRevenue"],
  "AdminDashboard.getRecentVisits": ["recentFieldActivity"],
  "Collections.details": ["collectionsSummary"],
  "Collections.history": ["collectionsSummary"],
  "Collections.notesWrite": ["collectionsSummary"],
  "Collections.paymentWrite": ["collectionsSummary"],
  "Orders.statusWrite": ["ordersBrowse", "todaysRevenue", "totalSoldValue"],
  "AgentDashboard.completeTask": ["agentCreditBuckets"],
  "ExecutiveControlTower.load": ["todaysRevenue", "outstandingReceivablesTotal", "inventoryBuckets", "collectionsSummary"],
};

function normalizeContext(context = {}) {
  if (typeof context === "string") return { reason: context };
  if (context instanceof Error) {
    return { reason: context.message, errorName: context.name };
  }
  return context && typeof context === "object" ? context : { detail: context };
}

function normalizeRiskLevel(value, fallback = "WARNING") {
  const risk = String(value || fallback).trim().toUpperCase();
  return RISK_LEVELS.has(risk) ? risk : fallback;
}

function metricKeysFor(feature, ctx) {
  const explicit = ctx.metricKeys ?? ctx.metrics ?? ctx.metricKey;
  const keys = Array.isArray(explicit) ? explicit : explicit ? [explicit] : FEATURE_METRIC_KEYS[feature] || [];
  return keys.filter((key) => Boolean(METRIC_DEPENDENCY_GRAPH[key]));
}

function dependencyTrailFor(feature, ctx) {
  return metricKeysFor(feature, ctx).map((key) => ({
    metric: key,
    trail: formatMetricDependencyTrail(key),
  }));
}

function compactContext(ctx, riskLevel) {
  const rest = { ...ctx };
  delete rest.primarySourceExpected;
  delete rest.fallbackSourceUsed;
  delete rest.fallbackType;
  delete rest.metricKey;
  delete rest.metricKeys;
  delete rest.metrics;
  delete rest.reason;
  delete rest.message;
  delete rest.riskLevel;
  return Object.fromEntries(
    Object.entries({ ...rest, riskLevel }).filter(([, value]) => value !== undefined)
  );
}

function buildPayload(feature, context, defaults) {
  const ctx = normalizeContext(context);
  const riskLevel = normalizeRiskLevel(ctx.riskLevel, defaults.riskLevel);
  return {
    feature,
    primarySourceExpected: ctx.primarySourceExpected ?? defaults.primarySourceExpected,
    fallbackSourceUsed: ctx.fallbackSourceUsed ?? defaults.fallbackSourceUsed,
    riskLevel,
    fallbackType: ctx.fallbackType ?? defaults.fallbackType,
    reason: ctx.reason ?? ctx.message ?? undefined,
    dependencyTrail: dependencyTrailFor(feature, ctx),
    context: compactContext(ctx, riskLevel),
  };
}

export function logAppsScriptFallbackUsed(feature, context = {}) {
  console.warn(
    "PRIMECARE FALLBACK USED",
    buildPayload(feature, context, {
      primarySourceExpected: "Supabase",
      fallbackSourceUsed: "Apps Script",
      fallbackType: "apps_script_fallback",
      riskLevel: "DANGEROUS",
    })
  );
}

export function logHybridSourceWarning(feature, context = {}) {
  console.warn(
    "PRIMECARE HYBRID SOURCE WARNING",
    buildPayload(feature, context, {
      primarySourceExpected: "Supabase",
      fallbackSourceUsed: "Mixed Supabase / Apps Script / derived sources",
      fallbackType: "hybrid_source",
      riskLevel: "WARNING",
    })
  );
}

export function logStaleFieldMigration(feature, context = {}) {
  console.warn(
    "PRIMECARE STALE FIELD WARNING",
    buildPayload(feature, context, {
      primarySourceExpected: "Canonical Supabase metric engine",
      fallbackSourceUsed: "Legacy field mapping or stale cache",
      fallbackType: "stale_field_or_cache",
      riskLevel: "WARNING",
    })
  );
}
