import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAgentVisitEvidenceRead } from "@/api/primecareSupabaseApi.js";
import { labIdKey } from "@/utils/labId.js";
import {
  getVisitHeadersForHandoffsRead,
  listOpenVisitHandoffsRead,
  respondVisitHandoffWrite,
} from "@/visits/visitHandoffsApi.js";

function str(v) {
  return String(v ?? "").trim();
}

function ageLabel(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  const hours = Math.max(0, Math.round((Date.now() - t) / 36e5));
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function neededByTone(neededBy) {
  const d = str(neededBy).slice(0, 10);
  if (!d) return "";
  const today = new Date().toISOString().slice(0, 10);
  if (d < today) return "overdue";
  if (d === today) return "today";
  return "";
}

export default function VisitHandoffHqPanel({
  tenantId,
  labs = [],
  directoryUsers = [],
  onQueueCount,
}) {
  const [rows, setRows] = useState([]);
  const [visitsById, setVisitsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reviewId, setReviewId] = useState("");
  const [evidence, setEvidence] = useState(null);
  const [response, setResponse] = useState("");
  const [sending, setSending] = useState(false);

  const labById = useMemo(() => {
    const map = new Map();
    for (const lab of labs || []) {
      const id = labIdKey(lab.labId || lab.lab_id);
      if (id) map.set(id, lab);
    }
    return map;
  }, [labs]);

  const agentNameById = useMemo(() => {
    const map = new Map();
    for (const user of directoryUsers || []) {
      const id = str(user.agentId || user.agent_id);
      if (id) map.set(id.toLowerCase(), str(user.agentName || user.name || user.fullName || id));
    }
    return map;
  }, [directoryUsers]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listOpenVisitHandoffsRead({ tenantId, limit: 200 });
    if (!res.success) {
      setError(res.error || "Could not load waiting items.");
      setRows([]);
      onQueueCount?.(0);
    } else {
      setError("");
      const list = res.data || [];
      setRows(list);
      onQueueCount?.(list.length);
      const headers = await getVisitHeadersForHandoffsRead(list.map((row) => row.visitUuid));
      const next = {};
      for (const visit of headers.data || []) {
        next[str(visit.id)] = visit;
      }
      setVisitsById(next);
    }
    setLoading(false);
  }, [tenantId, onQueueCount]);

  useEffect(() => {
    load();
  }, [load]);

  const review = rows.find((r) => r.id === reviewId) || null;

  useEffect(() => {
    let cancelled = false;
    async function loadReview() {
      setEvidence(null);
      setResponse("");
      if (!review) return;
      const ev = await getAgentVisitEvidenceRead({ visitUuid: review.visitUuid });
      if (cancelled) return;
      setEvidence(ev?.success ? ev.data : null);
    }
    loadReview();
    return () => {
      cancelled = true;
    };
  }, [review?.id, review?.visitUuid]);

  async function sendBack() {
    if (!review || sending) return;
    setSending(true);
    const res = await respondVisitHandoffWrite({
      handoffId: review.id,
      hqResponse: response,
    });
    setSending(false);
    if (!res.success) {
      setError(res.error || "Could not send back to Agent.");
      return;
    }
    setReviewId("");
    setResponse("");
    await load();
  }

  const visit = evidence?.visit || {};
  const lines = evidence?.discoveryLines || [];

  return (
    <div className="space-y-3" data-ae1c-hq-queue="true">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Labs waiting on a PrimeCare answer. Oldest first; overdue needed-by is marked.
        </p>
        <span className="text-xs font-medium text-slate-600" data-ae1c-hq-count={rows.length}>
          {rows.length} waiting
        </span>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
          Nothing waiting on PrimeCare.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Lab</th>
                <th className="px-3 py-2">Agent</th>
                <th className="px-3 py-2">Outcome</th>
                <th className="px-3 py-2">Visit date</th>
                <th className="px-3 py-2">Waiting</th>
                <th className="px-3 py-2">Needed by</th>
                <th className="px-3 py-2">Requirement</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const tone = neededByTone(row.neededBy);
                const lab = labById.get(labIdKey(row.labId));
                const visitHeader = visitsById[row.visitUuid] || {};
                const agentLabel =
                  agentNameById.get(str(row.agentId).toLowerCase()) ||
                  str(visitHeader.agent_name) ||
                  row.agentId;
                return (
                  <tr key={row.id} className="border-t" data-ae1c-hq-row={row.id} data-ae1c-hq-status="OPEN_HQ">
                    <td className="px-3 py-2 font-medium">{lab?.labName || lab?.lab_name || row.labId}</td>
                    <td className="px-3 py-2">{agentLabel}</td>
                    <td className="px-3 py-2">{row.triggerOutcome}</td>
                    <td className="px-3 py-2">{str(visitHeader.visit_date).slice(0, 10) || "—"}</td>
                    <td className="px-3 py-2">{ageLabel(row.createdAt)}</td>
                    <td className={tone === "overdue" ? "px-3 py-2 font-semibold text-amber-800" : "px-3 py-2"}>
                      {row.neededBy || "—"}
                      {tone === "overdue" ? " (overdue)" : tone === "today" ? " (today)" : ""}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2">{row.requirementSummary}</td>
                    <td className="px-3 py-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setReviewId(row.id)}>
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {review ? (
        <section className="rounded-xl border bg-white p-4" data-ae1c-hq-review={review.id}>
          <h3 className="text-base font-semibold">Review</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">Lab</dt>
              <dd>{labById.get(labIdKey(review.labId))?.labName || review.labId}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Agent</dt>
              <dd>{agentNameById.get(str(review.agentId).toLowerCase()) || review.agentId}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Visit date</dt>
              <dd>{str(visit.visitDate || visitsById[review.visitUuid]?.visit_date).slice(0, 10) || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Outcome</dt>
              <dd>{review.triggerOutcome}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Requirement</dt>
              <dd>{review.requirementSummary}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Needed by</dt>
              <dd>{review.neededBy || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Visit notes</dt>
              <dd>{str(visit.notes) || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Current follow-up</dt>
              <dd>
                {str(visit.nextAction || visitsById[review.visitUuid]?.next_action) || "—"}
                {str(visit.nextFollowUpDate || visitsById[review.visitUuid]?.next_follow_up_date)
                  ? ` · ${str(visit.nextFollowUpDate || visitsById[review.visitUuid]?.next_follow_up_date).slice(0, 10)}`
                  : ""}
              </dd>
            </div>
          </dl>
          {lines.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm" data-ae1c-hq-discovery="true">
              {lines.map((line) => (
                <li key={line.id || `${line.lineKind}-${line.brand}-${line.model}`}>
                  {[line.lineKind, line.brand, line.model, line.description].filter(Boolean).join(" · ")}
                </li>
              ))}
            </ul>
          ) : null}
          <label className="mt-4 block text-sm font-medium">
            PrimeCare Response
            <Textarea
              className="mt-1 min-h-[96px]"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              data-ae1c-hq-response="true"
            />
          </label>
          <Button
            type="button"
            className="mt-3"
            disabled={sending || !str(response)}
            onClick={sendBack}
            data-ae1c-hq-send-back="true"
          >
            {sending ? "Sending…" : "Send back to Agent"}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
