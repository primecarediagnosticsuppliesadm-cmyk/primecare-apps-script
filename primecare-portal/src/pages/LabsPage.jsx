import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users, MapPin, ClipboardCheck, AlertTriangle, ShieldAlert } from "lucide-react";
import { getLabs } from "@/api/primecareApi";

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

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function getCreditStatus(lab) {
  const explicit = String(lab.creditStatus || "").trim().toUpperCase();
  if (explicit) return explicit;

  const reason = String(lab.creditReason || "").trim().toUpperCase();
  const hold = String(lab.creditHold || "").trim().toUpperCase();
  const outstanding = Number(lab.outstanding || lab.outstandingAmount || 0);
  const creditLimit = Number(lab.creditLimit || 0);

  if (reason || hold === "YES" || hold === "HOLD") return "HOLD";
  if (creditLimit > 0 && outstanding / creditLimit >= 0.8) return "NEAR_LIMIT";
  return "OK";
}

function getCreditBadgeClasses(status) {
  switch ((status || "").toUpperCase()) {
    case "HOLD":
      return "bg-red-100 text-red-700 border border-red-200";
    case "NEAR_LIMIT":
      return "bg-yellow-100 text-yellow-700 border border-yellow-200";
    default:
      return "bg-green-100 text-green-700 border border-green-200";
  }
}

function getCreditLabel(status) {
  switch ((status || "").toUpperCase()) {
    case "HOLD":
      return "Credit Hold";
    case "NEAR_LIMIT":
      return "Near Limit";
    default:
      return "OK";
  }
}

function normalizeLab(lab) {
  const outstanding = Number(lab.outstanding ?? lab.outstandingAmount ?? 0);
  const creditLimit = Number(lab.creditLimit ?? 0);
  const daysOverdue = Number(lab.daysOverdue ?? lab.overdueDays ?? 0);
  const allowedOverdueDays = Number(lab.allowedOverdueDays ?? 15);
  const creditWarnings = Array.isArray(lab.creditWarnings) ? lab.creditWarnings : [];
  const creditReason = lab.creditReason || "";
  const creditStatus = getCreditStatus({
    ...lab,
    outstanding,
    creditLimit,
    daysOverdue,
    allowedOverdueDays,
    creditReason,
  });

  return {
    labId: lab.labId || "",
    labName: lab.labName || "",
    ownerName: lab.ownerName || "",
    phone: lab.phone || "",
    area: lab.area || "",
    assignedAgent: lab.assignedAgent || "",
    status:
      lab.status ||
      (String(lab.activeFlag || "").toUpperCase() === "N" ? "Inactive" : "Active"),
    stage: lab.stage || "Existing",
    lastVisit: lab.lastVisit || "-",
    nextFollowUp: lab.nextFollowUp || "-",
    outstandingAmount: outstanding,
    creditLimit,
    daysOverdue,
    allowedOverdueDays,
    creditHold: lab.creditHold || "",
    creditAllowed:
      typeof lab.creditAllowed === "boolean"
        ? lab.creditAllowed
        : creditStatus !== "HOLD",
    creditReason,
    creditWarnings,
    creditStatus,
    creditTerms: lab.creditTerms || "",
    visitCount: Number(lab.visitCount || 0),
    revenue: Number(lab.revenue || 0),
  };
}

function CreditBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getCreditBadgeClasses(
        status
      )}`}
    >
      {getCreditLabel(status)}
    </span>
  );
}

export default function LabsPage({ currentUser, authToken }) {
  const [labs, setLabs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creditFilter, setCreditFilter] = useState("ALL");

  useEffect(() => {
    async function loadLabs() {
      try {
        setLoading(true);
        setError("");

        console.log("LabsPage currentUser:", currentUser);
        console.log("LabsPage authToken:", authToken);

        const params = authToken ? { sessionToken: authToken } : {};
        console.log("LabsPage getLabs params:", params);

        const res = await getLabs(params);
        console.log("LabsPage getLabs response:", res);

        if (!res?.success) {
          throw new Error(res?.error || "Failed to load labs");
        }

        const rawLabs = Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.data?.labs)
          ? res.data.labs
          : [];

        const rows = rawLabs.map(normalizeLab);
        console.log("LabsPage normalized rows:", rows);

        setLabs(rows);

        setSummary({
          totalOutstanding: rows.reduce(
            (sum, x) => sum + Number(x.outstandingAmount || 0),
            0
          ),
          totalRevenue: rows.reduce(
            (sum, x) => sum + Number(x.revenue || 0),
            0
          ),
          labsWithOutstanding: rows.filter(
            (x) => Number(x.outstandingAmount || 0) > 0
          ).length,
          labsOnCreditHold: rows.filter((x) => x.creditStatus === "HOLD").length,
        });
      } catch (err) {
        console.error("Failed to load labs", err);
        setError(err.message || "Failed to load labs");
      } finally {
        setLoading(false);
      }
    }

    loadLabs();
  }, [authToken, currentUser]);

  const visibleLabs = useMemo(() => labs, [labs]);

  const filteredLabs = useMemo(() => {
    if (creditFilter === "ALL") return visibleLabs;
    return visibleLabs.filter(
      (lab) => (lab.creditStatus || "OK").toUpperCase() === creditFilter
    );
  }, [visibleLabs, creditFilter]);

  const metrics = useMemo(() => {
    return {
      total: visibleLabs.length,
      active: visibleLabs.filter(
        (x) => String(x.status).toLowerCase() === "active"
      ).length,
      assigned: visibleLabs.filter((x) => x.assignedAgent).length,
      followUps: visibleLabs.filter(
        (x) => x.nextFollowUp && x.nextFollowUp !== "-"
      ).length,
      ok: visibleLabs.filter((x) => x.creditStatus === "OK").length,
      nearLimit: visibleLabs.filter((x) => x.creditStatus === "NEAR_LIMIT").length,
      hold: visibleLabs.filter((x) => x.creditStatus === "HOLD").length,
    };
  }, [visibleLabs]);

  if (loading) {
    return <div className="p-4 text-slate-600">Loading labs...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">{error}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Labs</h1>
        <p className="text-sm text-muted-foreground">
          {currentUser?.role === "agent"
            ? "Only labs assigned to this logged-in agent are visible."
            : "Lab master, assignments, collections visibility, revenue snapshot, and credit risk."}
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <StatCard
          title="Visible Labs"
          value={metrics.total}
          icon={Building2}
          subtitle="Labs visible to this user"
        />
        <StatCard
          title="Active Labs"
          value={metrics.active}
          icon={ClipboardCheck}
          subtitle="Currently active accounts"
        />
        <StatCard
          title="Assigned"
          value={metrics.assigned}
          icon={Users}
          subtitle="Labs with assigned agent"
        />
        <StatCard
          title="Follow-ups"
          value={metrics.followUps}
          icon={MapPin}
          subtitle="Pending follow-up actions"
        />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <StatCard
          title="Credit OK"
          value={metrics.ok}
          icon={ClipboardCheck}
          subtitle="Labs cleared for ordering"
        />
        <StatCard
          title="Near Limit"
          value={metrics.nearLimit}
          icon={AlertTriangle}
          subtitle="Labs approaching credit limit"
        />
        <StatCard
          title="Credit Hold"
          value={metrics.hold}
          icon={ShieldAlert}
          subtitle="Labs blocked from ordering"
        />
      </div>

      {summary ? (
        <div className="grid md:grid-cols-4 gap-4">
          <StatCard
            title="Total Outstanding"
            value={formatCurrency(summary.totalOutstanding || 0)}
            icon={Building2}
            subtitle="Across visible lab records"
          />
          <StatCard
            title="Revenue"
            value={formatCurrency(summary.totalRevenue || 0)}
            icon={Users}
            subtitle="Visible order contribution"
          />
          <StatCard
            title="Outstanding Labs"
            value={summary.labsWithOutstanding || 0}
            icon={MapPin}
            subtitle="Labs needing collections attention"
          />
          <StatCard
            title="Credit Hold"
            value={summary.labsOnCreditHold || 0}
            icon={ClipboardCheck}
            subtitle="Labs on hold"
          />
        </div>
      ) : null}

      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Lab Directory</CardTitle>
          <CardDescription>
            Territory, assignment, collections, revenue, and credit visibility
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {["ALL", "OK", "NEAR_LIMIT", "HOLD"].map((filter) => (
              <button
                key={filter}
                onClick={() => setCreditFilter(filter)}
                className={`rounded-full px-3 py-1 text-sm border transition ${
                  creditFilter === filter
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200"
                }`}
              >
                {filter === "NEAR_LIMIT"
                  ? "Near Limit"
                  : filter === "ALL"
                  ? "All"
                  : filter}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredLabs.length === 0 ? (
              <div className="text-sm text-slate-500">No labs found for this user.</div>
            ) : (
              filteredLabs.map((lab, idx) => (
                <div
                  key={`${lab.labId || lab.labName}-${idx}`}
                  className="rounded-2xl border p-4 flex flex-col gap-4"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-slate-900">
                          {lab.labName || "Unnamed Lab"}
                        </div>
                        <CreditBadge status={lab.creditStatus} />
                        <Badge variant="secondary">{lab.status || "Active"}</Badge>
                        <Badge variant="secondary">
                          Stage: {lab.stage || "Existing"}
                        </Badge>
                      </div>

                      <div className="text-sm text-slate-500 mt-1">
                        ID: {lab.labId || "-"} • Area: {lab.area || "-"} • Assigned Agent:{" "}
                        {lab.assignedAgent || "-"}
                      </div>

                      <div className="text-sm text-slate-500 mt-1">
                        Owner: {lab.ownerName || "-"} • Phone: {lab.phone || "-"} • Credit Terms:{" "}
                        {lab.creditTerms || "-"}
                      </div>

                      {lab.creditStatus === "HOLD" && lab.creditReason ? (
                        <div className="mt-2 text-sm text-red-600 font-medium">
                          Hold Reason: {lab.creditReason}
                        </div>
                      ) : null}

                      {lab.creditStatus === "NEAR_LIMIT" ? (
                        <div className="mt-2 text-sm text-yellow-700 font-medium">
                          Warning: This lab is near its credit limit.
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2 items-center text-sm">
                      <Badge variant="outline">Visits: {lab.visitCount || 0}</Badge>
                      <Badge variant="outline">Last Visit: {lab.lastVisit || "-"}</Badge>
                      <Badge variant="outline">
                        Next Follow-up: {lab.nextFollowUp || "-"}
                      </Badge>
                      {Number(lab.outstandingAmount || 0) > 0 ? (
                        <Badge variant="outline">Outstanding</Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-slate-500 text-xs">Outstanding</div>
                      <div className="font-semibold text-slate-900">
                        {formatCurrency(lab.outstandingAmount)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-slate-500 text-xs">Credit Limit</div>
                      <div className="font-semibold text-slate-900">
                        {formatCurrency(lab.creditLimit)}
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-slate-500 text-xs">Overdue</div>
                      <div className="font-semibold text-slate-900">
                        {lab.daysOverdue || 0} / {lab.allowedOverdueDays || 15} days
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 p-3">
                      <div className="text-slate-500 text-xs">Revenue</div>
                      <div className="font-semibold text-slate-900">
                        {formatCurrency(lab.revenue)}
                      </div>
                    </div>
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