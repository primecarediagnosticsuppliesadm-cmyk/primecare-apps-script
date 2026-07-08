import React from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ux";
import { enterpriseLayout } from "@/styles/enterpriseLayout.js";

/**
 * RC2 executive command center page scaffold — top metrics, middle modules, bottom insights.
 */
export default function ExecutiveCommandCenterShell({
  title,
  subtitle,
  icon,
  actions,
  freshness,
  topMetrics = null,
  priorityQueue = null,
  middle = null,
  bottom = null,
  alerts = null,
  className,
}) {
  return (
    <div className={cn(enterpriseLayout.pageDense, className)}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={actions}
        freshness={freshness}
        compact
      />
      {alerts}
      {topMetrics}
      {priorityQueue}
      {middle ? <div className={enterpriseLayout.gridTwoCol}>{middle}</div> : null}
      {bottom ? <div className="space-y-3">{bottom}</div> : null}
    </div>
  );
}
