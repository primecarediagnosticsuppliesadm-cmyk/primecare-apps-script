import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getTenantDeliveryPolicyRead,
  upsertTenantDeliveryPolicyWrite,
} from "@/api/deliveryChargeSupabaseApi.js";
import {
  DEFAULT_DELIVERY_POLICY,
  DELIVERY_POLICY_TYPE,
  DELIVERY_POLICY_TYPE_LABELS,
} from "@/logistics/deliveryChargeEngine.js";
import { Loader2 } from "lucide-react";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function DeliveryPolicyPanel({ tenantId, currentUser, readOnly = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [policyType, setPolicyType] = useState(DEFAULT_DELIVERY_POLICY.policyType);
  const [standardCharge, setStandardCharge] = useState(
    String(DEFAULT_DELIVERY_POLICY.standardDeliveryCharge)
  );
  const [freeThreshold, setFreeThreshold] = useState(
    String(DEFAULT_DELIVERY_POLICY.freeDeliveryThreshold)
  );
  const [customerPickupAllowed, setCustomerPickupAllowed] = useState(false);
  const [expressDeliveryAllowed, setExpressDeliveryAllowed] = useState(false);
  const [maxDeliveryRadiusKm, setMaxDeliveryRadiusKm] = useState("");
  const [policyReason, setPolicyReason] = useState("");
  const [isActive, setIsActive] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError("");
    const res = await getTenantDeliveryPolicyRead(tenantId);
    if (!res.success) {
      setError(res.error || "Failed to load delivery policy");
    } else {
      const p = res.policy;
      setPolicyType(p.policyType || DELIVERY_POLICY_TYPE.STANDARD);
      setStandardCharge(String(p.standardDeliveryCharge));
      setFreeThreshold(String(p.freeDeliveryThreshold));
      setCustomerPickupAllowed(Boolean(p.customerPickupAllowed));
      setExpressDeliveryAllowed(Boolean(p.expressDeliveryAllowed));
      setMaxDeliveryRadiusKm(
        p.maxDeliveryRadiusKm != null && p.maxDeliveryRadiusKm !== ""
          ? String(p.maxDeliveryRadiusKm)
          : ""
      );
      setPolicyReason(p.policyReason || "");
      setIsActive(p.isActive !== false);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (readOnly || !tenantId) return;
    setSaving(true);
    setError("");
    setMessage("");
    const res = await upsertTenantDeliveryPolicyWrite({
      tenantId,
      policyType,
      standardDeliveryCharge: num(standardCharge),
      freeDeliveryThreshold: num(freeThreshold),
      customerPickupAllowed,
      expressDeliveryAllowed,
      maxDeliveryRadiusKm: maxDeliveryRadiusKm === "" ? null : num(maxDeliveryRadiusKm),
      policyReason,
      isActive,
      actorId:
        currentUser?.email || currentUser?.userId || currentUser?.id || currentUser?.name || "",
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to save policy");
      return;
    }
    setMessage("Delivery policy saved.");
    await load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading delivery policy…
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-900">Delivery Charge Policy</h2>
        <p className="mt-1 text-xs text-slate-500">
          Operational quotes for lab checkout and logistics. Billing integration is disabled in
          Phase 3A. Distance routing is not calculated yet — policy type and flags are stored only.
        </p>
      </div>

      {error ? (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-700">Policy type</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={policyType}
            onChange={(e) => setPolicyType(e.target.value)}
            disabled={readOnly}
          >
            {Object.values(DELIVERY_POLICY_TYPE).map((value) => (
              <option key={value} value={value}>
                {DELIVERY_POLICY_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">Standard delivery charge (₹)</span>
          <Input
            type="number"
            min="0"
            step="1"
            value={standardCharge}
            onChange={(e) => setStandardCharge(e.target.value)}
            disabled={readOnly}
            className="h-9 text-sm"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">Free delivery above (₹ subtotal)</span>
          <Input
            type="number"
            min="0"
            step="1"
            value={freeThreshold}
            onChange={(e) => setFreeThreshold(e.target.value)}
            disabled={readOnly}
            className="h-9 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={customerPickupAllowed}
            onChange={(e) => setCustomerPickupAllowed(e.target.checked)}
            disabled={readOnly}
          />
          Customer pickup allowed
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={expressDeliveryAllowed}
            onChange={(e) => setExpressDeliveryAllowed(e.target.checked)}
            disabled={readOnly}
          />
          Express delivery allowed
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">Max delivery radius (km, optional)</span>
          <Input
            type="number"
            min="0"
            step="0.1"
            value={maxDeliveryRadiusKm}
            onChange={(e) => setMaxDeliveryRadiusKm(e.target.value)}
            disabled={readOnly}
            placeholder="Not enforced yet"
            className="h-9 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={readOnly}
          />
          Policy active
        </label>
        <label className="block space-y-1 sm:col-span-2">
          <span className="text-xs font-medium text-slate-700">Reason / notes</span>
          <Textarea
            value={policyReason}
            onChange={(e) => setPolicyReason(e.target.value)}
            disabled={readOnly}
            className="min-h-[64px] resize-none text-sm"
            placeholder="Optional note for contract or manual override policies"
          />
        </label>
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        Quote priority unchanged: HQ override → customer pickup → active L1B/Hybrid contract → free
        threshold → standard charge.
      </p>

      {!readOnly ? (
        <div className="mt-4">
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save policy"
            )}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
