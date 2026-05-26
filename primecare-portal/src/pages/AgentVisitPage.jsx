import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  StatusBadge,
  KpiCard,
  KpiCardGrid,
  PageSkeleton,
  ListSkeleton,
  EmptyState,
  usePortalToast,
} from "@/components/ux";
import { typography } from "@/styles/designTokens";
import { cn } from "@/lib/utils";
import {
  qualificationBandToVariant,
  pipelineStageToVariant,
  visitTypeToVariant,
} from "@/utils/statusTokens";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { usePredatorRenderTrace } from "@/predator/renderTrace.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import {
  ClipboardCheck,
  MapPin,
  PlusCircle,
  Users,
  CalendarDays,
  PhoneCall,
  IndianRupee,
  MessageSquare,
  Building2,
  Clock3,
  AlertTriangle,
  Package,
  Loader2,
} from "lucide-react";

import { saveAgentVisit } from "@/api/primecareApi";
import {
  createAgentVisitWrite,
  getAgentVisitPageContextRead,
  getLabsCredit,
  getLabQualificationRead,
  upsertLabQualificationWrite,
} from "@/api/primecareSupabaseApi";
import { supabase } from "@/api/supabaseClient.js";
import { ROLES } from "@/config/roles";
import { labIdKey } from "@/utils/labId";
import {
  logAppsScriptFallbackUsed,
  logSupabaseFeatureSource,
} from "@/utils/migrationTrace.js";
import { logClientError } from "@/utils/debugLogger";
import { filterLabsForUser } from "@/utils/accessFilters";
import {
  buildLabSelectOptions,
  extractLabsCreditRows,
  normalizePortalLab,
} from "@/utils/portalLabMapper";
import { ALLOW_LEGACY_APPS_SCRIPT } from "@/config/environment";
import {
  computeQualificationScore,
  formatQualificationBandLabel,
} from "@/utils/computeQualificationScore";
import {
  getPipelineStageLabel,
  mapPipelineFieldsFromRow,
} from "@/utils/qualificationPipeline";

