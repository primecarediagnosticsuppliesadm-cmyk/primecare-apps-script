import React from "react";
import { useAgentDailyOs } from "@/hooks/useAgentDailyOs.js";
import { AgentStickyMissionWidget } from "@/components/agent/AgentOsSections.jsx";
import { startVisitFromWorkspaceItem } from "@/pages/agentVisitContext.js";

const WIDGET_PAGES = new Set(["dashboard", "collections", "labs", "visits"]);

export default function AgentPortalShell({ currentUser, activePage, setActivePage, children }) {
  const showWidget = WIDGET_PAGES.has(String(activePage || "").toLowerCase());
  const { osState, loading } = useAgentDailyOs(currentUser, { enabled: showWidget });

  const handleOpenVisit = (stop) => {
    if (!stop) return;
    startVisitFromWorkspaceItem(stop, {
      visitType: "Field Visit",
      source: "agent_os_widget",
    });
    setActivePage?.("visits");
  };

  return (
    <>
      {children}
      {showWidget ? (
        <AgentStickyMissionWidget
          osState={osState}
          loading={loading}
          dayComplete={osState.dayComplete}
          onOpenVisit={handleOpenVisit}
        />
      ) : null}
    </>
  );
}
