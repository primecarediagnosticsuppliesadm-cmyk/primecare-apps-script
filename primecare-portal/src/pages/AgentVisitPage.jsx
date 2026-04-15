import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardCheck,
  MapPin,
  PlusCircle,
  Users,
  CalendarDays,
  PhoneCall,
  FlaskConical,
  IndianRupee,
  MessageSquare,
  Building2,
  Clock3,
  AlertTriangle,
  Package,
} from "lucide-react";

import { getLabs, getRecentVisits, saveAgentVisit, getCollections } from "@/api/primecareApi";
import { logClientError } from "@/utils/debugLogger";

function QuickStat({ title, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">{title}</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <Icon className="h-4 w-4 text-slate-700" />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-slate-100 p-2">
        <Icon className="h-5 w-5 text-slate-700" />
      </div>
      <div>
        <div className="text-base font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="text-sm text-slate-500">{subtitle}</div> : null}
      </div>
    </div>
  );
}

function FieldLabel({ children, helper }) {
  return (
    <div className="mb-2">
      <label className="block text-sm font-medium text-slate-700">{children}</label>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

function SnapshotItem({ icon: Icon, label, value, tone = "default" }) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50"
      : tone === "warn"
      ? "border-amber-200 bg-amber-50"
      : "border-slate-200 bg-slate-50";

  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white p-2">
          <Icon className="h-4 w-4 text-slate-700" />
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{value || "-"}</div>
        </div>
      </div>
    </div>
  );
}

function normalizeLab(lab) {
  return {
    labId: lab.labId || lab.Lab_ID || "",
    labName: lab.labName || lab.Lab_Name || lab.name || "",
    area: lab.area || lab.Area || "",
    assignedAgent:
      lab.assignedAgent ||
      lab.agentName ||
      lab.Agent_Name ||
      lab.Assigned_Agent_ID ||
      lab.owner ||
      "",
    status: lab.status || lab.Status || "Active",
    nextFollowUp: lab.nextFollowUp || lab.Next_Follow_Up || "-",
    ownerName: lab.ownerName || lab.Owner_Name || "",
    phone: lab.phone || lab.Phone || "",
  };
}

function normalizeVisit(v) {
  return {
    id: v.id || v.Visit_ID || "",
    agent: v.agent || v.agentName || v.Agent_Name || "",
    date: v.date || v.visitDate || v.Visit_Date || "",
    labId: v.labId || v.Lab_ID || "",
    labName: v.labName || v.Lab_Name || "",
    area: v.area || v.Area || "",
    visitType: v.visitType || v.Visit_Type || "",
    labResponse: v.labResponse || v.Lab_Response || "",
    soldValue: Number(v.soldValue || v.Sold_Value || 0),
    nextAction: v.nextAction || v.Next_Action || "",
    nextFollowUpDate: v.nextFollowUpDate || v.Next_Follow_Up_Date || "",
    nextFollowUpType: v.nextFollowUpType || v.Next_Follow_Up_Type || "",
  };
}

function normalizeCollection(c) {
  return {
    labId: c.labId || c.Lab_ID || "",
    labName: c.labName || c.Lab_Name || "",
    outstandingAmount: Number(c.outstandingAmount || c.Outstanding || 0),
    overdueDays: Number(c.overdueDays || c.Days_Overdue || 0),
    riskStatus: c.riskStatus || c.Risk_Status || "",
    creditHold: c.creditHold || c.Credit_Hold || "",
    nextAction: c.nextAction || c.Next_Action || "",
    paymentStatus: c.paymentStatus || c.Payment_Status || "",
    lastFollowUp: c.lastFollowUp || c.Last_Follow_Up_Date || "",
  };
}

function displayResponseLabel(value) {
  const v = String(value || "").trim();
  if (v === "Interested") return "Interested";
  if (v === "Warm") return "Moderately Interested";
  if (v === "Not Interested") return "Not Interested";
  if (v === "Converted") return "Order Confirmed";
  if (v === "Need Follow-up") return "Follow-up Needed";
  return v || "-";
}

