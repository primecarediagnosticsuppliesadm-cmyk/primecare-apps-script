import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Brain, ClipboardCheck, ShieldAlert } from "lucide-react";
import { getAIInsights } from "@/api/primecareApi";

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

function severityVariant(severity) {
  if (severity === "high") return "destructive";
  if (severity === "medium") return "secondary";
  return "outline";
}

export default function AIInsightsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadInsights() {
      try {
        const res = await getAIInsights();
        if (!res.success) throw new Error(res.error || "Failed to load AI insights");
        setData(res.data || {});
      } catch (err) {
        setError(err.message || "Failed to load AI insights");
      } finally {
        setLoading(false);
      }
    }

    loadInsights();
  }, []);

  if (loading) {
    return <div className="p-4 text-slate-600">Loading AI insights...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  const summary = data?.summary || {};
  const insights = data?.insights || [];
  const actions = data?.recommendedActions || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Insights</h1>
        <p className="text-sm text-muted-foreground">
          Automated operational and executive recommendations for PrimeCare.
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <StatCard
          title="Total Insights"
          value={Number(summary.totalInsights || 0)}
          icon={Brain}
          subtitle="Current AI findings"
        />
        <StatCard
          title="High Severity"
          value={Number(summary.highSeverity || 0)}
          icon={ShieldAlert}
          subtitle="Immediate attention required"
        />
        <StatCard
          title="Medium Severity"
          value={Number(summary.mediumSeverity || 0)}
          icon={AlertTriangle}
          subtitle="Needs operational review"
        />
        <StatCard
          title="Recommended Actions"
          value={actions.length}
          icon={ClipboardCheck}
          subtitle="Actionable next steps"
        />
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Insights Feed</CardTitle>
            <CardDescription>Current system-detected business signals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {insights.length === 0 ? (
                <div className="text-sm text-slate-500">No insights found.</div>
              ) : (
                insights.map((item, idx) => (
                  <div key={`${item.type}-${idx}`} className="rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold text-slate-900">{item.title}</div>
                      <Badge variant={severityVariant(item.severity)}>
                        {item.severity || "low"}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">{item.message}</div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Recommended Actions</CardTitle>
            <CardDescription>Suggested next moves for PrimeCare</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {actions.length === 0 ? (
                <div className="text-sm text-slate-500">No actions recommended.</div>
              ) : (
                actions.map((action, idx) => (
                  <div key={idx} className="rounded-2xl border p-4 text-sm text-slate-700">
                    {idx + 1}. {action}
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Generated Timestamp</CardTitle>
          <CardDescription>Last AI insights refresh</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-600">
            {data?.generatedAt || "-"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}