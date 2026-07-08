import React from "react";
import { Calendar, Clock, FileOutput, Lock, Settings2, Shield } from "lucide-react";
import { StatusBadge } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";

const SETTINGS_SECTIONS = [
  {
    id: "payroll-policies",
    title: "Payroll Policies",
    subtitle: "Approval thresholds, preview rules, and paid-evidence requirements.",
    icon: Shield,
  },
  {
    id: "approval-matrix",
    title: "Approval Matrix",
    subtitle: "Role-based submit, approve, lock, and export permissions.",
    icon: Lock,
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
  {
    id: "pay-cycles",
    title: "Pay Cycles",
    subtitle: "Monthly cadence, period boundaries, and run versioning.",
    icon: Clock,
  },
];

export default function PeopleOpsSettingsLanding({ breadcrumbs = [] }) {
  return (
    <PeopleOpsModuleFrame
      title="Configuration"
      description="People Operations settings and policies. Editable configuration arrives in Phase 8.6."
      breadcrumbs={breadcrumbs}
    >
      <PeopleOpsSectionCard
        title="Settings Overview"
        subtitle="Intentional placeholders — existing payroll workflow behavior is unchanged."
        icon={Settings2}
      >
        <p className="text-sm text-muted-foreground">
          Configure payroll policies, approval routing, export templates, and pay cycles from this landing page in a
          future release. Until then, use Payroll and Compensation modules for day-to-day operations.
        </p>
      </PeopleOpsSectionCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_SECTIONS.map((section) => (
          <PeopleOpsSectionCard
            key={section.id}
            title={section.title}
            subtitle={section.subtitle}
            icon={section.icon}
            rightAction={<StatusBadge variant="info">Phase 8.6</StatusBadge>}
          >
            <p className="text-sm text-muted-foreground">Available in Phase 8.6</p>
          </PeopleOpsSectionCard>
        ))}
      </div>

      <PeopleOpsSectionCard title="Future Features" subtitle="Roadmap capabilities not yet in scope.">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Bank file generation handoff (Finance-led)</li>
          <li>GL posting integration (Finance-led)</li>
          <li>Leave and benefits configuration</li>
          <li>Department and manager hierarchy</li>
        </ul>
      </PeopleOpsSectionCard>
    </PeopleOpsModuleFrame>
  );
}
