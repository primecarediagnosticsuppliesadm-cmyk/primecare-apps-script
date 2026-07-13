/**
 * (7) Projection Shadow Monitoring.
 */
export function buildShadowMonitoring(healthRecords = []) {
  const items = (healthRecords || []).map((r) => ({
    registryId: r.registryId,
    registryStatus: r.status,
    shadowStatus: r.shadowStatus,
    featureFlag: r.featureFlag,
    featureFlagStatus: r.featureFlagStatus,
    adapterRpc: r.adapterRpc,
    adapterLive: r.featureFlagStatus === "OFF",
  }));

  const flagsOn = items.filter((i) => i.featureFlagStatus === "ON");
  const shadowMode = items.every((i) => i.featureFlagStatus !== "ON");

  return {
    items,
    summary: {
      shadowMode,
      flagsOnCount: flagsOn.length,
      flagsOn: flagsOn.map((i) => i.featureFlag).filter(Boolean),
      deployedCount: items.length,
      message: shadowMode
        ? "All adapter flags OFF — shadow mode active"
        : `WARNING: ${flagsOn.length} adapter flag(s) ON`,
    },
  };
}
