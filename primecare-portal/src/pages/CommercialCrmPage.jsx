import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  PageSkeleton,
  DataFetchError,
  EnterpriseDataTable,
  StatusBadge,
  usePortalToast,
} from "@/components/ux";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import PeopleOpsBreadcrumbs from "@/components/peopleOps/PeopleOpsBreadcrumbs.jsx";
import PeopleOpsFilterBar from "@/components/peopleOps/PeopleOpsFilterBar.jsx";
import CommercialModuleNav from "@/components/commercial/CommercialModuleNav.jsx";
import CommercialLab360Drawer from "@/components/commercial/CommercialLab360Drawer.jsx";
import {
  buildCommercialBreadcrumbs,
  defaultCommercialRoute,
  resolveCommercialRoute,
} from "@/commercial/commercialNavigation.js";
import { buildCommercialWorkspace } from "@/commercial/commercialWorkspaceModel.js";
import { loadCommercialWorkspaceRead } from "@/commercial/commercialWorkspaceRead.js";
import { usePagePerformance } from "@/hooks/usePagePerformance.js";

function KpiStrip({ kpis }) {
  if (!kpis) return null;
  const items = [
    { label: "Prospects", value: kpis.totalProspects },
    { label: "Qualified", value: kpis.qualifiedLabs },
    { label: "Meetings (week)", value: kpis.meetingsThisWeek },
    { label: "Samples out", value: kpis.samplesOutstanding },
    { label: "Quotes (proxy)", value: kpis.quotesSent },
    { label: "Contracts pending", value: kpis.contractsPending },
    { label: "Activated", value: kpis.labsActivated },
    { label: "Pipeline value", value: kpis.pipelineValueLabel },
    { label: "Forecast revenue", value: kpis.forecastRevenueLabel },
    { label: "Forecast collections", value: kpis.forecastCollectionsLabel },
    { label: "Conversion", value: kpis.conversionRateLabel },
    { label: "Avg cycle", value: kpis.averageSalesCycleLabel },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-border bg-muted/20 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export default function CommercialCrmPage({ currentUser = null, setActivePage = null }) {
  const [route, setRoute] = useState(() => defaultCommercialRoute());
  const { moduleId, screenId } = useMemo(
    () => resolveCommercialRoute(route.moduleId, route.screenId),
    [route]
  );
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedLabId, setSelectedLabId] = useState("");
  const { showToast } = usePortalToast();
  usePagePerformance("Commercial CRM");

  const navigate = useCallback((next) => {
    setRoute(resolveCommercialRoute(next.moduleId, next.screenId));
  }, []);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      try {
        if (refresh) setRefreshing(true);
        else setLoading(true);
        setError("");
        const result = await loadCommercialWorkspaceRead({ currentUser, force: refresh });
        if (!result.success && result.error) {
          setError(result.error);
        }
        setPayload(result);
      } catch (err) {
        setError(err?.message || "Could not load Commercial workspace");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUser]
  );

  useEffect(() => {
    load();
  }, [load]);

  const workspace = useMemo(() => {
    if (!payload) return null;
    return buildCommercialWorkspace({
      qualifications: payload.qualifications || [],
      contracts: payload.contracts || [],
      visits: payload.visits || [],
    });
  }, [payload]);

  const breadcrumbs = useMemo(
    () => buildCommercialBreadcrumbs({ moduleId, screenId }),
    [moduleId, screenId]
  );

  const selectedLab = useMemo(() => {
    if (!workspace || !selectedLabId) return null;
    return workspace.resolveLab360(selectedLabId);
  }, [selectedLabId, workspace]);

  const pipelineRows = useMemo(() => {
    const stages = workspace?.pipelineBoard || [];
    if (!search) return stages;
    const q = search.toLowerCase();
    return stages
      .map((stage) => ({
        ...stage,
        labs: (stage.labs || []).filter((lab) =>
          [lab.labName, lab.owner, lab.commercialStage].join(" ").toLowerCase().includes(q)
        ),
      }))
      .filter((stage) => stage.labs.length > 0 || stage.label.toLowerCase().includes(q));
  }, [search, workspace]);

  const labDirectory = useMemo(() => {
    const labs = (workspace?.pipelineBoard || []).flatMap((stage) =>
      (stage.labs || []).map((lab) => ({ ...lab, stageLabel: stage.label }))
    );
    if (!search) return labs;
    const q = search.toLowerCase();
    return labs.filter((lab) => [lab.labName, lab.owner, lab.stageLabel].join(" ").toLowerCase().includes(q));
  }, [search, workspace]);

  if (loading && !workspace) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Commercial"
        subtitle="Lab growth lifecycle — Qualification · Visits · Contracts composed. Not Salesforce."
        actions={
          <Button type="button" variant="outline" size="sm" disabled={refreshing} onClick={() => void load({ refresh: true })}>
            <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {error ? (
        <DataFetchError
          message={error}
          onRetry={() => void load({ refresh: true })}
          staleDataNote={workspace ? "Showing last commercial snapshot." : ""}
        />
      ) : null}

      <CommercialModuleNav moduleId={moduleId} screenId={screenId} onNavigate={navigate} />

      {moduleId === "dashboard" && workspace ? (
        <div className="space-y-4">
          <PeopleOpsBreadcrumbs items={breadcrumbs} />
          <PeopleOpsSectionCard
            title="Commercial Dashboard"
            subtitle="Founder visibility across pipeline, contracts, and field activity. Read-only compose layer."
          >
            <KpiStrip kpis={workspace.kpis} />
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setActivePage?.("qualificationReview")}>
                Open Qualification
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setActivePage?.("labContractEngine")}>
                Open Contracts
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setActivePage?.("revenueFunnel")}>
                Open Revenue Funnel
              </Button>
            </div>
          </PeopleOpsSectionCard>
        </div>
      ) : null}

      {moduleId === "pipeline" && workspace ? (
        <div className="space-y-4">
          <PeopleOpsBreadcrumbs items={breadcrumbs} />
          <PeopleOpsFilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search labs or owners…" />
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {pipelineRows.map((stage) => (
              <PeopleOpsSectionCard
                key={stage.id}
                title={stage.label}
                subtitle={`${stage.count} labs · ${stage.expectedRevenueLabel}`}
              >
                <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span>Weighted {stage.expectedCollectionLabel}</span>
                  <span>· Prob {stage.probability}%</span>
                </div>
                {stage.proxyNote ? <p className="mb-2 text-[11px] italic text-muted-foreground">{stage.proxyNote}</p> : null}
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {(stage.labs || []).slice(0, 12).map((lab) => (
                    <button
                      key={`${stage.id}-${lab.labId}`}
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-xs hover:bg-muted/40"
                      onClick={() => setSelectedLabId(lab.labId)}
                    >
                      <span>
                        <span className="font-medium">{lab.labName}</span>
                        <span className="block text-muted-foreground">{lab.owner} · {lab.daysInStage}d</span>
                      </span>
                      <span className="tabular-nums">{lab.expectedRevenueLabel}</span>
                    </button>
                  ))}
                </div>
              </PeopleOpsSectionCard>
            ))}
          </div>
        </div>
      ) : null}

      {moduleId === "labs" && workspace ? (
        <div className="space-y-4">
          <PeopleOpsBreadcrumbs items={breadcrumbs} />
          <PeopleOpsFilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search labs…" />
          <PeopleOpsSectionCard title="Commercial Labs" subtitle="Open Lab 360 — reuses qualification, visits, contracts.">
            <EnterpriseDataTable
              hasRows={labDirectory.length > 0}
              emptyTitle="No commercial labs"
              emptyDescription="Qualification rows appear when labs have pipeline profiles."
              desktop={
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-left text-[11px]">
                    <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {["Lab", "Stage", "Owner", "Expected", "Days"].map((label) => (
                          <th key={label} className="px-2 py-2">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {labDirectory.map((lab) => (
                        <tr
                          key={lab.labId}
                          className="cursor-pointer border-b border-border/60 hover:bg-muted/30"
                          onClick={() => setSelectedLabId(lab.labId)}
                        >
                          <td className="px-2 py-2 font-medium">{lab.labName}</td>
                          <td className="px-2 py-2">{lab.stageLabel}</td>
                          <td className="px-2 py-2">{lab.owner}</td>
                          <td className="px-2 py-2 tabular-nums">{lab.expectedRevenueLabel}</td>
                          <td className="px-2 py-2">{lab.daysInStage}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            />
          </PeopleOpsSectionCard>
        </div>
      ) : null}

      {moduleId === "activities" && workspace ? (
        <div className="space-y-4">
          <PeopleOpsBreadcrumbs items={breadcrumbs} />
          <PeopleOpsSectionCard
            title="Field Activities"
            subtitle="Unified visits + qualification follow-ups. Creates stay on Visits / Qualification."
          >
            <div className="mb-3">
              <Button type="button" size="sm" variant="outline" onClick={() => setActivePage?.("visits")}>
                Open Visits
              </Button>
            </div>
            <EnterpriseDataTable
              hasRows={(workspace.activities || []).length > 0}
              emptyTitle="No activities"
              emptyDescription="Agent visits and follow-up dates appear here."
              desktop={
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-left text-[11px]">
                    <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {["Date", "Type", "Lab", "Agent", "Next action"].map((label) => (
                          <th key={label} className="px-2 py-2">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(workspace.activities || []).slice(0, 80).map((row) => (
                        <tr key={row.id} className="border-b border-border/60">
                          <td className="px-2 py-2">{row.visitDate}</td>
                          <td className="px-2 py-2">
                            <StatusBadge variant="info" label={row.visitType} />
                          </td>
                          <td className="px-2 py-2">{row.labName}</td>
                          <td className="px-2 py-2">{row.agentName}</td>
                          <td className="px-2 py-2">{row.nextAction || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            />
          </PeopleOpsSectionCard>
        </div>
      ) : null}

      {moduleId === "contracts" && workspace ? (
        <div className="space-y-4">
          <PeopleOpsBreadcrumbs items={breadcrumbs} />
          <PeopleOpsSectionCard
            title="Contracts Portfolio"
            subtitle="Reuses lab_contracts. Mutations remain on Contract Management."
          >
            <div className="mb-3">
              <Button type="button" size="sm" variant="outline" onClick={() => setActivePage?.("labContractEngine")}>
                Open Contract Management
              </Button>
            </div>
            <EnterpriseDataTable
              hasRows={(workspace.contracts || []).length > 0}
              emptyTitle="No contracts"
              emptyDescription="Contracts created in Contract Management appear here."
              desktop={
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-left text-[11px]">
                    <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {["Lab", "Type", "Status", "Renewal", "Risk"].map((label) => (
                          <th key={label} className="px-2 py-2">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(workspace.contracts || []).map((row) => (
                        <tr
                          key={row.id}
                          className="cursor-pointer border-b border-border/60 hover:bg-muted/30"
                          onClick={() => row.labId && setSelectedLabId(row.labId)}
                        >
                          <td className="px-2 py-2 font-medium">{row.labName}</td>
                          <td className="px-2 py-2">{row.type}</td>
                          <td className="px-2 py-2">
                            <StatusBadge variant={row.status === "Active" ? "success" : "warning"} label={row.status} />
                          </td>
                          <td className="px-2 py-2">{row.renewalDate || "—"}</td>
                          <td className="px-2 py-2">{row.risk}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            />
          </PeopleOpsSectionCard>
        </div>
      ) : null}

      {moduleId === "forecast" && workspace ? (
        <div className="space-y-4">
          <PeopleOpsBreadcrumbs items={breadcrumbs} />
          <PeopleOpsSectionCard title="Commercial Forecast" subtitle="Pipeline expected value × probability. Preview only.">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-border px-4 py-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Expected revenue</p>
                <p className="text-xl font-semibold tabular-nums">{workspace.forecast.expectedRevenueLabel}</p>
              </div>
              <div className="rounded-xl border border-border px-4 py-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Expected collections</p>
                <p className="text-xl font-semibold tabular-nums">{workspace.forecast.expectedCollectionsLabel}</p>
              </div>
              <div className="rounded-xl border border-border px-4 py-3">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Active contract revenue</p>
                <p className="text-xl font-semibold tabular-nums">{workspace.forecast.activeContractRevenueLabel}</p>
              </div>
            </div>
            <div className="mt-4 space-y-1 text-xs text-muted-foreground">
              <p>{workspace.forecast.expectedOrdersNote}</p>
              <p>{workspace.forecast.expectedPayrollImpactLabel}</p>
              <p>{workspace.forecast.expectedInventoryDemandNote}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setActivePage?.("compensationPayroll")}>
                People Ops Budgeting
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setActivePage?.("revenueFunnel")}>
                Revenue Funnel
              </Button>
            </div>
          </PeopleOpsSectionCard>
        </div>
      ) : null}

      {moduleId === "reports" && workspace ? (
        <div className="space-y-4">
          <PeopleOpsBreadcrumbs items={breadcrumbs} />
          <PeopleOpsSectionCard title="Sales Funnel" subtitle={`Conversion ${workspace.reports.conversion}`}>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              {(workspace.reports.salesFunnel || []).map((row) => (
                <div key={row.stage} className="rounded-lg border border-border px-3 py-2 text-xs">
                  <p className="font-medium">{row.stage}</p>
                  <p className="tabular-nums text-muted-foreground">
                    {row.count} · {row.valueLabel}
                  </p>
                </div>
              ))}
            </div>
          </PeopleOpsSectionCard>
          <PeopleOpsSectionCard title="Agent Performance" subtitle="Commercial metrics only — not payroll.">
            <EnterpriseDataTable
              hasRows={(workspace.agentPerformance || []).length > 0}
              emptyTitle="No agent activity"
              emptyDescription="Visits and pipeline ownership populate performance."
              desktop={
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-full text-left text-[11px]">
                    <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr>
                        {["Agent", "Visits", "Meetings", "Contracts", "Activated", "Pipeline ₹"].map((label) => (
                          <th key={label} className="px-2 py-2">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(workspace.agentPerformance || []).map((row) => (
                        <tr key={row.agentId} className="border-b border-border/60">
                          <td className="px-2 py-2 font-medium">{row.agentName}</td>
                          <td className="px-2 py-2">{row.visits}</td>
                          <td className="px-2 py-2">{row.meetings}</td>
                          <td className="px-2 py-2">{row.contracts}</td>
                          <td className="px-2 py-2">{row.activatedLabs}</td>
                          <td className="px-2 py-2 tabular-nums">{row.revenueLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            />
          </PeopleOpsSectionCard>
          <PeopleOpsSectionCard title="Lost / Growth labs">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Lost</p>
                {(workspace.reports.lostLabs || []).slice(0, 8).map((lab) => (
                  <button
                    key={lab.labId}
                    type="button"
                    className="mb-1 block w-full rounded border border-border px-2 py-1 text-left text-xs"
                    onClick={() => setSelectedLabId(lab.labId)}
                  >
                    {lab.labName}
                  </button>
                ))}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Growth / activated</p>
                {(workspace.reports.growthLabs || []).slice(0, 8).map((lab) => (
                  <button
                    key={lab.labId}
                    type="button"
                    className="mb-1 block w-full rounded border border-border px-2 py-1 text-left text-xs"
                    onClick={() => setSelectedLabId(lab.labId)}
                  >
                    {lab.labName}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{workspace.reports.forecastAccuracyNote}</p>
          </PeopleOpsSectionCard>
        </div>
      ) : null}

      <CommercialLab360Drawer
        open={Boolean(selectedLabId)}
        onClose={() => setSelectedLabId("")}
        labModel={selectedLab}
        onOpenOrders={() => {
          showToast?.("info", "Opening Orders (unchanged SoT).");
          setActivePage?.("orders");
        }}
        onOpenCollections={() => {
          showToast?.("info", "Opening Collections (unchanged SoT).");
          setActivePage?.("collections");
        }}
      />
    </div>
  );
}
