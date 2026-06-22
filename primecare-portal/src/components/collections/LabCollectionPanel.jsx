import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, IndianRupee, CheckCircle2 } from "lucide-react";
import { labIdKey } from "@/utils/labId.js";
import { AGENT_TASK_COMPLETION_ENABLED } from "@/config/environment";
import EvidenceUploadField, {
  EvidenceUploadProgress,
} from "@/components/evidence/EvidenceUploadField.jsx";
import LabReceivableSummary from "@/components/collections/LabReceivableSummary.jsx";
import OpenOrdersTable from "@/components/collections/OpenOrdersTable.jsx";
import PaymentCollectionContext from "@/components/collections/PaymentCollectionContext.jsx";
import CollectionActivityTimeline from "@/components/collections/CollectionActivityTimeline.jsx";

const TABS = [
  { id: "details", label: "Details" },
  { id: "payment", label: "Record Payment" },
  { id: "followup", label: "Follow-up" },
  { id: "activity", label: "Activity" },
];

function normalizeTab(focusSection) {
  const key = String(focusSection || "details").toLowerCase();
  if (key === "followup" || key === "follow-up") return "followup";
  if (TABS.some((t) => t.id === key)) return key;
  return "details";
}

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function LabCollectionPanel({
  collection,
  history = [],
  openOrders = [],
  ordersLoading = false,
  lastPaymentDate = "",
  paymentStatusLabel = "Pending",
  detailsLoading = false,
  copy,
  amountCollected,
  setAmountCollected,
  paymentMode,
  setPaymentMode,
  note,
  setNote,
  nextFollowUp,
  setNextFollowUp,
  nextAction,
  setNextAction,
  saving,
  completingTask,
  pendingTaskContext,
  onSave,
  onCompleteTask,
  readOnly = false,
  collectionProofFile,
  setCollectionProofFile,
  proofRemarks,
  setProofRemarks,
  evidenceUploading,
  focusSection = "details",
}) {
  const [activeTab, setActiveTab] = useState(() => normalizeTab(focusSection));
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);

  useEffect(() => {
    setActiveTab(normalizeTab(focusSection));
  }, [focusSection, collection?.labId]);

  useEffect(() => {
    setSelectedOrderIds([]);
  }, [collection?.labId]);

  useEffect(() => {
    if (str(amountCollected) !== "") return;
    const selectedTotal = (openOrders || [])
      .filter((o) => selectedOrderIds.includes(String(o.orderId || "")))
      .reduce((s, o) => s + num(o.orderTotal), 0);
    if (selectedTotal > 0) {
      setAmountCollected(String(selectedTotal));
    }
  }, [selectedOrderIds, openOrders, amountCollected, setAmountCollected]);

  const labKey = labIdKey(collection?.labId);

  const saveButtons = useMemo(
    () => (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" className="h-11 flex-1 rounded-lg" onClick={onSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <IndianRupee className="mr-2 h-4 w-4" />
              Save collection update
            </>
          )}
        </Button>
        {pendingTaskContext?.taskId ? (
          AGENT_TASK_COMPLETION_ENABLED ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-lg"
              onClick={onCompleteTask}
              disabled={completingTask}
            >
              {completingTask ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark linked task complete
                </>
              )}
            </Button>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground sm:flex-1">
              Task completion coming soon.
            </p>
          )
        ) : null}
      </div>
    ),
    [completingTask, onCompleteTask, onSave, pendingTaskContext?.taskId, saving]
  );

  if (detailsLoading) {
    return (
      <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {copy?.loadingDetails || "Loading collection details…"}
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-6">
        <p className="text-sm text-muted-foreground">
          {copy?.noDetails || "No collection details found."}
        </p>
      </div>
    );
  }

  function toggleOrder(orderId) {
    setSelectedOrderIds((prev) =>
      prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
    );
  }

  return (
    <div
      id={`collection-detail-${labKey}`}
      className="border-t border-slate-200 bg-slate-50/80 px-2.5 py-3 sm:px-3"
    >
      <div className="mb-3 flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            size="sm"
            variant={activeTab === tab.id ? "default" : "outline"}
            className="h-8 rounded-lg px-2.5 text-xs"
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === "details" ? (
        <div className="space-y-3">
          <LabReceivableSummary
            collection={collection}
            lastPaymentDate={lastPaymentDate}
            paymentStatusLabel={paymentStatusLabel}
          />
          <div>
            <h3 className="mb-1.5 text-xs font-semibold text-slate-700">
              Open orders (fulfilled, payment pending)
            </h3>
            <OpenOrdersTable
              orders={openOrders}
              outstandingAmount={collection.outstandingAmount}
              loading={ordersLoading}
            />
          </div>
        </div>
      ) : null}

      {activeTab === "payment" && !readOnly ? (
        <div className="space-y-3">
          <PaymentCollectionContext
            outstandingAmount={collection.outstandingAmount}
            openOrders={openOrders}
            ordersLoading={ordersLoading}
            amountCollected={amountCollected}
            selectedOrderIds={selectedOrderIds}
            onToggleOrder={toggleOrder}
          />
          <section className="space-y-3 rounded-lg border border-border bg-card p-3">
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Amount collected
              </label>
              <Input
                id={`collection-amount-${labKey}`}
                type="number"
                value={amountCollected}
                onChange={(e) => setAmountCollected(e.target.value)}
                placeholder="Enter collected amount"
                className="h-11 rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Payment mode
              </label>
              <select
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Note
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Collection note…"
                className="min-h-[72px] rounded-lg"
              />
            </div>
            <EvidenceUploadField
              file={collectionProofFile}
              onFileChange={setCollectionProofFile}
              label="Payment / receipt proof (optional)"
              disabled={saving || evidenceUploading}
              hint="Receipt, UPI screenshot, or signed slip"
            />
            <EvidenceUploadProgress uploading={evidenceUploading} />
            {saveButtons}
          </section>
        </div>
      ) : null}

      {activeTab === "followup" && !readOnly ? (
        <section className="space-y-3 rounded-lg border border-border bg-card p-3">
          <h3 className="text-xs font-semibold text-slate-700">Schedule follow-up</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Next follow-up date
              </label>
              <Input
                id={`collection-followup-date-${labKey}`}
                type="date"
                value={nextFollowUp}
                onChange={(e) => setNextFollowUp(e.target.value)}
                className="h-11 rounded-lg"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Next action
              </label>
              <Input
                id={`collection-followup-action-${labKey}`}
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="Call, revisit, send reminder…"
                className="h-11 rounded-lg"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Note
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Follow-up note…"
              className="min-h-[88px] rounded-lg"
            />
          </div>
          {saveButtons}
        </section>
      ) : null}

      {activeTab === "activity" ? (
        <CollectionActivityTimeline
          history={history}
          collectionsNotes={collection.collectionsNotes || collection.note || ""}
          openOrders={openOrders}
          arTotalPaid={collection.totalPaid}
        />
      ) : null}
    </div>
  );
}
