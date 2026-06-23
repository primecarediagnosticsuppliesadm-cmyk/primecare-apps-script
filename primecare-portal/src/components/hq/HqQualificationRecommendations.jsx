import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Target, ChevronRight } from "lucide-react";
import { buildQualificationRecommendations } from "@/operations/qualificationRecommendationEngine.js";
import { formatQualificationBandLabel } from "@/utils/computeQualificationScore";
import { qualificationBandToVariant } from "@/utils/statusTokens";

/**
 * Priority qualification recommendations for HQ Qualification Analytics.
 */
export default function HqQualificationRecommendations({
  rows = [],
  onReviewLab,
  limit = 5,
}) {
  const recommendations = useMemo(
    () => buildQualificationRecommendations(rows, limit),
    [rows, limit]
  );

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-500">
        No qualification rows loaded — agents must save lab qualification profiles first.
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-500">
        All loaded qualifications are in terminal pipeline stages (won/lost). No priority labs to
        recommend.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-[var(--pc-brand-primary)]" />
        <h2 className="text-sm font-semibold text-slate-900">Priority recommendations</h2>
        <span className="text-xs text-slate-500">Top {recommendations.length} by score & band</span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
        {recommendations.map((rec) => (
          <div
            key={rec.labId}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-sm text-slate-900">{rec.labName}</p>
                {rec.distributorName ? (
                  <p className="truncate text-[10px] text-slate-500">{rec.distributorName}</p>
                ) : null}
              </div>
              <Badge
                variant={qualificationBandToVariant(rec.band)}
                className={cn("shrink-0 text-[10px]")}
              >
                {formatQualificationBandLabel(rec.band)}
                {rec.score > 0 ? ` · ${rec.score}` : ""}
              </Badge>
            </div>

            <p className="mt-2 text-[11px] leading-snug text-slate-600">
              <span className="font-medium text-slate-700">Why: </span>
              {rec.whyMatters}
            </p>

            <p className="mt-1.5 text-[11px] leading-snug text-indigo-800">
              <span className="font-medium">Next: </span>
              {rec.recommendedAction}
            </p>

            {(rec.expectedValue || rec.fitLabel || rec.rentalLabel) && (
              <p className="mt-1.5 text-[10px] text-slate-500">
                {[rec.expectedValue, rec.fitLabel, rec.rentalLabel].filter(Boolean).join(" · ")}
              </p>
            )}

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2 h-8 w-full gap-1 text-[11px]"
              onClick={() => onReviewLab?.(rec.labId, rec.labName)}
            >
              Review Lab
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
