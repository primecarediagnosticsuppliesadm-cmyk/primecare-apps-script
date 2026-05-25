import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  getDashboard,
  getExecutiveSnapshot,
  getAIInsights,
  getRecentVisits,
} from "@/api/primecareApi";
import {
  getStockDashboard,
  getLabsCredit,
  getReorderForecastRead,
  getAdminDashboardRead,
  resolveAdminVisitRevenue,
} from "@/api/primecareSupabaseApi";
import {
  logHybridSourceWarning,
  logAppsScriptPrimarySource,
  logPartialMigrationWarning,
  logStaleFieldMigration,
  logSupabaseFeatureSource,
} from "@/utils/migrationTrace.js";
import { computeNearStockoutMergeDerived } from "@/metrics/computeInventoryMetrics.js";
import {
  countLabsCreditRiskFromCreditView,
  deriveTopLabsByRevenueFromLabsCreditFallback,
} from "@/metrics/computeRiskMetrics.js";
import { ADMIN_DASHBOARD_INVALIDATE_EVENT } from "@/utils/dashboardInvalidate.js";
import { IS_QA } from "@/config/environment";
import { perfLog, perfMark, perfTime } from "@/utils/perfLog.js";
import {
  KpiCard,
  KpiCardGrid,
  KpiSkeleton,
  PageSkeleton,
  ListSkeleton,
  EmptyState,
  StatusBadge,
} from "@/components/ux";
import { insightSeverityToVariant, visitTypeToVariant } from "@/utils/statusTokens";
import { typography } from "@/styles/designTokens";
import { cn } from "@/lib/utils";
import {
  TrendingUp,
  AlertTriangle,
  Package,
  Wallet,
  Activity,
  RefreshCw,
  Users,
  ShieldAlert,
} from "lucide-react";

const DASHBOARD_CACHE_TTL = 60 * 1000;

/**
 * When true, AdminDashboard does not call Apps Script reads (getDashboard,
 * getExecutiveSnapshot, getAIInsights, getRecentVisits) — avoids backend helpers
 * like pcaiSheetExists_ during local Supabase migration.
 *
 * Enabled when: `VITE_ADMIN_DASHBOARD_SUPABASE_ONLY=true`, or in Vite `DEV` with
 * both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set. Set
 * `VITE_ADMIN_DASHBOARD_SUPABASE_ONLY=false` to force Apps Script reads in dev.
 */
function adminDashboardSkipAppsScriptReads() {
  const override = String(import.meta.env.VITE_ADMIN_DASHBOARD_SUPABASE_ONLY || "")
    .trim()
    .toLowerCase();
  if (override === "false" || override === "0") return false;
  if (override === "true" || override === "1") return true;

  const hasSupabase =
    String(import.meta.env.VITE_SUPABASE_URL || "").trim() !== "" &&
    String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim() !== "";
  return Boolean(import.meta.env.DEV && hasSupabase);
}

const EMPTY_AI_INSIGHTS = { insights: [], recommendedActions: [] };
const EMPTY_VISITS_PAYLOAD = { visits: [] };

const adminDashboardCache = {
  dashboard: null,
  executive: null,
  insights: null,
  visits: null,
  dashboardLoadedAt: 0,
  executiveLoadedAt: 0,
  insightsLoadedAt: 0,
  visitsLoadedAt: 0,
};

function isFresh(ts) {
  return ts && Date.now() - ts < DASHBOARD_CACHE_TTL;
}

function currency(value) {
  return `₹${Number(value || 0).toLocaleString()}`;
}

function AdminDashboardLoading() {
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageSkeleton kpiCount={6} kpiColumns={6} showList={false} />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--pc-shadow-card)]">
          <div className="mb-3 h-5 w-44 animate-pulse rounded-lg bg-muted" />
          <KpiCardGrid columns={4}>
            {Array.from({ length: 4 }).map((_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </KpiCardGrid>
        </div>
        <ListSkeleton rows={4} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ListSkeleton rows={3} />
        <ListSkeleton rows={3} />
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, rightAction = null }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--pc-shadow-card)] sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className={typography.sectionTitle}>{title}</h2>
          {subtitle ? <p className={cn(typography.sectionSubtitle, "mt-1")}>{subtitle}</p> : null}
        </div>
        {rightAction}
      </div>
      {children}
    </section>
  );
}

function normalizeInsight(insight) {
  return {
    type: insight?.type || "",
    severity: insight?.severity || "low",
    title: insight?.title || "Insight",
    message: insight?.message || "",
  };
}

