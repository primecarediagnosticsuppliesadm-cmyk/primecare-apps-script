import { LAB_CONTRACT_VERSION } from "@/labContract/labContractTypes.js";

const REGISTRY_PREFIX = "primecare_lab_contract_registry_v1";

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function registryKey(tenantId) {
  return `${REGISTRY_PREFIX}:${tenantId || "default"}`;
}

export function readLabContractRegistry(tenantId) {
  if (typeof window === "undefined") {
    return { contracts: [], updatedAt: null, version: LAB_CONTRACT_VERSION };
  }
  const data = safeParse(window.localStorage.getItem(registryKey(tenantId)), {
    contracts: [],
  });
  return {
    contracts: Array.isArray(data.contracts) ? data.contracts : [],
    updatedAt: data.updatedAt || null,
    version: data.version || LAB_CONTRACT_VERSION,
  };
}

export function writeLabContractRegistry(tenantId, registry) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    registryKey(tenantId),
    JSON.stringify({
      ...registry,
      version: LAB_CONTRACT_VERSION,
      updatedAt: new Date().toISOString(),
    })
  );
}

export function upsertLabContract(tenantId, contract) {
  const registry = readLabContractRegistry(tenantId);
  const idx = registry.contracts.findIndex((c) => c.id === contract.id);
  const next = [...registry.contracts];
  if (idx >= 0) next[idx] = contract;
  else next.push(contract);
  writeLabContractRegistry(tenantId, { ...registry, contracts: next });
  return contract;
}

export function getLabContractById(tenantId, contractId) {
  return readLabContractRegistry(tenantId).contracts.find((c) => c.id === contractId) || null;
}

export function deleteLabContract(tenantId, contractId) {
  const registry = readLabContractRegistry(tenantId);
  writeLabContractRegistry(tenantId, {
    ...registry,
    contracts: registry.contracts.filter((c) => c.id !== contractId),
  });
}
