import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "peopleOps.workforcePlanning.v1";

function readState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      headcountPositions: Array.isArray(parsed.headcountPositions) ? parsed.headcountPositions : [],
      customScenarios: Array.isArray(parsed.customScenarios) ? parsed.customScenarios : [],
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return defaultState();
  }
}

function defaultState() {
  return { headcountPositions: [], customScenarios: [], history: [] };
}

function writeState(state) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Session-only workforce planning state (headcount positions, scenarios, history).
 */
export function useWorkforcePlanningState() {
  const [state, setState] = useState(() => readState());

  useEffect(() => {
    writeState(state);
  }, [state]);

  const addHeadcountPosition = useCallback((payload = {}) => {
    setState((prev) => ({
      ...prev,
      headcountPositions: [
        ...prev.headcountPositions,
        {
          id: makeId("position"),
          title: payload.title || "New Position",
          role: payload.role || "agent",
          department: payload.department || "HQ",
          openCount: Number(payload.openCount) || 1,
          monthlyCost: Number(payload.monthlyCost) || 0,
          archived: false,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
  }, []);

  const duplicateHeadcountPosition = useCallback((row) => {
    if (!row) return;
    addHeadcountPosition({
      title: `${row.title || row.roleLabel || row.role} (Copy)`,
      role: row.role,
      department: row.department || "HQ",
      openCount: row.open || 1,
      monthlyCost: row.monthlyCost,
    });
  }, [addHeadcountPosition]);

  const archiveHeadcountPosition = useCallback((id) => {
    setState((prev) => ({
      ...prev,
      headcountPositions: prev.headcountPositions.map((row) =>
        row.id === id ? { ...row, archived: true } : row
      ),
    }));
  }, []);

  const addCustomScenario = useCallback((payload = {}) => {
    const entry = {
      id: makeId("scenario"),
      label: payload.label || "Custom scenario",
      monthlyPayroll: Number(payload.monthlyPayroll) || 0,
      headcount: Number(payload.headcount) || 0,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      customScenarios: [...prev.customScenarios, entry],
      history: [
        {
          id: makeId("history"),
          scenario: entry.label,
          createdBy: payload.createdBy || "Executive",
          createdAt: entry.createdAt,
          summary: payload.summary || `Projected monthly payroll ${payload.monthlyPayrollLabel || entry.monthlyPayroll}`,
        },
        ...prev.history,
      ],
    }));
    return entry;
  }, []);

  const saveScenarioToHistory = useCallback((scenario, createdBy = "Executive") => {
    if (!scenario) return;
    setState((prev) => ({
      ...prev,
      history: [
        {
          id: makeId("history"),
          scenario: scenario.label,
          createdBy,
          createdAt: new Date().toISOString(),
          summary: `Monthly ${scenario.monthlyPayrollLabel || scenario.monthlyPayroll} · Headcount ${scenario.headcount ?? "—"} · Variance ${scenario.varianceLabel || "—"}`,
        },
        ...prev.history,
      ],
    }));
  }, []);

  return {
    planningState: state,
    addHeadcountPosition,
    duplicateHeadcountPosition,
    archiveHeadcountPosition,
    addCustomScenario,
    saveScenarioToHistory,
  };
}
