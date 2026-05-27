import { supabase } from "@/api/supabaseClient.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { checkTenantConsistency } from "@/predator/predatorChecks.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { PLACEHOLDER_CHANNELS } from "@/notifications/notificationConstants.js";

const FORBIDDEN_LIVE_DELIVERY_STATUSES = new Set([
  "sent",
  "delivered",
  "queued",
  "sending",
  "submitted",
]);

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 */
export async function validateNotificationsFoundationModule({ ctx }) {
  return predatorTrace("Notifications", "validation.foundation", async () => {
    const entries = [];

    if (!supabase) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Notifications",
          step: "supabase.client",
          rootCauseGuess: "Supabase not configured",
          suggestedFix: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return { module: "Notifications", summary: summarizePredatorEntries(entries), entries };
    }

    const tables = [
      "notification_events",
      "notification_templates",
      "notification_preferences",
    ];

    for (const table of tables) {
      const res = await supabase.from(table).select("tenant_id").limit(25);
      if (res.error) {
        entries.push(
          createPredatorEntry({
            status: table === "notification_events" ? "WARN" : "PASS",
            module: "Notifications",
            step: `${table}.probe`,
            actual: res.error.message,
            rootCauseGuess:
              res.error.message?.includes("does not exist")
                ? "Notification foundation migration not applied"
                : "RLS or schema probe failed",
            suggestedFix: "Run notifications_foundation_migration.sql",
            severity: "medium",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
        continue;
      }

      const rows = Array.isArray(res.data) ? res.data : [];
      entries.push(
        ...checkTenantConsistency({
          module: "Notifications",
          step: table,
          ctx,
          profileTenantId: ctx.tenantId,
          rowTenantIds: rows.map((r) => r.tenant_id).filter(Boolean),
        })
      );
    }

    const logRes = await supabase
      .from("notification_delivery_log")
      .select("channel, status, tenant_id")
      .limit(50);

    if (!logRes.error && Array.isArray(logRes.data)) {
      const liveLike = logRes.data.filter((r) =>
        FORBIDDEN_LIVE_DELIVERY_STATUSES.has(String(r.status || "").toLowerCase())
      );
      const externalChannelLive = logRes.data.filter(
        (r) =>
          PLACEHOLDER_CHANNELS.includes(String(r.channel || "").toLowerCase()) &&
          String(r.status || "").toLowerCase() === "delivered"
      );

      entries.push(
        createPredatorEntry({
          status: liveLike.length > 0 || externalChannelLive.length > 0 ? "FAIL" : "PASS",
          module: "Notifications",
          step: "delivery_log.no_live_provider",
          expected: "placeholder_not_sent or logged_in_app only",
          actual: {
            forbiddenStatusCount: liveLike.length,
            externalDeliveredCount: externalChannelLive.length,
            sample: logRes.data.slice(0, 5),
          },
          rootCauseGuess:
            liveLike.length > 0
              ? "Delivery log contains live-send statuses — external provider may be enabled"
              : "Foundation phase: no live provider delivery",
          suggestedFix: "Keep delivery status placeholder_not_sent until providers are integrated",
          severity: liveLike.length > 0 ? "critical" : "low",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      entries.push(
        ...checkTenantConsistency({
          module: "Notifications",
          step: "notification_delivery_log",
          ctx,
          profileTenantId: ctx.tenantId,
          rowTenantIds: logRes.data.map((r) => r.tenant_id).filter(Boolean),
        })
      );
    }

    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Notifications",
        step: "foundation.external_send_disabled",
        expected: "No WhatsApp/SMS/email providers wired",
        actual: { placeholderChannels: PLACEHOLDER_CHANNELS },
        rootCauseGuess: "",
        suggestedFix: "",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    return {
      module: "Notifications",
      summary: summarizePredatorEntries(entries),
      entries,
    };
  });
}
