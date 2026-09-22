/**
 * My Business reporting calendar — Asia/Kolkata civil dates.
 * Founder and Agent must share these boundaries. Not browser-local.
 */

export const MY_BUSINESS_TIME_ZONE = "Asia/Kolkata";

export const MY_BUSINESS_RANGE_PRESETS = Object.freeze([
  "today",
  "this_week",
  "this_month",
  "previous_month",
  "custom",
]);

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {string} ymd
 */
export function isValidYmd(ymd) {
  const m = YMD_RE.exec(String(ymd || ""));
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * @param {Date} [date]
 * @param {string} [timeZone]
 */
export function formatYmdInTimeZone(date = new Date(), timeZone = MY_BUSINESS_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date instanceof Date ? date : new Date(date));
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

/**
 * @param {string} ymd
 * @param {number} days
 */
export function addDaysYmd(ymd, days) {
  const m = YMD_RE.exec(String(ymd || ""));
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + Number(days)));
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/**
 * Monday=0 … Sunday=6 for an IST civil date.
 * @param {string} ymd
 */
export function weekdayMon0Ist(ymd) {
  const m = YMD_RE.exec(String(ymd || ""));
  if (!m) return 0;
  // 12:00 IST = 06:30 UTC on the same civil date (IST has no DST).
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 6, 30));
  return (dt.getUTCDay() + 6) % 7;
}

function monthStartYmd(ymd) {
  return `${String(ymd).slice(0, 7)}-01`;
}

function monthEndYmd(ymd) {
  const start = monthStartYmd(ymd);
  const next = addDaysYmd(`${start.slice(0, 7)}-28`, 10);
  const nextMonthStart = monthStartYmd(next);
  return addDaysYmd(nextMonthStart, -1);
}

/**
 * @param {object} input
 * @param {"today"|"this_week"|"this_month"|"previous_month"|"custom"} input.preset
 * @param {string} [input.from]
 * @param {string} [input.to]
 * @param {Date} [input.now]
 */
export function resolveMyBusinessRange(input = {}) {
  const preset = MY_BUSINESS_RANGE_PRESETS.includes(input.preset)
    ? input.preset
    : "this_month";
  const today = formatYmdInTimeZone(input.now || new Date());

  if (preset === "today") {
    return { preset, from: today, to: today, timeZone: MY_BUSINESS_TIME_ZONE, todayYmd: today };
  }
  if (preset === "this_week") {
    const monOffset = weekdayMon0Ist(today);
    const from = addDaysYmd(today, -monOffset);
    return { preset, from, to: today, timeZone: MY_BUSINESS_TIME_ZONE, todayYmd: today };
  }
  if (preset === "this_month") {
    return {
      preset,
      from: monthStartYmd(today),
      to: today,
      timeZone: MY_BUSINESS_TIME_ZONE,
      todayYmd: today,
    };
  }
  if (preset === "previous_month") {
    const thisStart = monthStartYmd(today);
    const prevEnd = addDaysYmd(thisStart, -1);
    return {
      preset,
      from: monthStartYmd(prevEnd),
      to: prevEnd,
      timeZone: MY_BUSINESS_TIME_ZONE,
      todayYmd: today,
    };
  }

  const from = isValidYmd(input.from) ? input.from : today;
  const to = isValidYmd(input.to) ? input.to : today;
  if (from > to) {
    return { preset: "custom", from: to, to: from, timeZone: MY_BUSINESS_TIME_ZONE, todayYmd: today };
  }
  return { preset: "custom", from, to, timeZone: MY_BUSINESS_TIME_ZONE, todayYmd: today };
}

/**
 * @param {string} ymd
 * @param {string} from
 * @param {string} to
 */
export function ymdInInclusiveRange(ymd, from, to) {
  const d = String(ymd || "").slice(0, 10);
  if (!isValidYmd(d) || !isValidYmd(from) || !isValidYmd(to)) return false;
  return d >= from && d <= to;
}

/**
 * @param {object} range
 */
export function formatMyBusinessRangeLabel(range = {}) {
  const from = range.from || "";
  const to = range.to || "";
  if (range.preset === "today") return `Today (${from})`;
  if (from && to && from === to) return from;
  if (from && to) return `${from} → ${to}`;
  return "Period";
}
