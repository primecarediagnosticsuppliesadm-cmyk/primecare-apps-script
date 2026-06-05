import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Building2,
  Users,
  MapPin,
  ClipboardCheck,
  AlertTriangle,
  ShieldAlert,
  Plus,
  X,
} from "lucide-react";
import { createLabWrite, getLabsCredit } from "@/api/primecareSupabaseApi";
import { ROLES } from "@/config/roles";
import { deriveCreditTierFromLabRecord } from "@/metrics/creditTier.js";
import { summarizeLabsCreditPortfolio } from "@/metrics/computeRiskMetrics.js";
import { filterLabsForUser } from "@/utils/accessFilters.js";
import { loadTenantFoundationRegistry } from "@/tenant/tenantFoundationData.js";
import {
  readDistributorLabContext,
  setDistributorLabContext,
} from "@/tenant/tenantFoundationStore.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";

function str(v) {
  return String(v ?? "").trim();
}

const EMPTY_LAB_FORM = {
  labName: "",
  tenantId: "",
  cityTerritory: "",
  contactName: "",
  phone: "",
  email: "",
  creditLimit: "",
  paymentTerms: "Net 30",
};

function AddLabModal({
  distributors,
  defaultTenantId,
  defaultTenantName = "",
  lockDistributor = false,
  homeTenantId = "",
  distributorContextTenantId = "",
  isExecutive = false,
  onClose,
  onCreated,
}) {
  const [form, setForm] = useState({
    ...EMPTY_LAB_FORM,
    tenantId: defaultTenantId || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultTenantId) {
      setForm((prev) => ({ ...prev, tenantId: defaultTenantId }));
    }
  }, [defaultTenantId]);
  const showDistributorPicker = !lockDistributor && isExecutive && distributors.length > 1;
  const lockedDistributorName =
    defaultTenantName ||
    distributors.find((d) => d.id === form.tenantId)?.name ||
    "Selected distributor";

  function patch(fields) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const res = await createLabWrite({
        ...form,
        homeTenantId,
        distributorContextTenantId:
          distributorContextTenantId || (lockDistributor ? form.tenantId : ""),
        selectedDistributorTenantId: distributorContextTenantId || form.tenantId,
        forbidHomeTenant:
          lockDistributor &&
          Boolean(distributorContextTenantId || form.tenantId) &&
          str(distributorContextTenantId || form.tenantId) !== str(homeTenantId),
      });
      if (!res?.success) {
        throw new Error(res?.error || "Failed to create lab");
      }
      onCreated?.(res.data);
      onClose?.();
    } catch (err) {
      setError(err.message || "Failed to create lab");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-xl border bg-white p-4 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Add lab</h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2 text-sm">
          {lockDistributor ? (
            <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs">
              <p className="font-semibold text-indigo-900">Creating lab under:</p>
              <p className="text-indigo-800">{lockedDistributorName}</p>
            </div>
          ) : null}
          <Input
            placeholder="Lab name *"
            value={form.labName}
            onChange={(e) => patch({ labName: e.target.value })}
            required
          />
          {lockDistributor ? (
            <label className="block text-xs text-slate-600">
              Distributor
              <input
                type="text"
                className="mt-1 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                value={lockedDistributorName}
                readOnly
                aria-readonly="true"
              />
            </label>
          ) : showDistributorPicker ? (
            <select
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={form.tenantId}
              onChange={(e) => patch({ tenantId: e.target.value })}
              required
            >
              <option value="">Select distributor *</option>
              {distributors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-slate-500">
              Distributor: {distributors.find((d) => d.id === form.tenantId)?.name || "Current tenant"}
            </p>
          )}
          <Input
            placeholder="City / territory *"
            value={form.cityTerritory}
            onChange={(e) => patch({ cityTerritory: e.target.value })}
            required
          />
          <Input
            placeholder="Contact name *"
            value={form.contactName}
            onChange={(e) => patch({ contactName: e.target.value })}
            required
          />
          <Input
            placeholder="Phone *"
            value={form.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            required
          />
          <Input
            placeholder="Email *"
            type="email"
            value={form.email}
            onChange={(e) => patch({ email: e.target.value })}
            required
          />
          <Input
            placeholder="Credit limit (INR) *"
            type="number"
            min="0"
            value={form.creditLimit}
            onChange={(e) => patch({ creditLimit: e.target.value })}
            required
          />
          <Input
            placeholder="Payment terms *"
            value={form.paymentTerms}
            onChange={(e) => patch({ paymentTerms: e.target.value })}
            required
          />
        </div>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            <Plus className="h-4 w-4" /> {saving ? "Saving…" : "Create lab"}
          </Button>
        </div>
      </form>
    </div>
  );
}

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
  const creditStatus = deriveCreditTierFromLabRecord({
    ...lab,
    outstanding,
    creditLimit,
    daysOverdue,
    allowedOverdueDays,
    creditReason,
  });

  return {
    tenantId: lab.tenantId || lab.tenant_id || "",
    labId: lab.labId || "",
    labName: lab.labName || "",
    ownerName: lab.ownerName || "",
    phone: lab.phone || "",
    area: lab.area || "",
    assignedAgentId: lab.assignedAgentId || lab.assigned_agent_id || "",
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

export default function LabsPage({
  currentUser,
  authToken,
  distributorScope = null,
  embedded = false,
}) {
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const isExecutive = currentUser?.role === ROLES.EXECUTIVE;
  const isDistributorOs = Boolean(distributorScope?.tenantId);
  const [labs, setLabs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creditFilter, setCreditFilter] = useState("ALL");
  const [showAddLab, setShowAddLab] = useState(false);
  const [distributors, setDistributors] = useState([]);
  const [msg, setMsg] = useState("");
  const [labContext, setLabContext] = useState(() =>
    distributorScope?.tenantId ? readDistributorLabContext() : null
  );
  const [lastCreatedLab, setLastCreatedLab] = useState(null);

  const canAddLab =
    currentUser?.role === ROLES.EXECUTIVE || currentUser?.role === ROLES.ADMIN;

  const selectedDistributorTenantId = useMemo(() => {
    return str(distributorScope?.tenantId);
  }, [distributorScope?.tenantId]);

  const selectedDistributorName = useMemo(() => {
    if (distributorScope?.tenantName) return distributorScope.tenantName;
    if (labContext?.tenantName) return labContext.tenantName;
    return distributors.find((d) => d.id === selectedDistributorTenantId)?.name || "";
  }, [distributorScope, labContext, distributors, selectedDistributorTenantId]);

  const lockDistributor = useMemo(() => {
    if (isDistributorOs) return true;
    if (currentUser?.role === ROLES.ADMIN) return true;
    if (currentUser?.role === ROLES.EXECUTIVE) return true;
    return false;
  }, [isDistributorOs, currentUser?.role]);

  usePredatorModuleValidation(
    "Lab Portal",
    currentUser,
    {
      labsPage: true,
      homeTenantId,
      selectedDistributorTenantId,
      distributorContextLocked: lockDistributor,
      lastCreatedLabName: lastCreatedLab?.labName || "",
      lastCreatedTenantId: lastCreatedLab?.tenantId || "",
    },
    Boolean(canAddLab)
  );

  const loadLabs = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const res = await getLabsCredit();

      if (!res?.success) {
        throw new Error(res?.error || "Failed to load labs");
      }

      const rawLabs = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.labs)
          ? res.data.labs
          : [];

      const rows = rawLabs.map(normalizeLab);
      setLabs(rows);
      setSummary(summarizeLabsCreditPortfolio(rows));
    } catch (err) {
      console.error("Failed to load labs", err);
      setError(err.message || "Failed to load labs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLabs();
  }, [authToken, currentUser, loadLabs]);

  useEffect(() => {
    if (!isDistributorOs) return;
    const ctx = readDistributorLabContext();
    setLabContext(ctx);
    if (ctx?.openAddLab) {
      setShowAddLab(true);
      setDistributorLabContext({ ...ctx, openAddLab: false });
      setLabContext({ ...ctx, openAddLab: false });
    }
  }, [isDistributorOs]);

  useEffect(() => {
    if (!canAddLab || !isDistributorOs) return;
    async function loadDistributors() {
      try {
        const foundation = await loadTenantFoundationRegistry(currentUser, {
          skipLiveLoad: true,
        });
        const homeId = foundation.homeTenantId;
        const rows = (foundation.tenants || [])
          .filter((t) => t.id && t.id !== homeId && !t.isHome)
          .map((t) => ({ id: t.id, name: t.name || t.config?.companyName || t.id }));
        if (currentUser?.role === ROLES.ADMIN && currentUser?.tenantId) {
          const own = rows.find((d) => d.id === currentUser.tenantId);
          setDistributors(own ? [own] : [{ id: currentUser.tenantId, name: "My distributor" }]);
        } else {
          setDistributors(rows);
        }
      } catch (err) {
        console.warn("[LabsPage] distributor list", err);
        if (currentUser?.tenantId) {
          setDistributors([{ id: currentUser.tenantId, name: "Current tenant" }]);
        }
      }
    }
    void loadDistributors();
  }, [canAddLab, currentUser, isDistributorOs]);

  const visibleLabs = useMemo(() => {
    if (currentUser?.role === ROLES.AGENT) {
      return filterLabsForUser(labs, currentUser);
    }
    if (selectedDistributorTenantId) {
      return labs.filter(
        (lab) => str(lab.tenantId) === selectedDistributorTenantId
      );
    }
    const homeId = str(homeTenantId || currentUser?.tenantId);
    if (
      (currentUser?.role === ROLES.EXECUTIVE || currentUser?.role === ROLES.ADMIN) &&
      homeId
    ) {
      return labs.filter((lab) => str(lab.tenantId) === homeId);
    }
    return labs;
  }, [labs, currentUser, selectedDistributorTenantId, homeTenantId]);

  usePredatorModuleValidation(
    "PrimeCare OS",
    currentUser,
    {
      primecareOs: true,
      page: "labs",
      homeTenantId,
      visibleLabs: visibleLabs.map((l) => ({
        tenantId: l.tenantId,
        labId: l.labId,
      })),
    },
    !isDistributorOs && !loading
  );

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

  const defaultTenantId = isDistributorOs
    ? selectedDistributorTenantId
    : str(homeTenantId || currentUser?.tenantId);

  return (
    <div className={embedded ? "space-y-4" : "space-y-6"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {!embedded ? <h1 className="text-2xl font-semibold tracking-tight">Labs</h1> : null}
          <p className="text-sm text-muted-foreground">
            {currentUser?.role === "agent"
              ? "Only labs assigned to this logged-in agent are visible."
              : selectedDistributorTenantId
                ? `Showing labs for ${selectedDistributorName || "selected distributor"} only.`
                : "PrimeCare HQ labs only — use Distributor OS for distributor tenants."}
          </p>
          {selectedDistributorTenantId && lockDistributor ? (
            <p className="mt-1 text-xs font-medium text-indigo-700">
              Distributor context: {selectedDistributorName || selectedDistributorTenantId}
            </p>
          ) : null}
        </div>
        {canAddLab && (isDistributorOs || currentUser?.role !== ROLES.EXECUTIVE || defaultTenantId) ? (
          <Button type="button" size="sm" onClick={() => setShowAddLab(true)}>
            <Plus className="h-4 w-4" /> Add lab
          </Button>
        ) : null}
      </div>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

      {showAddLab ? (
        <AddLabModal
          distributors={distributors}
          defaultTenantId={defaultTenantId}
          defaultTenantName={selectedDistributorName}
          lockDistributor={lockDistributor && Boolean(defaultTenantId)}
          homeTenantId={homeTenantId}
          distributorContextTenantId={selectedDistributorTenantId}
          isExecutive={isExecutive}
          onClose={() => setShowAddLab(false)}
          onCreated={(data) => {
            setLastCreatedLab({
              labName: data?.labName,
              tenantId: data?.tenantId,
              labId: data?.labId,
            });
            if (selectedDistributorTenantId) {
              setDistributorLabContext({
                tenantId: selectedDistributorTenantId,
                tenantName: selectedDistributorName,
                homeTenantId,
                locked: true,
                openAddLab: false,
                source: labContext?.source || "labs",
              });
              setLabContext(readDistributorLabContext());
            }
            setMsg(`Lab created under ${selectedDistributorName || data?.tenantId} · ${data?.labName || data?.labId}`);
            void loadLabs();
          }}
        />
      ) : null}

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