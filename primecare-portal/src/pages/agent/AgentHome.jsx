import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AgentHome() {
  const stats = [
    { label: "Today's Visits", value: 6 },
    { label: "Pending Follow-ups", value: 4 },
    { label: "Assigned Collections", value: 3 },
    { label: "Samples Given", value: 2 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agent Home</h1>
        <p className="text-sm text-muted-foreground">
          Quick view of today’s field work.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}