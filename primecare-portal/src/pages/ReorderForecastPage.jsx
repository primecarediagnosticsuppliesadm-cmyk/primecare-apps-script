import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Package, ClipboardCheck, TrendingUp } from "lucide-react";
import { getReorderForecast } from "@/api/primecareApi";

function StatCard({ title, value, icon: Icon, subtitle }) {
  return (
    <Card className="rounded-2xl shadow-sm border-slate-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">{title}</p>
            <h3 className="text-2xl font-bold mt-1 text-slate-900">{value}</h3>
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
          </div>
          <div className="rounded-2xl p-3 bg-slate-50">
            <Icon className="w-5 h-5 text-slate-700" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function urgencyVariant(urgency) {
  if (urgency === "Critical") return "destructive";
  if (urgency === "High") return "secondary";
  if (urgency === "Medium") return "outline";
  return "outline";
}

export default function ReorderForecastPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadForecast() {
      try {
        const res = await getReorderForecast();
        if (!res.success) throw new Error(res.error || "Failed to load reorder forecast");
        setData(res.data || {});
      } catch (err) {
        setError(err.message || "Failed to load reorder forecast");
      } finally {
        setLoading(false);
      }
    }

    loadForecast();
  }, []);

  if (loading) {
    return <div className="p-4 text-slate-600">Loading reorder forecast...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  const summary = data?.summary || {};
  const forecast = data?.forecast || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Predictive Reorder Engine</h1>
        <p className="text-sm text-muted-foreground">
          Forecast stock runout, urgency, and suggested reorder quantities.
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <StatCard
          title="Critical Items"
          value={Number(summary.criticalItems || 0)}
          icon={AlertTriangle}
          subtitle="Need immediate action"
        />
        <StatCard
          title="High Urgency"
          value={Number(summary.highUrgencyItems || 0)}
          icon={TrendingUp}
          subtitle="Should be ordered soon"
        />
        <StatCard
          title="Medium Urgency"
          value={Number(summary.mediumUrgencyItems || 0)}
          icon={Package}
          subtitle="Watch closely"
        />
        <StatCard
          title="Suggested Order Qty"
          value={Number(summary.totalSuggestedOrderQty || 0)}
          icon={ClipboardCheck}
          subtitle="Total recommended purchase"
        />
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Reorder Forecast</CardTitle>
          <CardDescription>Priority-ranked forecast by stock runout risk</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {forecast.length === 0 ? (
              <div className="text-sm text-slate-500">No forecast data found.</div>
            ) : (
              forecast.map((item, idx) => (
                <div
                  key={`${item.productId || item.productName}-${idx}`}
                  className="rounded-2xl border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {item.productName || "Unnamed Product"}
                    </div>
                    <div className="text-sm text-slate-500">
                      SKU: {item.productId || "-"} • Stock Health: {item.stockHealth || "-"}
                    </div>
                    <div className="text-sm text-slate-500 mt-1">
                      Current: {item.currentStock} • Monthly Demand: {item.monthlyDemand} • Days Left: {item.daysLeft}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant={urgencyVariant(item.urgency)}>
                      {item.urgency}
                    </Badge>
                    <Badge variant="secondary">
                      Order {Number(item.suggestedOrderQty || 0)}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}