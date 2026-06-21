import { useCallback, useEffect, useMemo, useState } from "react";
import { getAgentWorkspaceRead } from "@/api/primecareSupabaseApi";
import { buildAgentDailyWorkspaceModel } from "@/pages/agentDailyWorkspace.js";
import { buildAgentOsState } from "@/pages/agentOsModel.js";

const EMPTY_WORKSPACE = {
  summary: {
    todayVisits: 0,
    pendingCollections: 0,
    totalOutstanding: 0,
    activeLabs: 0,
    openTasks: 0,
    highPriorityTasks: 0,
  },
  tasks: [],
  assignedLabs: [],
  recentVisits: [],
  pendingCollections: [],
};

/** @type {{ key: string, workspace: Object|null, listeners: Set<() => void> }} */
const shared = {
  key: "",
  workspace: null,
  listeners: new Set(),
};

function userCacheKey(currentUser) {
  return String(currentUser?.id || currentUser?.agentId || currentUser?.email || "agent");
}

function notifySharedListeners() {
  shared.listeners.forEach((fn) => fn());
}

async function fetchWorkspace(currentUser) {
  const apiRes = await getAgentWorkspaceRead(currentUser);
  if (!apiRes?.success) {
    throw new Error(apiRes?.error || "Failed to load agent workspace");
  }
  return { ...EMPTY_WORKSPACE, ...(apiRes.data || EMPTY_WORKSPACE) };
}

/**
 * Shared agent daily OS state (route order, progress, current stop).
 * @param {Object|null} currentUser
 * @param {{ enabled?: boolean }} [options]
 */
export function useAgentDailyOs(currentUser, options = {}) {
  const enabled = options.enabled !== false && Boolean(currentUser);
  const cacheKey = userCacheKey(currentUser);
  const [workspace, setWorkspace] = useState(
    shared.key === cacheKey && shared.workspace ? shared.workspace : EMPTY_WORKSPACE
  );
  const [loading, setLoading] = useState(enabled && !(shared.key === cacheKey && shared.workspace));
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);

  const load = useCallback(
    async (force = false) => {
      if (!enabled) return;
      try {
        setLoading(true);
        setError("");
        if (!force && shared.key === cacheKey && shared.workspace) {
          setWorkspace(shared.workspace);
          return;
        }
        const next = await fetchWorkspace(currentUser);
        shared.key = cacheKey;
        shared.workspace = next;
        setWorkspace(next);
        notifySharedListeners();
      } catch (err) {
        setError(err.message || "Failed to load agent workspace");
        setWorkspace(EMPTY_WORKSPACE);
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, currentUser, enabled]
  );

  useEffect(() => {
    if (!enabled) return;
    void load(false);
  }, [enabled, load, tick]);

  useEffect(() => {
    if (!enabled) return;
    const onRefresh = () => {
      shared.workspace = null;
      setTick((n) => n + 1);
    };
    window.addEventListener("primecare:agentWorkspaceRefresh", onRefresh);
    return () => window.removeEventListener("primecare:agentWorkspaceRefresh", onRefresh);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const bump = () => setTick((n) => n + 1);
    shared.listeners.add(bump);
    return () => shared.listeners.delete(bump);
  }, [enabled]);

  const dailyModel = useMemo(() => buildAgentDailyWorkspaceModel(workspace), [workspace]);
  const osState = useMemo(() => buildAgentOsState(workspace), [workspace]);

  return {
    workspace,
    dailyModel,
    osState,
    loading,
    error,
    reload: () => load(true),
    orderByLabId: osState.orderByLabId,
    routeStops: osState.routeStops,
  };
}
