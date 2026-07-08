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
      title="Settings"
      description="People Operations configuration — policies, approvals, exports, and pay cycles."
      breadcrumbs={breadcrumbs}
    >
      <PeopleOpsSectionCard
        title="Configuration Hub"
        subtitle="Grouped settings for payroll governance and workforce policies."
        icon={Settings2}
      >
        <p className="text-sm text-muted-foreground">
          Manage payroll policies, approval routing, export templates, and pay cycles from this hub. Operational
          workflows remain in Payroll and Compensation until each settings area is enabled.
        </p>
      </PeopleOpsSectionCard>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_SECTIONS.map((section) => (
          <PeopleOpsSectionCard
            key={section.id}
            title={section.title}
            subtitle={section.subtitle}
            icon={section.icon}
            rightAction={<StatusBadge variant="neutral">Future capability</StatusBadge>}
          >
            <p className="text-sm text-muted-foreground">Planned — use Payroll and Compensation for day-to-day work today.</p>
          </PeopleOpsSectionCard>
        ))}
      </div>

      <PeopleOpsSectionCard title="Roadmap" subtitle="Capabilities on the product roadmap.">
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
