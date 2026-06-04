import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildWizardTenantDraft } from "@/tenant/tenantFoundationEngine.js";
import { persistPendingTenant } from "@/tenant/tenantFoundationData.js";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";

const STEPS = [
  { id: 1, title: "Company" },
  { id: 2, title: "Branding" },
  { id: 3, title: "Admin" },
  { id: 4, title: "Defaults" },
  { id: 5, title: "Review" },
];

const EMPTY = {
  company: {
    companyName: "",
    legalName: "",
    country: "India",
    state: "",
    timezone: "Asia/Kolkata",
  },
  branding: { displayName: "", primaryColor: "#4f46e5", logoDataUrl: "" },
  admin: { name: "", email: "", phone: "" },
  operations: {
    currency: "INR",
    creditDays: "30",
    collectionsRules: "Net 30 — escalate at 45 days overdue",
    rolesConfigured: false,
    productCatalogReady: false,
  },
};

export default function TenantCreationWizard({ onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const draft = useMemo(() => buildWizardTenantDraft(form), [form]);

  function patchSection(section, patch) {
    setForm((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }

  function handleLogo(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => patchSection("branding", { logoDataUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  }

  async function handleCreate() {
    setError("");
    if (!form.company.companyName?.trim()) {
      setError("Company name is required.");
      return;
    }
    if (!form.admin.email?.trim()) {
      setError("Admin email is required.");
      return;
    }
    setSaving(true);
    try {
      const row = persistPendingTenant({
        ...draft,
        config: {
          ...draft.config,
          rolesConfigured: form.operations.rolesConfigured === true,
          productCatalogReady: form.operations.productCatalogReady === true,
        },
      });
      onCreated?.(row);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to save tenant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Create distributor tenant</h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <ol className="mb-4 flex gap-1">
        {STEPS.map((s) => (
          <li
            key={s.id}
            className={cn(
              "flex-1 rounded border px-1 py-1 text-center text-[10px] font-semibold",
              step === s.id ? "border-indigo-500 bg-indigo-50 text-indigo-900" : "border-slate-200 text-slate-500"
            )}
          >
            {s.title}
          </li>
        ))}
      </ol>

      {step === 1 ? (
        <div className="space-y-2 text-sm">
          <Input
            placeholder="Company name *"
            value={form.company.companyName}
            onChange={(e) => patchSection("company", { companyName: e.target.value })}
          />
          <Input
            placeholder="Legal name"
            value={form.company.legalName}
            onChange={(e) => patchSection("company", { legalName: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Country"
              value={form.company.country}
              onChange={(e) => patchSection("company", { country: e.target.value })}
            />
            <Input
              placeholder="State"
              value={form.company.state}
              onChange={(e) => patchSection("company", { state: e.target.value })}
            />
          </div>
          <Input
            placeholder="Timezone"
            value={form.company.timezone}
            onChange={(e) => patchSection("company", { timezone: e.target.value })}
          />
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-2 text-sm">
          <Input
            placeholder="Display name"
            value={form.branding.displayName}
            onChange={(e) => patchSection("branding", { displayName: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-600">Primary color</label>
            <input
              type="color"
              value={form.branding.primaryColor}
              onChange={(e) => patchSection("branding", { primaryColor: e.target.value })}
              className="h-8 w-12 cursor-pointer rounded border"
            />
          </div>
          <input type="file" accept="image/*" onChange={(e) => handleLogo(e.target.files?.[0])} className="text-xs" />
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-2 text-sm">
          <Input
            placeholder="Admin name *"
            value={form.admin.name}
            onChange={(e) => patchSection("admin", { name: e.target.value })}
          />
          <Input
            placeholder="Admin email *"
            type="email"
            value={form.admin.email}
            onChange={(e) => patchSection("admin", { email: e.target.value })}
          />
          <Input
            placeholder="Phone"
            value={form.admin.phone}
            onChange={(e) => patchSection("admin", { phone: e.target.value })}
          />
        </div>
      ) : null}

      {step === 4 ? (
        <div className="space-y-2 text-sm">
          <Input
            placeholder="Currency"
            value={form.operations.currency}
            onChange={(e) => patchSection("operations", { currency: e.target.value })}
          />
          <Input
            placeholder="Credit days"
            value={form.operations.creditDays}
            onChange={(e) => patchSection("operations", { creditDays: e.target.value })}
          />
          <Input
            placeholder="Collections rules"
            value={form.operations.collectionsRules}
            onChange={(e) => patchSection("operations", { collectionsRules: e.target.value })}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.operations.rolesConfigured}
              onChange={(e) => patchSection("operations", { rolesConfigured: e.target.checked })}
            />
            Roles configured in Supabase Auth / profiles
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={form.operations.productCatalogReady}
              onChange={(e) => patchSection("operations", { productCatalogReady: e.target.checked })}
            />
            Product catalog seeded for tenant
          </label>
        </div>
      ) : null}

      {step === 5 ? (
        <div className="space-y-2 text-xs text-slate-700">
          <p>
            <strong>{draft.name}</strong> · {draft.tenantCode}
          </p>
          <p>
            {draft.config.country}, {draft.config.state} · {draft.config.timezone}
          </p>
          <p>Admin: {draft.config.adminName} · {draft.config.adminEmail}</p>
          <p>
            {draft.config.currency} · {draft.config.creditDays} credit days
          </p>
          <p className="text-slate-500">
            Tenant is saved as PENDING in the registry. Provision rows in Supabase, then activate when
            readiness passes.
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
        {step < 5 ? (
          <Button type="button" size="sm" onClick={() => setStep((s) => Math.min(5, s + 1))}>
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={saving} onClick={() => void handleCreate()}>
            <CheckCircle2 className="h-4 w-4" /> Create tenant
          </Button>
        )}
      </div>
    </div>
  );
}
