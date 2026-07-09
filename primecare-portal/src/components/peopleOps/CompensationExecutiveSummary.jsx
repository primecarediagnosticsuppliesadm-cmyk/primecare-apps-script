import React, { useMemo } from "react";
import { GitBranch, Layers, TrendingUp, Wallet, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { buildCompensationSummaryStats } from "@/peopleOps/peopleOpsEnterpriseModel.js";
import { formatPeopleOpsMetricValue } from "@/peopleOps/peopleOpsDataQualityModel.js";

/**
 * RC5 — Compensation executive summary (read models only, business language).
 */
export default function CompensationExecutiveSummary({ adminModel, model, onAssignEmployees }) {
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

  const highestCommissionPct = useMemo(() => {
    const plans = adminModel?.planRows || [];
    let best = null;
    for (const plan of plans) {
      const pct = Number(plan.commissionPct ?? plan.rules_json?.commissionPct ?? plan.commission_pct);
      if (!Number.isFinite(pct)) continue;
      if (!best || pct > best.pct) best = { pct, code: plan.planCode || plan.plan_code || "Plan" };
    }
    if (best) return `${best.code} · ${best.pct}%`;
    const rows = model?.previewRows || [];
    const top = [...rows].sort((a, b) => Number(b.commissionAmount || 0) - Number(a.commissionAmount || 0))[0];
    return top ? `${top.agentName || "Agent"} · ${top.commissionLabel || "—"}` : "Not configured";
  }, [adminModel, model]);

  const plansWithoutEmployees = useMemo(() => {
    const plans = (adminModel?.planRows || []).filter((row) => row.status === "active");
    return plans.filter((plan) => {
      const code = String(plan.planCode || plan.plan_code || "").trim();
      return !activeAssignments.some((row) => String(row.planCode || row.plan_code || "").trim() === code);
    }).length;
  }, [adminModel, activeAssignments]);

  return (
    <div className="space-y-1.5">
      <KpiCardGrid columns={5} dense>
        <KpiCard dense title="Most Used Plan" value={mostUsedPlan} subtitle="Active Compensation Assignments" icon={Layers} />
        <KpiCard dense title="Highest Commission %" value={formatPeopleOpsMetricValue(highestCommissionPct, { emptyLabel: "Not configured" })} subtitle="Across Compensation Plans" icon={Wallet} />
        <KpiCard dense title="Promotion Eligible" value={promotionCount ? String(promotionCount) : "None"} subtitle="Agents ready for review" icon={TrendingUp} />
        <KpiCard dense title="Inactive Plans" value={stats.inactivePlans ? String(stats.inactivePlans) : "None"} subtitle={`${stats.activePlans} active · ${stats.plans} total`} icon={GitBranch} />
        <KpiCard dense title="Plans without Employees" value={plansWithoutEmployees ? String(plansWithoutEmployees) : "None"} subtitle="Templates with no assignments" icon={UserX} />
      </KpiCardGrid>
      <div className="grid gap-1.5 xl:grid-cols-2">
        <PeopleOpsSectionCard title="Compensation Assignment Distribution" subtitle="By Compensation Plan (active)" dense>
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
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">No employees assigned to Compensation Plans yet.</p>
                {onAssignEmployees ? (
                  <Button type="button" size="sm" className="h-7 text-[10px]" onClick={onAssignEmployees}>
                    Assign Employees →
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </PeopleOpsSectionCard>
        <PeopleOpsSectionCard title="Compensation Plan Timeline" subtitle="Latest versions per plan (read-only)" dense>
          <div className="space-y-1">
            {(adminModel?.planRows || [])
              .reduce((acc, row) => {
                const code = row.planCode || row.plan_code || "Unknown";
                if (!acc.find((item) => item.code === code)) {
                  acc.push({
                    code,
                    versions: (adminModel.planRows || [])
                      .filter((plan) => (plan.planCode || plan.plan_code) === code)
                      .sort((a, b) => String(b.version).localeCompare(String(a.version))),
                  });
                }
                return acc;
              }, [])
              .slice(0, 5)
              .map(({ code, versions }) => (
                <div key={code} className="rounded-md border border-border bg-background px-2 py-1 text-[11px]">
                  <p className="font-semibold text-foreground">{code}</p>
                  <p className="text-muted-foreground">
                    {versions.slice(0, 3).map((row) => `${row.version} (${row.status})`).join(" · ")}
                  </p>
                </div>
              ))}
            {!(adminModel?.planRows || []).length ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">No Compensation Plans yet.</p>
                <p className="text-[11px] text-muted-foreground">Create a Compensation Plan → then Assign Employees →</p>
              </div>
            ) : null}
          </div>
        </PeopleOpsSectionCard>
      </div>
    </div>
  );
}