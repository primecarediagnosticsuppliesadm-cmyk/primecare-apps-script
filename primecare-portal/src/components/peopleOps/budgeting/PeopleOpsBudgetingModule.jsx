import React from "react";
import WorkforceBudgetOverview from "@/components/peopleOps/budgeting/WorkforceBudgetOverview.jsx";
import WorkforceHeadcountPlanning from "@/components/peopleOps/budgeting/WorkforceHeadcountPlanning.jsx";
import WorkforceDepartmentBudget from "@/components/peopleOps/budgeting/WorkforceDepartmentBudget.jsx";
import WorkforceScenarioPlanning from "@/components/peopleOps/budgeting/WorkforceScenarioPlanning.jsx";
import WorkforceBudgetHistory from "@/components/peopleOps/budgeting/WorkforceBudgetHistory.jsx";

export default function PeopleOpsBudgetingModule({
  screenId,
  workspace,
  breadcrumbs = [],
  planningActions,
  actorLabel = "Executive",
}) {
  if (!workspace) return null;

  if (screenId === "overview") {
    return <WorkforceBudgetOverview workspace={workspace} breadcrumbs={breadcrumbs} />;
  }
  if (screenId === "headcount") {
    return (
      <WorkforceHeadcountPlanning
        workspace={workspace}
        breadcrumbs={breadcrumbs}
        onAddPosition={planningActions?.addHeadcountPosition}
        onDuplicatePosition={planningActions?.duplicateHeadcountPosition}
        onArchivePosition={planningActions?.archiveHeadcountPosition}
      />
    );
  }
  if (screenId === "department-budget") {
    return <WorkforceDepartmentBudget workspace={workspace} breadcrumbs={breadcrumbs} />;
  }
  if (screenId === "scenarios") {
    return (
      <WorkforceScenarioPlanning
        workspace={workspace}
        breadcrumbs={breadcrumbs}
        onAddCustomScenario={(payload) =>
          planningActions?.addCustomScenario?.({ ...payload, createdBy: actorLabel })
        }
        onSaveScenario={(row) => planningActions?.saveScenarioToHistory?.(row, actorLabel)}
      />
    );
  }
  if (screenId === "history") {
    return <WorkforceBudgetHistory workspace={workspace} breadcrumbs={breadcrumbs} />;
  }
  return <WorkforceBudgetOverview workspace={workspace} breadcrumbs={breadcrumbs} />;
}
