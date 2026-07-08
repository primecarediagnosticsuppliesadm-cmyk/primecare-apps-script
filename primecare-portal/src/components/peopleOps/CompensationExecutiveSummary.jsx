import React, { useMemo } from "react";
import { GitBranch, Layers, TrendingUp, Users, Wallet, Clock } from "lucide-react";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { buildCompensationSummaryStats } from "@/peopleOps/peopleOpsEnterpriseModel.js";
import { formatPeopleOpsMetricValue } from "@/peopleOps/peopleOpsDataQualityModel.js";

/**
 * RC4 — Compensation executive summary (read models only).
 */
export default function CompensationExecutiveSummary({ adminModel, model }) {
  const stats = useMemo(() => buildCompensationSummaryStats(adminModel), [adminModel]);
  const promotionPipeline = model?.charts?.promotionPipeline || model?.promotionPipelineRows || [];
  const promotionCount = promotionPipeline.filter((row) => row.eligible).length || promotionPipeline.length;
  const assignments = adminModel?.assignmentRows || [];
  const activeAssignments = assignments.filter((row) => row.status === "active" || row.assignmentStatus === "active");

  const mostUsedPlan = useMemo(() => {
    const counts = activeAssignments.reduce((acc, row) => {
      const code = row.planCode || row.plan_code || "Unassigned";
      acc[code] = (acc[code] || 0) + 1;
      return acc;
    }, {});
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? `${top[0]} (${top[1]})` : "None";
  }, [activeAssignments]);

  const highestCommission = useMemo(() => {
    const rows = model?.previewRows || [];
    const top = [...rows].sort((a, b) => Number(b.commissionAmount || 0) - Number(a.commissionAmount || 0))[0];
    return top ? `${top.agentName || "Agent"} · ${top.commissionLabel || "—"}` : "No preview lines";
  }, [model]);

  const pendingPlanChanges = useMemo(() => {
    const drafts = (adminModel?.planRows || []).filter((row) => row.status === "draft");
    const ended = assignments.filter((row) => row.assignmentStatus === "ended" || row.status === "ended");
    return drafts.length + ended.length;
  }, [adminModel, assignments]);

  const planVersions = useMemo(() => {
    const plans = adminModel?.planRows || [];
    const byCode = new Map();
    for (const row of plans) {
      const code = row.planCode || row.plan_code || "Unknown";
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(row);
    }
    return [...byCode.entries()].map(([code, rows]) => ({
      code,
      versions: rows.sort((a, b) => String(b.version).localeCompare(String(a.version))),
    }));
  }, [adminModel]);

  return (
    <div className="space-y-1.5">
      <KpiCardGrid columns={5} dense>
        <KpiCard dense title="Most Used Plan" value={mostUsedPlan} subtitle="Active assignments" icon={Layers} />
        <KpiCard dense title="Highest Commission" value={formatPeopleOpsMetricValue(highestCommission, { emptyLabel: "No preview" })} subtitle="Selected run" icon={Wallet} />
        <KpiCard dense title="Promotion Ready" value={promotionCount ? String(promotionCount) : "None"} subtitle="Payroll intelligence" icon={TrendingUp} />
        <KpiCard dense title="Pending Plan Changes" value={pendingPlanChanges ? String(pendingPlanChanges) : "None"} subtitle="Drafts + ended assignments" icon={Clock} />
        <KpiCard dense title="Inactive Plans" value={stats.inactivePlans ? String(stats.inactivePlans) : "None"} subtitle={`${stats.activePlans} active · ${stats.plans} total`} icon={GitBranch} />
      </KpiCardGrid>
      <div className="grid gap-1.5 xl:grid-cols-2">
        <PeopleOpsSectionCard title="Assignment Distribution" subtitle="By plan code (active assignments)" dense>
          <div className="flex flex-wrap gap-1">
            {Object.entries(
              activeAssignments.reduce((acc, row) => {
                const code = row.planCode || row.plan_code || "Unassigned";
                acc[code] = (acc[code] || 0) + 1;
                return acc;
              }, {})
            ).map(([code, count]) => (
              <span key={code} className="rounded-md border border-border bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium">
                {code}: {count}
              </span>
            ))}
            {!activeAssignments.length ? (
              <p className="text-xs text-muted-foreground">No active plan assignments — assign plans from the directory.</p>
            ) : null}
          </div>
        </PeopleOpsSectionCard>
        <PeopleOpsSectionCard title="Plan Version Timeline" subtitle="Latest versions per plan code (read-only)" dense>
          <div className="space-y-1">
            {planVersions.slice(0, 5).map(({ code, versions }) => (
              <div key={code} className="rounded-md border border-border bg-background px-2 py-1 text-[11px]">
                <p className="font-semibold text-foreground">{code}</p>
                <p className="text-muted-foreground">
                  {versions.slice(0, 3).map((row) => `${row.version} (${row.status})`).join(" · ")}
                </p>
              </div>
            ))}
            {!planVersions.length ? (
              <p className="text-xs text-muted-foreground">No compensation plans configured yet.</p>
            ) : null}
          </div>
        </PeopleOpsSectionCard>
      </div>
    </div>
  );
}
