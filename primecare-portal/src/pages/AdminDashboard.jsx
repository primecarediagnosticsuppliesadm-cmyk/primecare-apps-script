import React, { useEffect, useMemo, useState } from "react";
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
} from "@/api/primecareSupabaseApi";
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

function StatCard({ title, value, subtext, icon: Icon }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{title}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
          {subtext ? <div className="mt-1 text-xs text-slate-500">{subtext}</div> : null}
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <Icon className="h-4 w-4 text-slate-700" />
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, rightAction = null }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
        {rightAction}
      </div>
      {children}
    </div>
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

function severityBadgeClass(severity) {
  const value = String(severity || "").toLowerCase();
  if (value === "high") return "bg-red-100 text-red-700 border-red-200";
  if (value === "medium") return "bg-yellow-100 text-yellow-700 border-yellow-200";
  return "bg-green-100 text-green-700 border-green-200";
}

function normalizeVisit(visit) {
  return {
    id: visit?.id || visit?.Visit_ID || "",
    date: visit?.date || visit?.Visit_Date || "",
    agent: visit?.agent || visit?.Agent_Name || "",
    labName: visit?.labName || visit?.Lab_Name || "",
    area: visit?.area || visit?.Area || "",
    visitType: visit?.visitType || visit?.Visit_Type || "",
    soldValue: Number(visit?.soldValue || visit?.Sold_Value || 0),
    labResponse: visit?.labResponse || visit?.Lab_Response || "",
  };
}

const EMPTY_STOCK_STATS = {
  totalSkus: 0,
  criticalItems: 0,
  reorderItems: 0,
  healthyItems: 0,
};

async function fetchSupabaseAdminSlice() {
  const slice = { stock: null, labs: null, forecast: null, dashboardRead: null };
  try {
    slice.dashboardRead = await getAdminDashboardRead();
  } catch (e) {
    console.warn("[AdminDashboard] Supabase dashboard read skipped:", e?.message || e);
  }
  try {
    slice.stock = await getStockDashboard();
  } catch (e) {
    console.warn("[AdminDashboard] Supabase stock skipped:", e?.message || e);
  }
  try {
    slice.labs = await getLabsCredit();
  } catch (e) {
    console.warn("[AdminDashboard] Supabase labs skipped:", e?.message || e);
  }
  try {
    slice.forecast = await getReorderForecastRead();
  } catch (e) {
    console.warn("[AdminDashboard] Supabase reorder forecast skipped:", e?.message || e);
  }
  return slice;
}

