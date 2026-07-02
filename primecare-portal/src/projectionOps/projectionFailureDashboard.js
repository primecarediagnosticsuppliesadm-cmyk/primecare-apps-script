/**
 * (5) Projection Failure Dashboard.
 */
export function buildFailureDashboard(healthRecords = []) {
  const failures = (healthRecords || [])
    .filter((r) => r.lastError || r.failureCount > 0)
    .map((r) => ({
      registryId: r.registryId,
      table: r.table,
      lastError: r.lastError,
      failureCount: r.failureCount,
      lastRebuild: r.lastRebuild,
      freshnessStatus: r.freshnessStatus,
    }));

  return {
    failures,
    summary: {
      activeErrors: failures.filter((f) => f.lastError).length,
      totalFailureCount: failures.reduce((s, f) => s + Number(f.failureCount || 0), 0),
      affectedProjections: failures.length,
    },
  };
}
