import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { resolvePredatorOpsPayload } from "@/predator/predatorOpsPayload.js";
import { buildExecutiveInterventionModel } from "@/operations/executiveInterventionModel.js";
import {
  readOperationalLedger,
  readPendingOperationalEvents,
  isOperationalLedgerOrdered,
  normalizeLedgerEventForRead,
} from "@/operations/operationalEventLedger.js";
import {
  buildOperationalAuditReplay,
  buildCorrelatedEventChains,
} from "@/operations/operationalEventTimeline.js";
import { OPERATIONAL_EVENT_TYPES } from "@/operations/operationalEventTypes.js";
import { backfillOperationalLedgerFromPayload } from "@/operations/operationalEventBridge.js";
import { ROLES } from "@/config/roles.js";

const FEED_SYNC_TOLERANCE = 5;
const LEDGER_STORE_TOLERANCE = 12;
const SNAPSHOT_MAX_AGE_MS = 120_000;

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {object|null|undefined} rendered
 */
function resolveExecutiveOpsUiSnapshot(rendered) {
  const feedUiReady = rendered?.feedUiReady === true;
  const ledgerUiReady = rendered?.ledgerUiReady === true;
  const feedMounted = rendered?.feedMounted !== false;
  const feedRenderedCount =
    rendered?.feedRenderedCount != null
      ? Number(rendered.feedRenderedCount)
      : rendered?.feedCount != null
        ? Number(rendered.feedCount)
        : null;
  const ledgerStoreCount =
    rendered?.ledgerStoreCount != null
      ? Number(rendered.ledgerStoreCount)
      : rendered?.ledgerEventCount != null
        ? Number(rendered.ledgerEventCount)
        : null;
  const auditReplayCount =
    rendered?.auditReplayCount != null ? Number(rendered.auditReplayCount) : null;
  const capturedAt = Number(rendered?.capturedAt) || 0;
  const ageMs = capturedAt > 0 ? Date.now() - capturedAt : null;
  const snapshotFresh =
    feedUiReady &&
    ledgerUiReady &&
    feedMounted &&
    feedRenderedCount != null &&
    ledgerStoreCount != null &&
    (ageMs == null || ageMs <= SNAPSHOT_MAX_AGE_MS);

  return {
    feedUiReady,
    ledgerUiReady,
    feedMounted,
    feedRenderedCount,
    ledgerStoreCount,
    auditReplayCount,
    capturedAt,
    ageMs,
    snapshotFresh,
  };
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
  opsPayload = null,
}) {
  return predatorTrace("Operational Event Ledger", "validation.full", async () => {
    const entries = [];
    const ledgerAtStart = readOperationalLedger(ctx.tenantId);
    const ui = resolveExecutiveOpsUiSnapshot(rendered);

    const invalidTypes = ledgerAtStart.filter(
      (e) => !OPERATIONAL_EVENT_TYPES.includes(e.eventType)
    );
    entries.push(
      createPredatorEntry({
        status: invalidTypes.length === 0 ? "PASS" : "FAIL",
        module: "Operational Event Ledger",
        step: "ledger.event_types",
        actual: { invalid: invalidTypes.length, total: ledgerAtStart.length },
        severity: "high",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const ids = ledgerAtStart.map((e) => e.eventId);
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

    const missingTimestamps = ledgerAtStart.filter(
      (e) => !normalizeLedgerEventForRead(e).event_timestamp
    );
    const ordered = isOperationalLedgerOrdered(ledgerAtStart);
    entries.push(
      createPredatorEntry({
        status: ordered && missingTimestamps.length === 0 ? "PASS" : "WARN",
        module: "Operational Event Ledger",
        step: "ledger.ordering",
        expected: "event_timestamp desc, inserted_at desc, sequence/id desc",
        actual: {
          count: ledgerAtStart.length,
          newestFirst: ordered,
          missingEventTimestamp: missingTimestamps.length,
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const crossTenant = ledgerAtStart.filter(
      (e) => e.tenantId && str(e.tenantId) !== str(ctx.tenantId)
    );
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
      let payload;
      let execModelForUi;
      try {
        payload = await resolvePredatorOpsPayload(
          currentUser || { role: ctx.role, tenantId: ctx.tenantId, id: ctx.userId },
          opsPayload
        );
        execModelForUi = buildExecutiveInterventionModel(payload, {
          tenantId: ctx.tenantId,
        });
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
        payload = null;
        execModelForUi = null;
      }

      if (payload) {
        if (!ui.feedMounted) {
          entries.push(
            createPredatorEntry({
              status: "PASS",
              module: "Operational Event Ledger",
              step: "ui.feed_sync",
              rootCauseGuess: "Live operations feed not mounted on current view — model-only check",
              actual: { skipped: true },
              tenantId: ctx.tenantId,
              role: ctx.role,
              userId: ctx.userId,
            })
          );
        } else if (!ui.snapshotFresh) {
          entries.push(
            createPredatorEntry({
              status: "WARN",
              module: "Operational Event Ledger",
              step: "ui_snapshot_freshness",
              expected: "hydrated Executive Control Tower snapshot (feed + ledger counts)",
              actual: {
                feedUiReady: ui.feedUiReady,
                ledgerUiReady: ui.ledgerUiReady,
                feedRenderedCount: ui.feedRenderedCount,
                ledgerStoreCount: ui.ledgerStoreCount,
                ageMs: ui.ageMs,
                capturedAt: ui.capturedAt || null,
              },
              rootCauseGuess:
                "UI snapshot missing or captured before ledger hydration — open Control Tower and refresh",
              suggestedFix:
                "Load Executive Control Tower, wait for data, then re-run Predator",
              tenantId: ctx.tenantId,
              role: ctx.role,
              userId: ctx.userId,
            })
          );
        } else if (execModelForUi) {
          const apiFeedCount = execModelForUi.feed?.length ?? 0;
          const feedDrift = Math.abs(apiFeedCount - (ui.feedRenderedCount ?? 0));
          entries.push(
            createPredatorEntry({
              status: feedDrift <= FEED_SYNC_TOLERANCE ? "PASS" : "WARN",
              module: "Operational Event Ledger",
              step: "ui.feed_sync",
              expected: `rendered live feed rows within ${FEED_SYNC_TOLERANCE} of unified model`,
              actual: { api: apiFeedCount, ui: ui.feedRenderedCount, drift: feedDrift },
              rootCauseGuess:
                feedDrift <= FEED_SYNC_TOLERANCE
                  ? "Executive feed row count matches hydrated model"
                  : "Rendered feed count drifted from unified operations feed model",
              tenantId: ctx.tenantId,
              role: ctx.role,
              userId: ctx.userId,
            })
          );

          const storeCount = ledgerAtStart.length;
          const ledgerDrift = Math.abs(storeCount - (ui.ledgerStoreCount ?? 0));
          entries.push(
            createPredatorEntry({
              status: ledgerDrift <= LEDGER_STORE_TOLERANCE ? "PASS" : "WARN",
              module: "Operational Event Ledger",
              step: "ui.ledger_sync",
              expected: `UI ledger store count within ${LEDGER_STORE_TOLERANCE} of read store (pre-validator backfill)`,
              actual: {
                store: storeCount,
                ui: ui.ledgerStoreCount,
                drift: ledgerDrift,
              },
              rootCauseGuess:
                ledgerDrift <= LEDGER_STORE_TOLERANCE
                  ? "UI ledger store count matches tenant ledger"
                  : "UI ledger count taken before hydration or session events added after snapshot",
              tenantId: ctx.tenantId,
              role: ctx.role,
              userId: ctx.userId,
            })
          );

          if (ui.auditReplayCount != null) {
            const apiReplayCount = buildOperationalAuditReplay(
              ctx.tenantId,
              payload,
              40
            ).length;
            const replayDrift = Math.abs(apiReplayCount - ui.auditReplayCount);
            entries.push(
              createPredatorEntry({
                status: replayDrift <= FEED_SYNC_TOLERANCE ? "PASS" : "WARN",
                module: "Operational Event Ledger",
                step: "ui.audit_replay_sync",
                actual: {
                  api: apiReplayCount,
                  ui: ui.auditReplayCount,
                  drift: replayDrift,
                },
                tenantId: ctx.tenantId,
                role: ctx.role,
                userId: ctx.userId,
              })
            );
          }
        }

        backfillOperationalLedgerFromPayload(ctx.tenantId, payload);
        const replay = buildOperationalAuditReplay(ctx.tenantId, payload, 40);
        const chains = buildCorrelatedEventChains(ctx.tenantId, payload, 8);

        const orderedReplay =
          replay.length < 2 ||
          (Date.parse(replay[0]?.at || "") || 0) >=
            (Date.parse(replay[replay.length - 1]?.at || "") || 0);
        entries.push(
          createPredatorEntry({
            status:
              orderedReplay && replay.length > 0 ? "PASS" : replay.length === 0 ? "WARN" : "WARN",
            module: "Operational Event Ledger",
            step: "timeline.hydration",
            actual: { replayRows: replay.length, chains: chains.length },
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );

        const execModel = execModelForUi;
        const interventionIds = new Set(
          (execModel?.interventionQueues?.allIssues || []).map((i) => i.id)
        );
        const ledgerAfterBackfill = readOperationalLedger(ctx.tenantId);
        const orphanTasks = ledgerAfterBackfill.filter(
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

    return {
      module: "Operational Event Ledger",
      summary: summarizePredatorEntries(entries),
      entries,
    };
  });
}
