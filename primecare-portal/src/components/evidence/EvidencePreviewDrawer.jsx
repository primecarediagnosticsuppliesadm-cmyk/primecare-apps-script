import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { resolveEvidencePreviewUrl, listOperationalEvidence } from "@/api/operationalEvidenceApi.js";
import { recordEvidenceEvent } from "@/operations/evidencePredator.js";
import {
  getEvidenceKindLabel,
  getEvidenceLinkLabel,
  getEvidenceRecordTypeLabel,
} from "@/utils/operationalEvidenceUi.js";
import { labIdKey } from "@/utils/labId.js";
import { cn } from "@/lib/utils";
import { Loader2, X, Image as ImageIcon } from "lucide-react";

function formatWhen(iso) {
  if (!iso) return "Unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {object|null} props.currentUser
 * @param {string} [props.labId]
 * @param {string} [props.visitId]
 * @param {string} [props.paymentId]
 * @param {object} [props.initialRecord]
 * @param {object[]} [props.records] Pre-filtered list (skips broad fetch)
 */
export default function EvidencePreviewDrawer({
  open,
  onClose,
  currentUser,
  labId,
  visitId,
  paymentId,
  initialRecord = null,
  records: recordsProp,
}) {
  const [records, setRecords] = useState([]);
  const [active, setActive] = useState(initialRecord);
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const tenantId = currentUser?.tenantId ?? currentUser?.tenant_id ?? "";

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    if (Array.isArray(recordsProp)) {
      setRecords(recordsProp);
      setActive(initialRecord || recordsProp[0] || null);
      setLoading(false);
      recordEvidenceEvent("evidence.preview_open", {
        labId,
        count: recordsProp.length,
        scoped: true,
      });
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listOperationalEvidence(tenantId, currentUser, {
          labId,
          visitId,
          paymentId,
          limit: 24,
        });
        if (cancelled) return;
        setRecords(list);
        setActive(initialRecord || list[0] || null);
        recordEvidenceEvent("evidence.preview_open", {
          labId,
          count: list.length,
        });
      } catch {
        if (!cancelled) setRecords([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, currentUser, labId, visitId, paymentId, initialRecord, recordsProp]);

  useEffect(() => {
    if (!active) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const resolved = await resolveEvidencePreviewUrl(active);
      if (!cancelled) setUrl(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Evidence preview">
      <button type="button" className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        className={cn(
          "absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-xl",
          "max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-[90vh] max-md:rounded-t-xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">Operational evidence</p>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="max-h-40 overflow-y-auto border-b md:max-h-none md:w-44 md:border-b-0 md:border-r">
            {loading ? (
              <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : records.length ? (
              <ul className="p-1">
                {records.map((r) => (
                  <li key={r.evidenceId}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-[10px]",
                        active?.evidenceId === r.evidenceId
                          ? "bg-slate-900 text-white"
                          : "hover:bg-slate-100"
                      )}
                      onClick={() => setActive(r)}
                    >
                      <span className="font-semibold">{getEvidenceKindLabel(r.kind)}</span>
                      <br />
                      <span className="opacity-80">{formatWhen(r.uploadedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-3 text-xs text-slate-500">No evidence for this context.</p>
            )}
          </aside>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            {active ? (
              <>
                <dl className="mb-2 grid grid-cols-2 gap-2 text-[10px] text-slate-600">
                  <div>
                    <dt className="text-slate-400">Type</dt>
                    <dd className="font-medium">{getEvidenceKindLabel(active.kind)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Record</dt>
                    <dd className="font-medium">{getEvidenceRecordTypeLabel(active)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Linked to</dt>
                    <dd className="font-medium">{getEvidenceLinkLabel(active)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Lab</dt>
                    <dd>{labIdKey(active.labId) || labId || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Uploaded</dt>
                    <dd>{formatWhen(active.uploadedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">By</dt>
                    <dd>{active.uploadedBy || "—"}</dd>
                  </div>
                  {active.gps ? (
                    <div className="col-span-2">
                      <dt className="text-slate-400">GPS</dt>
                      <dd>
                        {active.gps.lat?.toFixed?.(5)}, {active.gps.lng?.toFixed?.(5)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border bg-slate-50">
                  {url ? (
                    <img src={url} alt="Evidence" className="max-h-full max-w-full object-contain" />
                  ) : (
                    <ImageIcon className="h-12 w-12 text-slate-300" />
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">Select evidence to preview.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
