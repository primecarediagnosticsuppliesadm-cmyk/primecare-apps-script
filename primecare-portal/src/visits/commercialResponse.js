/**
 * Preview of the agent-visible commercial text.
 * The database function resolve_visit_handoff_commercial builds the stored text.
 * This preview uses the same labels and never includes supplier, cost, or the HQ note.
 */

function str(v) {
  return String(v ?? "").trim();
}

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2);
}

function qtyText(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(n);
}

export function composeAgentVisibleCommercialText({
  decision = "",
  productId = "",
  productName = "",
  specification = "",
  quantity = "",
  packUom = "",
  availability = "",
  leadTime = "",
  sellingPrice = "",
  validUntil = "",
  agentResponse = "",
} = {}) {
  const kind = str(decision).toUpperCase();
  const label =
    kind === "YES" ? "YES" : kind === "NO" ? "NO" : kind === "NEED_MORE_INFORMATION" ? "NEED MORE INFORMATION" : "";
  if (!label) return "";
  const lines = [`Decision: ${label}`];
  const spec = str(specification);
  const next = str(agentResponse);
  if (kind === "YES") {
    const id = str(productId);
    const name = str(productName) || id;
    if (id) lines.push(`Product: ${name} (${id})`);
    if (spec) lines.push(`Specification: ${spec}`);
    const qty = qtyText(quantity);
    if (qty) lines.push(`Quantity: ${qty}`);
    const pack = str(packUom);
    if (pack) lines.push(`Pack: ${pack}`);
    const price = money(sellingPrice);
    if (price) lines.push(`Selling price: ${price}`);
    const avail = str(availability);
    if (avail) lines.push(`Availability: ${avail}`);
    const lead = str(leadTime);
    if (lead) lines.push(`Lead time: ${lead}`);
    const until = str(validUntil).slice(0, 10);
    if (until) lines.push(`Valid until: ${until}`);
  } else if (spec) {
    lines.push(`Specification: ${spec}`);
  }
  if (next) lines.push(`Next action: ${next}`);
  return lines.join("\n");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatValidUntil(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(value));
  if (!match) return "";
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return "";
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function formatInr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const hasFraction = Math.round(amount * 100) % 100 !== 0;
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function productNameFromVisibleText(text) {
  const match = str(text).match(/^Product:\s*(.+?)\s*\([^)]+\)\s*$/m);
  return match ? match[1].trim() : "";
}

function nextActionFromVisibleText(text) {
  const match = str(text).match(/Next action:\s*([\s\S]*)$/);
  return match ? match[1].trim() : "";
}

/**
 * Agent card fields. Purchase cost, supplier, margin, and the HQ note are not inputs.
 */
export function presentAgentCommercialTerms(row) {
  if (!row) return null;
  const decision = str(row.decision).toUpperCase();
  if (decision !== "YES" && decision !== "NO" && decision !== "NEED_MORE_INFORMATION") return null;
  const visible = str(row.agent_visible_text ?? row.agentVisibleText);
  const nextAction = nextActionFromVisibleText(visible);
  if (decision !== "YES") {
    return {
      decision,
      product: "",
      pack: "",
      price: "",
      availability: "",
      leadTime: "",
      validUntil: "",
      specification: str(row.specification),
      nextAction,
    };
  }
  const quantity = qtyText(row.quantity);
  const pack = str(row.pack_uom ?? row.packUom);
  return {
    decision,
    product: productNameFromVisibleText(visible) || str(row.specification) || str(row.product_id ?? row.productId),
    pack: pack ? [quantity, pack].filter(Boolean).join(" × ") : "",
    price: formatInr(row.selling_price ?? row.sellingPrice),
    availability: str(row.availability),
    leadTime: str(row.lead_time ?? row.leadTime),
    validUntil: formatValidUntil(row.valid_until ?? row.validUntil),
    specification: "",
    nextAction,
  };
}

/** Lines the agent card actually renders. Empty values are omitted. */
export function commercialTermLines(terms) {
  if (!terms) return [];
  const lines = [];
  if (str(terms.specification)) lines.push({ label: "", value: str(terms.specification) });
  if (str(terms.product)) lines.push({ label: "PRODUCT", value: str(terms.product) });
  if (str(terms.product) && str(terms.pack)) lines.push({ label: "Pack", value: str(terms.pack) });
  if (str(terms.price)) lines.push({ label: "PRIMECARE PRICE", value: str(terms.price) });
  if (str(terms.availability)) lines.push({ label: "AVAILABILITY", value: str(terms.availability) });
  if (str(terms.leadTime)) lines.push({ label: "LEAD TIME", value: str(terms.leadTime) });
  if (str(terms.validUntil)) lines.push({ label: "PRICE VALID UNTIL", value: str(terms.validUntil) });
  if (str(terms.nextAction)) lines.push({ label: "NEXT ACTION", value: str(terms.nextAction) });
  return lines;
}
