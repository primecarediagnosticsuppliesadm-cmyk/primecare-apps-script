import {
  getInventoryHealthRead,
  getInventoryLedgerRead,
} from "@/api/primecareSupabaseApi.js";
import { buildInventoryEconomicsModel } from "@/inventory/inventoryEconomicsEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * Load inventory + ledger reads and build economics model.
 * @param {{ distributorId?: string, distributorNames?: Map<string,string> }} [options]
 */
export async function loadInventoryEconomicsBundle(options = {}) {
  const [healthRes, ledgerRes] = await Promise.all([
    getInventoryHealthRead(),
    getInventoryLedgerRead(),
  ]);

  const inventoryRows = healthRes?.data?.rows || [];
  const ledgerRows = ledgerRes?.data?.movements || [];
  const ok = healthRes?.success === true && ledgerRes?.success === true;

  const model = buildInventoryEconomicsModel(inventoryRows, ledgerRows, {
    distributorId: options.distributorId,
    distributorNames: options.distributorNames,
  });

  return {
    ok,
    error: healthRes?.error || ledgerRes?.error || null,
    inventoryRows,
    ledgerRows,
    model,
  };
}

/**
 * @param {object[]} distributors
 */
export function distributorNamesFromRegistry(distributors = []) {
  return new Map(distributors.map((d) => [str(d.id), d.name || d.id]));
}
