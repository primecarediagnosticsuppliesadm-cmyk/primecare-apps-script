import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, KpiCard, KpiCardGrid } from "@/components/ux";
import { ROLES } from "@/config/roles.js";
import {
  createDistributorBillingPayment,
  listBillingPaymentsForDistributor,
  PAYMENT_TYPE_LABELS,
  PAYMENT_TYPES,
  RECORDABLE_PAYMENT_TYPES,
} from "@/api/distributorBillingSupabaseApi.js";
import {
  allowedLifecycleTransitions,
  contractExpiryState,
  lifecycleActionLabel,
  lifecycleStatusLabel,
  lifecycleStatusVariant,
} from "@/distributor/distributorLifecycleEngine.js";
import { HEALTH_BAND_VARIANT } from "@/distributor/distributorHealthEngine.js";
import { buildDistributorStageModel } from "@/distributor/distributorStageEngine.js";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Circle, TrendingUp, XCircle } from "lucide-react";

export function DashboardPanel({ dashboard, comparison = [], onSelect }) {
  if (!dashboard) return null;
  const d = dashboard;

  return (
    <div className="space-y-4">
      <KpiCardGrid>
        <KpiCard title="Total distributors" value={d.totalDistributors} />
        <KpiCard title="Active" value={d.activeDistributors} />
        <KpiCard title="Suspended" value={d.suspendedDistributors} />
        <KpiCard title="Monthly revenue" value={d.monthlyDistributorRevenueLabel} />
        <KpiCard
          title="Collected"
          value={d.collectionsFromDistributorsLabel || d.collectionsFromDistributors}
        />
        <KpiCard
          title="Top distributor"
          value={
            d.topDistributorByRevenue?.isPlaceholder
              ? "No active distributor yet"
              : d.topDistributorByRevenue?.name || "—"
          }
          subtitle={
            d.topDistributorByRevenue?.isPlaceholder
              ? undefined
              : d.topDistributorByRevenue?.revenueLabel
          }
        />
        <KpiCard
          title="Needs attention"
          value={d.needsAttentionDistributor?.name || "None"}
          subtitle={
            d.needsAttentionDistributor
              ? `${d.needsAttentionDistributor.healthBand} · ${d.needsAttentionDistributor.nextAction}`
              : undefined
          }
        />
        <KpiCard
          title="Contracts expiring"
          value={`30d: ${d.contractsExpiring30} · 60d: ${d.contractsExpiring60} · 90d: ${d.contractsExpiring90}`}
        />
      </KpiCardGrid>

      {d.billingRollup ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <p className="font-semibold text-slate-900">PrimeCare billing rollup</p>
          <p className="mt-1 text-slate-700">
            Due {d.billingRollup.totalDueLabel} · Collected {d.billingRollup.totalCollectedLabel} ·
            Outstanding {d.billingRollup.totalOutstandingLabel}
            {d.billingRollup.overdueCount ? ` · ${d.billingRollup.overdueCount} overdue` : ""}
          </p>
        </div>
      ) : null}

      <ComparisonPanel rows={comparison} onSelect={onSelect} title="Distributor portfolio" />
    </div>
  );
}

