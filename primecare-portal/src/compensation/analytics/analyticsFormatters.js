export function str(value) {
  return String(value ?? "").trim();
}

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function roundMoney(value) {
  return Math.round(num(value) * 100) / 100;
}

export function roundPct(value) {
  return Math.round(num(value) * 100) / 100;
}

export function formatInr(value) {
  return `₹${roundMoney(value).toLocaleString("en-IN")}`;
}

export function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? str(value) : d.toLocaleDateString("en-IN");
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? str(value) : d.toLocaleString("en-IN");
}

export function ratioPct(numerator, denominator) {
  if (denominator <= 0) return 0;
  return roundPct((num(numerator) / num(denominator)) * 100);
}

export function snapshotField(line, key, fallback = 0) {
  return line?.calculation_snapshot?.[key] ?? fallback;
}
