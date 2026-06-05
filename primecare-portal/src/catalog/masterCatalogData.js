import { getLabCatalogRead } from "@/api/primecareSupabaseApi.js";
import { buildMasterCatalogModel } from "@/catalog/masterCatalogEngine.js";

/**
 * Load HQ master catalog (products HQ owns — distributors assign from this list).
 */
export async function loadMasterCatalog() {
  const res = await getLabCatalogRead();
  const products = res?.data?.products || [];
  const model = buildMasterCatalogModel(products);
  return {
    ok: res?.success !== false,
    error: res?.error || null,
    source: res?.data?.source || "hq_master",
    ...model,
  };
}