function visitRecencyTimestamp(visit) {
  const createdMs = new Date(visit?.createdAt || visit?.created_at || 0).getTime();
  if (Number.isFinite(createdMs) && createdMs > 0) return createdMs;
  const dateOnly = String(visit?.date || visit?.visitDate || "").slice(0, 10);
  if (!dateOnly) return 0;
  const dateMs = new Date(`${dateOnly}T12:00:00`).getTime();
  return Number.isFinite(dateMs) ? dateMs : 0;
}

function sortVisitsByRecency(visits) {
  return [...visits].sort((a, b) => visitRecencyTimestamp(b) - visitRecencyTimestamp(a));
}

function cleanActivityText(value) {
  const s = String(value ?? "").trim();
  if (!s || s === "-" || s === "—" || s.toLowerCase() === "null" || s.toLowerCase() === "undefined") {
    return "";
  }
  return s;
}

function normalizeLabelKey(value) {
  return cleanActivityText(value).toLowerCase().replace(/\s+/g, " ");
}

function isOutcomeDuplicateOfVisitType(outcomeLabel, visitType) {
  const outcome = normalizeLabelKey(outcomeLabel);
  const type = normalizeLabelKey(visitType);
  if (!outcome || !type) return false;
  if (outcome === type) return true;
  if (outcome.includes("follow") && type.includes("follow")) return true;
  return false;
}

