import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StockPage from "@/StockPage";

export default function AgentStockCheck() {
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Stock Availability Check</CardTitle>
        </CardHeader>
        <CardContent>
          <StockPage />
        </CardContent>
      </Card>
    </div>
  );
}