function mergeAdminDashboardWithSupabase(supabaseSlice, summaryIn, executiveIn) {
  const dash = supabaseSlice.dashboardRead?.success ? supabaseSlice.dashboardRead.data : null;

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

  const labsCreditRiskCount = labs.filter((l) => {
    const s = String(l.creditStatus || "").toUpperCase();
    return s === "HOLD" || s === "NEAR_LIMIT";
  }).length;

  const urgentForecastCount = forecast.filter((r) => {
    const u = String(r.urgency || "").trim().toLowerCase();
    return u === "critical" || u === "high";
  }).length;

  const nearStockoutDerived = Math.max(
    urgentForecastCount,
    Number(stockStats.criticalItems || 0) + Number(stockStats.reorderItems || 0)
  );

  const topLabsDerived = [...labs]
    .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
    .slice(0, 5)
    .map((l) => ({
      labName: l.labName || l.labId || "Lab",
      revenue: Number(l.revenue || 0),
    }));

  const summary = {
    stockStats,
    recentVisits: Number(
      dash?.summary?.recentVisits ?? summaryIn?.recentVisits ?? 0
    ),
    totalSoldValue: Number(
      dash?.summary?.totalSoldValue ?? summaryIn?.totalSoldValue ?? 0
    ),
    todayCollections: Number(dash?.summary?.todayCollections ?? 0),
  };

  const executive = {
    todaysRevenue: Number(
      dash?.executive?.todaysRevenue ??
        executiveIn?.todaysRevenue ??
        executiveIn?.todays_revenue ??
        0
    ),
    outstandingReceivables: Number(
      dash?.executive?.outstandingReceivables ??
        executiveIn?.outstandingReceivables ??
        executiveIn?.outstanding_receivables ??
        0
    ),
    labsAtCreditRisk: Number(
      dash?.executive?.labsAtCreditRisk ??
        executiveIn?.labsAtCreditRisk ??
        executiveIn?.labs_at_credit_risk ??
        labsCreditRiskCount
    ),
    productsNearStockout: Number(
      dash?.executive?.productsNearStockout ??
        executiveIn?.productsNearStockout ??
        executiveIn?.products_near_stockout ??
        nearStockoutDerived
    ),
    topLabsByRevenue:
      Array.isArray(dash?.executive?.topLabsByRevenue) && dash.executive.topLabsByRevenue.length
        ? dash.executive.topLabsByRevenue
        : Array.isArray(executiveIn?.topLabsByRevenue) && executiveIn.topLabsByRevenue.length
          ? executiveIn.topLabsByRevenue
          : topLabsDerived,
  };

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

    const supabaseSlice = await fetchSupabaseAdminSlice();
    const data = {
      stock: supabaseSlice.stock?.data ?? null,
      labs: Array.isArray(supabaseSlice.labs?.data)
        ? { rowCount: supabaseSlice.labs.data.length }
        : supabaseSlice.labs?.data ?? null,
      forecast: supabaseSlice.forecast?.data ?? null,
    };
    console.log("SUPABASE ADMIN DASHBOARD:", data);

    const skipAppsScript = adminDashboardSkipAppsScriptReads();
    let dashboardPayload = {};
    let executivePayload = {};

    if (!skipAppsScript) {
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
    }

    const merged = mergeAdminDashboardWithSupabase(
      supabaseSlice,
      dashboardPayload,
      executivePayload
    );

    adminDashboardCache.dashboard = merged.summary;
    adminDashboardCache.executive = merged.executive;
    adminDashboardCache.dashboardLoadedAt = Date.now();
    adminDashboardCache.executiveLoadedAt = Date.now();

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

    if (!insightsFresh) {
      if (skipAppsScript) {
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
      if (skipAppsScript) {
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
    try {
      setErrorMessage("");

      if (!summaryData && !executiveData) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      await loadPrimaryData({ force });
      await loadSecondaryData({ force });
    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to load admin dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
      setBackgroundLoading(false);
    }
  };

  useEffect(() => {
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

  const stockStats = summaryData?.stockStats || {};
  const executive = executiveData || {};
  const insights = Array.isArray(insightsData?.insights)
    ? insightsData.insights.map(normalizeInsight)
    : [];
  const recommendedActions = Array.isArray(insightsData?.recommendedActions)
    ? insightsData.recommendedActions
    : [];
  const recentVisits = Array.isArray(recentVisitsData?.visits)
    ? recentVisitsData.visits.map(normalizeVisit).slice(0, 5)
    : [];

  const topLabs = useMemo(() => {
    return Array.isArray(executive?.topLabsByRevenue)
      ? executive.topLabsByRevenue.slice(0, 5)
      : [];
  }, [executive]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-dashed bg-white p-8 text-sm text-slate-500 shadow-sm">
          Loading admin dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Admin Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Operational control across stock, revenue, receivables, risk, and field execution.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadAll({ force: true })}
          disabled={refreshing}
          className="inline-flex items-center justify-center rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {backgroundLoading ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Loading secondary dashboard panels in background...
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Today's Revenue"
          value={currency(executive?.todaysRevenue || 0)}
          subtext="Current day visible revenue"
          icon={TrendingUp}
        />
        <StatCard
          title="Receivables"
          value={currency(executive?.outstandingReceivables || 0)}
          subtext="Outstanding collections"
          icon={Wallet}
        />
        <StatCard
          title="Credit Risk Labs"
          value={executive?.labsAtCreditRisk || 0}
          subtext="Labs needing attention"
          icon={ShieldAlert}
        />
        <StatCard
          title="Near Stockout"
          value={executive?.productsNearStockout || 0}
          subtext="Critical + reorder items"
          icon={Package}
        />
        <StatCard
          title="Recent Visits"
          value={summaryData?.recentVisits || 0}
          subtext="Latest field activity"
          icon={Activity}
        />
        <StatCard
          title="Total Sold Value"
          value={currency(summaryData?.totalSoldValue || 0)}
          subtext="Tracked visit-linked sales"
          icon={Users}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Inventory Snapshot"
          subtitle="Fast view of current stock health"
          rightAction={
            <button
              type="button"
              onClick={() => setActivePage?.("inventory")}
              className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Open Inventory
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              title="Total SKUs"
              value={stockStats?.totalSkus || 0}
              subtext=""
              icon={Package}
            />
            <StatCard
              title="Critical Items"
              value={stockStats?.criticalItems || 0}
              subtext=""
              icon={AlertTriangle}
            />
            <StatCard
              title="Reorder Items"
              value={stockStats?.reorderItems || 0}
              subtext=""
              icon={Package}
            />
            <StatCard
              title="Healthy Items"
              value={stockStats?.healthyItems || 0}
              subtext=""
              icon={Activity}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Quick Actions"
          subtitle="Jump into the most-used admin workflows"
        >
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setActivePage?.("orders")}
              className="rounded-xl border bg-white px-4 py-3 text-left text-sm font-medium hover:bg-slate-50"
            >
              Orders Monitor
            </button>
            <button
              type="button"
              onClick={() => setActivePage?.("collections")}
              className="rounded-xl border bg-white px-4 py-3 text-left text-sm font-medium hover:bg-slate-50"
            >
              Collections
            </button>
            <button
              type="button"
              onClick={() => setActivePage?.("purchase")}
              className="rounded-xl border bg-white px-4 py-3 text-left text-sm font-medium hover:bg-slate-50"
            >
              Purchase & Reorder
            </button>
            <button
              type="button"
              onClick={() => setActivePage?.("labs")}
              className="rounded-xl border bg-white px-4 py-3 text-left text-sm font-medium hover:bg-slate-50"
            >
              Labs
            </button>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="Top Labs by Revenue"
          subtitle="Highest visible revenue contributors"
          rightAction={
            <button
              type="button"
              onClick={() => setActivePage?.("orders")}
              className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              View Orders
            </button>
          }
        >
          {topLabs.length === 0 ? (
            <div className="text-sm text-slate-500">No revenue data available yet.</div>
          ) : (
            <div className="space-y-3">
              {topLabs.map((lab, idx) => (
                <div key={`${lab.labName}-${idx}`} className="rounded-2xl border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{lab.labName || "-"}</div>
                      <div className="mt-1 text-sm text-slate-500">Revenue contribution</div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold text-slate-900">
                        {currency(lab.revenue || 0)}
                      </div>
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
              className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Open Visits
            </button>
          }
        >
          {recentVisits.length === 0 ? (
            <div className="text-sm text-slate-500">No recent visit data found.</div>
          ) : (
            <div className="space-y-3">
              {recentVisits.map((visit, idx) => (
                <div key={`${visit.id || visit.labName}-${idx}`} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{visit.labName || "-"}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {visit.agent || "-"} • {visit.area || "-"} • {visit.date || "-"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full border bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                          {visit.visitType || "-"}
                        </span>
                        <span className="rounded-full border bg-slate-50 px-2 py-0.5 text-xs text-slate-700">
                          {visit.labResponse || "-"}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {currency(visit.soldValue || 0)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SectionCard
          title="AI Insights"
          subtitle="Risk and growth signals generated from current data"
          rightAction={
            <button
              type="button"
              onClick={() => setActivePage?.("insights")}
              className="rounded-xl border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Open Insights
            </button>
          }
        >
          {insights.length === 0 ? (
            <div className="text-sm text-slate-500">No AI insights available yet.</div>
          ) : (
            <div className="space-y-3">
              {insights.slice(0, 4).map((item, idx) => (
                <div key={`${item.type}-${idx}`} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{item.title}</div>
                      <div className="mt-1 text-sm text-slate-600">{item.message}</div>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${severityBadgeClass(
                        item.severity
                      )}`}
                    >
                      {item.severity}
                    </span>
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
            <div className="text-sm text-slate-500">No recommended actions available yet.</div>
          ) : (
            <div className="space-y-3">
              {recommendedActions.slice(0, 5).map((action, idx) => (
                <div key={idx} className="rounded-2xl border p-4 text-sm text-slate-700">
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