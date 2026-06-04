import React from "react";
import { useTenantView } from "@/context/TenantViewContext.jsx";
import { cn } from "@/lib/utils";
import { Eye, Building2 } from "lucide-react";

/**
 * Executive tenant switcher — read-only for non-home tenants (no impersonation).
 */
export default function TenantSwitcher({ options = [], className }) {
  const { viewTenantId, readOnly, setViewTenant, resetToHome, homeTenantId } = useTenantView();

  if (!options.length) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Building2 className="h-3.5 w-3.5 text-slate-500" aria-hidden />
      <label className="sr-only" htmlFor="tenant-switcher">
        View tenant
      </label>
      <select
        id="tenant-switcher"
        value={viewTenantId || homeTenantId}
        onChange={(e) => {
          const id = e.target.value;
          if (id === homeTenantId) resetToHome();
          else setViewTenant(id);
        }}
        className="max-w-[200px] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-800"
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
            {opt.readOnly ? " (read-only)" : ""}
          </option>
        ))}
      </select>
      {readOnly ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
          <Eye className="h-3 w-3" />
          Read-only
        </span>
      ) : null}
    </div>
  );
}
