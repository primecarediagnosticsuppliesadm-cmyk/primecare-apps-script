import { enrichCatalogWithProductMetadata, getLabCatalogRead } from "@/api/primecareSupabaseApi.js";
import { buildMasterCatalogModel } from "@/catalog/masterCatalogEngine.js";

/**
 * Load HQ master catalog (products HQ owns — distributors assign from this list).
 * @param {{ tenantId?: string|null }} [options]
 */
export async function loadMasterCatalog(options = {}) {
  const tenantId = String(options.tenantId ?? options.tenant_id ?? "").trim() || null;
  const res = await getLabCatalogRead({ tenantId });
  const rawProducts = res?.data?.products || [];
  const products = tenantId
    ? await enrichCatalogWithProductMetadata(rawProducts, tenantId)
    : rawProducts;
  const model = buildMasterCatalogModel(products);
  return {
    ok: res?.success !== false,
    error: res?.error || null,
    source: res?.data?.source || "hq_master",
    ...model,
  };
}
