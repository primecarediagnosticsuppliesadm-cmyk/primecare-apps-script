import React, { useEffect, useMemo, useState } from "react";
import {
  getCollections,
  getCollectionDetails,
  getCollectionHistory,
  updateCollection,
  completeAgentTask,
} from "@/api/primecareApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, IndianRupee, CheckCircle2, ClipboardCheck } from "lucide-react";

export default function CollectionsPage({ currentUser, authToken }) {
  const [summary, setSummary] = useState({
    totalOutstanding: 0,
    overdueCount: 0,
    highRiskCount: 0,
    todayCollections: 0,
  });

  const [collections, setCollections] = useState([]);
  const [selectedLabId, setSelectedLabId] = useState("");
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [history, setHistory] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completingTask, setCompletingTask] = useState(false);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [amountCollected, setAmountCollected] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [note, setNote] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [nextAction, setNextAction] = useState("");

  const [pendingTaskContext, setPendingTaskContext] = useState(null);

  useEffect(() => {
    loadCollections();
  }, [authToken]);

  useEffect(() => {
    if (loading) return;
    hydratePendingCollectionTask();
  }, [loading, collections]);

  async function loadCollections() {
    try {
      setLoading(true);
      setError("");

      const params = authToken ? { sessionToken: authToken } : {};
      const res = await getCollections(params);
      const payload = res?.data || {};

      setSummary(
        payload.summary || {
          totalOutstanding: 0,
          overdueCount: 0,
          highRiskCount: 0,
          todayCollections: 0,
        }
      );

      setCollections(Array.isArray(payload.collections) ? payload.collections : []);
    } catch (err) {
      setError(err.message || "Failed to load collections");
    } finally {
      setLoading(false);
    }
  }

  function hydratePendingCollectionTask() {
    const raw = sessionStorage.getItem("primecare_pending_collection_task");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.labId) {
        sessionStorage.removeItem("primecare_pending_collection_task");
        return;
      }

      setPendingTaskContext(parsed);
      openCollection(parsed.labId, {
        fromTask: true,
        taskContext: parsed,
      });

      sessionStorage.removeItem("primecare_pending_collection_task");
    } catch (err) {
      console.error("Failed to parse pending collection task", err);
      sessionStorage.removeItem("primecare_pending_collection_task");
    }
  }

  async function openCollection(labId, options = {}) {
    try {
      setDetailsLoading(true);
      setError("");
      setSuccessMessage("");

      const params = authToken ? { sessionToken: authToken } : {};

      const [detailsRes, historyRes] = await Promise.all([
        getCollectionDetails(labId, params),
        getCollectionHistory(labId, params),
      ]);

      const detailsPayload = detailsRes?.data || detailsRes || {};
      const historyPayload = historyRes?.data || historyRes || {};
      const collection = detailsPayload.collection || null;

      setSelectedLabId(labId);
      setSelectedCollection(collection);
      setHistory(Array.isArray(historyPayload.history) ? historyPayload.history : []);

      setAmountCollected("");
      setPaymentMode("Cash");
      setNote("");
      setNextFollowUp(collection?.nextFollowUp || "");
      setNextAction(
        options?.taskContext?.nextAction ||
          collection?.nextAction ||
          ""
      );

      if (options?.fromTask && options?.taskContext) {
        setSuccessMessage(
          `Collection task loaded for ${options.taskContext.labName || collection?.labName || labId}.`
        );
      }
    } catch (err) {
      setError(err.message || "Failed to load collection details");
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleSaveCollection() {
    if (!selectedLabId) return;

    try {
      setSaving(true);
      setError("");
      setSuccessMessage("");

      const payload = {
        labId: selectedLabId,
        amountCollected: Number(amountCollected || 0),
        paymentMode,
        collectedBy: currentUser?.name || "System User",
        note,
        nextFollowUp,
        nextAction,
      };

      const res = await updateCollection(payload);
      const responsePayload = res?.data || res || {};

      if (!responsePayload?.success) {
        throw new Error(responsePayload?.message || "Failed to update collection");
      }

      setSuccessMessage(
        pendingTaskContext?.taskId
          ? "Collection updated successfully. You can now mark the linked task complete."
          : "Collection updated successfully"
      );

      await loadCollections();
      await openCollection(selectedLabId, {
        fromTask: !!pendingTaskContext,
        taskContext: pendingTaskContext,
      });
    } catch (err) {
      setError(err.message || "Failed to save collection update");
    } finally {
      setSaving(false);
    }
  }

  async function handleCompleteLinkedTask() {
    if (!pendingTaskContext?.taskId) return;

    try {
      setCompletingTask(true);
      setError("");
      setSuccessMessage("");

      const res = await completeAgentTask({
        taskId: pendingTaskContext.taskId,
        completedBy: currentUser?.name || currentUser?.agentName || "System User",
      });

      const payload = res?.data || res || {};
      if (!payload?.success) {
        throw new Error(payload?.message || "Failed to complete linked task");
      }

      setSuccessMessage("Collection updated and linked task marked complete.");
      setPendingTaskContext(null);
    } catch (err) {
      setError(err.message || "Failed to complete linked task");
    } finally {
      setCompletingTask(false);
    }
  }

  const filteredCollections = useMemo(() => {
    return collections.filter((item) =>
      `${item.labId} ${item.labName} ${item.assignedAgent} ${item.area}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [collections, search]);
 console.log("CollectionsPage authToken", authToken);
  return (
   
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Collections</h1>
        <p className="text-sm text-slate-500">
          Track receivables, update collections, and manage follow-ups.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Total Outstanding</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              ₹{Number(summary.totalOutstanding || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Overdue Labs</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              {Number(summary.overdueCount || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">High Risk</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              {Number(summary.highRiskCount || 0)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardContent className="p-4">
            <div className="text-xs text-slate-500">Today's Collections</div>
            <div className="mt-1 text-xl font-semibold text-slate-900">
              ₹{Number(summary.todayCollections || 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {pendingTaskContext ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          <div className="flex items-start gap-2">
            <ClipboardCheck className="mt-0.5 h-4 w-4" />
            <div>
              <div className="font-medium">Linked collection task loaded</div>
              <div>
                Lab: <strong>{pendingTaskContext.labName || pendingTaskContext.labId}</strong>
              </div>
              {pendingTaskContext.nextAction ? (
                <div>Suggested action: {pendingTaskContext.nextAction}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Lab Collections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search by lab, agent, area..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 rounded-xl"
            />

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading collections...
              </div>
            ) : filteredCollections.length === 0 ? (
              <div className="text-sm text-slate-500">No collection records found.</div>
            ) : (
              <div className="space-y-3">
                {filteredCollections.map((item) => (
                  <div
                    key={item.labId}
                    className={`rounded-2xl border p-4 shadow-sm ${
                      selectedLabId === item.labId ? "ring-2 ring-slate-200" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{item.labName}</div>
                        <div className="text-sm text-slate-500">
                          {item.labId} • {item.area || "-"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          Agent: {item.assignedAgent || "-"}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">{item.riskStatus || "Low"}</Badge>
                        <Badge variant="outline">
                          {item.paymentStatus || "Pending"}
                        </Badge>
                        <Badge>
                          ₹{Number(item.outstandingAmount || 0).toLocaleString()}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => openCollection(item.labId)}
                      >
                        Open
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Collection Details</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedLabId ? (
              <div className="text-sm text-slate-500">
                Select a lab to update collections.
              </div>
            ) : detailsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading collection details...
              </div>
            ) : selectedCollection ? (
              <div className="space-y-4">
                <div>
                  <div className="font-semibold">{selectedCollection.labName}</div>
                  <div className="text-sm text-slate-500">
                    {selectedCollection.labId}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 text-sm text-slate-700">
                  <div>
                    Outstanding: ₹
                    {Number(selectedCollection.outstandingAmount || 0).toLocaleString()}
                  </div>
                  <div>Risk: {selectedCollection.riskStatus || "-"}</div>
                  <div>Status: {selectedCollection.paymentStatus || "-"}</div>
                  <div>Overdue Days: {selectedCollection.overdueDays || 0}</div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Amount Collected
                  </label>
                  <Input
                    type="number"
                    value={amountCollected}
                    onChange={(e) => setAmountCollected(e.target.value)}
                    placeholder="Enter collected amount"
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Payment Mode
                  </label>
                  <select
                    className="h-11 w-full rounded-xl border bg-white px-3 text-sm"
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
                  <label className="text-sm font-medium text-slate-700">
                    Next Follow-up Date
                  </label>
                  <Input
                    type="date"
                    value={nextFollowUp}
                    onChange={(e) => setNextFollowUp(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Next Action
                  </label>
                  <Input
                    value={nextAction}
                    onChange={(e) => setNextAction(e.target.value)}
                    placeholder="Call, revisit, send reminder..."
                    className="h-11 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Note
                  </label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Collection note..."
                    className="min-h-[90px] rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <Button
                    className="h-11 w-full rounded-xl"
                    onClick={handleSaveCollection}
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <IndianRupee className="mr-2 h-4 w-4" />
                        Save Collection Update
                      </>
                    )}
                  </Button>

                  {pendingTaskContext?.taskId ? (
                    <Button
                      variant="outline"
                      className="h-11 w-full rounded-xl"
                      onClick={handleCompleteLinkedTask}
                      disabled={completingTask}
                    >
                      {completingTask ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Completing...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Mark Linked Task Complete
                        </>
                      )}
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2 pt-2">
                  <div className="text-sm font-medium text-slate-900">
                    Collection History
                  </div>

                  {history.length ? (
                    history.map((item) => (
                      <div
                        key={item.paymentId}
                        className="rounded-xl border p-3 text-sm"
                      >
                        <div className="font-medium">
                          ₹{Number(item.amountCollected || 0).toLocaleString()}
                        </div>
                        <div className="text-slate-500">
                          {item.paymentDate || "-"} • {item.paymentMode || "-"}
                        </div>
                        <div className="mt-1 text-slate-600">
                          {item.note || "No note"}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">
                      No payment history found.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                No collection details found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}