import { useEffect, useMemo, useState } from "react";
import { getDashboard } from "../api/primecareApi";

const dashboardCache = {
  data: null,
  loadedAt: 0,
};

const CACHE_TTL_MS = 60 * 1000;

function currency(value) {
  return `₹${Number(value || 0).toLocaleString()}`;
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(dashboardCache.data);
  const [loading, setLoading] = useState(!dashboardCache.data);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = async ({ force = false } = {}) => {
    try {
      setError("");

      const isCacheValid =
        !force &&
        dashboardCache.data &&
        Date.now() - dashboardCache.loadedAt < CACHE_TTL_MS;

      if (isCacheValid) {
        setData(dashboardCache.data);
        setLoading(false);
        return;
      }

      if (!dashboardCache.data) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const res = await getDashboard();
      const payload = res?.data || res || {};

      dashboardCache.data = payload;
      dashboardCache.loadedAt = Date.now();

      setData(payload);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!mounted) return;
      await loadDashboard();
    };

    run();

    return () => {
      mounted = false;
    };
  }, []);

  const stockStats = useMemo(() => data?.stockStats || {}, [data]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-dashed bg-white p-8 text-sm text-slate-500 shadow-sm">
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PrimeCare Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Quick operational snapshot across stock and field execution.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadDashboard({ force: true })}
          disabled={refreshing}
          className="rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Total SKUs" value={stockStats.totalSkus || 0} />
        <MetricCard label="Critical Items" value={stockStats.criticalItems || 0} />
        <MetricCard label="Reorder Items" value={stockStats.reorderItems || 0} />
        <MetricCard label="Healthy Items" value={stockStats.healthyItems || 0} />
        <MetricCard label="Recent Visits" value={data?.recentVisits || 0} />
        <MetricCard label="Total Sold Value" value={currency(data?.totalSoldValue || 0)} />
      </div>
    </div>
  );
}