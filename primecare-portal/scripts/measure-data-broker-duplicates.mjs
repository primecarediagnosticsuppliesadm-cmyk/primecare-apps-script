#!/usr/bin/env node
/**
 * Sprint 7A — shared data broker duplicate-read probe.
 *
 * Read-only synthetic measurement: no Supabase calls. Exercises the same broker
 * in-flight and TTL cache path used by page reads.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const asJson = process.argv.includes("--json");

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function print(status, id, detail) {
  const line = `${status.padEnd(5)} ${id}: ${detail}`;
  if (status === "FAIL") console.error(line);
  else console.log(line);
}

async function main() {
  const server = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "error",
  });

  try {
    const broker = await server.ssrLoadModule("/src/api/sharedReadBroker.js");
    broker.resetSharedReadBrokerStats({ clearCache: true });

    let loaderCalls = 0;
    const loader = async () => {
      loaderCalls += 1;
      await delay(25);
      return { success: true, data: { rows: ["ok"], call: loaderCalls } };
    };

    const baseConfig = {
      source: "measure-broker",
      logicalKey: { tenantId: "TENANT_A", page: "orders" },
      scope: {
        tenantId: "TENANT_A",
        role: "admin",
        userId: "probe-admin",
      },
      loader,
      fallbackData: { rows: [] },
    };

    const concurrent = await Promise.all([
      broker.readBrokerProbe(baseConfig),
      broker.readBrokerProbe(baseConfig),
      broker.readBrokerProbe(baseConfig),
    ]);
    const afterConcurrent = loaderCalls;
    const cached = await broker.readBrokerProbe(baseConfig);
    const afterCached = loaderCalls;
    const forced = await Promise.all([
      broker.readBrokerProbe({ ...baseConfig, force: true }),
      broker.readBrokerProbe({ ...baseConfig, force: true }),
    ]);
    const afterForced = loaderCalls;
    const stats = broker.getSharedReadBrokerStats();

    const rows = [
      {
        id: "inflight.dedupe",
        ok: afterConcurrent === 1 && concurrent.every((r) => r.success),
        detail: `loader calls after 3 concurrent reads = ${afterConcurrent}`,
      },
      {
        id: "ttl.cache",
        ok: afterCached === 1 && cached.cacheHit === true,
        detail: `loader calls after cached read = ${afterCached}; cacheHit=${cached.cacheHit}`,
      },
      {
        id: "force.inflight",
        ok: afterForced === 2 && forced.every((r) => r.success),
        detail: `loader calls after 2 concurrent force reads = ${afterForced}`,
      },
      {
        id: "envelope.shape",
        ok: concurrent.every(
          (r) =>
            "success" in r &&
            "data" in r &&
            "readFailed" in r &&
            "degraded" in r &&
            "source" in r &&
            "durationMs" in r
        ),
        detail: "broker reads expose success/data/readFailed/degraded/source/durationMs",
      },
    ];

    const failed = rows.filter((row) => !row.ok);
    if (asJson) {
      console.log(JSON.stringify({ rows, stats, ok: failed.length === 0 }, null, 2));
    } else {
      console.log("\n# Data broker duplicate-read probe\n");
      for (const row of rows) {
        print(row.ok ? "PASS" : "FAIL", row.id, row.detail);
      }
      console.log("\n# Broker stats");
      console.log(JSON.stringify(stats, null, 2));
      console.log(failed.length ? "\nNO-GO: broker duplicate suppression failed." : "\nGO: broker duplicate suppression passed.");
    }
    process.exitCode = failed.length ? 1 : 0;
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error("FAIL  measure-data-broker-duplicates:", err?.message || err);
  process.exit(1);
});