function AgentVisitLoading() {
  return (
    <div className="space-y-3 pb-6">
      <PageSkeleton kpiCount={4} kpiColumns={4} showList={false} />
      <div className="animate-pulse rounded-lg border border-border bg-card p-3 shadow-sm">
        <ListSkeleton rows={5} />
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

/** LabsPage-aligned lab row shape for dropdown and snapshots. */
function normalizeLab(lab) {
  return normalizePortalLab(lab);
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
    outstandingAmount: Number(
      c.outstandingAmount ?? c.outstanding ?? c.Outstanding ?? 0
    ),
    overdueDays: Number(c.overdueDays ?? c.daysOverdue ?? c.Days_Overdue ?? 0),
    riskStatus: c.riskStatus || c.Risk_Status || "",
    creditHold: c.creditHold || c.Credit_Hold || "",
    nextAction: c.nextAction || c.Next_Action || "",
    paymentStatus: c.paymentStatus || c.Payment_Status || "",
    lastFollowUp: c.lastFollowUp || c.Last_Follow_Up_Date || "",
  };
}

function mapWorkspaceVisitToPageVisit(visit) {
  return normalizeVisit({
    id: visit.visitId || visit.id,
    agent: visit.agentName || visit.agent,
    agentName: visit.agentName || visit.agent,
    agentId: visit.agentId,
    date: visit.visitDate || visit.date,
    labId: visit.labId,
    labName: visit.labName,
    area: visit.area,
    visitType: visit.visitType,
    labResponse: visit.labResponse,
    soldValue: visit.soldValue,
    nextAction: visit.nextAction,
    nextFollowUpDate: visit.nextFollowUpDate,
    nextFollowUpType: visit.nextFollowUpType,
  });
}

const QUALIFICATION_DEFAULT = {
  labSize: "",
  monthlyConsumablesEstimate: "",
  currentSupplier: "",
  paymentTerms: "",
  decisionMaker: "",
  reagentRentalPotential: "",
  labOsFit: "",
  nextFollowUpDate: "",
  founderReviewStatus: "pending",
  notes: "",
  qualificationScore: null,
  qualificationBand: "",
  qualificationReasons: [],
  pipelineStage: "new",
  pipelineStageLabel: "New",
  pipelineNextAction: "",
};

function normalizeQualificationRow(row) {
  if (!row) return { ...QUALIFICATION_DEFAULT };
  const scoring = computeQualificationScore(row);
  const pipeline = mapPipelineFieldsFromRow(row);
  return {
    labSize: row.lab_size || "",
    monthlyConsumablesEstimate:
      row.monthly_consumables_estimate == null
        ? ""
        : String(row.monthly_consumables_estimate),
    currentSupplier: row.current_supplier || "",
    paymentTerms: row.payment_terms || "",
    decisionMaker: row.decision_maker || "",
    reagentRentalPotential: row.reagent_rental_potential || "",
    labOsFit: row.lab_os_fit || "",
    nextFollowUpDate: row.next_follow_up_date || "",
    founderReviewStatus: row.founder_review_status || "pending",
    notes: row.notes || "",
    qualificationScore:
      row.qualification_score != null
        ? Number(row.qualification_score)
        : scoring.qualification_score,
    qualificationBand: row.qualification_band || scoring.qualification_band || "",
    qualificationReasons: scoring.qualification_reasons || [],
    pipelineStage: pipeline.pipelineStage,
    pipelineStageLabel: pipeline.pipelineStageLabel,
    pipelineNextAction: pipeline.pipelineNextAction,
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

/** Match dropdown value to a lab (native select string values). */
function resolveLabByOptionValue(labs, value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const rawKey = labIdKey(raw);
  let lab = labs.find((l) => labIdKey(l.labId) === rawKey);
  if (!lab) {
    lab = labs.find((l) => String(l.labName ?? "").trim() === raw);
  }
  return lab || null;
}

function isAgentUser(user) {
  return String(user?.role ?? "").trim().toLowerCase() === ROLES.AGENT;
}

export default function AgentVisitPage({ currentUser, authToken }) {
  const { showToast } = usePortalToast();
  const [labs, setLabs] = useState([]);
  /** Last agent workspace payload when loaded via getAgentWorkspaceRead (Supabase). */
  const [agentWorkspace, setAgentWorkspace] = useState(null);
  const [recentVisits, setRecentVisits] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [qualificationForm, setQualificationForm] = useState(QUALIFICATION_DEFAULT);
  const [qualificationOpen, setQualificationOpen] = useState(false);
  const [qualificationLoading, setQualificationLoading] = useState(false);
  const [qualificationSaving, setQualificationSaving] = useState(false);
  const [qualificationLastUpdated, setQualificationLastUpdated] = useState("");

  const hasLoadedDataRef = useRef(false);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;

  const loadUserKey = useMemo(
    () =>
      [
        currentUser?.id,
        currentUser?.role,
        currentUser?.agentId,
        currentUser?.tenantId,
      ]
        .map((v) => String(v ?? ""))
        .join("|"),
    [currentUser?.id, currentUser?.role, currentUser?.agentId, currentUser?.tenantId]
  );

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

  const loadPageData = useCallback(async () => {
    return predatorTrace("Agent Visits", "page.load", async () => {
      const isInitialLoad = !hasLoadedDataRef.current;
      try {
        if (isInitialLoad) {
          setLoading(true);
        }
        setLoadError("");

        const token = authTokenRef.current;
        const params = token ? { sessionToken: token } : {};

        let workspace = null;
        let labList = [];
        let visitRows = [];
        let collectionRows = [];

        if (supabase) {
          logSupabaseFeatureSource("AgentVisit.load", {
            apis: ["getAgentVisitPageContextRead", "getLabsCredit"],
          });
          const isAgent = isAgentUser(currentUser);

          if (isAgent) {
            const ctxRes = await getAgentVisitPageContextRead(currentUser);
            if (!ctxRes?.success) {
              throw new Error(ctxRes?.error || "Failed to load agent visit context");
            }
            const ctx = ctxRes.data || {};
            workspace = {
              assignedLabs: ctx.labs || [],
              recentVisits: ctx.recentVisits || [],
              pendingCollections: ctx.collections || [],
            };
            visitRows = (ctx.recentVisits || []).map(mapWorkspaceVisitToPageVisit);
            collectionRows = (ctx.collections || []).map(normalizeCollection);

            labList = (ctx.labs || []).map(normalizePortalLab);
            if (labList.length === 0) {
              const cr = await getLabsCredit();
              const rawLabs = extractLabsCreditRows(cr);
              labList = rawLabs.map(normalizePortalLab);
            }
          } else {
            try {
              const cr = await getLabsCredit();
              if (cr?.success && Array.isArray(cr.data)) {
                labList = cr.data
                  .map(normalizeLab)
                  .filter((l) => String(l.labId).trim() !== "");
              }
            } catch (e) {
              console.warn("[AgentVisitPage] getLabsCredit failed:", e?.message || e);
            }
          }
        } else {
          if (!ALLOW_LEGACY_APPS_SCRIPT) {
            throw new Error("Supabase visit data is required for pilot access.");
          }
          const { getLabs, getRecentVisits, getCollections } = await import(
            "@/api/primecareApi"
          );
          const labsRes = await getLabs(params);
          if (!labsRes.success) throw new Error(labsRes.error || "Failed to load labs");
          labList = (labsRes.data?.labs || []).map(normalizeLab).filter((l) => String(l.labId).trim() !== "");

          const [visitsRes, collectionsRes] = await Promise.all([
            getRecentVisits(params),
            getCollections(params),
          ]);
          if (visitsRes?.success) {
            visitRows = (visitsRes.data?.visits || []).map(normalizeVisit);
          }
          if (collectionsRes?.success) {
            collectionRows = (collectionsRes.data?.collections || []).map(normalizeCollection);
          }
        }

        setAgentWorkspace(workspace);
        setLabs(labList);
        setRecentVisits(visitRows);
        setCollections(collectionRows);
        hasLoadedDataRef.current = true;
        setLoading(false);
      } catch (err) {
        await logClientError({
          authToken: authTokenRef.current,
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

        setLoadError(err.message || "Failed to load agent visit page");
        setLabs([]);
        setAgentWorkspace(null);
        setLoading(false);
      }
    });
  }, [currentUser]);

  useEffect(() => {
    loadPageData();
  }, [loadUserKey, loadPageData]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      agentName: currentUser?.agentName || currentUser?.name || prev.agentName,
    }));
  }, [currentUser?.id, currentUser?.agentName, currentUser?.name]);

  const visibleLabs = useMemo(() => {
    if (isAgentUser(currentUser)) {
      return filterLabsForUser(labs, currentUser);
    }
    return labs;
  }, [labs, currentUser]);

  const labSelectOptions = useMemo(
    () => buildLabSelectOptions(visibleLabs),
    [visibleLabs]
  );

  const visibleVisits = useMemo(() => recentVisits, [recentVisits]);

  const todayVisits = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return visibleVisits.filter((v) => String(v.date).slice(0, 10) === today).length;
  }, [visibleVisits]);

  usePredatorModuleValidation(
    "Agent Visits",
    currentUser,
    {
      recentVisitsCount: visibleVisits.length,
      todayVisits,
    },
    !loading
  );

  usePredatorRenderTrace("Agent Visits", {
    ready: !loading,
    hasData: visibleLabs.length > 0 || visibleVisits.length > 0,
  });
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

      showToast(
        "info",
        `Task loaded for ${task.labName || "selected lab"}. Review and save your visit update.`
      );
    }

    window.addEventListener("primecare:openVisitTask", handleOpenVisitTask);

    return () => {
      window.removeEventListener("primecare:openVisitTask", handleOpenVisitTask);
    };
  }, [visibleLabs, showToast]);

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

      showToast(
        "info",
        `Task loaded for ${task.labName || "selected lab"}. Review and save your visit update.`
      );

      sessionStorage.removeItem("primecare_pending_visit_task");
    } catch (err) {
      console.error("Failed to read pending visit task", err);
      sessionStorage.removeItem("primecare_pending_visit_task");
    }
  }, [visibleLabs, showToast]);

  const selectedLab = useMemo(() => {
    const labId = String(form.labId || "").trim();
    if (!labId) return null;
    return resolveLabByOptionValue(visibleLabs, labId);
  }, [visibleLabs, form.labId]);

  const showQualificationCapture = useMemo(() => {
    return isAgentUser(currentUser) && Boolean(String(form.labId || "").trim());
  }, [currentUser, form.labId]);

  useEffect(() => {
    let cancelled = false;

    async function loadQualification() {
      const labId = labIdKey(form.labId);
      if (!labId) {
        setQualificationForm({ ...QUALIFICATION_DEFAULT });
        setQualificationLastUpdated("");
        return;
      }

      try {
        setQualificationLoading(true);
        const res = await getLabQualificationRead({
          tenantId: currentUser?.tenantId || currentUser?.tenant_id || "",
          labId,
        });

        if (cancelled) return;
        if (!res?.success) {
          throw new Error(res?.error || "Failed to load qualification");
        }

        setQualificationForm(normalizeQualificationRow(res.data));
        setQualificationLastUpdated(res?.data?.updated_at || "");
      } catch (err) {
        if (cancelled) return;
        setQualificationForm({ ...QUALIFICATION_DEFAULT });
        showToast("error", err?.message || "Failed to load qualification");
      } finally {
        if (!cancelled) setQualificationLoading(false);
      }
    }

    loadQualification();
    return () => {
      cancelled = true;
    };
  }, [form.labId, currentUser, showToast]);

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

    if (Number(selectedLabCollection?.outstandingAmount || 0) > 0) {
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
    const raw = String(value ?? "").trim();
    if (!raw) {
      setQualificationOpen(false);
      setForm((prev) => ({
        ...prev,
        labId: "",
        labName: "",
        area: currentUser?.assignedArea || prev.area || "",
        nextAction: "",
        nextFollowUpDate: "",
        nextFollowUpType: "Call",
      }));
      return;
    }

    const selected = resolveLabByOptionValue(visibleLabs, raw);
    const labId = selected ? labIdKey(selected.labId) : labIdKey(raw);
    const labName = selected ? String(selected.labName ?? "").trim() : "";

    setQualificationOpen(false);
    setForm((prev) => ({
      ...prev,
      labId,
      labName: labName || prev.labName,
      area:
        selected && String(selected.area ?? "").trim() !== ""
          ? String(selected.area).trim()
          : prev.area,
      nextAction: "",
      nextFollowUpDate: "",
      nextFollowUpType: "Call",
    }));
  }

  async function handleSaveQualification() {
    const labId = labIdKey(form.labId);
    if (!labId) {
      showToast("error", "Select a lab before saving qualification.");
      return;
    }

    return predatorTrace("Agent Visits", "page.saveQualification", async () => {
    try {
      setQualificationSaving(true);

      const payload = {
        tenantId: currentUser?.tenantId || currentUser?.tenant_id || "",
        labId,
        labSize: qualificationForm.labSize,
        monthlyConsumablesEstimate: qualificationForm.monthlyConsumablesEstimate,
        currentSupplier: qualificationForm.currentSupplier,
        paymentTerms: qualificationForm.paymentTerms,
        decisionMaker: qualificationForm.decisionMaker,
        reagentRentalPotential: qualificationForm.reagentRentalPotential,
        labOsFit: qualificationForm.labOsFit,
        nextFollowUpDate: qualificationForm.nextFollowUpDate,
        founderReviewStatus: qualificationForm.founderReviewStatus || "pending",
        notes: qualificationForm.notes,
        agentId: currentUser?.agentId || currentUser?.agent_id || "",
        agentName:
          currentUser?.agentName || currentUser?.name || form.agentName || "",
        updatedBy: currentUser?.id || currentUser?.userId || "",
        writerRole: currentUser?.role || "agent",
        pipelineNextAction: qualificationForm.pipelineNextAction,
      };

      const res = await upsertLabQualificationWrite(payload);
      if (!res?.success) {
        throw new Error(res?.error || "Failed to save qualification");
      }

      setQualificationForm(normalizeQualificationRow(res.data));
      setQualificationLastUpdated(res?.data?.updated_at || "");
      showToast("success", "Qualification saved");
    } catch (err) {
      showToast("error", err?.message || "Failed to save qualification");
    } finally {
      setQualificationSaving(false);
    }
    });
  }

  async function handleSaveVisit() {
    if (!form.agentName || !form.visitDate || !form.visitType) {
      showToast("error", "Please fill agent name, date, and visit type.");
      return;
    }

    if (!String(form.labId ?? "").trim()) {
      showToast("error", "Please select a lab from the dropdown.");
      return;
    }

    return predatorTrace("Agent Visits", "page.saveVisit", async () => {

    const resolvedLab =
      selectedLab ||
      resolveLabByOptionValue(visibleLabs, form.labId) ||
      resolveLabByOptionValue(visibleLabs, form.labName);

    const normalizedLabId = String(resolvedLab?.labId ?? form.labId ?? "").trim();
    const normalizedLabName = String(resolvedLab?.labName ?? form.labName ?? "").trim();

    if (!normalizedLabName) {
      showToast("error", "Please fill agent name, lab, date, and visit type.");
      return;
    }

    if (form.labResponse === "Converted" && !Number(form.soldValue || 0)) {
      showToast("error", "Enter order value when the visit outcome is Order Confirmed.");
      return;
    }

    if ((form.labResponse === "Need Follow-up" || form.nextFollowUpDate) && !form.nextFollowUpType) {
      showToast("error", "Please choose a follow-up type.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        sessionToken: authToken || "",
        visitDate: form.visitDate,
        agentName: form.agentName,
        labId: normalizedLabId,
        labName: normalizedLabName,
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

      let res;
      if (supabase) {
        logSupabaseFeatureSource("AgentVisit.save", { api: "createAgentVisitWrite" });
        const sbRes = await createAgentVisitWrite({
          tenantId: currentUser?.tenantId || currentUser?.tenant_id,
          agentId: currentUser?.agentId || currentUser?.agent_id || "",
          agentName:
            currentUser?.agentName ||
            currentUser?.name ||
            form.agentName ||
            "",
          visitDate: form.visitDate,
          visitType: form.visitType,
          labId: normalizedLabId,
          labName: normalizedLabName,
          area: form.area,
          notes: form.notes,
          nextFollowUpDate: form.nextFollowUpDate,
          labResponse: form.labResponse,
          soldValue: form.soldValue,
        });

        if (sbRes?.success && sbRes.data) {
          const vid =
            sbRes.data.visit_id ??
            sbRes.data.visitId ??
            sbRes.data.id ??
            "";
          res = { success: true, data: { visitId: vid } };
        } else {
          if (!ALLOW_LEGACY_APPS_SCRIPT) {
            throw new Error(sbRes?.error || "Supabase visit write failed.");
          }
          logAppsScriptFallbackUsed("AgentVisit.save", sbRes?.error || "unknown");
          res = await saveAgentVisit(payload);
        }
      } else {
        if (!ALLOW_LEGACY_APPS_SCRIPT) {
          throw new Error("Supabase visit write is required for pilot access.");
        }
        res = await saveAgentVisit(payload);
      }

      if (!res.success) throw new Error(res.error || "Failed to save visit");

      const newVisit = normalizeVisit({
        id: res.data?.visitId || `VISIT-${Date.now()}`,
        agent: form.agentName,
        date: form.visitDate,
        labId: normalizedLabId,
        labName: normalizedLabName,
        area: form.area,
        visitType: form.visitType,
        labResponse: form.labResponse,
        soldValue: form.soldValue,
        nextAction: form.nextAction,
        nextFollowUpDate: form.nextFollowUpDate,
        nextFollowUpType: form.nextFollowUpType,
      });

      setRecentVisits((prev) => [newVisit, ...prev]);

      showToast(
        "success",
        `Visit saved${res.data?.visitId ? `: ${res.data.visitId}` : ""}`
      );

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

      showToast("error", err.message || "Failed to save visit");
    } finally {
      setSaving(false);
    }
    });
  }

  if (loading) {
    return <AgentVisitLoading />;
  }

  return (
    <div className="space-y-3 pb-28">
      <header>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-[var(--pc-brand-primary)]" />
          <h1 className={typography.pageTitle}>Agent Visits</h1>
        </div>
        <p className={cn(typography.pageSubtitle, "mt-0.5")}>
          Log field visits step by step. Select a lab, capture the outcome, then save.
        </p>
      </header>

      <KpiCardGrid columns={4}>
        <KpiCard title="My labs" value={visibleLabs.length} icon={Users} />
        <KpiCard title="Today visits" value={todayVisits} icon={ClipboardCheck} />
        <KpiCard title="Follow-ups" value={pendingFollowUps} icon={PhoneCall} />
        <KpiCard
          title="Sales logged"
          value={`₹${totalSalesLogged.toLocaleString("en-IN")}`}
          icon={IndianRupee}
        />
      </KpiCardGrid>

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {loadError}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-9 rounded-lg"
            onClick={() => loadPageData()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <Card className="rounded-lg border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Log field visit</CardTitle>
          <CardDescription className="text-xs">
            Sections 1–4 are required for every visit. Qualification is optional.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <section className="space-y-4 rounded-lg border border-border bg-card p-3">
            <SectionTitle
              icon={Users}
              title="1. Lab & visit basics"
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
                <FieldLabel helper="Select the lab to auto-load context">Select lab</FieldLabel>
                <select
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none focus:ring-2 focus:ring-ring"
                  value={form.labId ? labIdKey(form.labId) : ""}
                  onChange={(e) => handleLabChange(e.target.value)}
                >
                  <option value="">Select lab…</option>
                  {labSelectOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
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

          <section className="space-y-4 rounded-lg border border-border bg-card p-3">
            <SectionTitle
              icon={MapPin}
              title="2. Visit outcome & sales"
              subtitle="Visit type, lab response, demo, and order value"
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel helper="Why did you visit this lab today?">Visit type</FieldLabel>
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

            {form.labResponse === "Converted" ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                Order confirmed — enter the order value below.
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel helper="How many samples were given?">Samples given</FieldLabel>
                <Input
                  value={form.samplesGiven}
                  onChange={(e) => setForm({ ...form, samplesGiven: e.target.value })}
                  placeholder="e.g. 2"
                  className="h-11 rounded-lg text-sm"
                />
              </div>

              <div>
                <FieldLabel helper="Did you demo the product?">Demo given</FieldLabel>
                <Select value={form.demoGiven} onValueChange={(value) => setForm({ ...form, demoGiven: value })}>
                  <SelectTrigger className="h-11 rounded-lg text-sm">
                    <SelectValue placeholder="Demo given?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes — demo given</SelectItem>
                    <SelectItem value="No">No demo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <FieldLabel helper="Fill only when order value is confirmed">Order / sold value (₹)</FieldLabel>
                <Input
                  value={form.soldValue}
                  onChange={(e) => setForm({ ...form, soldValue: e.target.value })}
                  placeholder="Confirmed order value"
                  className={cn(
                    "h-11 rounded-lg text-sm",
                    form.labResponse === "Converted" && "border-green-400 ring-1 ring-green-200"
                  )}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-border bg-card p-3">
            <SectionTitle
              icon={Package}
              title="3. Stock feedback"
              subtitle="Capture stock availability at the lab"
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

          <section className="space-y-4 rounded-lg border border-border bg-card p-3">
            <SectionTitle
              icon={CalendarDays}
              title="4. Next action & follow-up"
              subtitle="Define the next step after this visit"
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

          {showQualificationCapture ? (
            <section className="rounded-lg border border-border bg-card">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 p-3 text-left"
                onClick={() => setQualificationOpen((v) => !v)}
                aria-expanded={qualificationOpen}
              >
                <SectionTitle
                  icon={ClipboardCheck}
                  title="5. Qualification capture (optional)"
                  subtitle="Collapsed by default — expand when needed"
                />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {qualificationOpen ? "Hide" : "Expand"}
                </span>
              </button>

              {qualificationOpen ? (
                <div className="space-y-4 border-t border-border px-3 pb-3 pt-3">
                  {qualificationLoading ? (
                    <ListSkeleton rows={3} />
                  ) : (
                    <>
                      {qualificationForm.qualificationBand ||
                      qualificationForm.pipelineStage ? (
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge
                              variant={pipelineStageToVariant(qualificationForm.pipelineStage)}
                              compact
                            >
                              {qualificationForm.pipelineStageLabel ||
                                getPipelineStageLabel(qualificationForm.pipelineStage)}
                            </StatusBadge>
                            <span className="text-[10px] text-muted-foreground">read-only</span>
                            {qualificationForm.qualificationBand ? (
                              <StatusBadge
                                variant={qualificationBandToVariant(
                                  qualificationForm.qualificationBand
                                )}
                                compact
                              >
                                {formatQualificationBandLabel(qualificationForm.qualificationBand)}
                              </StatusBadge>
                            ) : null}
                            {qualificationForm.qualificationScore != null ? (
                              <span className="text-sm text-slate-700">
                                Score: {qualificationForm.qualificationScore}
                              </span>
                            ) : null}
                          </div>
                          {qualificationForm.qualificationReasons?.length > 0 ? (
                            <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                              {qualificationForm.qualificationReasons.slice(0, 6).map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}

                      <div>
                        <FieldLabel helper="Your next step for this lab in the pipeline">
                          Pipeline next action
                        </FieldLabel>
                        <Input
                          value={qualificationForm.pipelineNextAction}
                          onChange={(e) =>
                            setQualificationForm((prev) => ({
                              ...prev,
                              pipelineNextAction: e.target.value,
                            }))
                          }
                          placeholder="e.g. Send sample kit, schedule demo call"
                          className="h-11 rounded-lg text-sm"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <FieldLabel>Lab size</FieldLabel>
                          <Select
                            value={qualificationForm.labSize || ""}
                            onValueChange={(value) =>
                              setQualificationForm((prev) => ({ ...prev, labSize: value }))
                            }
                          >
                            <SelectTrigger className="h-11 rounded-lg text-sm">
                              <SelectValue placeholder="Select lab size" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Small">Small</SelectItem>
                              <SelectItem value="Medium">Medium</SelectItem>
                              <SelectItem value="Large">Large</SelectItem>
                              <SelectItem value="Enterprise">Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <FieldLabel>Monthly consumables (₹)</FieldLabel>
                          <Input
                            type="number"
                            value={qualificationForm.monthlyConsumablesEstimate}
                            onChange={(e) =>
                              setQualificationForm((prev) => ({
                                ...prev,
                                monthlyConsumablesEstimate: e.target.value,
                              }))
                            }
                            placeholder="e.g. 50000"
                            className="h-11 rounded-lg text-sm"
                          />
                        </div>

                        <div>
                          <FieldLabel>Current supplier</FieldLabel>
                          <Input
                            value={qualificationForm.currentSupplier}
                            onChange={(e) =>
                              setQualificationForm((prev) => ({
                                ...prev,
                                currentSupplier: e.target.value,
                              }))
                            }
                            className="h-11 rounded-lg text-sm"
                          />
                        </div>

                        <div>
                          <FieldLabel>Payment terms</FieldLabel>
                          <Input
                            value={qualificationForm.paymentTerms}
                            onChange={(e) =>
                              setQualificationForm((prev) => ({
                                ...prev,
                                paymentTerms: e.target.value,
                              }))
                            }
                            className="h-11 rounded-lg text-sm"
                          />
                        </div>

                        <div>
                          <FieldLabel>Decision maker</FieldLabel>
                          <Input
                            value={qualificationForm.decisionMaker}
                            onChange={(e) =>
                              setQualificationForm((prev) => ({
                                ...prev,
                                decisionMaker: e.target.value,
                              }))
                            }
                            className="h-11 rounded-lg text-sm"
                          />
                        </div>

                        <div>
                          <FieldLabel>Reagent rental potential</FieldLabel>
                          <Select
                            value={qualificationForm.reagentRentalPotential || ""}
                            onValueChange={(value) =>
                              setQualificationForm((prev) => ({
                                ...prev,
                                reagentRentalPotential: value,
                              }))
                            }
                          >
                            <SelectTrigger className="h-11 rounded-lg text-sm">
                              <SelectValue placeholder="Select potential" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Low">Low</SelectItem>
                              <SelectItem value="Medium">Medium</SelectItem>
                              <SelectItem value="High">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <FieldLabel>Lab OS fit</FieldLabel>
                          <Select
                            value={qualificationForm.labOsFit || ""}
                            onValueChange={(value) =>
                              setQualificationForm((prev) => ({ ...prev, labOsFit: value }))
                            }
                          >
                            <SelectTrigger className="h-11 rounded-lg text-sm">
                              <SelectValue placeholder="Select fit" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Low">Low</SelectItem>
                              <SelectItem value="Medium">Medium</SelectItem>
                              <SelectItem value="High">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <FieldLabel>Qualification follow-up date</FieldLabel>
                          <Input
                            type="date"
                            value={qualificationForm.nextFollowUpDate}
                            onChange={(e) =>
                              setQualificationForm((prev) => ({
                                ...prev,
                                nextFollowUpDate: e.target.value,
                              }))
                            }
                            className="h-11 rounded-lg text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <FieldLabel>Founder review (read-only)</FieldLabel>
                        <Input
                          value={qualificationForm.founderReviewStatus || "pending"}
                          readOnly
                          className="h-11 rounded-lg bg-muted/40 text-sm"
                        />
                      </div>

                      <div>
                        <FieldLabel>Qualification notes</FieldLabel>
                        <Textarea
                          value={qualificationForm.notes}
                          onChange={(e) =>
                            setQualificationForm((prev) => ({ ...prev, notes: e.target.value }))
                          }
                          placeholder="Objections, buying cycle, competitor notes…"
                          className="min-h-[88px] rounded-lg text-sm"
                        />
                      </div>

                      <Button
                        type="button"
                        onClick={handleSaveQualification}
                        disabled={qualificationSaving || qualificationLoading}
                        className="h-11 w-full rounded-lg sm:w-auto"
                      >
                        {qualificationSaving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving qualification…
                          </>
                        ) : (
                          "Save qualification"
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {qualificationLastUpdated
                          ? `Last updated: ${new Date(qualificationLastUpdated).toLocaleString()}`
                          : "No qualification saved yet for this lab."}
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/90 sm:static sm:border-0 sm:bg-transparent sm:p-0">
        <Button
          type="button"
          onClick={handleSaveVisit}
          disabled={saving}
          className="h-12 w-full rounded-lg text-base sm:max-w-md"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving visit…
            </>
          ) : (
            <>
              <PlusCircle className="mr-2 h-4 w-4" />
              Save visit
            </>
          )}
        </Button>
      </div>

      <section className="space-y-2">
        <SectionTitle
          icon={Clock3}
          title="6. Recent visits"
          subtitle="Latest records visible to you"
        />

        {visibleVisits.length === 0 ? (
          <EmptyState
            title="No recent visits"
            description="Saved visits will appear here for quick reference."
          />
        ) : (
          <div className="space-y-2" role="list">
            {visibleVisits.slice(0, 6).map((visit, idx) => (
              <Card
                key={`${visit.id || visit.labName}-${idx}`}
                className="rounded-lg border-border p-3 shadow-sm"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{visit.labName || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {visit.area || "—"} · {visit.date || "—"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <StatusBadge variant={visitTypeToVariant(visit.visitType)} compact>
                      {visit.visitType || "—"}
                    </StatusBadge>
                    <StatusBadge variant="neutral" compact>
                      {displayResponseLabel(visit.labResponse)}
                    </StatusBadge>
                  </div>
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  Sold: ₹{Number(visit.soldValue || 0).toLocaleString("en-IN")}
                </div>
                {visit.nextFollowUpDate ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Follow-up: {visit.nextFollowUpType || "Call"} · {visit.nextFollowUpDate}
                  </div>
                ) : null}
                {visit.nextAction ? (
                  <div className="text-xs text-muted-foreground">Next: {visit.nextAction}</div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}