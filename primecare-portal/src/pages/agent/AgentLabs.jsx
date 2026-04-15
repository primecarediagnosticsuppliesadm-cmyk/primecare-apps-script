import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const labs = [
  { name: "Sai Diagnostics", area: "Secunderabad", lastVisit: "2026-03-15" },
  { name: "LifeCare Labs", area: "Begumpet", lastVisit: "2026-03-14" },
  { name: "Medilab Center", area: "Ameerpet", lastVisit: "2026-03-13" },
];

export default function AgentLabs() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assigned Labs</h1>
        <p className="text-sm text-muted-foreground">
          Labs assigned to this agent.
        </p>
      </div>

      <div className="space-y-3">
        {labs.map((lab) => (
          <Card key={lab.name} className="rounded-2xl shadow-sm">
            <CardContent className="pt-6">
              <div className="font-semibold">{lab.name}</div>
              <div className="text-sm text-muted-foreground">
                {lab.area} • Last visit: {lab.lastVisit}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}