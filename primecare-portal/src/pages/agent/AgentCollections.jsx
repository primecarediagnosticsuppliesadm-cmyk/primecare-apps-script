import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const items = [
  { lab: "Sai Diagnostics", due: "₹18,000", risk: "Medium", status: "Follow-up" },
  { lab: "LifeCare Labs", due: "₹9,500", risk: "High", status: "Pending" },
  { lab: "Medilab Center", due: "₹0", risk: "Low", status: "Collected" },
];

export default function AgentCollections() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Collections</h1>
        <p className="text-sm text-muted-foreground">
          Labs assigned for collection follow-up.
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <Card key={item.lab} className="rounded-2xl shadow-sm">
            <CardContent className="pt-6 flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">{item.lab}</div>
                <div className="text-sm text-muted-foreground">
                  Due: {item.due} • Risk: {item.risk}
                </div>
              </div>
              <div className="text-sm font-medium">{item.status}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}