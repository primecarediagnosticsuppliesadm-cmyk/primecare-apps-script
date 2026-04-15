import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  Wallet,
  Building2,
  MapPin,
  PlusCircle,
  PhoneCall,
} from "lucide-react";

import { getLabs, getRecentVisits, getCollections } from "@/api/primecareApi";
import {
  filterLabsForUser,
  filterVisitsForUser,
  filterCollectionsForUser,
} from "@/utils/accessFilters";

const DASHBOARD_CACHE_TTL = 60 * 1000;

const dashboardCache = {
  visits: null,
  labs: null,
  collections: null,
  visitsLoadedAt: 0,
  labsLoadedAt: 0,
  collectionsLoadedAt: 0,
};

function isFresh(ts) {
  return ts && Date.now() - ts < DASHBOARD_CACHE_TTL;
}

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

function normalizeLab(lab) {
  return {
    labId: lab.labId || lab.Lab_ID || "",
    labName: lab.labName || lab.Lab_Name || lab.name || "",
    area: lab.area || lab.Area || "",
    assignedAgent:
      lab.assignedAgent ||
      lab.agentName ||
      lab.Agent_Name ||
      lab.owner ||
      "",
    nextFollowUp: lab.nextFollowUp || lab.Next_Follow_Up || "-",
  };
}

function normalizeVisit(v) {
  return {
    id: v.id || v.Visit_ID || "",
    agent: v.agent || v.agentName || v.Agent_Name || "",
    date: v.date || v.visitDate || v.Visit_Date || "",
    labName: v.labName || v.Lab_Name || "",
    area: v.area || v.Area || "",
    visitType: v.visitType || v.Visit_Type || "",
    labResponse: v.labResponse || v.Lab_Response || "",
  };
}

function normalizeCollection(c) {
  return {
    labName: c.labName || c.Lab_Name || "",
    assignedAgent: c.assignedAgent || c.agentName || c.Agent_Name || "",
    outstandingAmount: Number(c.outstandingAmount || c.Amount_Due || 0),
    overdueDays: Number(c.overdueDays || c.Overdue_Days || 0),
    riskStatus: c.riskStatus || c.Risk_Status || "Low",
    nextAction: c.nextAction || c.Next_Action || "-",
  };
}