export default function AgentVisitPage({ currentUser, authToken }) {
  const [labs, setLabs] = useState([]);
  const [recentVisits, setRecentVisits] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("success");

  const [form, setForm] = useState({
    agentName: currentUser?.agentName || currentUser?.name || "",
    visitDate: new Date().toISOString().slice(0, 10),
    labId: "",
    labName: "",
    area: currentUser?.assignedArea || "",
    visitType: "Follow-up",
    samplesGiven: "",
    demoGiven: "No",
    labResponse: "Warm",
    soldValue: "",
    stockAvailable: "Yes",
    needsNewStock: "No",
    nextAction: "",
    nextFollowUpDate: "",
    nextFollowUpType: "Call",
    notes: "",
  });

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setLoading(true);

        const params = authToken ? { sessionToken: authToken } : {};

        const labsRes = await getLabs(params);
        if (!labsRes.success) throw new Error(labsRes.error || "Failed to load labs");

        if (!mounted) return;
        setLabs((labsRes.data?.labs || []).map(normalizeLab));
        setLoading(false);

        Promise.all([getRecentVisits(params), getCollections(params)])
          .then(async ([visitsRes, collectionsRes]) => {
            if (!mounted) return;

            if (visitsRes?.success) {
              setRecentVisits((visitsRes.data?.visits || []).map(normalizeVisit));
            }

            if (collectionsRes?.success) {
              setCollections((collectionsRes.data?.collections || []).map(normalizeCollection));
            }
          })
          .catch(async (err) => {
            console.error("Background load failed", err);
            await logClientError({
              authToken,
              page: "AgentVisitPage",
              component: "AgentVisitPage",
              actionType: "BACKGROUND_LOAD_FAIL",
              errorCode: "VISITS_BACKGROUND_LOAD_FAIL",
              errorMessage: err?.message || "Background load failed",
              stackTrace: err?.stack || "",
              payload: {},
            });
          });
      } catch (err) {
        if (!mounted) return;

        await logClientError({
          authToken,
          page: "AgentVisitPage",
          component: "AgentVisitPage",
          actionType: "LOAD_FAIL",
          errorCode: "VISIT_PAGE_LOAD_FAIL",
          errorMessage: err?.message || "Failed to load agent visit page",
          stackTrace: err?.stack || "",
          payload: {
            currentUser,
          },
        });

        setStatusMessage(err.message || "Failed to load agent visit page");
        setStatusType("error");
        setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [authToken, currentUser]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      agentName: currentUser?.agentName || currentUser?.name || prev.agentName,
    }));
  }, [currentUser]);

  const visibleLabs = useMemo(() => labs, [labs]);
  const visibleVisits = useMemo(() => recentVisits, [recentVisits]);
  const visibleCollections = useMemo(() => collections, [collections]);

  useEffect(() => {
    function handleOpenVisitTask(event) {
      const detail = event?.detail || {};
      const task = detail.task || {};
      if (!task) return;

      const matchingLab =
        visibleLabs.find((lab) => String(lab.labId) === String(task.labId)) || null;

      setForm((prev) => ({
        ...prev,
        labId: task.labId || "",
        labName: task.labName || matchingLab?.labName || "",
        area: matchingLab?.area || prev.area || "",
        visitType: task.visitType || "Follow-up",
        nextAction: task.nextAction || prev.nextAction || "",
        nextFollowUpType: task.followUpType || prev.nextFollowUpType || "Call",
        nextFollowUpDate: task.followUpDate || prev.nextFollowUpDate || "",
      }));

      setStatusMessage(
        `Task loaded for ${task.labName || "selected lab"}. Review details and save the new visit update.`
      );
      setStatusType("success");
    }

    window.addEventListener("primecare:openVisitTask", handleOpenVisitTask);

    return () => {
      window.removeEventListener("primecare:openVisitTask", handleOpenVisitTask);
    };
  }, [visibleLabs]);

  useEffect(() => {
    const raw = sessionStorage.getItem("primecare_pending_visit_task");
    if (!raw) return;

    try {
      const task = JSON.parse(raw);
      const matchingLab =
        visibleLabs.find((lab) => String(lab.labId) === String(task.labId)) || null;

      setForm((prev) => ({
        ...prev,
        labId: task.labId || "",
        labName: task.labName || matchingLab?.labName || "",
        area: matchingLab?.area || prev.area || "",
        visitType: task.visitType || "Follow-up",
        nextAction: task.nextAction || prev.nextAction || "",
        nextFollowUpType: task.followUpType || prev.nextFollowUpType || "Call",
        nextFollowUpDate: task.followUpDate || prev.nextFollowUpDate || "",
      }));

      setStatusMessage(
        `Task loaded for ${task.labName || "selected lab"}. Review details and save the new visit update.`
      );
      setStatusType("success");

      sessionStorage.removeItem("primecare_pending_visit_task");
    } catch (err) {
      console.error("Failed to read pending visit task", err);
      sessionStorage.removeItem("primecare_pending_visit_task");
    }
  }, [visibleLabs]);

  const selectedLab = useMemo(() => {
    return visibleLabs.find((lab) => String(lab.labId) === String(form.labId)) || null;
  }, [visibleLabs, form.labId]);

  const selectedLabVisits = useMemo(() => {
    return visibleVisits
      .filter((visit) => String(visit.labId) === String(form.labId))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [visibleVisits, form.labId]);

  const latestLabVisit = selectedLabVisits[0] || null;

  const selectedLabCollection = useMemo(() => {
    return visibleCollections.find((c) => String(c.labId) === String(form.labId)) || null;
  }, [visibleCollections, form.labId]);

  const selectedLabTotalSales = useMemo(() => {
    return selectedLabVisits.reduce((sum, visit) => sum + Number(visit.soldValue || 0), 0);
  }, [selectedLabVisits]);

  const todayVisits = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return visibleVisits.filter((v) => String(v.date).slice(0, 10) === today).length;
  }, [visibleVisits]);

  const pendingFollowUps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return visibleVisits.filter((v) => {
      const due = String(v.nextFollowUpDate || "").slice(0, 10);
      return due && due >= today;
    }).length;
  }, [visibleVisits]);

  const totalSalesLogged = useMemo(() => {
    return visibleVisits.reduce((sum, v) => sum + Number(v.soldValue || 0), 0);
  }, [visibleVisits]);

  useEffect(() => {
    if (!form.labId) return;

    if (selectedLabCollection?.outstandingAmount > 0) {
      setForm((prev) => ({
        ...prev,
        nextAction: prev.nextAction || "Follow up for payment collection",
        nextFollowUpType: prev.nextFollowUpType || "Collection",
      }));
      return;
    }

    if (latestLabVisit?.labResponse === "Need Follow-up") {
      setForm((prev) => ({
        ...prev,
        nextAction: prev.nextAction || latestLabVisit.nextAction || "Follow up with lab",
        nextFollowUpType: prev.nextFollowUpType || latestLabVisit.nextFollowUpType || "Call",
      }));
    }
  }, [form.labId, latestLabVisit, selectedLabCollection]);

  function handleLabChange(value) {
    const selected = visibleLabs.find((lab) => lab.labId === value);
    setForm((prev) => ({
      ...prev,
      labId: selected?.labId || "",
      labName: selected?.labName || "",
      area: selected?.area || prev.area,
      nextAction: "",
      nextFollowUpDate: "",
      nextFollowUpType: "Call",
    }));
  }

  async function handleSaveVisit() {
    if (!form.agentName || !form.labName || !form.visitDate || !form.visitType) {
      setStatusMessage("Please fill agent name, lab, date, and visit type.");
      setStatusType("error");
      return;
    }

    if (!form.labId) {
      setStatusMessage("Please select a lab from the dropdown.");
      setStatusType("error");
      return;
    }

    if (form.labResponse === "Converted" && !Number(form.soldValue || 0)) {
      setStatusMessage("Please enter order value when the visit outcome is Order Confirmed.");
      setStatusType("error");
      return;
    }

    if ((form.labResponse === "Need Follow-up" || form.nextFollowUpDate) && !form.nextFollowUpType) {
      setStatusMessage("Please choose a follow-up type.");
      setStatusType("error");
      return;
    }

    try {
      setSaving(true);
      setStatusMessage("");

      const payload = {
        sessionToken: authToken || "",
        visitDate: form.visitDate,
        agentName: form.agentName,
        labId: form.labId,
        labName: form.labName,
        area: form.area,
        visitType: form.visitType,
        samplesGiven: Number(form.samplesGiven || 0),
        demoGiven: form.demoGiven,
        labResponse: form.labResponse,
        soldValue: Number(form.soldValue || 0),
        stockAvailable: form.stockAvailable,
        needsNewStock: form.needsNewStock,
        nextAction: form.nextAction,
        nextFollowUpDate: form.nextFollowUpDate,
        nextFollowUpType: form.nextFollowUpType,
        notes: form.notes,
      };

      const res = await saveAgentVisit(payload);
      if (!res.success) throw new Error(res.error || "Failed to save visit");

      const newVisit = normalizeVisit({
        id: res.data?.visitId || `VISIT-${Date.now()}`,
        agent: form.agentName,
        date: form.visitDate,
        labId: form.labId,
        labName: form.labName,
        area: form.area,
        visitType: form.visitType,
        labResponse: form.labResponse,
        soldValue: form.soldValue,
        nextAction: form.nextAction,
        nextFollowUpDate: form.nextFollowUpDate,
        nextFollowUpType: form.nextFollowUpType,
      });

      setRecentVisits((prev) => [newVisit, ...prev]);

      setStatusMessage(`Visit saved successfully${res.data?.visitId ? `: ${res.data.visitId}` : ""}`);
      setStatusType("success");

      setForm((prev) => ({
        ...prev,
        visitDate: new Date().toISOString().slice(0, 10),
        labId: "",
        labName: "",
        area: currentUser?.assignedArea || "",
        visitType: "Follow-up",
        samplesGiven: "",
        demoGiven: "No",
        labResponse: "Warm",
        soldValue: "",
        stockAvailable: "Yes",
        needsNewStock: "No",
        nextAction: "",
        nextFollowUpDate: "",
        nextFollowUpType: "Call",
        notes: "",
      }));
    } catch (err) {
      await logClientError({
        authToken,
        page: "AgentVisitPage",
        component: "AgentVisitPage",
        actionType: "SAVE_FAIL",
        errorCode: "SAVE_AGENT_VISIT_FAIL",
        errorMessage: err?.message || "Failed to save visit",
        stackTrace: err?.stack || "",
        payload: {
          form,
        },
      });

      setStatusMessage(err.message || "Failed to save visit");
      setStatusType("error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-4 text-slate-600">Loading visit page...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Agent Visit CRM</h1>
        <p className="text-sm text-slate-500">
          Log field visits, outcomes, follow-ups, and next actions in one place.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickStat title="My Labs" value={visibleLabs.length} icon={Users} />
        <QuickStat title="Today Visits" value={todayVisits} icon={ClipboardCheck} />
        <QuickStat title="Follow-ups" value={pendingFollowUps} icon={PhoneCall} />
        <QuickStat title="Sales Logged" value={`₹${totalSalesLogged.toLocaleString()}`} icon={IndianRupee} />
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Log Field Visit</CardTitle>
          <CardDescription>
            Capture the visit clearly so follow-ups and performance are easy to track.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-8">
          <section className="space-y-4">
            <SectionTitle
              icon={Users}
              title="Basic Details"
              subtitle="Who visited, which lab, and when"
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel helper="Auto-filled from logged-in user">Agent Name</FieldLabel>
                <Input
                  value={form.agentName}
                  onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                  className="h-12 rounded-xl text-base"
                  disabled={String(currentUser?.role || "").toLowerCase() === "agent"}
                />
              </div>

              <div>
                <FieldLabel helper="Date of this field visit">Visit Date</FieldLabel>
                <Input
                  type="date"
                  value={form.visitDate}
                  onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
                  className="h-12 rounded-xl text-base"
                />
              </div>

              <div className="md:col-span-2">
                <FieldLabel helper="Select the lab to auto-load context">Select Lab</FieldLabel>
                <Select value={form.labId} onValueChange={handleLabChange}>
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Select lab" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleLabs.map((lab) => (
                      <SelectItem key={lab.labId} value={lab.labId}>
                        {lab.labName} ({lab.labId || "No ID"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <FieldLabel helper="Auto-filled from selected lab">Lab Name</FieldLabel>
                <Input
                  value={form.labName}
                  onChange={(e) => setForm({ ...form, labName: e.target.value })}
                  placeholder="Lab name"
                  className="h-12 rounded-xl text-base"
                />
              </div>

              <div>
                <FieldLabel helper="Area or locality of the lab">Area / Locality</FieldLabel>
                <Input
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  placeholder="Area / locality"
                  className="h-12 rounded-xl text-base"
                />
              </div>
            </div>

            {selectedLab ? (
              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-slate-700" />
                  <div className="text-sm font-semibold text-slate-900">Selected Lab Snapshot</div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <SnapshotItem
                    icon={Building2}
                    label="Lab"
                    value={`${selectedLab.labName} (${selectedLab.labId})`}
                  />
                  <SnapshotItem
                    icon={MapPin}
                    label="Area"
                    value={selectedLab.area || "-"}
                  />
                  <SnapshotItem
                    icon={Clock3}
                    label="Last Visit"
                    value={latestLabVisit?.date || "No previous visit"}
                  />
                  <SnapshotItem
                    icon={MessageSquare}
                    label="Last Response"
                    value={displayResponseLabel(latestLabVisit?.labResponse || "")}
                  />
                  <SnapshotItem
                    icon={IndianRupee}
                    label="Total Sales"
                    value={`₹${Number(selectedLabTotalSales || 0).toLocaleString()}`}
                  />
                  <SnapshotItem
                    icon={IndianRupee}
                    label="Outstanding"
                    value={`₹${Number(selectedLabCollection?.outstandingAmount || 0).toLocaleString()}`}
                    tone={selectedLabCollection?.outstandingAmount > 0 ? "warn" : "default"}
                  />
                  <SnapshotItem
                    icon={AlertTriangle}
                    label="Credit Hold"
                    value={selectedLabCollection?.creditHold || "OK"}
                    tone={String(selectedLabCollection?.creditHold || "").toUpperCase() === "HOLD" ? "danger" : "default"}
                  />
                  <SnapshotItem
                    icon={CalendarDays}
                    label="Next Follow-up"
                    value={
                      latestLabVisit?.nextFollowUpDate
                        ? `${latestLabVisit.nextFollowUpType || "Follow-up"} • ${latestLabVisit.nextFollowUpDate}`
                        : "Not scheduled"
                    }
                  />
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <SectionTitle
              icon={MapPin}
              title="Visit Outcome"
              subtitle="What happened during the visit"
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel helper="Why did you visit this lab today?">Visit Type</FieldLabel>
                <Select value={form.visitType} onValueChange={(value) => setForm({ ...form, visitType: value })}>
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Visit type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="New Lead">New Lead</SelectItem>
                    <SelectItem value="Follow-up">Follow-up</SelectItem>
                    <SelectItem value="Closing">Closing</SelectItem>
                    <SelectItem value="Collection">Collection</SelectItem>
                    <SelectItem value="Support Visit">Support Visit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <FieldLabel helper="How interested is the lab after this visit?">Lab Response</FieldLabel>
                <Select value={form.labResponse} onValueChange={(value) => setForm({ ...form, labResponse: value })}>
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Lead / lab response" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Interested">Interested</SelectItem>
                    <SelectItem value="Warm">Moderately Interested</SelectItem>
                    <SelectItem value="Not Interested">Not Interested</SelectItem>
                    <SelectItem value="Converted">Order Confirmed</SelectItem>
                    <SelectItem value="Need Follow-up">Follow-up Needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionTitle
              icon={FlaskConical}
              title="Demo, Samples & Sales"
              subtitle="Track product interest and commercial outcome"
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel helper="Enter how many samples were given">Samples Given</FieldLabel>
                <Input
                  value={form.samplesGiven}
                  onChange={(e) => setForm({ ...form, samplesGiven: e.target.value })}
                  placeholder="e.g. 2"
                  className="h-12 rounded-xl text-base"
                />
              </div>

              <div>
                <FieldLabel helper="Did you explain or demo the product?">Demo Given</FieldLabel>
                <Select value={form.demoGiven} onValueChange={(value) => setForm({ ...form, demoGiven: value })}>
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Demo given?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes - Demo Given</SelectItem>
                    <SelectItem value="No">No Demo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <FieldLabel helper="Fill only when real order value is confirmed">Order / Sold Value</FieldLabel>
                <Input
                  value={form.soldValue}
                  onChange={(e) => setForm({ ...form, soldValue: e.target.value })}
                  placeholder="Enter confirmed order value in ₹"
                  className={`h-12 rounded-xl text-base ${
                    form.labResponse === "Converted" ? "border-green-400 ring-1 ring-green-200" : ""
                  }`}
                />
              </div>
            </div>

            {form.labResponse === "Converted" ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                This visit is marked as <strong>Order Confirmed</strong>. Please make sure the order value is filled correctly.
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <SectionTitle
              icon={Package}
              title="Stock Feedback"
              subtitle="Capture stock needs from the lab"
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel helper="Was required stock available for this lab?">Stock Available</FieldLabel>
                <Select
                  value={form.stockAvailable}
                  onValueChange={(value) => setForm({ ...form, stockAvailable: value })}
                >
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Stock available?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes - Fully Available</SelectItem>
                    <SelectItem value="No">No - Not Available</SelectItem>
                    <SelectItem value="Partial">Partial Availability</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <FieldLabel helper="Did the lab request fresh stock or replenishment?">Needs New Stock</FieldLabel>
                <Select
                  value={form.needsNewStock}
                  onValueChange={(value) => setForm({ ...form, needsNewStock: value })}
                >
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Needs new stock?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(form.stockAvailable === "No" || form.stockAvailable === "Partial") ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Stock was not fully available. Mention the stock recovery plan clearly in <strong>Next Action</strong>.
              </div>
            ) : null}
          </section>

          <section className="space-y-4">
            <SectionTitle
              icon={CalendarDays}
              title="Next Action & Follow-up"
              subtitle="Define the next step clearly"
            />

            <div className="grid grid-cols-1 gap-4">
              <div>
                <FieldLabel helper="What should happen next after this visit?">Next Action</FieldLabel>
                <Input
                  value={form.nextAction}
                  onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
                  placeholder="e.g. Call manager Friday, send pricing, revisit next week"
                  className="h-12 rounded-xl text-base"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel helper="When should the next follow-up happen?">Next Follow-up Date</FieldLabel>
                  <Input
                    type="date"
                    value={form.nextFollowUpDate}
                    onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })}
                    className={`h-12 rounded-xl text-base ${
                      form.labResponse === "Need Follow-up" ? "border-blue-400 ring-1 ring-blue-200" : ""
                    }`}
                  />
                </div>

                <div>
                  <FieldLabel helper="What kind of follow-up is required?">Follow-up Type</FieldLabel>
                  <Select
                    value={form.nextFollowUpType}
                    onValueChange={(value) => setForm({ ...form, nextFollowUpType: value })}
                  >
                    <SelectTrigger className={`h-12 rounded-xl text-base ${
                      form.labResponse === "Need Follow-up" ? "border-blue-400 ring-1 ring-blue-200" : ""
                    }`}>
                      <SelectValue placeholder="Follow-up type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Call">Call</SelectItem>
                      <SelectItem value="Visit">Visit</SelectItem>
                      <SelectItem value="Send Pricing">Send Pricing</SelectItem>
                      <SelectItem value="Demo">Demo</SelectItem>
                      <SelectItem value="Collection">Collection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.labResponse === "Need Follow-up" ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                  This visit is marked as <strong>Follow-up Needed</strong>. Please make sure follow-up date and type are filled.
                </div>
              ) : null}

              <div>
                <FieldLabel helper="Anything important the team should know later?">Notes / Observations</FieldLabel>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Decision-maker feedback, objections, competitor pricing, demand notes, buying signals..."
                  className="min-h-[110px] rounded-xl text-base"
                />
              </div>
            </div>
          </section>

          {statusMessage ? (
            <div
              className={`rounded-xl p-3 text-sm ${
                statusType === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-green-50 text-green-700"
              }`}
            >
              {statusMessage}
            </div>
          ) : null}

          <div className="sticky bottom-3 z-10 bg-white/90 pt-2 backdrop-blur">
            <Button
              onClick={handleSaveVisit}
              disabled={saving}
              className="h-12 w-full rounded-xl text-base"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Visit"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent Visible Visits</CardTitle>
          <CardDescription>
            Latest visit records visible to this agent.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="space-y-3">
            {visibleVisits.length === 0 ? (
              <div className="text-sm text-slate-500">No recent visits found.</div>
            ) : (
              visibleVisits.slice(0, 6).map((visit, idx) => (
                <div
                  key={`${visit.id || visit.labName}-${idx}`}
                  className="rounded-2xl border p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{visit.labName || "-"}</div>
                      <div className="text-sm text-slate-500">
                        {visit.area || "-"} • {visit.date || "-"}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge>{visit.visitType || "-"}</Badge>
                      <Badge variant="secondary">{displayResponseLabel(visit.labResponse)}</Badge>
                    </div>
                  </div>

                  <div className="mt-3 text-sm text-slate-600">
                    Sold value: ₹{Number(visit.soldValue || 0).toLocaleString()}
                  </div>

                  {visit.nextFollowUpDate ? (
                    <div className="mt-2 text-sm text-slate-500">
                      Next follow-up: {visit.nextFollowUpType || "Follow-up"} • {visit.nextFollowUpDate}
                    </div>
                  ) : null}

                  {visit.nextAction ? (
                    <div className="mt-1 text-sm text-slate-500">
                      Next action: {visit.nextAction}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}