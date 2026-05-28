import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { buildExecutiveInterventionModel } from "@/operations/executiveInterventionModel.js";
import {
  readOperationalLedger,
  readPendingOperationalEvents,
} from "@/operations/operationalEventLedger.js";
import { buildOperationalAuditReplay, buildCorrelatedEventChains } from "@/operations/operationalEventTimeline.js";
import { OPERATIONAL_EVENT_TYPES } from "@/operations/operationalEventTypes.js";
import { backfillOperationalLedgerFromPayload } from "@/operations/operationalEventBridge.js";
import { ROLES } from "@/config/roles.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {object|null} [params.rendered]
 */
export async function validateOperationalEventLedgerModule({
  ctx,
  currentUser = null,
  rendered = null,
}) {
  return predatorTrace("Operational Event Ledger", "validation.full", async () => {
    const entries = [];
    const ledger = readOperationalLedger(ctx.tenantId);

    const invalidTypes = ledger.filter((e) => !OPERATIONAL_EVENT_TYPES.includes(e.eventType));
    entries.push(
      createPredatorEntry({
        status: invalidTypes.length === 0 ? "PASS" : "FAIL",
        module: "Operational Event Ledger",
        step: "ledger.event_types",
        actual: { invalid: invalidTypes.length, total: ledger.length },
        severity: "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const ids = ledger.map((e) => e.eventId);
    const uniqueIds = new Set(ids);
    entries.push(
      createPredatorEntry({
        status: ids.length === uniqueIds.size ? "PASS" : "FAIL",
        module: "Operational Event Ledger",
        step: "ledger.duplicate_ids",
        actual: { total: ids.length, unique: uniqueIds.size },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const ordered =
      ledger.length < 2 ||
      Date.parse(ledger[0]?.timestamp || "") >= Date.parse(ledger[ledger.length - 1]?.timestamp || "");
    entries.push(
      createPredatorEntry({
        status: ordered ? "PASS" : "WARN",
        module: "Operational Event Ledger",
        step: "ledger.ordering",
        actual: { count: ledger.length, newestFirst: ordered },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const crossTenant = ledger.filter((e) => e.tenantId && str(e.tenantId) !== str(ctx.tenantId));
    entries.push(
      createPredatorEntry({
        status: crossTenant.length === 0 ? "PASS" : "FAIL",
        module: "Operational Event Ledger",
        step: "tenant.isolation",
        actual: { crossTenant: crossTenant.length },
        severity: "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const pending = readPendingOperationalEvents(ctx.tenantId);
    entries.push(
      createPredatorEntry({
        status: pending.length < 20 ? "PASS" : "WARN",
        module: "Operational Event Ledger",
        step: "offline.pending_queue",
        actual: { pending: pending.length },
        rootCauseGuess:
          pending.length === 0
            ? "No offline retry backlog"
            : "Pending durable sync events awaiting replay",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (ctx.role !== ROLES.LAB && ctx.role !== ROLES.AGENT) {
      try {
        const payload = await loadOperationsCommandCenterData(
          currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId }
        );
        backfillOperationalLedgerFromPayload(ctx.tenantId, payload);
        const replay = buildOperationalAuditReplay(ctx.tenantId, payload, 40);
        const chains = buildCorrelatedEventChains(ctx.tenantId, payload, 8);

        const orderedReplay =
          replay.length < 2 ||
          Date.parse(replay[0]?.at || "") >= Date.parse(replay[replay.length - 1]?.at || "");
        entries.push(
          createPredatorEntry({
            status: orderedReplay && replay.length > 0 ? "PASS" : replay.length === 0 ? "WARN" : "WARN",
            module: "Operational Event Ledger",
            step: "timeline.hydration",
            actual: { replayRows: replay.length, chains: chains.length },
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );

        const execModel = buildExecutiveInterventionModel(payload, { tenantId: ctx.tenantId });
        const uiFeed = rendered?.feedCount ?? null;
        const apiFeed = execModel.feed?.length ?? 0;
        if (uiFeed != null) {
          entries.push(
            createPredatorEntry({
              status: Math.abs(apiFeed - uiFeed) <= 5 ? "PASS" : "WARN",
              module: "Operational Event Ledger",
              step: "ui.feed_sync",
              actual: { api: apiFeed, ui: uiFeed },
              tenantId: ctx.tenantId,
              role: ctx.role,
              userId: ctx.userId,
            })
          );
        }

        const interventionIds = new Set(
          (execModel.interventionQueues?.allIssues || []).map((i) => i.id)
        );
        const orphanTasks = ledger.filter(
          (e) =>
            e.linkedEntityType === "intervention" &&
            e.linkedEntityId &&
            interventionIds.size > 0 &&
            !interventionIds.has(e.linkedEntityId)
        );
        entries.push(
          createPredatorEntry({
            status: orphanTasks.length <= 5 ? "PASS" : "WARN",
            module: "Operational Event Ledger",
            step: "intervention.linkage",
            actual: { orphanEvents: orphanTasks.length },
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      } catch (err) {
        entries.push(
          createPredatorEntry({
            status: "FAIL",
            module: "Operational Event Ledger",
            step: "timeline.build",
            actual: err?.message || String(err),
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Operational Event Ledger",
          step: "role.scope",
          rootCauseGuess: "Agent/lab roles use scoped ledger reads only",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const uiLedger = rendered?.ledgerEventCount ?? null;
    if (uiLedger != null) {
      entries.push(
        createPredatorEntry({
          status: Math.abs(ledger.length - uiLedger) <= 10 ? "PASS" : "WARN",
          module: "Operational Event Ledger",
          step: "ui.ledger_sync",
          actual: { store: ledger.length, ui: uiLedger },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return {
      module: "Operational Event Ledger",
      summary: summarizePredatorEntries(entries),
      entries,
    };
  });
}
