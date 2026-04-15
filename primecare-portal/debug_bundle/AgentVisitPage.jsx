import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  CalendarDays,
  ClipboardCheck,
  FlaskConical,
  IndianRupee,
  MapPin,
  PhoneCall,
  PlusCircle,
  Save,
  User,
  Building2,
  MessageSquare,
  Activity,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { getLabs, getRecentVisits, saveAgentVisit } from "@/api/primecareApi";
import { filterLabsForUser, filterVisitsForUser } from "@/utils/accessFilters";

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-2xl bg-slate-100 p-2">
        <Icon className="h-5 w-5 text-slate-700" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function InfoStat({ label, value }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ChoiceChip({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
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
    samplesGiven: Number(v.samplesGiven || v.Samples_Given || 0),
    demoGiven: v.demoGiven || v.Demo_Given || "",
    labResponse: v.labResponse || v.Lab_Response || "",
    soldValue: Number(v.soldValue || v.Sold_Value || 0),
    stockAvailable: v.stockAvailable || v.Stock_Available || "",
    needsNewStock: v.needsNewStock || v.Needs_New_Stock || "",
    nextAction: v.nextAction || v.Next_Action || "",
    notes: v.notes || v.Notes || "",
    createdAt: v.createdAt || v.Created_At || "",
  };
}

function normalizeLab(lab) {
  return {
    labId: lab.labId || lab.Lab_ID || "",
    labName: lab.labName || lab.Lab_Name || "",
    ownerName: lab.ownerName || lab.Owner_Name || "",
    phone: lab.phone || lab.Phone || "",
    area: lab.area || lab.Area || "",
  };
}

export default function AgentVisitPage({ currentUser, authToken }) {
  const [labs, setLabs] = useState([]);
  const [visits, setVisits] = useState([]);

  const [loadingLabs, setLoadingLabs] = useState(true);
  const [loadingVisits, setLoadingVisits] = useState(true);
  const [saving, setSaving] = useState(false);

  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("info");

  const [form, setForm] = useState({
    agent: currentUser?.name || "Agent",
    date: new Date().toISOString().slice(0, 10),
    labId: "",
    labName: "",
    area: "",

    visitType: "Follow-up",

    samplesGiven: "",
    demoGiven: "No",

    leadTemperature: "Warm",
    dealClosed: "No",
    soldValue: "",

    stockAvailable: "Yes",
    needsNewStock: "No",

    followUpRequired: "Yes",
    nextAction: "",
    notes: "",
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      agent: currentUser?.name || prev.agent,
    }));
  }, [currentUser]);

  useEffect(() => {
    async function loadLabs() {
      try {
        setLoadingLabs(true);
        const res = await getLabs(authToken ? { sessionToken: authToken } : {});
        if (!res?.success) throw new Error(res?.error || "Failed to load labs");

        const normalized = (res.data?.labs || []).map(normalizeLab);
        setLabs(normalized);
      } catch (err) {
        setStatusMessage(err.message || "Failed to load labs");
        setStatusType("error");
      } finally {
        setLoadingLabs(false);
      }
    }

    loadLabs();
  }, [authToken]);

  useEffect(() => {
    async function loadVisits() {
      try {
        setLoadingVisits(true);
        const res = await getRecentVisits(authToken ? { sessionToken: authToken } : {});
        if (!res?.success) throw new Error(res?.error || "Failed to load recent visits");

        const normalized = (res.data?.visits || []).map(normalizeVisit);
        setVisits(normalized);
      } catch (err) {
        setStatusMessage(err.message || "Failed to load visit activity");
        setStatusType("error");
      } finally {
        setLoadingVisits(false);
      }
    }

    loadVisits();
  }, [authToken]);

  const visibleLabs = useMemo(() => {
    return filterLabsForUser(labs, currentUser);
  }, [labs, currentUser]);

  const visibleVisits = useMemo(() => {
    return filterVisitsForUser(visits, currentUser);
  }, [visits, currentUser]);

  const today = new Date().toISOString().slice(0, 10);

  const todayVisits = useMemo(() => {
    return visibleVisits.filter((v) => String(v.date || "").slice(0, 10) === today).length;
  }, [visibleVisits, today]);

  const thisMonthSales = useMemo(() => {
    const monthPrefix = today.slice(0, 7);
    return visibleVisits
      .filter((v) => String(v.date || "").slice(0, 7) === monthPrefix)
      .reduce((sum, v) => sum + Number(v.soldValue || 0), 0);
  }, [visibleVisits, today]);

  const convertedCount = useMemo(() => {
    return visibleVisits.filter((v) => String(v.labResponse || "").toLowerCase() === "converted").length;
  }, [visibleVisits]);

  function onLabChange(value) {
    const selected = visibleLabs.find((x) => String(x.labId) === String(value));
    setForm((prev) => ({
      ...prev,
      labId: selected?.labId || "",
      labName: selected?.labName || "",
      area: selected?.area || "",
    }));
  }

  function resetForm() {
    setForm({
      agent: currentUser?.name || "Agent",
      date: new Date().toISOString().slice(0, 10),
      labId: "",
      labName: "",
      area: "",
      visitType: "Follow-up",
      samplesGiven: "",
      demoGiven: "No",
      leadTemperature: "Warm",
      dealClosed: "No",
      soldValue: "",
      stockAvailable: "Yes",
      needsNewStock: "No",
      followUpRequired: "Yes",
      nextAction: "",
      notes: "",
    });
  }

  async function handleSaveVisit() {
    if (!form.agent) {
      setStatusMessage("Agent name is required.");
      setStatusType("error");
      return;
    }

    if (!form.labId || !form.labName) {
      setStatusMessage("Please select a valid lab from the dropdown.");
      setStatusType("error");
      return;
    }

    if (!form.area) {
      setStatusMessage("Area is required.");
      setStatusType("error");
      return;
    }

    if (form.dealClosed === "Yes" && !Number(form.soldValue || 0)) {
      setStatusMessage("Please enter order value when deal is closed.");
      setStatusType("error");
      return;
    }

    if (form.followUpRequired === "Yes" && !String(form.nextAction || "").trim()) {
      setStatusMessage("Please add next action for required follow-up.");
      setStatusType("error");
      return;
    }

    const payload = {
      visitDate: form.date,
      agentName: form.agent,
      labId: form.labId,
      labName: form.labName,
      area: form.area,
      visitType: form.visitType,
      samplesGiven: Number(form.samplesGiven || 0),
      demoGiven: form.demoGiven,
      labResponse:
        form.dealClosed === "Yes"
          ? "Converted"
          : form.leadTemperature,
      soldValue: Number(form.soldValue || 0),
      stockAvailable: form.stockAvailable,
      needsNewStock: form.needsNewStock,
      nextAction: form.followUpRequired === "Yes" ? form.nextAction : "No follow-up needed",
      notes: form.notes,
    };

    try {
      setSaving(true);
      setStatusMessage("");

      const res = await saveAgentVisit(payload);
      if (!res?.success) throw new Error(res?.error || "Failed to save visit");

      const newVisit = {
        id: res.data?.visitId || `VIS-${Date.now()}`,
        agent: payload.agentName,
        date: payload.visitDate,
        labId: payload.labId,
        labName: payload.labName,
        area: payload.area,
        visitType: payload.visitType,
        samplesGiven: payload.samplesGiven,
        demoGiven: payload.demoGiven,
        labResponse: payload.labResponse,
        soldValue: payload.soldValue,
        stockAvailable: payload.stockAvailable,
        needsNewStock: payload.needsNewStock,
        nextAction: payload.nextAction,
        notes: payload.notes,
      };

      setVisits((prev) => [newVisit, ...prev]);
      setStatusMessage(`Visit saved successfully: ${res.data?.visitId || ""}`);
      setStatusType("success");
      resetForm();
    } catch (err) {
      setStatusMessage(err.message || "Failed to save visit");
      setStatusType("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Agent Visit CRM
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Log field visits, sales progress, sample activity, and follow-up actions clearly.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <InfoStat label="Today Visits" value={todayVisits} />
          <InfoStat label="Converted" value={convertedCount} />
          <InfoStat label="Month Sales" value={`₹${thisMonthSales.toLocaleString()}`} />
        </div>
      </div>

      {statusMessage ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            statusType === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {statusMessage}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
        <Card className="rounded-3xl border-slate-200 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Log Field Visit</CardTitle>
            <CardDescription>
              Fill in what happened during the visit in simple business language.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8">
            <section className="space-y-4">
              <SectionHeader
                icon={User}
                title="Basic Visit Details"
                subtitle="Who visited, when, and which lab was covered"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Agent Name</label>
                  <Input
                    value={form.agent}
                    onChange={(e) => setForm((prev) => ({ ...prev, agent: e.target.value }))}
                    disabled
                    className="h-12 rounded-2xl"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Visit Date</label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
                    className="h-12 rounded-2xl"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium text-slate-700">Select Lab</label>
                  {loadingLabs ? (
                    <div className="rounded-2xl border bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      Loading labs...
                    </div>
                  ) : (
                    <Select value={form.labId} onValueChange={onLabChange}>
                      <SelectTrigger className="h-12 rounded-2xl">
                        <SelectValue placeholder="Choose a lab" />
                      </SelectTrigger>
                      <SelectContent>
                        {visibleLabs.map((lab) => (
                          <SelectItem key={lab.labId} value={lab.labId}>
                            {lab.labName} ({lab.labId})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Lab Name</label>
                  <Input
                    value={form.labName}
                    onChange={(e) => setForm((prev) => ({ ...prev, labName: e.target.value }))}
                    className="h-12 rounded-2xl"
                    placeholder="Selected lab name"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Area / Locality</label>
                  <Input
                    value={form.area}
                    onChange={(e) => setForm((prev) => ({ ...prev, area: e.target.value }))}
                    className="h-12 rounded-2xl"
                    placeholder="Area"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeader
                icon={ClipboardCheck}
                title="Visit Outcome"
                subtitle="What was the purpose and result of the visit?"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Visit Type</label>
                  <Select
                    value={form.visitType}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, visitType: value }))}
                  >
                    <SelectTrigger className="h-12 rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New Lead">New Lead</SelectItem>
                      <SelectItem value="Follow-up">Follow-up</SelectItem>
                      <SelectItem value="Closing">Closing / Negotiation</SelectItem>
                      <SelectItem value="Collection">Collection Visit</SelectItem>
                      <SelectItem value="Support Visit">Support Visit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700">Lead Interest Level</label>
                  <div className="flex flex-wrap gap-2">
                    <ChoiceChip
                      label="🔥 Hot"
                      active={form.leadTemperature === "Hot"}
                      onClick={() => setForm((prev) => ({ ...prev, leadTemperature: "Hot" }))}
                    />
                    <ChoiceChip
                      label="🌤 Warm"
                      active={form.leadTemperature === "Warm"}
                      onClick={() => setForm((prev) => ({ ...prev, leadTemperature: "Warm" }))}
                    />
                    <ChoiceChip
                      label="❄️ Cold"
                      active={form.leadTemperature === "Cold"}
                      onClick={() => setForm((prev) => ({ ...prev, leadTemperature: "Cold" }))}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeader
                icon={IndianRupee}
                title="Sales & Business Outcome"
                subtitle="Capture whether the visit led to real business"
              />

              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Did you close a deal today?</label>
                <div className="flex flex-wrap gap-2">
                  <ChoiceChip
                    label="Yes, deal closed"
                    active={form.dealClosed === "Yes"}
                    onClick={() => setForm((prev) => ({ ...prev, dealClosed: "Yes" }))}
                  />
                  <ChoiceChip
                    label="No deal yet"
                    active={form.dealClosed === "No"}
                    onClick={() => setForm((prev) => ({ ...prev, dealClosed: "No", soldValue: "" }))}
                  />
                </div>
              </div>

              {form.dealClosed === "Yes" ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid gap-4 md:grid-cols-2"
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Order Value (₹)</label>
                    <Input
                      value={form.soldValue}
                      onChange={(e) => setForm((prev) => ({ ...prev, soldValue: e.target.value }))}
                      className="h-12 rounded-2xl"
                      placeholder="Enter order value"
                    />
                  </div>
                </motion.div>
              ) : null}
            </section>

            <section className="space-y-4">
              <SectionHeader
                icon={FlaskConical}
                title="Samples & Product Demo"
                subtitle="Track awareness-building actions during the visit"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700">Did you give a demo?</label>
                  <div className="flex flex-wrap gap-2">
                    <ChoiceChip
                      label="Yes"
                      active={form.demoGiven === "Yes"}
                      onClick={() => setForm((prev) => ({ ...prev, demoGiven: "Yes" }))}
                    />
                    <ChoiceChip
                      label="No"
                      active={form.demoGiven === "No"}
                      onClick={() => setForm((prev) => ({ ...prev, demoGiven: "No" }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Number of Samples Given</label>
                  <Input
                    value={form.samplesGiven}
                    onChange={(e) => setForm((prev) => ({ ...prev, samplesGiven: e.target.value }))}
                    className="h-12 rounded-2xl"
                    placeholder="e.g. 2"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeader
                icon={Activity}
                title="Stock & Supply Feedback"
                subtitle="Capture supply-side feedback from the lab"
              />

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700">Was required stock available?</label>
                  <div className="flex flex-wrap gap-2">
                    <ChoiceChip
                      label="Yes"
                      active={form.stockAvailable === "Yes"}
                      onClick={() => setForm((prev) => ({ ...prev, stockAvailable: "Yes" }))}
                    />
                    <ChoiceChip
                      label="Partial"
                      active={form.stockAvailable === "Partial"}
                      onClick={() => setForm((prev) => ({ ...prev, stockAvailable: "Partial" }))}
                    />
                    <ChoiceChip
                      label="No"
                      active={form.stockAvailable === "No"}
                      onClick={() => setForm((prev) => ({ ...prev, stockAvailable: "No" }))}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-700">Does this lab need new stock urgently?</label>
                  <div className="flex flex-wrap gap-2">
                    <ChoiceChip
                      label="Yes"
                      active={form.needsNewStock === "Yes"}
                      onClick={() => setForm((prev) => ({ ...prev, needsNewStock: "Yes" }))}
                    />
                    <ChoiceChip
                      label="No"
                      active={form.needsNewStock === "No"}
                      onClick={() => setForm((prev) => ({ ...prev, needsNewStock: "No" }))}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <SectionHeader
                icon={PhoneCall}
                title="Follow-up Plan"
                subtitle="Define the next step clearly so no lead gets lost"
              />

              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-700">Follow-up required?</label>
                <div className="flex flex-wrap gap-2">
                  <ChoiceChip
                    label="Yes, follow-up needed"
                    active={form.followUpRequired === "Yes"}
                    onClick={() => setForm((prev) => ({ ...prev, followUpRequired: "Yes" }))}
                  />
                  <ChoiceChip
                    label="No further action"
                    active={form.followUpRequired === "No"}
                    onClick={() => setForm((prev) => ({ ...prev, followUpRequired: "No", nextAction: "" }))}
                  />
                </div>
              </div>

              {form.followUpRequired === "Yes" ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-2"
                >
                  <label className="text-sm font-medium text-slate-700">Next Action</label>
                  <Input
                    value={form.nextAction}
                    onChange={(e) => setForm((prev) => ({ ...prev, nextAction: e.target.value }))}
                    className="h-12 rounded-2xl"
                    placeholder="e.g. Call again on Friday / Send revised pricing / Demo CBC reagent"
                  />
                </motion.div>
              ) : null}
            </section>

            <section className="space-y-4">
              <SectionHeader
                icon={MessageSquare}
                title="Notes & Observations"
                subtitle="Capture anything important for future follow-up"
              />

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Visit Notes</label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  className="min-h-[120px] rounded-2xl"
                  placeholder="Write useful context: decision maker feedback, objections, competitor presence, pricing concerns, next opportunity..."
                />
              </div>
            </section>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Button
                onClick={handleSaveVisit}
                disabled={saving}
                className="h-12 rounded-2xl px-6"
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving Visit..." : "Save Visit Record"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                className="h-12 rounded-2xl px-6"
              >
                Reset Form
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Recent Visit Activity</CardTitle>
              <CardDescription>
                Your latest visible field updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingVisits ? (
                <div className="text-sm text-slate-500">Loading visits...</div>
              ) : visibleVisits.length === 0 ? (
                <div className="text-sm text-slate-500">No recent visits found.</div>
              ) : (
                <div className="space-y-3">
                  {visibleVisits.slice(0, 5).map((visit) => (
                    <motion.div
                      key={visit.id}
                      layout
                      className="rounded-2xl border p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{visit.labName || "-"}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {visit.area || "-"} • {visit.date || "-"}
                          </div>
                        </div>
                        <Badge>{visit.visitType || "-"}</Badge>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="secondary">{visit.labResponse || "-"}</Badge>
                        {visit.demoGiven ? <Badge variant="outline">Demo: {visit.demoGiven}</Badge> : null}
                        {visit.soldValue ? (
                          <Badge variant="outline">
                            ₹{Number(visit.soldValue || 0).toLocaleString()}
                          </Badge>
                        ) : null}
                      </div>

                      {visit.nextAction ? (
                        <div className="mt-3 text-sm text-slate-600">
                          <span className="font-medium">Next:</span> {visit.nextAction}
                        </div>
                      ) : null}
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Agent Guidance</CardTitle>
              <CardDescription>How to fill this form correctly</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="font-medium text-slate-800">Visit Type</div>
                <div className="mt-1">
                  Choose the reason for the visit: new lead, follow-up, closing, collection, or support.
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="font-medium text-slate-800">Lead Interest Level</div>
                <div className="mt-1">
                  Hot = very interested, Warm = moderate interest, Cold = not interested now.
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="font-medium text-slate-800">Deal Closed</div>
                <div className="mt-1">
                  Mark this Yes only if business was confirmed during the visit.
                </div>
              </div>

              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="font-medium text-slate-800">Follow-up Required</div>
                <div className="mt-1">
                  Always mention a clear next step if the lab needs another call or visit.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}