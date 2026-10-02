import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAgentVisitEvidenceRead } from "@/api/primecareSupabaseApi.js";
import { labIdKey } from "@/utils/labId.js";
import { computeMarginPct, formatMarginPct } from "@/catalog/masterCatalogEngine.js";
import { composeAgentVisibleCommercialText } from "@/visits/commercialResponse.js";
import {
  getVisitHeadersForHandoffsRead,
  listCommercialProductChoicesRead,
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

function hqRespondMessage(res) {
  const code = str(res?.code);
  if (code === "already_responded") {
    return "Another PrimeCare user already answered this. It will leave the waiting list.";
  }
  if (code === "stale_or_closed") {
    return "This request is no longer waiting. Refreshing the list.";
  }
  if (code === "forbidden") {
    return "You cannot respond to this request.";
  }
  return res?.error || "Could not send back to Agent.";
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
  const [evidenceError, setEvidenceError] = useState("");
  const [response, setResponse] = useState("");
  const [decision, setDecision] = useState("YES");
  const [productId, setProductId] = useState("");
  const [specification, setSpecification] = useState("");
  const [quantity, setQuantity] = useState("");
  const [packUom, setPackUom] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [verifiedCost, setVerifiedCost] = useState("");
  const [availability, setAvailability] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [productChoices, setProductChoices] = useState([]);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const reviewRef = useRef(null);

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

  function openReview(handoffId) {
    const id = str(handoffId);
    if (!id) {
      setError("Could not open that request. Missing handoff ID.");
      return;
    }
    setError("");
    setReviewId(id);
  }

  function closeReview() {
    setReviewId("");
    setResponse("");
    setDecision("YES");
    setProductId("");
    setSpecification("");
    setQuantity("");
    setPackUom("");
    setSupplierName("");
    setVerifiedCost("");
    setAvailability("");
    setLeadTime("");
    setSellingPrice("");
    setValidUntil("");
    setInternalNote("");
    setEvidence(null);
    setEvidenceError("");
  }

  useEffect(() => {
    let cancelled = false;
    async function loadReview() {
      setEvidence(null);
      setEvidenceError("");
      setResponse("");
      setDecision("YES");
      setProductId("");
      setSpecification("");
      setQuantity("");
      setPackUom("");
      setSupplierName("");
      setVerifiedCost("");
      setAvailability("");
      setLeadTime("");
      setSellingPrice("");
      setValidUntil("");
      setInternalNote("");
      if (!review) return;
      const products = await listCommercialProductChoicesRead({ tenantId });
      if (!cancelled) setProductChoices(products.success ? products.data : []);
      const ev = await getAgentVisitEvidenceRead({
        visitUuid: review.visitUuid,
        tenantId,
      });
      if (cancelled) return;
      if (!ev?.success) {
        setEvidenceError(ev?.error || "Could not load visit context.");
        setEvidence(null);
        return;
      }
      setEvidence(ev.data);
    }
    loadReview();
    return () => {
      cancelled = true;
    };
  }, [review?.id, review?.visitUuid, tenantId]);

  useEffect(() => {
    if (!reviewId || !reviewRef.current) return;
    reviewRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [reviewId]);

  const selectedProduct = productChoices.find((row) => str(row.product_id) === str(productId));
  const marginPct = computeMarginPct(sellingPrice, verifiedCost);
  const preview = composeAgentVisibleCommercialText({
    decision,
    productId,
    productName: selectedProduct?.product_name || "",
    specification,
    quantity,
    packUom,
    availability,
    leadTime,
    sellingPrice,
    validUntil,
    agentResponse: response,
  });

  async function sendBack() {
    if (!review || sendingRef.current || sending) return;
    if (!str(response)) {
      setError("Write a PrimeCare response before sending back.");
      return;
    }
    if (decision === "YES") {
      if (!str(productId) && !str(specification)) {
        setError("Match a product or write the specification.");
        return;
      }
      if (!str(supplierName) || verifiedCost === "" || sellingPrice === "" || !str(availability) || !str(leadTime) || !str(validUntil)) {
        setError("A YES answer needs source, verified cost, selling price, availability, lead time, and validity.");
        return;
      }
    }
    sendingRef.current = true;
    setSending(true);
    setError("");
    try {
      const res = await respondVisitHandoffWrite({
        handoffId: review.id,
        hqResponse: response,
        commercial: {
          decision,
          agentResponse: response,
          productId: decision === "YES" ? productId : "",
          specification,
          quantity: decision === "YES" ? quantity : "",
          packUom: decision === "YES" ? packUom : "",
          supplierName: decision === "YES" ? supplierName : "",
          verifiedCost: decision === "YES" ? verifiedCost : "",
          availability: decision === "YES" ? availability : "",
          leadTime: decision === "YES" ? leadTime : "",
          sellingPrice: decision === "YES" ? sellingPrice : "",
          validUntil: decision === "YES" ? validUntil : "",
          internalNote,
        },
      });
      const stale = ["already_responded", "stale_or_closed"].includes(str(res?.code));
      if (!res.success && !stale) {
        setError(hqRespondMessage(res));
        return;
      }
      closeReview();
      await load();
      if (stale) {
        setError(hqRespondMessage(res));
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
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
      {reviewId && !review && !loading ? (
        <p className="text-sm text-destructive" role="alert">
          That request is no longer waiting on PrimeCare.
        </p>
      ) : null}

      {review ? (
        <section
          ref={reviewRef}
          className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4"
          data-ae1c-hq-review={review.id}
          data-ae1c-hq-review-open="true"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold">Review</h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={closeReview}
              data-ae1c-hq-review-close="true"
            >
              Close
            </Button>
          </div>
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
          {evidenceError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {evidenceError}
            </p>
          ) : null}
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
            Decision
            <select
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              data-commercial-decision="true"
            >
              <option value="YES">YES — we can supply</option>
              <option value="NO">NO</option>
              <option value="NEED_MORE_INFORMATION">Need more information</option>
            </select>
          </label>
          {decision === "YES" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2" data-commercial-yes="true">
              <label className="block text-sm font-medium sm:col-span-2">
                Existing product
                <select
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  data-commercial-product="true"
                >
                  <option value="">Not matched yet</option>
                  {productChoices.map((row) => (
                    <option key={row.product_id} value={row.product_id}>
                      {row.product_name} ({row.product_id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium sm:col-span-2">
                Specification
                <Textarea
                  className="mt-1 min-h-[72px] bg-white"
                  value={specification}
                  onChange={(e) => setSpecification(e.target.value)}
                  data-commercial-specification="true"
                />
              </label>
              <label className="block text-sm font-medium">
                Quantity
                <input
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  data-commercial-quantity="true"
                />
              </label>
              <label className="block text-sm font-medium">
                Pack
                <input
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  value={packUom}
                  onChange={(e) => setPackUom(e.target.value)}
                  data-commercial-pack="true"
                />
              </label>
              <label className="block text-sm font-medium">
                Source
                <input
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  data-commercial-supplier="true"
                />
              </label>
              <label className="block text-sm font-medium">
                Verified cost
                <input
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  inputMode="decimal"
                  value={verifiedCost}
                  onChange={(e) => setVerifiedCost(e.target.value)}
                  data-commercial-cost="true"
                />
              </label>
              <label className="block text-sm font-medium">
                Selling price
                <input
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  inputMode="decimal"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  data-commercial-selling="true"
                />
              </label>
              <label className="block text-sm font-medium">
                Availability
                <input
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  data-commercial-availability="true"
                />
              </label>
              <label className="block text-sm font-medium">
                Lead time
                <input
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                  data-commercial-lead-time="true"
                />
              </label>
              <label className="block text-sm font-medium">
                Valid until
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  data-commercial-valid-until="true"
                />
              </label>
              <p className="text-sm sm:col-span-2" data-commercial-margin="true">
                Margin, HQ only: {formatMarginPct(marginPct, marginPct != null)}
              </p>
            </div>
          ) : (
            <label className="mt-3 block text-sm font-medium">
              Specification, if it helps the agent
              <Textarea
                className="mt-1 min-h-[72px] bg-white"
                value={specification}
                onChange={(e) => setSpecification(e.target.value)}
                data-commercial-specification="true"
              />
            </label>
          )}
          <label className="mt-3 block text-sm font-medium">
            HQ internal note
            <Textarea
              className="mt-1 min-h-[72px] bg-white"
              value={internalNote}
              onChange={(e) => setInternalNote(e.target.value)}
              data-commercial-internal-note="true"
            />
          </label>
          <div className="mt-3 rounded-md border bg-white p-3 text-sm" data-commercial-preview="true">
            <p className="text-xs font-medium text-muted-foreground">PrimeCare Response</p>
            <pre className="mt-1 whitespace-pre-wrap font-sans">{preview || "The agent-visible answer appears here."}</pre>
          </div>
          <label className="mt-4 block text-sm font-medium">
            Next action for the agent
            <Textarea
              className="mt-1 min-h-[96px] bg-white"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              data-ae1c-hq-response="true"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={sending || !str(response)}
              onClick={sendBack}
              data-ae1c-hq-send-back="true"
            >
              {sending ? "Sending…" : "Send back to Agent"}
            </Button>
            <Button type="button" variant="outline" disabled={sending} onClick={closeReview}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {!loading && rows.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
          Nothing waiting on PrimeCare.
        </p>
      ) : !loading ? (
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
                const selected = row.id === reviewId;
                return (
                  <tr
                    key={row.id}
                    className={selected ? "border-t bg-indigo-50" : "border-t"}
                    data-ae1c-hq-row={row.id}
                    data-ae1c-hq-status="OPEN_HQ"
                  >
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
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openReview(row.id)}
                        data-ae1c-hq-review-open={row.id}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
