/**
 * Dev reference for UX-1 components (not routed in production).
 * Import temporarily in a page or Storybook to preview tokens.
 */
import React from "react";
import { TrendingUp, Wallet } from "lucide-react";
import {
  StatusBadge,
  KpiCard,
  KpiCardGrid,
  PageSkeleton,
  EmptyState,
  usePortalToast,
} from "@/components/ux";
import {
  qualificationBandToVariant,
  orderStatusToVariant,
  pipelineStageToVariant,
  paymentStatusToVariant,
  creditRiskToVariant,
} from "@/utils/statusTokens";
import { formatQualificationBandLabel } from "@/utils/computeQualificationScore";
import { getPipelineStageLabel } from "@/utils/qualificationPipeline";

function ToastDemo() {
  const { showToast } = usePortalToast();
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className="rounded-lg border px-3 py-2 text-sm"
        onClick={() => showToast("success", "Pipeline updated successfully")}
      >
        Success toast
      </button>
      <button
        type="button"
        className="rounded-lg border px-3 py-2 text-sm"
        onClick={() => showToast("error", "Save failed — try again")}
      >
        Error toast
      </button>
    </div>
  );
}

export default function UxFoundationShowcase() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">UX-1 Foundation</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Design tokens and shared components preview.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Status badges</h2>
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant={qualificationBandToVariant("hot")}>
            {formatQualificationBandLabel("hot")}
          </StatusBadge>
          <StatusBadge variant={qualificationBandToVariant("warm")}>
            {formatQualificationBandLabel("warm")}
          </StatusBadge>
          <StatusBadge variant={orderStatusToVariant("Fulfilled")}>Fulfilled</StatusBadge>
          <StatusBadge variant={pipelineStageToVariant("negotiation")}>
            {getPipelineStageLabel("negotiation")}
          </StatusBadge>
          <StatusBadge variant={paymentStatusToVariant("Pending")}>Pending</StatusBadge>
          <StatusBadge variant={creditRiskToVariant("HOLD")}>Credit Hold</StatusBadge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">KPI cards</h2>
        <KpiCardGrid columns={4}>
          <KpiCard
            title="Today's revenue"
            value="₹1,24,500"
            subtitle="Fulfilled orders today"
            icon={TrendingUp}
            trend={{ direction: "up", label: "+8% vs yesterday" }}
          />
          <KpiCard
            title="Receivables"
            value="₹8,40,000"
            icon={Wallet}
            loading
          />
        </KpiCardGrid>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Toasts</h2>
        <ToastDemo />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Empty state</h2>
        <EmptyState
          title="No labs to review"
          description="Try adjusting filters or wait for agents to submit qualifications."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Page skeleton</h2>
        <PageSkeleton kpiCount={3} kpiColumns={3} listRows={2} />
      </section>
    </div>
  );
}
