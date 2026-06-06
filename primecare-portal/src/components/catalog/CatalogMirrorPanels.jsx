import React from "react";
import { StatusBadge } from "@/components/ux";
import {
  catalogMirrorStatusVariant,
  CATALOG_SYNC_STATUS,
  formatCatalogSaveResultLines,
} from "@/catalog/catalogMirrorHealth.js";
import { cn } from "@/lib/utils";

function LayerLine({ label, outcome }) {
  const variant =
    outcome === "PASS" ? "success" : outcome === "FAIL" ? "danger" : "neutral";
  return (
    <p className="text-xs text-slate-700">
      {label}: <StatusBadge variant={variant} label={outcome || "PENDING"} />
    </p>
  );
}

export function CatalogSyncHealthBadge({ health }) {
  if (!health) return null;
  return (
    <StatusBadge
      variant={catalogMirrorStatusVariant(health.status)}
      label={`Mirror: ${health.status || CATALOG_SYNC_STATUS.SYNC_PENDING}`}
    />
  );
}

export function CatalogSaveResultPanel({ saveResult, tone = "success" }) {
  if (!saveResult) return null;
  const lines = formatCatalogSaveResultLines(saveResult.productLabel, saveResult.layers);
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5 text-xs space-y-0.5",
        tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-900",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "error" && "border-red-200 bg-red-50 text-red-900"
      )}
      role="status"
    >
      <p className="font-semibold">{saveResult.headline || lines.headline}</p>
      <LayerLine label="Metadata" outcome={saveResult.layers?.metadata} />
      <LayerLine label="Products mirror" outcome={saveResult.layers?.products} />
      <LayerLine label="Inventory mirror" outcome={saveResult.layers?.inventory} />
    </div>
  );
}

export function CatalogMirrorDiagnosticsPanel({ diagnostics }) {
  if (!diagnostics) return null;
  const lastAt = diagnostics.lastSyncAttemptAt || diagnostics.lastAttempt?.at;
  return (
    <section className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3 text-xs">
      <p className="mb-2 font-semibold text-slate-800">Catalog mirror diagnostics (read-only)</p>
      <dl className="grid gap-1.5 sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Catalog items (metadata)</dt>
          <dd className="font-medium tabular-nums">{diagnostics.catalogItemsCount ?? 0}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Mirrored products</dt>
          <dd className="font-medium tabular-nums">
            {diagnostics.mirroredProductsCount ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Mirrored inventory</dt>
          <dd className="font-medium tabular-nums">
            {diagnostics.mirroredInventoryCount ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Sync status</dt>
          <dd>
            <StatusBadge
              variant={catalogMirrorStatusVariant(diagnostics.status)}
              label={diagnostics.status || CATALOG_SYNC_STATUS.SYNC_PENDING}
            />
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-slate-500">Last sync attempt</dt>
          <dd className="font-medium">
            {lastAt ? new Date(lastAt).toLocaleString("en-IN") : "No sync recorded in this browser"}
          </dd>
        </div>
      </dl>
      <div className="mt-2 space-y-0.5 border-t border-slate-200 pt-2">
        <LayerLine label="Metadata save" outcome={diagnostics.layers?.metadata} />
        <LayerLine label="Products mirror" outcome={diagnostics.layers?.products} />
        <LayerLine label="Inventory mirror" outcome={diagnostics.layers?.inventory} />
      </div>
      {diagnostics.probe?.readError ? (
        <p className="mt-2 text-[10px] text-amber-800">
          Mirror probe note: {diagnostics.probe.readError}
        </p>
      ) : null}
    </section>
  );
}
