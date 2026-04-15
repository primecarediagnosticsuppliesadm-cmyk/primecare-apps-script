import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  IndianRupee,
  AlertTriangle,
  Package,
  Users,
  TrendingUp,
  ClipboardCheck,
} from "lucide-react";

import {
  getDashboard,
  getExecutiveSnapshot,
  getRecentVisits,
  getCollections,
  getStock,
} from "@/api/primecareApi";

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

function normalizeStockItem(item) {
  const statusRaw = String(item.stockHealth || item.status || "Healthy").toLowerCase();

  let status = "Healthy";
  if (statusRaw.includes("critical")) status = "Critical";
  else if (statusRaw.includes("reorder") || statusRaw.includes("low")) status = "Reorder";

  return {
    productId: item.productId || "",
    productName: item.productName || "",
    currentStock: Number(item.currentStock || 0),
    reorderQty: Number(item.reorderQty || 0),
    status,
  };
}

export default function ExecutiveControlTower() {
  const [dashboard, setDashboard] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [recentVisits, setRecentVisits] = useState([]);
  const [collections, setCollections] = useState([]);
  const [stock, setStock] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [dashRes, snapRes, visitsRes, collectionsRes, stockRes] = await Promise.all([
          getDashboard(),
          getExecutiveSnapshot(),
          getRecentVisits(),
          getCollections(),
          getStock(),
        ]);

        if (!dashRes.success) throw new Error(dashRes.error || "Failed to load dashboard");
        if (!snapRes.success) throw new Error(snapRes.error || "Failed to load executive snapshot");
        if (!visitsRes.success) throw new Error(visitsRes.error || "Failed to load visits");
        if (!collectionsRes.success) throw new Error(collectionsRes.error || "Failed to load collections");
        if (!stockRes.success) throw new Error(stockRes.error || "Failed to load stock");

        setDashboard(dashRes.data || {});
        setSnapshot(snapRes.data || {});
        setRecentVisits(visitsRes.data?.visits || []);
        setCollections(collectionsRes.data?.collections || []);
        setStock((stockRes.data?.inventory || []).map(normalizeStockItem));
      } catch (err) {
        setError(err.message || "Failed to load executive dashboard");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const lowStockItems = useMemo(
    () => stock.filter((item) => item.status === "Critical" || item.status === "Reorder"),
    [stock]
  );

  const topLabs = useMemo(() => snapshot?.topLabsByRevenue || [], [snapshot]);

  const highRiskCollections = useMemo(
    () =>
      collections.filter((item) =>
        String(item.riskStatus || "").toLowerCase().includes("high")
      ),
    [collections]
  );

  const aiRecommendations = useMemo(() => {
    const recs = [];

    if (Number(snapshot?.productsNearStockout || 0) > 0) {
      recs.push("Reorder planning needed immediately for low-stock products.");
    }

    if (Number(snapshot?.labsAtCreditRisk || 0) > 0) {
      recs.push("Collections focus needed on high-risk labs before extending more credit.");
    }

    if ((topLabs || []).length > 0) {
      recs.push("Protect top revenue labs with better service levels and faster follow-up.");
    }

    if ((recentVisits || []).length < 5) {
      recs.push("Field activity looks light. Increase visit coverage to drive conversions.");
    }

    if (recs.length === 0) {
      recs.push("Operations look stable. Focus on growth and lab expansion.");
    }

    return recs;
  }, [snapshot, topLabs, recentVisits]);

  if (loading) {
    return <div className="p-4 text-slate-600">Loading executive control tower...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Executive Control Tower</h1>
        <p className="text-sm text-muted-foreground">
          PrimeCare business health, risks, growth signals, and next actions.
        </p>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <StatCard
          title="Today's Revenue"
          value={`₹${Number(snapshot?.todaysRevenue || 0).toLocaleString()}`}
          icon={IndianRupee}
          subtitle="Today's order value"
        />
        <StatCard
          title="Outstanding Receivables"
          value={`₹${Number(snapshot?.outstandingReceivables || 0).toLocaleString()}`}
          icon={ClipboardCheck}
          subtitle="Open receivables"
        />
        <StatCard
          title="Labs at Credit Risk"
          value={Number(snapshot?.labsAtCreditRisk || 0)}
          icon={AlertTriangle}
          subtitle="High-risk receivables"
        />
        <StatCard
          title="Products Near Stockout"
          value={Number(snapshot?.productsNearStockout || 0)}
          icon={Package}
          subtitle="Critical and reorder items"
        />
        <StatCard
          title="Recent Field Activity"
          value={recentVisits.length}
          icon={Users}
          subtitle="Latest visit records"
        />
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <Card className="rounded-2xl shadow-sm xl:col-span-2">
          <CardHeader>
            <CardTitle>Top Labs by Revenue</CardTitle>
            <CardDescription>Highest-revenue labs from current data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topLabs.length === 0 ? (
                <div className="text-sm text-slate-500">No top lab revenue data found.</div>
              ) : (
                topLabs.map((lab, idx) => (
                  <div
                    key={`${lab.labName}-${idx}`}
                    className="rounded-2xl border p-4 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        #{idx + 1} {lab.labName}
                      </div>
                      <div className="text-sm text-slate-500">
                        Revenue-driving account
                      </div>
                    </div>

                    <Badge variant="secondary">
                      ₹{Number(lab.revenue || 0).toLocaleString()}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>AI Recommendations</CardTitle>
            <CardDescription>Priority actions for PrimeCare growth and control</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {aiRecommendations.map((rec, idx) => (
                <div key={idx} className="rounded-2xl border p-4 text-sm text-slate-700">
                  {rec}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid xl:grid-cols-2 gap-6">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Credit Risk Watch</CardTitle>
            <CardDescription>High-risk labs needing executive attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {highRiskCollections.length === 0 ? (
                <div className="text-sm text-slate-500">No high-risk labs found.</div>
              ) : (
                highRiskCollections.slice(0, 6).map((item, idx) => (
                  <div
                    key={`${item.labName}-${idx}`}
                    className="rounded-2xl border p-4 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">{item.labName || "-"}</div>
                      <div className="text-sm text-slate-500">
                        Overdue: {Number(item.overdueDays || 0)}d • Agent: {item.assignedAgent || "-"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        ₹{Number(item.outstandingAmount || 0).toLocaleString()}
                      </Badge>
                      <Badge>{item.riskStatus || "High"}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Supply Risk Watch</CardTitle>
            <CardDescription>Products near stockout requiring action</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockItems.length === 0 ? (
                <div className="text-sm text-slate-500">No supply risk items found.</div>
              ) : (
                lowStockItems.slice(0, 6).map((item, idx) => (
                  <div
                    key={`${item.productId || item.productName}-${idx}`}
                    className="rounded-2xl border p-4 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="font-semibold text-slate-900">
                        {item.productName || "Unnamed Product"}
                      </div>
                      <div className="text-sm text-slate-500">
                        Current: {item.currentStock} • Reorder Qty: {item.reorderQty}
                      </div>
                    </div>

                    <Badge variant={item.status === "Critical" ? "destructive" : "secondary"}>
                      {item.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Recent Field Signal</CardTitle>
          <CardDescription>Latest visible activity from the field</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentVisits.length === 0 ? (
              <div className="text-sm text-slate-500">No recent field activity found.</div>
            ) : (
              recentVisits.slice(0, 6).map((visit, idx) => (
                <div
                  key={`${visit.id || visit.labName}-${idx}`}
                  className="rounded-2xl border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{visit.labName || "-"}</div>
                    <div className="text-sm text-slate-500">
                      {visit.area || "-"} • {visit.agent || "-"} • {visit.date || "-"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center text-sm">
                    <Badge>{visit.visitType || "-"}</Badge>
                    <Badge variant="secondary">Response: {visit.labResponse || "-"}</Badge>
                    <Badge variant="secondary">Demo: {visit.demoGiven || "-"}</Badge>
                    <Badge variant="secondary">
                      Sales: ₹{Number(visit.soldValue || 0).toLocaleString()}
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