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
