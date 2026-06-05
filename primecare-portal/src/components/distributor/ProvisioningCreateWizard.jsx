import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildProvisioningDraft } from "@/distributor/distributorProvisioningEngine.js";
import { persistProvisioningDraft } from "@/distributor/distributorProvisioningData.js";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

const STEPS = [
  { id: 1, title: "Company" },
  { id: 2, title: "Defaults" },
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
  operations: {
    paymentTerms: "Net 30",
    creditLimit: "",
    commissionPct: "12",
    territoryNotes: "",
  },
};

export default function ProvisioningCreateWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const draft = useMemo(() => buildProvisioningDraft(form), [form]);

  function patch(section, patch) {
    setForm((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
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
        <h3 className="text-sm font-bold">Launch new distributor</h3>
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
            placeholder="Territory (cities/regions, comma-separated)"
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
            placeholder="Company phone"
            value={form.company.phone}
            onChange={(e) => patch("company", { phone: e.target.value })}
          />
          <Input
            placeholder="Company email"
            type="email"
            value={form.company.email}
            onChange={(e) => patch("company", { email: e.target.value })}
          />
          <p className="text-[10px] text-slate-500">
            PrimeCare HQ operates this distributor — no distributor login or user provisioning in Year-1.
          </p>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-2 text-sm">
          <Input
            placeholder="Payment terms"
            value={form.operations.paymentTerms}
            onChange={(e) => patch("operations", { paymentTerms: e.target.value })}
          />
          <Input
            placeholder="Credit limit (INR)"
            value={form.operations.creditLimit}
            onChange={(e) => patch("operations", { creditLimit: e.target.value })}
          />
          <Input
            placeholder="Default commission %"
            value={form.operations.commissionPct}
            onChange={(e) => patch("operations", { commissionPct: e.target.value })}
          />
          <Input
            placeholder="Territory notes"
            value={form.operations.territoryNotes}
            onChange={(e) => patch("operations", { territoryNotes: e.target.value })}
          />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="text-xs text-slate-700">
          <p className="font-semibold">{draft.name}</p>
          <p>{draft.config.legalName}</p>
          <p>Territory: {draft.config.territory || draft.config.territories?.join(", ")}</p>
          {draft.config.email ? <p>Contact: {draft.config.contactName || "—"} · {draft.config.email}</p> : null}
          <p className="mt-2 text-slate-500">
            Saved as draft. Complete catalog, isolation, lab, and contract milestones, then activate.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      <div className="mt-4 flex justify-between">
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
            <CheckCircle2 className="h-4 w-4" /> Create distributor
          </Button>
        )}
      </div>
    </div>
  );
}
