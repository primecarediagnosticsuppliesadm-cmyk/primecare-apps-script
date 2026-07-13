import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ux";
import {
  getLogisticsCouriersRead,
  setLogisticsCourierActiveWrite,
  upsertLogisticsCourierWrite,
} from "@/api/logisticsSupabaseApi.js";
import { filterCouriers, sortCouriersByName } from "@/logistics/logisticsCourierEngine.js";
import { Loader2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const EMPTY_FORM = {
  courierId: "",
  name: "",
  contactPerson: "",
  phone: "",
  email: "",
  vehicleType: "",
  isActive: true,
  notes: "",
};

export default function CourierManagementPanel({
  tenantId,
  currentUser,
  readOnly = false,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [couriers, setCouriers] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    if (!tenantId) return;
    setLoading(true);
    setError("");
    const res = await getLogisticsCouriersRead({ tenantId });
    setLoading(false);
    if (!res.success) {
      setError(res.error || "Failed to load couriers");
      return;
    }
    setCouriers(res.couriers || []);
    if (res.warning) setError(res.warning);
  };

  useEffect(() => {
    void load();
  }, [tenantId]);

  const rows = useMemo(
    () => sortCouriersByName(filterCouriers(couriers, { search })),
    [couriers, search]
  );

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormOpen(true);
    setError("");
  }

  function openEdit(row) {
    setForm({
      courierId: row.courierId,
      name: row.name,
      contactPerson: row.contactPerson,
      phone: row.phone,
      email: row.email,
      vehicleType: row.vehicleType,
      isActive: row.isActive !== false,
      notes: row.notes,
    });
    setFormOpen(true);
    setError("");
  }

  async function saveCourier() {
    setSaving(true);
    setError("");
    const res = await upsertLogisticsCourierWrite({
      tenantId,
      ...form,
      actorId: currentUser?.id || currentUser?.email,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to save courier");
      return;
    }
    setFormOpen(false);
    await load();
  }

  async function toggleActive(row) {
    if (readOnly) return;
    const res = await setLogisticsCourierActiveWrite(row.courierId, !row.isActive, tenantId);
    if (!res.success) {
      setError(res.error || "Failed to update courier status");
      return;
    }
    await load();
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Courier Management</h2>
          <p className="text-xs text-slate-500">External couriers for HQ dispatch assignment</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder="Search couriers…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {!readOnly ? (
            <Button type="button" size="sm" className="h-8 text-xs" onClick={openCreate}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Courier
            </Button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="border-b px-4 py-2 text-xs text-amber-700">{error}</p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Vehicle</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Notes</th>
              {!readOnly ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={readOnly ? 7 : 8} className="px-3 py-8 text-center text-slate-500">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={readOnly ? 7 : 8} className="px-3 py-8 text-center text-slate-500">
                  No couriers yet. Add your first external courier.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.courierId} className="hover:bg-slate-50/80">
                  <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
                  <td className="px-3 py-2">{row.contactPerson || "—"}</td>
                  <td className="px-3 py-2">{row.phone || "—"}</td>
                  <td className="px-3 py-2">{row.email || "—"}</td>
                  <td className="px-3 py-2">{row.vehicleType || "—"}</td>
                  <td className="px-3 py-2">
                    <StatusBadge variant={row.isActive !== false ? "success" : "neutral"} compact>
                      {row.isActive !== false ? "Active" : "Inactive"}
                    </StatusBadge>
                  </td>
                  <td className="max-w-[160px] truncate px-3 py-2 text-slate-600">{row.notes || "—"}</td>
                  {!readOnly ? (
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px]"
                          onClick={() => openEdit(row)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[10px]"
                          onClick={() => void toggleActive(row)}
                        >
                          {row.isActive !== false ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">
              {form.courierId ? "Edit Courier" : "Add Courier"}
            </h3>
            <div className="mt-3 space-y-2">
              <Input
                className="h-8 text-xs"
                placeholder="Courier name *"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <Input
                className="h-8 text-xs"
                placeholder="Contact person"
                value={form.contactPerson}
                onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  className="h-8 text-xs"
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
                <Input
                  className="h-8 text-xs"
                  placeholder="Email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <Input
                className="h-8 text-xs"
                placeholder="Vehicle type (optional)"
                value={form.vehicleType}
                onChange={(e) => setForm((f) => ({ ...f, vehicleType: e.target.value }))}
              />
              <Textarea
                className="min-h-[72px] text-xs"
                placeholder="Notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Active
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" disabled={saving} onClick={() => void saveCourier()}>
                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
