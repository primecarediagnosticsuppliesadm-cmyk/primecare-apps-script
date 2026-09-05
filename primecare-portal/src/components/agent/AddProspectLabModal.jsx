import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { createProspectLabWrite } from "@/api/primecareSupabaseApi";

const EMPTY_FORM = {
  labName: "",
  contactName: "",
  phone: "",
  area: "",
};

export default function AddProspectLabModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  function patch(fields) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setError("");
    setSaving(true);
    try {
      const res = await createProspectLabWrite({
        labName: form.labName,
        contactName: form.contactName,
        phone: form.phone,
        area: form.area,
      });
      if (!res?.success) {
        setError(res?.error || "Could not add this prospect. Please try again or contact HQ.");
        return;
      }
      onCreated?.(res.data);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Could not add this prospect. Please try again or contact HQ.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function handleClose() {
    if (saving) return;
    onClose?.();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-t-xl border bg-white p-4 shadow-lg sm:rounded-xl"
        aria-busy={saving}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Add Prospect</h3>
            <p className="mt-1 text-xs text-slate-600">
              Capture a Lab for HQ review. This is not an active Lab — no credit, ordering, or Lab login.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            onClick={handleClose}
            disabled={saving}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Lab name *</span>
            <Input
              name="labName"
              placeholder="Lab name"
              value={form.labName}
              onChange={(e) => patch({ labName: e.target.value })}
              required
              autoComplete="organization"
              className="min-h-11"
              disabled={saving}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Contact name *</span>
            <Input
              name="contactName"
              placeholder="Contact name"
              value={form.contactName}
              onChange={(e) => patch({ contactName: e.target.value })}
              required
              autoComplete="name"
              className="min-h-11"
              disabled={saving}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Phone *</span>
            <Input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              required
              className="min-h-11"
              disabled={saving}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">City / locality *</span>
            <Input
              name="area"
              placeholder="City / locality"
              value={form.area}
              onChange={(e) => patch({ area: e.target.value })}
              required
              autoComplete="address-level2"
              className="min-h-11"
              disabled={saving}
            />
          </label>
          {error ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" className="min-h-11 flex-1" disabled={saving}>
            {saving ? "Sending…" : "Send to HQ"}
          </Button>
        </div>
      </form>
    </div>
  );
}
