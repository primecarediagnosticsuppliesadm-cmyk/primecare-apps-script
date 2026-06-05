import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildProvisioningDraft } from "@/distributor/distributorProvisioningEngine.js";
import { persistProvisioningDraft } from "@/distributor/distributorProvisioningData.js";
import { BILLING_MODELS, LIFECYCLE_STATUS } from "@/distributor/distributorLifecycleEngine.js";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

const STEPS = [
  { id: 1, title: "Company" },
  { id: 2, title: "Commercial" },
  { id: 3, title: "Review" },
];

const EMPTY = {
  company: {
    distributorName: "",
    legalName: "",
    country: "India",
    state: "",
    territory: "",
    phone: "",
    email: "",
    contactName: "",
  },
  commercial: {
    contractStartDate: "",
    contractEndDate: "",
    billingModel: "fixed_monthly",
    monthlyPlatformFee: "",
    revenueSharePct: "12",
    perLabFee: "",
    lifecycleStatus: LIFECYCLE_STATUS.DRAFT,
  },
};

export default function DistributorCreateWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const draft = useMemo(() => buildProvisioningDraft(form), [form]);

  function patch(section, patchObj) {
    setForm((prev) => ({ ...prev, [section]: { ...prev[section], ...patchObj } }));
  }

  async function handleCreate() {
    setError("");
    const name = form.company.distributorName?.trim();
    if (!name) {
      setError("Distributor name is required.");
      return;
    }
    setSaving(true);
    try {
      const outcome = await persistProvisioningDraft(draft);
      onCreated?.(outcome.row, outcome);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to create distributor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">Add distributor</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <ol className="mb-3 flex gap-1">
        {STEPS.map((s) => (
          <li
            key={s.id}
            className={cn(
              "flex-1 rounded border py-1 text-center text-[10px] font-semibold",
              step === s.id ? "border-indigo-500 bg-indigo-50" : "border-slate-200"
            )}
          >
            {s.title}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="space-y-2 text-sm">
          <Input
            placeholder="Distributor name *"
            value={form.company.distributorName}
            onChange={(e) => patch("company", { distributorName: e.target.value })}
          />
          <Input
            placeholder="Legal name"
            value={form.company.legalName}
            onChange={(e) => patch("company", { legalName: e.target.value })}
          />
          <Input
            placeholder="Territories / cities (comma-separated)"
            value={form.company.territory}
            onChange={(e) => patch("company", { territory: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Country"
              value={form.company.country}
              onChange={(e) => patch("company", { country: e.target.value })}
            />
            <Input
              placeholder="State"
              value={form.company.state}
              onChange={(e) => patch("company", { state: e.target.value })}
            />
          </div>
          <Input
            placeholder="Primary contact name"
            value={form.company.contactName}
            onChange={(e) => patch("company", { contactName: e.target.value })}
          />
          <Input
            placeholder="Phone"
            value={form.company.phone}
            onChange={(e) => patch("company", { phone: e.target.value })}
          />
          <Input
            placeholder="Email"
            type="email"
            value={form.company.email}
            onChange={(e) => patch("company", { email: e.target.value })}
          />
          <p className="text-[10px] text-slate-500">
            HQ-operated distributor — no distributor login or user provisioning in Year-1.
          </p>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="date"
              placeholder="Contract start"
              value={form.commercial.contractStartDate}
              onChange={(e) => patch("commercial", { contractStartDate: e.target.value })}
            />
            <Input
              type="date"
              placeholder="Contract end"
              value={form.commercial.contractEndDate}
              onChange={(e) => patch("commercial", { contractEndDate: e.target.value })}
            />
          </div>
          <label className="text-xs font-semibold text-slate-600">Billing model</label>
          <select
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            value={form.commercial.billingModel}
            onChange={(e) => patch("commercial", { billingModel: e.target.value })}
          >
            {BILLING_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          <Input
            placeholder="Monthly platform fee (₹)"
            value={form.commercial.monthlyPlatformFee}
            onChange={(e) => patch("commercial", { monthlyPlatformFee: e.target.value })}
          />
          <Input
            placeholder="Revenue share %"
            value={form.commercial.revenueSharePct}
            onChange={(e) => patch("commercial", { revenueSharePct: e.target.value })}
          />
          <Input
            placeholder="Per-lab fee (₹)"
            value={form.commercial.perLabFee}
            onChange={(e) => patch("commercial", { perLabFee: e.target.value })}
          />
          <label className="text-xs font-semibold text-slate-600">Initial status</label>
          <select
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            value={form.commercial.lifecycleStatus}
            onChange={(e) => patch("commercial", { lifecycleStatus: e.target.value })}
          >
            <option value={LIFECYCLE_STATUS.DRAFT}>Draft</option>
            <option value={LIFECYCLE_STATUS.PENDING_LAUNCH}>Pending Launch</option>
          </select>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-1 text-xs text-slate-700">
          <p>
            <strong>Name:</strong> {form.company.distributorName || "—"}
          </p>
          <p>
            <strong>Legal:</strong> {form.company.legalName || "—"}
          </p>
          <p>
            <strong>Territories:</strong> {form.company.territory || "—"}
          </p>
          {form.company.email ? (
            <p>
              <strong>Contact:</strong> {form.company.contactName || "—"} · {form.company.email}
            </p>
          ) : null}
          <p>
            <strong>Contract:</strong> {form.commercial.contractStartDate || "—"} →{" "}
            {form.commercial.contractEndDate || "—"}
          </p>
          <p>
            <strong>Billing:</strong>{" "}
            {BILLING_MODELS.find((m) => m.id === form.commercial.billingModel)?.label}
          </p>
          <p className="text-slate-500">Saved via durable Supabase tenant provisioning.</p>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      <div className="mt-3 flex justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={step <= 1}
          onClick={() => setStep((s) => Math.max(1, s - 1))}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {step < 3 ? (
          <Button type="button" size="sm" onClick={() => setStep((s) => Math.min(3, s + 1))}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={saving} onClick={() => void handleCreate()}>
            {saving ? "Creating…" : "Create distributor"}
          </Button>
        )}
      </div>
    </div>
  );
}