function truncateActivityText(value, max = 80) {
  const s = cleanActivityText(value);
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function formatRelativeVisitDate(visit) {
  const dateOnly = String(visit?.date || visit?.visitDate || "").slice(0, 10);
  const createdOnly = String(visit?.createdAt || visit?.created_at || "").slice(0, 10);
  const anchor = dateOnly || createdOnly;
  if (!anchor) return "";

  const anchorMs = new Date(`${anchor}T12:00:00`).getTime();
  if (!Number.isFinite(anchorMs)) return anchor;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const anchorDay = new Date(anchorMs);
  anchorDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - anchorDay.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 14) return `${diffDays} days ago`;

  return anchorDay.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatLabResponseLabel(labResponse) {
  const lr = String(labResponse || "").trim();
  if (!lr) return "";
  if (lr === "Converted") return "Order confirmed";
  if (lr === "Need Follow-up") return "Follow-up needed";
  return lr;
}

/** Line 2 detail only — never repeats visit_type (shown once as badge on line 1). */
function buildVisitMetaDetail(visit) {
  const visitType = cleanActivityText(visit?.visitType ?? visit?.Visit_Type);
  const nextAction = cleanActivityText(visit?.nextAction ?? visit?.next_action ?? visit?.Next_Action);
  const notes = cleanActivityText(visit?.notes ?? visit?.Notes);
  const labResponse = formatLabResponseLabel(visit?.labResponse ?? visit?.Lab_Response);

  if (nextAction) return truncateActivityText(nextAction);
  if (notes) return truncateActivityText(notes);
  if (labResponse && !isOutcomeDuplicateOfVisitType(labResponse, visitType)) {
    return labResponse;
  }
  return "";
}

function normalizeVisit(visit) {
  const base = {
    id: visit?.id || visit?.Visit_ID || visit?.visitId || "",
    date: visit?.date || visit?.Visit_Date || visit?.visitDate || "",
    createdAt: visit?.createdAt || visit?.created_at || visit?.Created_At || "",
    agent: visit?.agent || visit?.Agent_Name || visit?.agentName || "",
    labName: visit?.labName || visit?.Lab_Name || "",
    labId: visit?.labId || visit?.Lab_ID || "",
    area: visit?.area || visit?.Area || "",
    visitType: visit?.visitType || visit?.Visit_Type || "",
    soldValue: Number(visit?.soldValue || visit?.Sold_Value || 0),
    labResponse: visit?.labResponse || visit?.Lab_Response || "",
    notes: visit?.notes ?? visit?.Notes ?? "",
    nextAction: visit?.nextAction ?? visit?.next_action ?? visit?.Next_Action ?? "",
  };

  if (visit?.valueSource != null && visit?.showRevenue != null) {
    return {
      ...base,
      soldValue: Number(visit.soldValue || 0),
      showRevenue: Boolean(visit.showRevenue),
      valueSource: visit.valueSource,
      linkedOrderId: visit.linkedOrderId || null,
    };
  }

  const revenue = resolveAdminVisitRevenue(base, new Map(), visit);
  return {
    ...base,
    soldValue: revenue.soldValue,
    showRevenue: revenue.showRevenue,
    valueSource: revenue.valueSource,
    linkedOrderId: revenue.linkedOrderId,
  };
}

function normalizeVisitForActivity(visit) {
  const normalized = normalizeVisit(visit);
  const visitType = cleanActivityText(normalized.visitType);
  const relativeDate = formatRelativeVisitDate(normalized);
  const enriched = {
    ...normalized,
    labName: cleanActivityText(normalized.labName),
    agent: cleanActivityText(normalized.agent),
    visitType,
    relativeDate: relativeDate === "-" ? "" : relativeDate,
    visitTypeVariant: visitTypeToVariant(visitType),
    metaDetail: buildVisitMetaDetail(normalized),
    sortTimestamp: visitRecencyTimestamp(normalized),
  };
  return enriched;
}

function openVisitFromActivity(visit, setActivePage) {
  if (typeof setActivePage !== "function") return;

  try {
    sessionStorage.setItem(
      "primecare_pending_visit_task",
      JSON.stringify({
        labId: visit.labId || "",
        labName: visit.labName || "",
        visitType: visit.visitType || "Follow-up",
        nextAction: visit.nextAction || visit.metaDetail || "",
        visitId: visit.id || "",
        source: "admin_dashboard_recent_activity",
      })
    );
  } catch (err) {
    console.warn("[AdminDashboard] Failed to store visit context:", err);
  }

  setActivePage("visits");
}

const EMPTY_STOCK_STATS = {
  totalSkus: 0,
  criticalItems: 0,
  reorderItems: 0,
  healthyItems: 0,
};

async function fetchSupabaseAdminSlice({ force = false } = {}) {
  const slice = { stock: null, labs: null, forecast: null, dashboardRead: null };
  const endPrimary = perfTime("AdminDashboard.getAdminDashboardRead");
  try {
    slice.dashboardRead = await getAdminDashboardRead({ force });
    endPrimary({ success: slice.dashboardRead?.success, force });
  } catch (e) {
    console.warn("[AdminDashboard] Supabase dashboard read skipped:", e?.message || e);
    endPrimary({ error: e?.message || String(e) });
  }

  if (slice.dashboardRead?.success && slice.dashboardRead?.data) {
    perfLog("AdminDashboard.skipRedundantSliceFetches", {
      reason: "getAdminDashboardRead already includes stock, AR, visits, and KPIs",
    });
    return slice;
  }

  const endFallback = perfTime("AdminDashboard.fallbackSliceFetches");
  const [stockSettled, labsSettled, forecastSettled] = await Promise.allSettled([
    getStockDashboard(),
    getLabsCredit(),
    getReorderForecastRead(),
  ]);
  if (stockSettled.status === "fulfilled") slice.stock = stockSettled.value;
  else console.warn("[AdminDashboard] Supabase stock skipped:", stockSettled.reason);
  if (labsSettled.status === "fulfilled") slice.labs = labsSettled.value;
  else console.warn("[AdminDashboard] Supabase labs skipped:", labsSettled.reason);
  if (forecastSettled.status === "fulfilled") slice.forecast = forecastSettled.value;
  else console.warn("[AdminDashboard] Supabase reorder forecast skipped:", forecastSettled.reason);
  endFallback();
  return slice;
}

function mergeAdminDashboardWithSupabase(supabaseSlice, summaryIn, executiveIn) {
  const dash = supabaseSlice.dashboardRead?.success ? supabaseSlice.dashboardRead.data : null;
  const dashMeta = dash?._readMeta;
  const preferSupabaseKpis = Boolean(
    dashMeta && (dashMeta.ordersCount > 0 || dashMeta.arCount > 0 || dashMeta.visitsCount > 0)
  );

  const stockStats =
    dash?.summary?.stockStats ||
    (supabaseSlice.stock?.success && supabaseSlice.stock?.data?.stats) ||
    summaryIn?.stockStats ||
    EMPTY_STOCK_STATS;

  const labs = Array.isArray(supabaseSlice.labs?.data) ? supabaseSlice.labs.data : [];
  const forecast =
    supabaseSlice.forecast?.success && Array.isArray(supabaseSlice.forecast?.data?.forecast)
      ? supabaseSlice.forecast.data.forecast
      : [];

  const labsCreditRiskCount = countLabsCreditRiskFromCreditView(labs);

  const nearStockoutDerived = computeNearStockoutMergeDerived({ forecastRows: forecast, stockStats });

  const topLabsDerived = deriveTopLabsByRevenueFromLabsCreditFallback(labs);

  const summary = {
    stockStats,
    recentVisits: Number(
      preferSupabaseKpis
        ? (dash?.summary?.recentVisits ?? 0)
        : (dash?.summary?.recentVisits ?? summaryIn?.recentVisits ?? 0)
    ),
    totalSoldValue: Number(
      preferSupabaseKpis
        ? (dash?.summary?.totalSoldValue ?? 0)
        : (dash?.summary?.totalSoldValue ?? summaryIn?.totalSoldValue ?? 0)
    ),
    todayCollections: Number(
      preferSupabaseKpis
        ? (dash?.summary?.todayCollections ?? 0)
        : (dash?.summary?.todayCollections ?? summaryIn?.todayCollections ?? 0)
    ),
  };

  const executive = {
    todaysRevenue: Number(
      preferSupabaseKpis
        ? (dash?.executive?.todaysRevenue ?? 0)
        : (dash?.executive?.todaysRevenue ??
            executiveIn?.todaysRevenue ??
            executiveIn?.todays_revenue ??
            0)
    ),
    outstandingReceivables: Number(
      preferSupabaseKpis
        ? (dash?.executive?.outstandingReceivables ?? 0)
        : (dash?.executive?.outstandingReceivables ??
            executiveIn?.outstandingReceivables ??
            executiveIn?.outstanding_receivables ??
            0)
    ),
    labsAtCreditRisk: Number(
      preferSupabaseKpis
        ? (dash?.executive?.labsAtCreditRisk ?? 0)
        : (dash?.executive?.labsAtCreditRisk ??
            executiveIn?.labsAtCreditRisk ??
            executiveIn?.labs_at_credit_risk ??
            labsCreditRiskCount)
    ),
    productsNearStockout: Number(
      preferSupabaseKpis
        ? (dash?.executive?.productsNearStockout ?? 0)
        : (dash?.executive?.productsNearStockout ??
            executiveIn?.productsNearStockout ??
            executiveIn?.products_near_stockout ??
            nearStockoutDerived)
    ),
    topLabsByRevenue:
      Array.isArray(dash?.executive?.topLabsByRevenue) && dash.executive.topLabsByRevenue.length
        ? dash.executive.topLabsByRevenue
        : Array.isArray(executiveIn?.topLabsByRevenue) && executiveIn.topLabsByRevenue.length
          ? executiveIn.topLabsByRevenue
          : topLabsDerived,
  };

  const topLabsSource =
    Array.isArray(dash?.executive?.topLabsByRevenue) && dash.executive.topLabsByRevenue.length
      ? "Supabase_fulfilled_order_rollup"
      : Array.isArray(executiveIn?.topLabsByRevenue) && executiveIn.topLabsByRevenue.length
        ? "Apps_Script_executive_cache"
        : "v_labs_credit_revenue_sort_fallback";

  const appsScriptMergeFields = [
    !dash?.summary?.stockStats && summaryIn?.stockStats ? "summary.stockStats" : null,
    dash?.summary?.recentVisits == null && summaryIn?.recentVisits != null ? "summary.recentVisits" : null,
    dash?.summary?.totalSoldValue == null && summaryIn?.totalSoldValue != null ? "summary.totalSoldValue" : null,
    dash?.executive?.todaysRevenue == null && executiveIn?.todaysRevenue != null ? "executive.todaysRevenue" : null,
    dash?.executive?.outstandingReceivables == null && executiveIn?.outstandingReceivables != null
      ? "executive.outstandingReceivables"
      : null,
    topLabsSource === "Apps_Script_executive_cache" ? "executive.topLabsByRevenue" : null,
  ].filter(Boolean);

  if (appsScriptMergeFields.length) {
    logHybridSourceWarning("AdminDashboard.merge", {
      primarySourceExpected: "Supabase getAdminDashboardRead + metric engines",
      fallbackSourceUsed: "Apps Script dashboard/executive payload",
      riskLevel: "DANGEROUS",
      metricKeys: ["todaysRevenue", "totalSoldValue", "outstandingReceivablesTotal", "inventoryBuckets", "topLabsByRevenue"],
      fields: appsScriptMergeFields,
    });
  }

  if (
    dash?.executive?.productsNearStockout != null &&
    nearStockoutDerived > Number(dash.executive.productsNearStockout || 0)
  ) {
    logHybridSourceWarning("AdminDashboard.merge", {
      primarySourceExpected: "Supabase productsNearStockout from inventory metric engine",
      fallbackSourceUsed: "Derived MAX(forecast urgency, inventory bucket sum)",
      riskLevel: "WARNING",
      metricKey: "productsNearStockout",
      supabaseBackend: dash.executive.productsNearStockout,
      derivedMaxForecastPlusInventoryBuckets: nearStockoutDerived,
      uiUses: executive.productsNearStockout,
      note:
        "UI prefers Supabase productsNearStockout from getAdminDashboardRead; merge layer computes MAX(forecast critical/high SKU count, critical+reorder from stock stats)—they can diverge.",
    });
  }

  if (topLabsSource === "Supabase_fulfilled_order_rollup") {
    console.log("KPI SOURCE VERIFIED", {
      kpi: "merge_topLabsAlignedWithSupabaseFulfilledRollup",
      topLabsSource,
    });
  } else if (topLabsSource === "Apps_Script_executive_cache") {
    logHybridSourceWarning("AdminDashboard.merge", {
      primarySourceExpected: "Supabase fulfilled-order lab revenue rollup",
      fallbackSourceUsed: "Apps Script executive topLabsByRevenue cache",
      riskLevel: "DANGEROUS",
      metricKey: "topLabsByRevenue",
      topLabsSource,
      note:
        "Not using Supabase fulfilled-order rollup path; reconcile manually if KPIs drift from Postgres.",
    });
  } else {
    logHybridSourceWarning("AdminDashboard.merge", {
      primarySourceExpected: "Supabase fulfilled-order lab revenue rollup",
      fallbackSourceUsed: "v_labs_credit revenue ordering fallback",
      riskLevel: "WARNING",
      metricKey: "topLabsByRevenue",
      topLabsSource,
      note: "Using v_labs_credit revenue ordering; differs from headline fulfilled-order KPI definition.",
    });
  }

  return {
    summary,
    executive,
    visits: dash?.visits ?? null,
    insights: dash?.insights ?? null,
  };
}

export default function AdminDashboard({ currentUser, setActivePage }) {
  const [summaryData, setSummaryData] = useState(adminDashboardCache.dashboard);
  const [executiveData, setExecutiveData] = useState(adminDashboardCache.executive);
  const [insightsData, setInsightsData] = useState(adminDashboardCache.insights);
  const [recentVisitsData, setRecentVisitsData] = useState(adminDashboardCache.visits);

  const [loading, setLoading] = useState(!adminDashboardCache.dashboard && !adminDashboardCache.executive);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadPrimaryData = async ({ force = false } = {}) => {
    const dashboardFresh =
      !force && adminDashboardCache.dashboard && isFresh(adminDashboardCache.dashboardLoadedAt);
    const executiveFresh =
      !force && adminDashboardCache.executive && isFresh(adminDashboardCache.executiveLoadedAt);

    if (dashboardFresh && executiveFresh) {
      setSummaryData(adminDashboardCache.dashboard);
      setExecutiveData(adminDashboardCache.executive);
      return;
    }

    logSupabaseFeatureSource("AdminDashboard.load", {
      apis: ["getAdminDashboardRead", "getStockDashboard?", "getLabsCredit?", "getReorderForecastRead?"],
    });
    const endLoad = perfTime("AdminDashboard.loadPrimaryData");
    const supabaseSlice = await fetchSupabaseAdminSlice({ force });
    endLoad({ force });

    const skipAppsScript = adminDashboardSkipAppsScriptReads();
    let dashboardPayload = {};
    let executivePayload = {};

    if (!skipAppsScript) {
      logHybridSourceWarning("AdminDashboard.load", {
        primarySourceExpected: "Supabase dashboard aggregate APIs",
        fallbackSourceUsed: "Apps Script getDashboard + getExecutiveSnapshot merge inputs",
        riskLevel: "DANGEROUS",
        metricKeys: ["todaysRevenue", "totalSoldValue", "outstandingReceivablesTotal", "topLabsByRevenue"],
      });
      logAppsScriptPrimarySource("AdminDashboard.load", "getDashboard + getExecutiveSnapshot");
      const [dashboardRes, executiveRes] = await Promise.allSettled([
        getDashboard(),
        getExecutiveSnapshot(),
      ]);

      dashboardPayload =
        dashboardRes.status === "fulfilled" && dashboardRes.value
          ? dashboardRes.value?.data || dashboardRes.value || {}
          : {};
      if (dashboardRes.status === "rejected") {
        console.warn("[AdminDashboard] getDashboard failed:", dashboardRes.reason);
      }

      executivePayload =
        executiveRes.status === "fulfilled" && executiveRes.value
          ? executiveRes.value?.data || executiveRes.value || {}
          : {};
      if (executiveRes.status === "rejected") {
        console.warn("[AdminDashboard] getExecutiveSnapshot failed:", executiveRes.reason);
      }
    } else {
      logPartialMigrationWarning(
        "AdminDashboard",
        "Apps Script dashboard reads skipped (DEV Supabase-only or VITE_ADMIN_DASHBOARD_SUPABASE_ONLY)."
      );
    }

    const merged = mergeAdminDashboardWithSupabase(
      supabaseSlice,
      dashboardPayload,
      executivePayload
    );

    const hasVisibleKpis =
      Number(merged.executive?.outstandingReceivables) > 0 ||
      Number(merged.summary?.totalSoldValue) > 0 ||
      Number(merged.summary?.recentVisits) > 0 ||
      Number(merged.executive?.todaysRevenue) > 0;

    if (hasVisibleKpis || force) {
      adminDashboardCache.dashboard = merged.summary;
      adminDashboardCache.executive = merged.executive;
      adminDashboardCache.dashboardLoadedAt = Date.now();
      adminDashboardCache.executiveLoadedAt = Date.now();
    } else {
      perfLog("AdminDashboard.skipClientCacheBlankKpis", { force });
    }

    if (merged.visits) {
      adminDashboardCache.visits = merged.visits;
      adminDashboardCache.visitsLoadedAt = Date.now();
      setRecentVisitsData(merged.visits);
    }
    if (merged.insights) {
      adminDashboardCache.insights = merged.insights;
      adminDashboardCache.insightsLoadedAt = Date.now();
      setInsightsData(merged.insights);
    }

    setSummaryData(merged.summary);
    setExecutiveData(merged.executive);
  };

  const loadSecondaryData = async ({ force = false } = {}) => {
    const insightsFresh =
      !force && adminDashboardCache.insights && isFresh(adminDashboardCache.insightsLoadedAt);
    const visitsFresh =
      !force && adminDashboardCache.visits && isFresh(adminDashboardCache.visitsLoadedAt);

    const tasks = [];
    const skipAppsScript = adminDashboardSkipAppsScriptReads();
    const hasSupabaseInsights =
      Array.isArray(adminDashboardCache.insights?.insights) &&
      adminDashboardCache.insights.insights.length > 0;
    const hasSupabaseVisits =
      Array.isArray(adminDashboardCache.visits?.visits) &&
      adminDashboardCache.visits.visits.length > 0;

    if (!insightsFresh) {
      if (skipAppsScript || hasSupabaseInsights) {
        if (adminDashboardCache.insights) {
          setInsightsData(adminDashboardCache.insights);
        } else {
          adminDashboardCache.insights = EMPTY_AI_INSIGHTS;
          adminDashboardCache.insightsLoadedAt = Date.now();
          setInsightsData(EMPTY_AI_INSIGHTS);
        }
      } else {
        tasks.push(
          (async () => {
            try {
              const res = await getAIInsights();
              const payload = res?.data || res || {};
              adminDashboardCache.insights = payload;
              adminDashboardCache.insightsLoadedAt = Date.now();
              setInsightsData(payload);
            } catch (err) {
              console.warn("[AdminDashboard] getAIInsights failed:", err);
              adminDashboardCache.insights = EMPTY_AI_INSIGHTS;
              adminDashboardCache.insightsLoadedAt = Date.now();
              setInsightsData(EMPTY_AI_INSIGHTS);
            }
          })()
        );
      }
    } else {
      setInsightsData(adminDashboardCache.insights);
    }

    if (!visitsFresh) {
      if (skipAppsScript || hasSupabaseVisits) {
        if (adminDashboardCache.visits) {
          setRecentVisitsData(adminDashboardCache.visits);
        } else {
          adminDashboardCache.visits = EMPTY_VISITS_PAYLOAD;
          adminDashboardCache.visitsLoadedAt = Date.now();
          setRecentVisitsData(EMPTY_VISITS_PAYLOAD);
        }
      } else {
        tasks.push(
          (async () => {
            try {
              logStaleFieldMigration("AdminDashboard.getRecentVisits", {
                primarySourceExpected: "Supabase getAdminDashboardRead visits payload",
                fallbackSourceUsed: "Apps Script getRecentVisits cache refresh",
                riskLevel: "DANGEROUS",
                metricKey: "recentFieldActivity",
                note: "Recent Visits count can remain Supabase while activity list is refreshed from Apps Script.",
              });
              const res = await getRecentVisits();
              const payload = res?.data || res || {};
              adminDashboardCache.visits = payload;
              adminDashboardCache.visitsLoadedAt = Date.now();
              setRecentVisitsData(payload);
            } catch (err) {
              console.warn("[AdminDashboard] getRecentVisits failed:", err);
              adminDashboardCache.visits = EMPTY_VISITS_PAYLOAD;
              adminDashboardCache.visitsLoadedAt = Date.now();
              setRecentVisitsData(EMPTY_VISITS_PAYLOAD);
            }
          })()
        );
      }
    } else {
      setRecentVisitsData(adminDashboardCache.visits);
    }

    if (tasks.length) {
      setBackgroundLoading(true);
      await Promise.allSettled(tasks);
      setBackgroundLoading(false);
    }
  };

  const loadAll = async ({ force = false } = {}) => {
    const endLoadAll = perfTime("AdminDashboard.loadAll");
    try {
      setErrorMessage("");

      if (!summaryData && !executiveData) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      await loadPrimaryData({ force });
    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to load admin dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
      endLoadAll({ force });
    }

    loadSecondaryData({ force }).catch((err) => {
      console.warn("[AdminDashboard] secondary panels:", err?.message || err);
    });
  };

  const dashboardInvalidateRef = useRef(() => {});
  dashboardInvalidateRef.current = () => loadAll({ force: true });

  useEffect(() => {
    const listener = () => dashboardInvalidateRef.current();
    window.addEventListener(ADMIN_DASHBOARD_INVALIDATE_EVENT, listener);
    return () => window.removeEventListener(ADMIN_DASHBOARD_INVALIDATE_EVENT, listener);
  }, []);

  useEffect(() => {
    perfMark("AdminDashboard.route.mount");
    let mounted = true;

    async function init() {
      if (!mounted) return;
      await loadAll({ force: false });
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const id = requestAnimationFrame(() => {
      perfMark("AdminDashboard.renderReady");
    });
    return () => cancelAnimationFrame(id);
  }, [loading]);

  const stockStats = summaryData?.stockStats || {};
  const executive = executiveData || {};
  const insights = Array.isArray(insightsData?.insights)
    ? insightsData.insights.map(normalizeInsight)
    : [];
  const recommendedActions = Array.isArray(insightsData?.recommendedActions)
    ? insightsData.recommendedActions
    : [];
  const recentVisits = useMemo(() => {
    if (!Array.isArray(recentVisitsData?.visits)) return [];
    return sortVisitsByRecency(recentVisitsData.visits.map(normalizeVisitForActivity)).slice(0, 5);
  }, [recentVisitsData]);

  const canOpenVisits = typeof setActivePage === "function";

  const topLabs = useMemo(() => {
    return Array.isArray(executive?.topLabsByRevenue)
      ? executive.topLabsByRevenue.slice(0, 5)
      : [];
  }, [executive]);

  if (loading) {
    return <AdminDashboardLoading />;
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className={typography.pageTitle}>Admin Dashboard</h1>
          <p className={cn(typography.pageSubtitle, "mt-1")}>
            Operational control across stock, revenue, receivables, risk, and field execution.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadAll({ force: true })}
          disabled={refreshing}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--pc-shadow-card)] hover:bg-muted/50 disabled:opacity-50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      {errorMessage ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {errorMessage}
        </div>
      ) : null}

      {backgroundLoading ? (
        <div className="rounded-2xl border border-[var(--pc-info-border)] bg-[var(--pc-info-bg)] px-4 py-3 text-sm text-[var(--pc-info)]">
          Loading secondary dashboard panels in background...
        </div>
      ) : null}

      <KpiCardGrid columns={6}>
        <KpiCard
          title="Today's Revenue"
          value={currency(executive?.todaysRevenue || 0)}
          subtitle="Current day visible revenue"
          icon={TrendingUp}
        />
        <KpiCard
          title="Receivables"
          value={currency(executive?.outstandingReceivables || 0)}
          subtitle="Outstanding collections"
          icon={Wallet}
        />
        <KpiCard
          title="Credit Risk Labs"
          value={executive?.labsAtCreditRisk || 0}
          subtitle="Labs needing attention"
          icon={ShieldAlert}
        />
        <KpiCard
          title="Near Stockout"
          value={executive?.productsNearStockout || 0}
          subtitle="Critical + reorder items"
          icon={Package}
        />
        <KpiCard
          title="Recent Visits"
          value={summaryData?.recentVisits || 0}
          subtitle="Latest field activity"
          icon={Activity}
        />
        <KpiCard
          title="Total Sold Value"
          value={currency(summaryData?.totalSoldValue || 0)}
          subtitle="Tracked visit-linked sales"
          icon={Users}
        />
      </KpiCardGrid>

      <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
        <SectionCard
          title="Inventory Snapshot"
          subtitle="Fast view of current stock health"
          rightAction={
            <button
              type="button"
              onClick={() => setActivePage?.("inventory")}
              className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/50"
            >
              Open Inventory
            </button>
          }
        >
          <KpiCardGrid columns={4}>
            <KpiCard title="Total SKUs" value={stockStats?.totalSkus || 0} icon={Package} />
            <KpiCard
              title="Critical Items"
              value={stockStats?.criticalItems || 0}
              icon={AlertTriangle}
            />
            <KpiCard title="Reorder Items" value={stockStats?.reorderItems || 0} icon={Package} />
            <KpiCard title="Healthy Items" value={stockStats?.healthyItems || 0} icon={Activity} />
          </KpiCardGrid>
        </SectionCard>

        <SectionCard
          title="Quick Actions"
          subtitle="Jump into the most-used admin workflows"
        >
          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            {[
              { label: "Orders Monitor", page: "orders" },
              { label: "Collections", page: "collections" },
              { label: "Purchase & Reorder", page: "purchase" },
              { label: "Labs", page: "labs" },
            ].map(({ label, page }) => (
              <button
                key={page}
                type="button"
                onClick={() => setActivePage?.(page)}
                className="min-h-11 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium hover:bg-muted/50"
              >
                {label}
              </button>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
        <SectionCard
          title="Top Labs by Revenue"
          subtitle="Highest visible revenue contributors"
          rightAction={
            <button
              type="button"
              onClick={() => setActivePage?.("orders")}
              className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/50"
            >
              View Orders
            </button>
          }
        >
          {topLabs.length === 0 ? (
            <EmptyState
              title="No revenue data yet"
              description="Top lab rankings appear once fulfilled orders are recorded."
            />
          ) : (
            <div className="space-y-3">
              {topLabs.map((lab, idx) => (
                <div
                  key={`${lab.labName}-${idx}`}
                  className="rounded-xl border border-border p-3 sm:p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-foreground">
                        {lab.labName || "-"}
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">Revenue contribution</div>
                    </div>
                    <div className="shrink-0 text-right text-base font-semibold text-foreground">
                      {currency(lab.revenue || 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent Field Activity"
          subtitle="Latest visible visit activity"
          rightAction={
            <button
              type="button"
              onClick={() => setActivePage?.("visits")}
              className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/50"
            >
              Open Visits
            </button>
          }
        >
          {recentVisits.length === 0 ? (
            <EmptyState
              title="No recent visits"
              description="Field activity from agents will show here after visits are logged."
            />
          ) : (
            <div className="space-y-3">
              {recentVisits.map((visit, idx) => {
                const cardKey = `${visit.id || visit.labName}-${idx}`;
                const cardInner = (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {visit.labName ? (
                          <div className="font-semibold text-slate-900">{visit.labName}</div>
                        ) : null}
                        {visit.relativeDate ? (
                          <StatusBadge variant="neutral" compact>
                            {visit.relativeDate}
                          </StatusBadge>
                        ) : null}
                        {visit.visitType ? (
                          <StatusBadge variant={visit.visitTypeVariant} compact>
                            {visit.visitType}
                          </StatusBadge>
                        ) : null}
                      </div>
                      {visit.agent || visit.metaDetail ? (
                        <div className="line-clamp-1 text-sm text-slate-500">
                          {[visit.agent, visit.metaDetail].filter(Boolean).join(" • ")}
                        </div>
                      ) : null}
                    </div>
                    <div className="min-w-[4rem] shrink-0 text-right text-sm font-semibold text-slate-900">
                      {visit.showRevenue && Number(visit.soldValue) > 0
                        ? currency(visit.soldValue)
                        : null}
                    </div>
                  </div>
                );

                if (canOpenVisits) {
                  return (
                    <button
                      key={cardKey}
                      type="button"
                      onClick={() => openVisitFromActivity(visit, setActivePage)}
                      className="w-full rounded-xl border border-border p-3 text-left transition-colors hover:border-border hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
                    >
                      {cardInner}
                    </button>
                  );
                }

                return (
                  <div key={cardKey} className="rounded-xl border border-border p-3 sm:p-4">
                    {cardInner}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
        <SectionCard
          title="AI Insights"
          subtitle="Risk and growth signals generated from current data"
          rightAction={
            <button
              type="button"
              onClick={() => setActivePage?.("insights")}
              className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted/50"
            >
              Open Insights
            </button>
          }
        >
          {insights.length === 0 ? (
            <EmptyState
              title="No AI insights yet"
              description="Insights appear when enough operational data is available to analyze."
            />
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {insights.slice(0, 4).map((item, idx) => (
                <div
                  key={`${item.type}-${idx}`}
                  className="rounded-xl border border-border p-3 sm:p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground">{item.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{item.message}</div>
                    </div>
                    <StatusBadge variant={insightSeverityToVariant(item.severity)} compact>
                      {item.severity}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recommended Actions"
          subtitle="Practical next moves from the AI layer"
        >
          {recommendedActions.length === 0 ? (
            <EmptyState
              title="No recommended actions"
              description="Action suggestions will appear alongside AI insights when available."
            />
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {recommendedActions.slice(0, 5).map((action, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border p-3 text-sm text-foreground sm:p-4"
                >
                  {action}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}