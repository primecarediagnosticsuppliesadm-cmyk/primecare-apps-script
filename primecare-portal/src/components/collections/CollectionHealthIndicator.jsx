import { HEALTH_TIER_META } from "@/collections/collectionsCockpitMetrics.js";
import { cn } from "@/lib/utils";

export default function CollectionHealthIndicator({ tier = "attention", compact = false, className }) {
  const meta = HEALTH_TIER_META[tier] || HEALTH_TIER_META.attention;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-none",
        meta.badgeClass,
        compact && "px-1 py-0.5",
        className
      )}
      title={meta.label}
      aria-label={`Account health: ${meta.label}`}
    >
      <span aria-hidden>{meta.emoji}</span>
      {!compact ? <span>{meta.label}</span> : null}
    </span>
  );
}