export default function AgentDashboard({ currentUser, setActivePage }) {
  const [labs, setLabs] = useState(() => (dashboardCache.labs ? dashboardCache.labs : []));
  const [visits, setVisits] = useState(() => (dashboardCache.visits ? dashboardCache.visits : []));
  const [collections, setCollections] = useState(() =>
    dashboardCache.collections ? dashboardCache.collections : []
  );

  const [loading, setLoading] = useState(!dashboardCache.visits);
  const [refreshing, setRefreshing] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const [error, setError] = useState("");

  const scopedParams = useMemo(() => {
    return {
      agentName: currentUser?.agentName || "",
      userRole: currentUser?.role || "",
      labId: currentUser?.labId || "",
    };
  }, [currentUser]);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        setError("");

        const visitsFresh = dashboardCache.visits && isFresh(dashboardCache.visitsLoadedAt);
        const labsFresh = dashboardCache.labs && isFresh(dashboardCache.labsLoadedAt);
        const collectionsFresh =
          dashboardCache.collections && isFresh(dashboardCache.collectionsLoadedAt);

        if (visitsFresh) {
          setVisits(dashboardCache.visits);
          setLoading(false);
        } else {
          setLoading(true);

          const visitsRes = await getRecentVisits(scopedParams);
          if (!mounted) return;

          if (!visitsRes?.success) {
            throw new Error(visitsRes?.error || "Failed to load visits");
          }

          const normalizedVisits = (visitsRes.data?.visits || []).map(normalizeVisit);
          dashboardCache.visits = normalizedVisits;
          dashboardCache.visitsLoadedAt = Date.now();
          setVisits(normalizedVisits);
          setLoading(false);
        }

        const backgroundTasks = [];

        if (!labsFresh) {
          backgroundTasks.push(
            getLabs(scopedParams).then((labsRes) => {
              if (!mounted || !labsRes?.success) return;
              const normalizedLabs = (labsRes.data?.labs || []).map(normalizeLab);
              dashboardCache.labs = normalizedLabs;
              dashboardCache.labsLoadedAt = Date.now();
              setLabs(normalizedLabs);
            })
          );
        } else {
          setLabs(dashboardCache.labs);
        }

        if (!collectionsFresh) {
          backgroundTasks.push(
            getCollections(scopedParams).then((collectionsRes) => {
              if (!mounted || !collectionsRes?.success) return;
              const normalizedCollections = (collectionsRes.data?.collections || []).map(
                normalizeCollection
              );
              dashboardCache.collections = normalizedCollections;
              dashboardCache.collectionsLoadedAt = Date.now();
              setCollections(normalizedCollections);
            })
          );
        } else {
          setCollections(dashboardCache.collections);
        }

        if (backgroundTasks.length > 0) {
          setBackgroundLoading(true);
          Promise.allSettled(backgroundTasks).finally(() => {
            if (mounted) setBackgroundLoading(false);
          });
        }
      } catch (err) {
        if (!mounted) return;
        console.error(err);
        setError(err.message || "Failed to load agent dashboard");
        setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [scopedParams]);

  async function handleRefresh() {
    let mounted = true;
    try {
      setRefreshing(true);
      setError("");

      const [visitsRes, labsRes, collectionsRes] = await Promise.all([
        getRecentVisits(scopedParams),
        getLabs(scopedParams),
        getCollections(scopedParams),
      ]);

      if (!mounted) return;

      if (!visitsRes?.success) throw new Error(visitsRes?.error || "Failed to load visits");
      if (!labsRes?.success) throw new Error(labsRes?.error || "Failed to load labs");
      if (!collectionsRes?.success) {
        throw new Error(collectionsRes?.error || "Failed to load collections");
      }

      const normalizedVisits = (visitsRes.data?.visits || []).map(normalizeVisit);
      const normalizedLabs = (labsRes.data?.labs || []).map(normalizeLab);
      const normalizedCollections = (collectionsRes.data?.collections || []).map(normalizeCollection);

      dashboardCache.visits = normalizedVisits;
      dashboardCache.labs = normalizedLabs;
      dashboardCache.collections = normalizedCollections;
      dashboardCache.visitsLoadedAt = Date.now();
      dashboardCache.labsLoadedAt = Date.now();
      dashboardCache.collectionsLoadedAt = Date.now();

      setVisits(normalizedVisits);
      setLabs(normalizedLabs);
      setCollections(normalizedCollections);
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to refresh dashboard");
    } finally {
      if (mounted) setRefreshing(false);
    }
  }

  const visibleLabs = useMemo(() => filterLabsForUser(labs, currentUser), [labs, currentUser]);
  const visibleVisits = useMemo(() => filterVisitsForUser(visits, currentUser), [visits, currentUser]);
  const visibleCollections = useMemo(
    () => filterCollectionsForUser(collections, currentUser),
    [collections, currentUser]
  );

  const today = new Date().toISOString().slice(0, 10);

  const todayVisits = useMemo(
    () => visibleVisits.filter((v) => String(v.date).slice(0, 10) === today).length,
    [visibleVisits, today]
  );

  const pendingCollections = useMemo(
    () => visibleCollections.filter((c) => Number(c.outstandingAmount || 0) > 0).length,
    [visibleCollections]
  );

  const followUpsDue = useMemo(
    () => visibleLabs.filter((lab) => lab.nextFollowUp && lab.nextFollowUp !== "-").length,
    [visibleLabs]
  );

  const topCollectionTasks = useMemo(() => {
    return [...visibleCollections]
      .sort((a, b) => Number(b.outstandingAmount || 0) - Number(a.outstandingAmount || 0))
      .slice(0, 3);
  }, [visibleCollections]);

  const recentActivity = useMemo(() => visibleVisits.slice(0, 4), [visibleVisits]);

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Loading agent dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {currentUser?.name || "Agent"}
          </h1>
          <p className="text-sm text-slate-500">Your field summary for today.</p>
        </div>

        <Button
          variant="outline"
          className="rounded-xl"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {backgroundLoading ? (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          Loading remaining dashboard data in background...
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickStat title="Today Visits" value={todayVisits} icon={ClipboardCheck} />
        <QuickStat title="Collections" value={pendingCollections} icon={Wallet} />
        <QuickStat title="My Labs" value={visibleLabs.length} icon={Building2} />
        <QuickStat title="Follow-ups" value={followUpsDue} icon={MapPin} />
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Fast actions for field work</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Button
            className="h-12 rounded-xl"
            onClick={() => setActivePage?.("visits")}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Visit
          </Button>

          <Button
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => setActivePage?.("collections")}
          >
            <PhoneCall className="mr-2 h-4 w-4" />
            Collections
          </Button>

          <Button
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => setActivePage?.("labs")}
          >
            <Building2 className="mr-2 h-4 w-4" />
            My Labs
          </Button>

          <Button
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => setActivePage?.("visits")}
          >
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Log Update
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Priority Collections</CardTitle>
            <CardDescription>Top collection tasks by amount due</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topCollectionTasks.length === 0 ? (
                <div className="text-sm text-slate-500">No pending collection tasks.</div>
              ) : (
                topCollectionTasks.map((item, idx) => (
                  <div key={`${item.labName}-${idx}`} className="rounded-2xl border p-4">
                    <div className="font-semibold text-slate-900">{item.labName || "-"}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      ₹{Number(item.outstandingAmount || 0).toLocaleString()} • Overdue {Number(item.overdueDays || 0)}d
                    </div>
                    <div className="mt-2">
                      <Badge variant="secondary">{item.riskStatus || "Low"}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>Your latest visible visit activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <div className="text-sm text-slate-500">No recent visits found.</div>
              ) : (
                recentActivity.map((visit, idx) => (
                  <div key={`${visit.id || visit.labName}-${idx}`} className="rounded-2xl border p-4">
                    <div className="font-semibold text-slate-900">{visit.labName || "-"}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {visit.area || "-"} • {visit.date || "-"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge>{visit.visitType || "-"}</Badge>
                      <Badge variant="secondary">{visit.labResponse || "-"}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}