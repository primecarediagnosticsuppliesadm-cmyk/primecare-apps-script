import React from "react";
import { Calendar, Clock, FileOutput, Lock, Settings2, Shield } from "lucide-react";
import { StatusBadge } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";

const ACTIVE_SETTINGS = [
  {
    id: "pay-cycles",
    title: "Pay Cycles",
    subtitle: "Monthly cadence, period boundaries, and run versioning — active via Payroll Periods.",
    icon: Clock,
    status: "Active",
    statusVariant: "success",
    detail: "Use Payroll → Periods to generate previews and manage run versions for the current reporting context.",
  },
  {
    id: "approval-matrix",
    title: "Approval Matrix",
    subtitle: "Role-based submit, approve, lock, and export permissions — enforced in payroll workflow.",
    icon: Lock,
    status: "Active",
    statusVariant: "success",
    detail: "Executive and admin roles drive submit/approve/lock actions on the Run Review toolbar.",
  },
];

const ROADMAP_SETTINGS = [
  {
    id: "payroll-policies",
    title: "Payroll Policies",
    subtitle: "Approval thresholds, preview rules, and paid-evidence requirements.",
    icon: Shield,
  },
  {
    id: "export-templates",
    title: "Export Templates",
    subtitle: "CSV layouts, checksum policy, and storage preferences.",
    icon: FileOutput,
  },
  {
    id: "work-calendars",
    title: "Work Calendars",
    subtitle: "Business days, holidays, and payroll blackout windows.",
    icon: Calendar,
  },
];

export default function PeopleOpsSettingsLanding({ breadcrumbs = [] }) {
  return (
    <PeopleOpsModuleFrame
      title="Settings"
      description="People Operations configuration — active governance vs roadmap capabilities."
      breadcrumbs={breadcrumbs}
    >
      <PeopleOpsSectionCard
        title="Active Configuration"
        subtitle="Settings that are operational today through Payroll and Compensation workflows."
        icon={Settings2}
      >
        <div className="grid gap-2 md:grid-cols-2">
          {ACTIVE_SETTINGS.map((section) => (
            <div key={section.id} className="rounded-lg border border-[var(--pc-brand-primary)]/20 bg-[var(--pc-brand-primary)]/5 px-3 py-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{section.title}</p>
                <StatusBadge variant={section.statusVariant} label={section.status} />
              </div>
              <p className="text-xs text-muted-foreground">{section.subtitle}</p>
              <p className="mt-1.5 text-xs text-foreground">{section.detail}</p>
            </div>
          ))}
        </div>
      </PeopleOpsSectionCard>

      <PeopleOpsSectionCard title="Future Capabilities" subtitle="Roadmap items — not yet configurable in this module.">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {ROADMAP_SETTINGS.map((section) => (
            <div key={section.id} className="rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{section.title}</p>
                <StatusBadge variant="neutral">Roadmap</StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">{section.subtitle}</p>
            </div>
          ))}
        </div>
      </PeopleOpsSectionCard>

      <PeopleOpsSectionCard title="Product Roadmap" subtitle="Capabilities planned beyond current People Operations scope.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Bank file generation handoff</li>
          <li>General ledger posting integration</li>
          <li>Leave and benefits configuration</li>
          <li>Department and manager hierarchy</li>
        </ul>
      </PeopleOpsSectionCard>
    </PeopleOpsModuleFrame>
  );
}
