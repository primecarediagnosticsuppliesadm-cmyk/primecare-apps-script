import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader, PageSkeleton } from "@/components/ux";
import { ROLES } from "@/config/roles.js";
import ReviewQuestionField from "@/components/reviews/ReviewQuestionField.jsx";
import {
  listAgentDirectory,
  listReviewCycles,
  listVisibleLabs,
  loadAgentQuestionnaire,
  saveReviewResponse,
  transitionReview,
} from "@/reviews/reviewApi.js";
import { isResponseAnswered } from "@/reviews/displayRule.js";
import {
  agentStatusLabel,
  canAgentEdit,
  formatReviewPeriod,
  groupSections,
  requiredProgress,
  reviewActionLabel,
  reviewTypeLabel,
  visibleQuestions,
} from "@/reviews/reviewPresentation.js";

const SAVE_DELAY_MS = 700;

function readCycleFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("cycle") || "";
}

function writeCycleUrl(cycleId) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (cycleId) url.searchParams.set("cycle", cycleId);
  else url.searchParams.delete("cycle");
  window.history.replaceState({ primecarePage: "agentReviews" }, "", `${url.pathname}${url.search}`);
}

export default function AgentReviewsPage({ currentUser = null, setActivePage = null }) {
  const role = String(currentUser?.role || "").toLowerCase();
  const isHq = role === ROLES.ADMIN || role === ROLES.EXECUTIVE;
  const isAgent = role === ROLES.AGENT;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cycles, setCycles] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [subjectAgentId, setSubjectAgentId] = useState("");
  const [openCycleId, setOpenCycleId] = useState(readCycleFromUrl);
  const [packet, setPacket] = useState(null);
  const [answers, setAnswers] = useState(() => new Map());
  const [sectionIndex, setSectionIndex] = useState(0);
  const [view, setView] = useState("form");
  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");
  const [labs, setLabs] = useState([]);
  const [busy, setBusy] = useState("");
  const pendingRef = useRef(new Map());
  const timerRef = useRef(null);
  const [startState, setStartState] = useState("idle");
  const startLockRef = useRef("");
  const openCycleRef = useRef(openCycleId);
  openCycleRef.current = openCycleId;

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await listReviewCycles();
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setCycles(result.cycles);
    if (isHq) {
      const agents = await listAgentDirectory(currentUser?.tenantId);
      setDirectory(agents);
      const stored = window.sessionStorage.getItem("primecare.reviewSubject") || "";
      setSubjectAgentId((current) => current || stored);
    }
    setLoading(false);
  }, [currentUser?.tenantId, isHq]);

  const loadPacket = useCallback(async (cycleId) => {
    setLoading(true);
    setError("");
    const result = await loadAgentQuestionnaire(cycleId);
    if (!result.ok) {
      setError(result.error);
      setPacket(null);
      setLoading(false);
      return;
    }
    const next = new Map();
    for (const row of result.responses) {
      next.set(row.instance_id, row.response_json || {});
    }
    setPacket(result);
    setAnswers(next);
    setSectionIndex(0);
    setView("form");
    setSaveState("idle");
    setLoading(false);
    if (isAgent) {
      const labsResult = await listVisibleLabs();
      setLabs(labsResult.ok ? labsResult.labs : []);
    }
  }, [isAgent]);

  useEffect(() => {
    if (openCycleId) loadPacket(openCycleId);
    else loadList();
  }, [openCycleId, loadList, loadPacket]);

  useEffect(() => {
    function onPop() {
      setOpenCycleId(readCycleFromUrl());
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const questions = packet?.questions || [];
  const cycle = packet?.cycle || null;
  const editing = isAgent && canAgentEdit(cycle);
  const preview = isHq;

  const startPublishedReview = useCallback(async (cycleId) => {
    if (!cycleId || startLockRef.current === cycleId) return;
    startLockRef.current = cycleId;
    setStartState("starting");
    setError("");
    const result = await transitionReview(cycleId, "IN_PROGRESS");
    if (startLockRef.current === cycleId) startLockRef.current = "";
    if (openCycleRef.current !== cycleId) return;
    if (!result.ok || result.cycle?.status !== "IN_PROGRESS") {
      setStartState("failed");
      setError("This review could not be started. Answers stay locked until it starts.");
      return;
    }
    setPacket((current) => {
      if (!current || current.cycle?.id !== result.cycle.id) return current;
      return { ...current, cycle: result.cycle };
    });
    setStartState("ready");
  }, []);

  useEffect(() => {
    if (!isAgent || !cycle || cycle.id !== openCycleId) return;
    if (cycle.status !== "PUBLISHED") return;
    if (startState !== "idle") return;
    void startPublishedReview(cycle.id);
  }, [isAgent, openCycleId, cycle, startState, startPublishedReview]);
  const shown = useMemo(() => visibleQuestions(questions, answers), [questions, answers]);
  const sections = useMemo(() => groupSections(shown), [shown]);
  const progress = useMemo(() => requiredProgress(questions, answers), [questions, answers]);
  const safeSectionIndex = sections.length ? Math.min(sectionIndex, sections.length - 1) : 0;
  const section = sections[safeSectionIndex] || null;

  const flushSaves = useCallback(async () => {
    if (!editing || !cycle) return true;
    const queued = [...pendingRef.current.entries()];
    if (!queued.length) return true;
    pendingRef.current = new Map();
    setSaveState("saving");
    setSaveError("");
    for (const [instanceId, responseJson] of queued) {
      const saved = await saveReviewResponse({
        tenantId: currentUser?.tenantId,
        cycleId: cycle.id,
        instanceId,
        userId: currentUser?.id,
        responseJson,
      });
      if (!saved.ok) {
        pendingRef.current.set(instanceId, responseJson);
        setSaveState("error");
        setSaveError(saved.error);
        return false;
      }
    }
    setSaveState("saved");
    return true;
  }, [currentUser?.id, currentUser?.tenantId, cycle, editing]);

  const scheduleSave = useCallback(
    (instanceId, responseJson) => {
      if (!editing) return;
      pendingRef.current.set(instanceId, responseJson);
      setSaveState("idle");
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        flushSaves();
      }, SAVE_DELAY_MS);
    },
    [editing, flushSaves]
  );

  function updateAnswer(question, responseJson) {
    setAnswers((current) => {
      const next = new Map(current);
      next.set(question.id, responseJson);
      return next;
    });
    scheduleSave(question.id, responseJson);
  }

  async function openCycle(cycleId) {
    startLockRef.current = "";
    setStartState("idle");
    setError("");
    writeCycleUrl(cycleId);
    setOpenCycleId(cycleId);
  }

  async function exitReview() {
    const ok = await flushSaves();
    if (!ok) return;
    startLockRef.current = "";
    setStartState("idle");
    writeCycleUrl("");
    setOpenCycleId("");
    setPacket(null);
  }

  async function runTransition(status, label) {
    if (!cycle) return;
    if (status === "SUBMITTED") {
      const ok = await flushSaves();
      if (!ok) return;
      if (progress.unanswered.length) {
        setView("review");
        setError("Answer the required questions that are showing before you submit.");
        return;
      }
    }
    setBusy(label);
    setError("");
    const result = await transitionReview(cycle.id, status);
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPacket((current) => (current ? { ...current, cycle: result.cycle } : current));
    if (status === "SUBMITTED") setView("submitted");
  }

  const visibleCycles = cycles.filter((row) => {
    if (isAgent) return true;
    if (!subjectAgentId) return false;
    return String(row.subject_agent_id || "").toUpperCase() === subjectAgentId.toUpperCase();
  });

  if (loading && !packet && !cycles.length) return <PageSkeleton />;

  if (!openCycleId || !cycle) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 pb-16" data-testid="reviews-landing">
        <PageHeader
          title="Reviews & Development"
          subtitle="A development conversation, not a score."
          compact
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setActivePage?.("myBusiness")}>
              My Business
            </Button>
          }
        />
        {isHq ? (
          <label className="block text-sm font-medium">
            Agent
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-base"
              value={subjectAgentId}
              data-testid="reviews-agent-picker"
              onChange={(event) => {
                setSubjectAgentId(event.target.value);
                window.sessionStorage.setItem("primecare.reviewSubject", event.target.value);
              }}
            >
              <option value="">Select an Agent</option>
              {directory.map((agent) => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.agentName} ({agent.agentId})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
        {!visibleCycles.length ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-base">No reviews are ready to open.</p>
        ) : (
          <ul className="space-y-3">
            {visibleCycles.map((row) => {
              const action = isAgent ? reviewActionLabel(row) : "Preview — Agent View";
              return (
                <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-4" data-testid="review-card">
                  <p className="text-lg font-semibold">{formatReviewPeriod(row.period_start, row.period_end)}</p>
                  <p className="text-base">{reviewTypeLabel(row.review_type)}</p>
                  <p className="mt-1 text-sm text-slate-600">Status: {agentStatusLabel(row)}</p>
                  {action ? (
                    <Button type="button" className="mt-3 min-h-11 w-full" onClick={() => openCycle(row.id)}>
                      {action}
                    </Button>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">This review is not open yet.</p>
                  )}
                  {isHq && row.status === "READY" ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-2 min-h-11 w-full"
                      onClick={async () => {
                        const published = await transitionReview(row.id, "PUBLISHED");
                        if (!published.ok) setError(published.error);
                        else loadList();
                      }}
                    >
                      Publish to the agent
                    </Button>
                  ) : null}
                  {isHq && ["SUBMITTED", "ANALYZED", "ONE_ON_ONE_COMPLETED", "FINALIZED"].includes(row.status) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-2 min-h-11 w-full"
                      onClick={async () => {
                        const reopened = await transitionReview(row.id, "IN_PROGRESS");
                        if (!reopened.ok) setError(reopened.error);
                        else loadList();
                      }}
                    >
                      Reopen for updates
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const title = `${formatReviewPeriod(cycle.period_start, cycle.period_end)} — ${reviewTypeLabel(cycle.review_type)}`;

  return (
    <div className="mx-auto max-w-lg space-y-4 overflow-x-hidden px-4 pb-64 md:pb-48" data-testid="review-workspace">
      <PageHeader title={title} compact />
      {preview ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="agent-view-preview">
          <p className="font-semibold">Preview — Agent View</p>
          <p className="mt-1 text-sm">
            This is the questionnaire the agent will see. You cannot answer it for them.
          </p>
        </div>
      ) : (
        <p className="text-base leading-6 text-slate-700">
          This review helps you and PrimeCare understand what went well, what support you need, and what to focus on next.
          Your recorded PrimeCare activity is already included where available.
        </p>
      )}
      <p className="text-sm text-slate-600">Approximately 15–20 minutes.</p>
      <p className="text-sm font-medium">Status: {agentStatusLabel(cycle)}</p>
      {startState === "starting" ? <p className="text-sm text-slate-600">Starting your review…</p> : null}
      {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
      {startState === "failed" && cycle.status === "PUBLISHED" ? (
        <Button type="button" className="min-h-11" data-testid="review-start-retry" onClick={() => startPublishedReview(cycle.id)}>
          Retry
        </Button>
      ) : null}
      {cycle.status === "SUBMITTED" || view === "submitted" ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="review-submitted">
          <p className="text-lg font-semibold">Review submitted</p>
          <p className="mt-2 text-base">
            Your responses have been saved. PrimeCare will use them to prepare your development discussion.
          </p>
        </div>
      ) : null}

      {view === "review" ? (
        <ReviewAnswers
          sections={sections}
          answers={answers}
          onJump={(index) => {
            setSectionIndex(index);
            setView("form");
          }}
        />
      ) : section ? (
        <div className="space-y-4">
          <p className="text-sm font-medium" data-testid="review-section-progress">
            Section {safeSectionIndex + 1} of {sections.length}
          </p>
          <h2 className="text-xl font-semibold">{section.title}</h2>
          <p className="text-sm text-slate-600" data-testid="review-required-progress">
            Required questions completed: {progress.done} of {progress.total}. Optional questions are not required for completion.
          </p>
          {section.questions.map((question) => (
            <ReviewQuestionField
              key={question.id}
              question={question}
              value={answers.get(question.id)}
              disabled={!editing}
              labs={labs}
              onChange={(responseJson) => updateAnswer(question, responseJson)}
            />
          ))}
        </div>
      ) : (
        <p>This review has no questions to show.</p>
      )}

      <div
        className="fixed inset-x-0 bottom-16 z-50 border-t border-slate-200 bg-white px-4 py-3 md:bottom-0"
        data-testid="review-action-bar"
      >
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <p className="text-sm" data-testid="review-save-state" role="status">
            {saveState === "saving" ? "Saving…" : null}
            {saveState === "saved" ? "Saved" : null}
            {saveState === "error" ? "Couldn't save" : null}
          </p>
          {saveState === "error" ? (
            <Button type="button" variant="outline" className="min-h-11" onClick={flushSaves}>
              Retry save
            </Button>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={exitReview}>
              Save & Exit
            </Button>
            {view === "form" && safeSectionIndex < sections.length - 1 ? (
              <Button
                type="button"
                className="min-h-11"
                onClick={async () => {
                  await flushSaves();
                  setSectionIndex((index) => Math.min(index + 1, Math.max(sections.length - 1, 0)));
                }}
              >
                Next section
              </Button>
            ) : (
              <Button type="button" className="min-h-11" onClick={() => setView(view === "review" ? "form" : "review")}>
                {view === "review" ? "Back to questions" : "Review Answers"}
              </Button>
            )}
          </div>
          {editing ? (
            <Button
              type="button"
              className="min-h-11"
              data-testid="review-submit"
              disabled={Boolean(busy)}
              onClick={() => runTransition("SUBMITTED", "submit")}
            >
              Submit review
            </Button>
          ) : null}
          {isAgent && cycle.status === "PUBLISHED" ? (
            <Button
              type="button"
              className="min-h-11"
              disabled={startState === "starting" || Boolean(busy)}
              onClick={() => startPublishedReview(cycle.id)}
            >
              {startState === "failed" ? "Retry" : "Start Review"}
            </Button>
          ) : null}
        </div>
      </div>
      <span className="sr-only" data-preview-lock="1">{editing ? "Editable" : "Read only"}</span>
    </div>
  );
}

function ReviewAnswers({ sections, answers, onJump }) {
  return (
    <div className="space-y-4" data-testid="review-answers">
      {sections.map((section, index) => (
        <section key={section.title} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            <button type="button" className="min-h-11 px-2 text-sm underline" onClick={() => onJump(index)}>
              Edit section
            </button>
          </div>
          <ul className="mt-3 space-y-3">
            {section.questions.map((question) => {
              const answer = answers.get(question.id);
              const missing = question.required && !isResponseAnswered(question.response_type, answer);
              return (
                <li key={question.id}>
                  <p className="text-sm text-slate-700">{question.question_text}</p>
                  <p className={`mt-1 text-base ${missing ? "font-semibold" : ""}`}>
                    {missing ? "Required answer missing" : answerText(question, answer)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function answerText(question, answer) {
  if (!isResponseAnswered(question.response_type, answer)) return "Not answered";
  if (question.response_type === "YES_NO") return answer.value ? "Yes" : "No";
  if (question.response_type === "MULTI_SELECT") return (answer.values || []).join(", ");
  if (question.response_type === "LAB_SELECT") return answer.lab_name || answer.lab_id;
  if (question.response_type === "MULTI_LAB_SELECT") {
    const named = Array.isArray(answer.labs) ? answer.labs.map((lab) => lab.lab_name || lab.lab_id) : [];
    return named.length ? named.join(", ") : (answer.lab_ids || []).join(", ");
  }
  if (typeof answer.text === "string") return answer.text;
  if (answer.value != null) return String(answer.value);
  return "Answered";
}