export function ComparisonPanel({ rows = [], onSelect, title = "Comparison" }) {
  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No distributors to compare yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase text-slate-500">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-slate-500">
              <th className="px-2 py-1.5">Distributor</th>
              <th className="px-2 py-1.5">Status</th>
              <th className="px-2 py-1.5">Labs</th>
              <th className="px-2 py-1.5">Revenue</th>
              <th className="px-2 py-1.5">Collections</th>
              <th className="px-2 py-1.5">Outstanding</th>
              <th className="px-2 py-1.5">Collection efficiency</th>
              <th className="px-2 py-1.5">Contract expiry</th>
              <th className="px-2 py-1.5">Health score</th>
              <th className="px-2 py-1.5">Next action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.distributorId}
                className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                onClick={() => onSelect?.(row.distributorId)}
              >
                <td className="px-2 py-1.5 font-medium">{row.distributor}</td>
                <td className="px-2 py-1.5">
                  <StatusBadge variant="neutral" label={row.status} />
                </td>
                <td className="px-2 py-1.5 tabular-nums">{row.labs}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.revenueLabel}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.collectionsLabel}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.outstandingLabel}</td>
                <td className="px-2 py-1.5 tabular-nums">
                  {row.collectionEfficiencyPct > 0 ? `${row.collectionEfficiencyPct}%` : "N/A"}
                </td>
                <td className="px-2 py-1.5">{row.contractExpiryLabel || "—"}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <span className="tabular-nums font-semibold">{row.health}</span>
                    <StatusBadge
                      variant={HEALTH_BAND_VARIANT[row.healthBand] || "neutral"}
                      label={row.healthColor || row.healthBand}
                    />
                  </div>
                </td>
                <td className="px-2 py-1.5 text-slate-600">{row.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatBillingInr(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `₹${v.toLocaleString("en-IN")}`;
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_PAYMENT_FORM = {
  amount: "",
  paymentDate: todayYmd(),
  paymentType: PAYMENT_TYPES.PLATFORM_FEE,
  reference: "",
  notes: "",
};

export function DistributorBillingDetailPanel({
  scope,
  billing,
  currentUser,
  homeTenantId,
  onPaymentRecorded,
  onPaymentsChange,
}) {
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_PAYMENT_FORM, paymentDate: todayYmd() });
  const [formError, setFormError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const isExecutive = currentUser?.role === ROLES.EXECUTIVE;
  const distributorId = scope?.tenantId;

  const loadPayments = useCallback(async () => {
    if (!distributorId) {
      setPayments([]);
      onPaymentsChange?.([]);
      return;
    }
    setPaymentsLoading(true);
    try {
      const res = await listBillingPaymentsForDistributor(distributorId);
      const rows = res.ok ? res.payments : [];
      setPayments(rows);
      onPaymentsChange?.(rows);
    } catch (err) {
      console.warn("[DistributorBilling] payment history", err);
      setPayments([]);
      onPaymentsChange?.([]);
    } finally {
      setPaymentsLoading(false);
    }
  }, [distributorId, onPaymentsChange]);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError("");
    setSaveMsg("");
  }

  function validateForm() {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Amount must be greater than zero.";
    }
    if (!String(form.paymentDate || "").trim()) {
      return "Payment date is required.";
    }
    if (!String(form.paymentType || "").trim()) {
      return "Payment type is required.";
    }
    return "";
  }

  async function handleSavePayment(event) {
    event.preventDefault();
    if (!isExecutive || !distributorId) return;

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSaving(true);
    setFormError("");
    setSaveMsg("");
    try {
      const res = await createDistributorBillingPayment(
        {
          id: `dbp-${distributorId}-${Date.now()}`,
          distributorId,
          amount: Number(form.amount),
          paymentType: form.paymentType,
          paymentDate: form.paymentDate,
          reference: form.reference || null,
          note: form.notes || null,
        },
        {
          registryTenantId: homeTenantId,
          recordedBy: currentUser?.name || currentUser?.email || "executive",
        }
      );

      if (!res.ok) {
        setFormError(res.error || "Failed to record payment.");
        return;
      }

      setForm({ ...EMPTY_PAYMENT_FORM, paymentDate: todayYmd() });
      setShowForm(false);
      setSaveMsg("Payment recorded.");
      await loadPayments();
      if (onPaymentRecorded) {
        await onPaymentRecorded();
      }
    } catch (err) {
      setFormError(err?.message || "Failed to record payment.");
    } finally {
      setSaving(false);
    }
  }

  if (!scope || !billing) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Select a distributor to view billing details and record payments.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{scope.tenantName}</h3>
          <p className="text-xs text-slate-600">
            {billing.billingModelLabel} · Due {billing.dueDate || "—"}
          </p>
        </div>
        {isExecutive ? (
          <Button type="button" size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "Record Payment"}
          </Button>
        ) : null}
      </div>

      <KpiCardGrid>
        <KpiCard title="Amount due" value={billing.amountDueLabel} />
        <KpiCard title="Collected" value={billing.collectedLabel} />
        <KpiCard title="Outstanding" value={billing.outstandingLabel} />
        <KpiCard title="Last payment" value={billing.lastPaymentDate || "—"} />
      </KpiCardGrid>

      {showForm && isExecutive ? (
        <form
          onSubmit={handleSavePayment}
          className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"
        >
          <p className="text-xs font-medium text-slate-700">Record payment</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-slate-600">
              <span>Amount (INR)</span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => updateField("amount", e.target.value)}
                placeholder="0.00"
                required
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Payment date</span>
              <Input
                type="date"
                value={form.paymentDate}
                onChange={(e) => updateField("paymentDate", e.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Payment type</span>
              <select
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={form.paymentType}
                onChange={(e) => updateField("paymentType", e.target.value)}
                required
              >
                {RECORDABLE_PAYMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PAYMENT_TYPE_LABELS[type] || type}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-slate-600">
              <span>Reference</span>
              <Input
                value={form.reference}
                onChange={(e) => updateField("reference", e.target.value)}
                placeholder="UTR / invoice / receipt"
              />
            </label>
            <label className="space-y-1 text-xs text-slate-600 sm:col-span-2">
              <span>Notes</span>
              <textarea
                className="min-h-[72px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Optional context"
              />
            </label>
          </div>
          {formError ? <p className="text-xs text-red-700">{formError}</p> : null}
          {saveMsg ? <p className="text-xs text-emerald-700">{saveMsg}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Saving…" : "Save payment"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-700">Payment history</p>
        {paymentsLoading ? (
          <p className="text-xs text-slate-500">Loading payment history…</p>
        ) : !payments.length ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No payments recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-500">
                  <th className="px-2 py-1.5">Payment date</th>
                  <th className="px-2 py-1.5">Amount</th>
                  <th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5">Reference</th>
                  <th className="px-2 py-1.5">Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-slate-100">
                    <td className="px-2 py-1.5">{payment.paymentDate || "—"}</td>
                    <td className="px-2 py-1.5 tabular-nums">{formatBillingInr(payment.amount)}</td>
                    <td className="px-2 py-1.5">
                      {PAYMENT_TYPE_LABELS[payment.paymentType] || payment.paymentType}
                    </td>
                    <td className="px-2 py-1.5">{payment.reference || "—"}</td>
                    <td className="px-2 py-1.5">{payment.recordedBy || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function BillingPanel({ billingRows = [], onSelect }) {
  if (!billingRows.length) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No distributor billing records yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-slate-50 text-left text-slate-500">
            <th className="px-2 py-1.5">Distributor</th>
            <th className="px-2 py-1.5">Billing model</th>
            <th className="px-2 py-1.5">Monthly fee</th>
            <th className="px-2 py-1.5">Revenue share %</th>
            <th className="px-2 py-1.5">Per lab fee</th>
            <th className="px-2 py-1.5">Amount due</th>
            <th className="px-2 py-1.5">Collected</th>
            <th className="px-2 py-1.5">Outstanding</th>
            <th className="px-2 py-1.5">Last payment</th>
            <th className="px-2 py-1.5">Next due</th>
            <th className="px-2 py-1.5">Billing status</th>
          </tr>
        </thead>
        <tbody>
          {billingRows.map((row) => (
            <tr
              key={row.distributorId}
              className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
              onClick={() => onSelect?.(row.distributorId)}
            >
              <td className="px-2 py-1.5 font-medium">{row.distributorName}</td>
              <td className="px-2 py-1.5">{row.billingModelLabel}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.monthlyFeeLabel}</td>
              <td className="px-2 py-1.5 tabular-nums">
                {row.revenueSharePct > 0 ? `${row.revenueSharePct}%` : "—"}
              </td>
              <td className="px-2 py-1.5 tabular-nums">{row.perLabFeeLabel}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.amountDueLabel}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.collectedLabel}</td>
              <td className="px-2 py-1.5 tabular-nums">{row.outstandingLabel}</td>
              <td className="px-2 py-1.5">{row.lastPaymentDate || "—"}</td>
              <td className="px-2 py-1.5">{row.dueDate || "—"}</td>
              <td className="px-2 py-1.5">
                <StatusBadge
                  variant={row.billingStatusVariant || "neutral"}
                  label={row.billingStatusLabel || row.paymentStatus}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PerformancePanel({ performance, billing }) {
  if (!performance) return null;
  const p = performance;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          variant={lifecycleStatusVariant(p.lifecycleStatus)}
          label={lifecycleStatusLabel(p.lifecycleStatus)}
        />
        {p.contractExpired || p.contractExpiryLabel ? (
          <span className="flex items-center gap-1 text-xs text-amber-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            {p.contractExpired ? "Expired · Renewal needed" : p.contractExpiryLabel}
          </span>
        ) : null}
        {!p.canOperate ? (
          <span className="text-xs text-red-700">Operations restricted for this status</span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-4">
        {[
          ["Labs", p.labs],
          ["Active labs", p.activeLabs],
          ["Orders", p.orders],
          ["Collections", p.collections],
          ["Contracts", p.contracts],
          ["Agents", p.agents],
          ["Commission payouts", p.commissionPayouts],
          ["Collection efficiency", `${p.collectionEfficiencyPct}%`],
        ].map(([label, val]) => (
          <div key={label} className="rounded border bg-white px-2 py-1">
            <p className="text-slate-500">{label}</p>
            <p className="font-semibold tabular-nums">{val}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-2 text-xs">
          <p className="flex items-center gap-1 text-slate-500">
            <TrendingUp className="h-3.5 w-3.5" /> Revenue contribution
          </p>
          <p className="text-sm font-bold">{p.revenueContributionPct}%</p>
          <p className="text-slate-600">{p.revenueLabel}</p>
        </div>
        <div className="rounded-lg border bg-white p-2 text-xs">
          <p className="text-slate-500">Health score</p>
          <p className="text-sm font-bold tabular-nums">{p.healthScore}</p>
          <StatusBadge
            variant={HEALTH_BAND_VARIANT[p.healthBand] || "neutral"}
            label={p.healthColor || p.healthBand}
          />
        </div>
        {billing ? (
          <div className="rounded-lg border bg-white p-2 text-xs">
            <p className="text-slate-500">Amount due to PrimeCare</p>
            <p className="text-sm font-bold">{billing.amountDueLabel}</p>
            <p className="text-slate-600">Outstanding {billing.outstandingLabel}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function LifecycleActionsPanel({ lifecycleStatus, onAction, busy = false }) {
  const transitions = allowedLifecycleTransitions(lifecycleStatus);
  const actions = [];
  if (transitions.includes("active")) {
    actions.push(lifecycleStatus === "suspended" || lifecycleStatus === "deactivated" ? "reactivate" : "activate");
  }
  if (transitions.includes("suspended")) actions.push("suspend");
  if (transitions.includes("deactivated")) actions.push("deactivate");

  if (!actions.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Button
          key={action}
          type="button"
          size="sm"
          variant={action === "deactivate" ? "outline" : "default"}
          disabled={busy}
          onClick={() => onAction?.(action)}
        >
          {lifecycleActionLabel(action)}
        </Button>
      ))}
    </div>
  );
}

export function DistributorStageProgressBar({
  distributorRow = null,
  catalogBundle = null,
  snapshot = null,
  onNavigateTab,
}) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const stageKey = useMemo(
    () =>
      [
        distributorRow?.id,
        distributorRow?.lifecycleStatus,
        distributorRow?.durable,
        distributorRow?.config?.catalogAssigned,
        distributorRow?.config?.isolationAcknowledged,
        catalogBundle?.assignedCount,
        catalogBundle?.catalogAssigned,
        snapshot?.labs?.length,
        snapshot?.contracts?.length,
      ].join("|"),
    [
      distributorRow?.id,
      distributorRow?.lifecycleStatus,
      distributorRow?.durable,
      distributorRow?.config?.catalogAssigned,
      distributorRow?.config?.isolationAcknowledged,
      catalogBundle?.assignedCount,
      catalogBundle?.catalogAssigned,
      snapshot?.labs?.length,
      snapshot?.contracts?.length,
    ]
  );

  const model = useMemo(
    () => buildDistributorStageModel({ distributorRow, catalogBundle, snapshot }),
    [stageKey]
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[DistributorStage:timing] render", {
      count: renderCountRef.current,
      stageKey,
      currentStage: model.currentStageId,
    });
  });

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase text-slate-500">Distributor stage</p>
        <StatusBadge variant="neutral" label={model.currentStageLabel} />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {model.stages.map((stage, index) => (
          <React.Fragment key={stage.id}>
            <div
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                stage.state === "complete" && "bg-emerald-100 text-emerald-800",
                stage.state === "current" && "bg-indigo-600 text-white",
                stage.state === "upcoming" && "bg-slate-100 text-slate-500"
              )}
            >
              {stage.label}
            </div>
            {index < model.stages.length - 1 ? (
              <span
                className={cn(
                  "hidden h-px w-4 sm:block",
                  stage.state === "complete" ? "bg-emerald-300" : "bg-slate-200"
                )}
              />
            ) : null}
          </React.Fragment>
        ))}
      </div>

      <ul className="grid gap-1.5 sm:grid-cols-2">
        {model.checklist.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onNavigateTab?.(item.tab)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors hover:bg-slate-50",
                item.pass ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/40"
              )}
            >
              {item.pass ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
              )}
              <span className={cn("font-medium", item.pass ? "text-emerald-900" : "text-red-900")}>
                {item.label}
              </span>
              <Circle className="ml-auto h-2.5 w-2.5 shrink-0 text-slate-300" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OperationRestrictionBanner({ scope, registryRow }) {
  if (!scope || scope.canOperate) return null;
  const config = registryRow?.config || {};
  const expiry = contractExpiryState(config);
  const msg = expiry.expired
    ? `${scope.tenantName} contract expired — renewal needed before operations resume.`
    : `${scope.tenantName} is ${lifecycleStatusLabel(scope.lifecycleStatus)} — orders and collections are blocked.`;

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", "border-amber-300 bg-amber-50 text-amber-950")}>
      {msg}
    </div>
  );
}
