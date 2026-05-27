import { supabase } from "@/api/supabaseClient.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { checkTenantConsistency } from "@/predator/predatorChecks.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { PLACEHOLDER_CHANNELS } from "@/notifications/notificationConstants.js";
import {
  createNotificationFoundationPredatorEntry,
  resolveNotificationFoundationState,
  shouldSkipNotificationIsolationProbes,
} from "@/notifications/notificationFoundationProbe.js";

const FORBIDDEN_LIVE_DELIVERY_STATUSES = new Set([
  "sent",
  "delivered",
  "queued",
  "sending",
  "submitted",
]);

/**
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} ctx
 * @param {Object} partial
 */
function infoEntry(ctx, partial = {}) {
  return createPredatorEntry(
    createNotificationFoundationPredatorEntry(ctx, {
      status: "INFO",
      issueClass: "setup_pending",
      severity: "low",
      ...partial,
    })
  );
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 */
export async function validateNotificationsFoundationModule({ ctx }) {
  return predatorTrace("Notifications", "validation.foundation", async () => {
    const entries = [];
    const foundationState = await resolveNotificationFoundationState();

    entries.push(
      infoEntry(ctx, {
        step: "foundation.state",
        expected: "ready | setup_pending | disabled",
        actual: {
          mode: foundationState.mode,
          enabled: foundationState.enabled,
          tablesExist: foundationState.tablesExist,
          probeRequired: foundationState.probeRequired,
        },
        rootCauseGuess: foundationState.message,
        suggestedFix: foundationState.suggestedFix,
      })
    );

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

    if (shouldSkipNotificationIsolationProbes(foundationState)) {
      entries.push(
        infoEntry(ctx, {
          step: "foundation.probes_skipped",
          rootCauseGuess: foundationState.message,
          suggestedFix: foundationState.suggestedFix,
          actual: { error: foundationState.error },
        })
      );

      return {
        module: "Notifications",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    const tables = [
      "notification_events",
      "notification_templates",
      "notification_preferences",
      "notification_delivery_log",
    ];

    let deliveryLogRows = [];

    for (const table of tables) {
      const selectCols =
        table === "notification_delivery_log"
          ? "tenant_id, channel, status"
          : "tenant_id";
      const res = await supabase.from(table).select(selectCols).limit(25);
      if (res.error) {
        entries.push(
          createPredatorEntry({
            status: "WARN",
            module: "Notifications",
            step: `tenant_isolation.${table}.probe`,
            actual: res.error.message,
            rootCauseGuess: "RLS or schema probe failed after foundation reported ready",
            suggestedFix: "Verify notifications_foundation_migration.sql and RLS policies",
            severity: "medium",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
        continue;
      }

      const rows = Array.isArray(res.data) ? res.data : [];
      if (table === "notification_delivery_log") {
        deliveryLogRows = rows;
      }

      entries.push(
        ...checkTenantConsistency({
          module: "Notifications",
          step: `tenant_isolation.${table}`,
          ctx,
          profileTenantId: ctx.tenantId,
          rowTenantIds: rows.map((r) => r.tenant_id).filter(Boolean),
        })
      );
    }

    if (deliveryLogRows.length > 0) {
      const liveLike = deliveryLogRows.filter((r) =>
        FORBIDDEN_LIVE_DELIVERY_STATUSES.has(String(r.status || "").toLowerCase())
      );
      const externalChannelLive = deliveryLogRows.filter(
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
            sample: deliveryLogRows.slice(0, 5),
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
