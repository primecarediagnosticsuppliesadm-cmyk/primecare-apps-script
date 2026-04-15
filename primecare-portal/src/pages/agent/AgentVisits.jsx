import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AgentPage from "@/AgentPage";

export default function AgentVisits() {
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Visit Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <AgentPage />
        </CardContent>
      </Card>
    </div>
  );
}