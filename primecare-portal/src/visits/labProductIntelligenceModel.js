/** Year-1 incumbent product mix — visit wizard helpers. No CRM. */

export const PRODUCT_CATEGORY_OPTIONS = [
  { value: "edta", label: "EDTA tubes" },
  { value: "sst", label: "SST tubes" },
  { value: "gel", label: "Gel / clot tubes" },
  { value: "needles", label: "Needles" },
  { value: "gloves", label: "Gloves" },
  { value: "containers", label: "Sample containers" },
  { value: "urine", label: "Urine containers" },
  { value: "other", label: "Other" },
];

export const PAIN_POINT_OPTIONS = [
  { value: "price", label: "Price" },
  { value: "quality", label: "Quality" },
  { value: "availability", label: "Availability" },
  { value: "delivery", label: "Delivery" },
  { value: "credit", label: "Credit" },
  { value: "service", label: "Service" },
  { value: "other", label: "Other" },
];

export const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "as_needed", label: "As needed" },
  { value: "unknown", label: "Unknown" },
];

export const SWITCH_OPTIONS = [
  { value: "high", label: "High — willing to switch" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low — locked in" },
  { value: "unknown", label: "Unknown" },
];

function str(v) {
  return String(v ?? "").trim();
}

function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolFrom(v) {
  if (typeof v === "boolean") return v;
  const s = str(v).toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export function createEmptyProductLine() {
  return {
    clientKey: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    id: "",
    productCategory: "",
    brand: "",
    monthlyQuantity: "",
    currentSupplier: "",
    primaryPainPoint: "",
    skuSpec: "",
    packSize: "",
    currentPurchasePrice: "",
    purchaseFrequency: "",
    willingnessToSwitch: "",
    alternativeBrandOk: "",
    sampleRequested: false,
    sampleSku: "",
    sampleQuantity: "",
    sampleIssuedAt: "",
    expanded: false,
  };
}

export function mapProductIntelligenceFromRow(row) {
  if (!row) return createEmptyProductLine();
  return {
    clientKey: str(row.id) || createEmptyProductLine().clientKey,
    id: str(row.id),
    productCategory: str(row.product_category ?? row.productCategory),
    brand: str(row.brand),
    monthlyQuantity:
      row.monthly_quantity == null && row.monthlyQuantity == null
        ? ""
        : String(row.monthly_quantity ?? row.monthlyQuantity),
    currentSupplier: str(row.current_supplier ?? row.currentSupplier),
    primaryPainPoint: str(row.primary_pain_point ?? row.primaryPainPoint).toLowerCase(),
    skuSpec: str(row.sku_spec ?? row.skuSpec),
    packSize: str(row.pack_size ?? row.packSize),
    currentPurchasePrice:
      row.current_purchase_price == null && row.currentPurchasePrice == null
        ? ""
        : String(row.current_purchase_price ?? row.currentPurchasePrice),
    purchaseFrequency: str(row.purchase_frequency ?? row.purchaseFrequency).toLowerCase(),
    willingnessToSwitch: str(row.willingness_to_switch ?? row.willingnessToSwitch).toLowerCase(),
    alternativeBrandOk: str(row.alternative_brand_ok ?? row.alternativeBrandOk),
    sampleRequested: boolFrom(row.sample_requested ?? row.sampleRequested),
    sampleSku: str(row.sample_sku ?? row.sampleSku),
    sampleQuantity:
      row.sample_quantity == null && row.sampleQuantity == null
        ? ""
        : String(row.sample_quantity ?? row.sampleQuantity),
    sampleIssuedAt: str(row.sample_issued_at ?? row.sampleIssuedAt).slice(0, 10),
    expanded: Boolean(
      str(row.sku_spec ?? row.skuSpec) ||
        str(row.pack_size ?? row.packSize) ||
        row.current_purchase_price != null ||
        str(row.purchase_frequency ?? row.purchaseFrequency) ||
        str(row.willingness_to_switch ?? row.willingnessToSwitch) ||
        str(row.alternative_brand_ok ?? row.alternativeBrandOk) ||
        boolFrom(row.sample_requested ?? row.sampleRequested) ||
        str(row.sample_sku ?? row.sampleSku)
    ),
  };
}

export function isProductLineCaptured(line) {
  if (!line) return false;
  return Boolean(
    str(line.productCategory) ||
      str(line.brand) ||
      str(line.currentSupplier) ||
      str(line.monthlyQuantity) ||
      str(line.primaryPainPoint)
  );
}

export function countCapturedProductLines(lines) {
  return (lines || []).filter(isProductLineCaptured).length;
}

export function productLineSummary(line) {
  const cat =
    PRODUCT_CATEGORY_OPTIONS.find((o) => o.value === str(line.productCategory))?.label ||
    str(line.productCategory) ||
    "Product";
  const brand = str(line.brand);
  const supplier = str(line.currentSupplier);
  const parts = [cat];
  if (brand) parts.push(brand);
  if (supplier) parts.push(supplier);
  return parts.join(" · ");
}

export function mapProductLineToWriteRow(line, ctx = {}) {
  const monthly = numOrNull(line.monthlyQuantity);
  const price = numOrNull(line.currentPurchasePrice);
  const sampleQty = numOrNull(line.sampleQuantity);
  const sampleSku = str(line.sampleSku);
  const sampleIssuedAt = str(line.sampleIssuedAt).slice(0, 10);
  const sampleRequested = Boolean(line.sampleRequested) || Boolean(sampleSku || sampleQty || sampleIssuedAt);

  const row = {
    tenant_id: str(ctx.tenantId),
    lab_id: str(ctx.labId),
    source_visit_id: str(ctx.visitId) || null,
    agent_id: str(ctx.agentId) || null,
    product_category: str(line.productCategory) || null,
    brand: str(line.brand) || null,
    monthly_quantity: monthly,
    current_supplier: str(line.currentSupplier) || null,
    primary_pain_point: str(line.primaryPainPoint).toLowerCase() || null,
    sku_spec: str(line.skuSpec) || null,
    pack_size: str(line.packSize) || null,
    current_purchase_price: price,
    purchase_frequency: str(line.purchaseFrequency).toLowerCase() || null,
    willingness_to_switch: str(line.willingnessToSwitch).toLowerCase() || null,
    alternative_brand_ok: str(line.alternativeBrandOk) || null,
    sample_requested: sampleRequested,
    sample_sku: sampleSku || null,
    sample_quantity: sampleQty,
    sample_issued_at: sampleIssuedAt || null,
  };
  if (str(line.id)) row.id = str(line.id);
  return row;
}
