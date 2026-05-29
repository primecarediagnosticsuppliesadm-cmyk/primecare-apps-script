import React from "react";
import { Button } from "@/components/ui/button";

/**
 * Legacy route — real collections live on Agent Dashboard / Collections page.
 */
export default function AgentCollections({ setActivePage }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Collections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your daily workspace to record collections and follow-ups for assigned labs.
        </p>
      </div>
      <Button type="button" className="w-full max-md:min-h-11" onClick={() => setActivePage?.("agentDashboard")}>
        Open agent workspace
      </Button>
    </div>
  );
}
