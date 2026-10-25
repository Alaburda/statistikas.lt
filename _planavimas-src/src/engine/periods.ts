// Dates and planning periods. Every date is a UTC day number (days since
// 1970-01-01); every period is an integer index so series can be aligned with
// plain array arithmetic:
//   day   → the day number
//   week  → ISO week (Monday start): floor((day + 3) / 7)
//   month → year * 12 + (month - 1)

export type Freq = "day" | "week" | "month";

export const FREQ_LABEL: Record<Freq, string> = {
  day: "diena",
  week: "savaitė",
  month: "mėnuo",
};

/** Natural seasonal period for each frequency (weekly within days, yearly otherwise). */
export const SEASON: Record<Freq, number> = { day: 7, week: 52, month: 12 };

const MS_DAY = 86_400_000;

export function dayFromYmd(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / MS_DAY);
}

export function ymdFromDay(day: number): [number, number, number] {
  const dt = new Date(day * MS_DAY);
  return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
}

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const [yy, mm, dd] = ymdFromDay(dayFromYmd(y, m, d));
  return yy === y && mm === m && dd === d;
}

/** Day number of the Monday of ISO week `w` in ISO year `y`. */
function isoWeekMonday(y: number, w: number): number {
  const jan4 = dayFromYmd(y, 1, 4);
  const jan4Dow = (((jan4 + 3) % 7) + 7) % 7; // 0 = Monday
  return jan4 - jan4Dow + (w - 1) * 7;
}

/** How a date column is written; detected once per column so "03/04" is read consistently. */
export type DateOrder = "dmy" | "mdy";

/**
 * Pick the day/month order for slash- or dot-separated dates: month-first only
 * when some value cannot be day-first (second part > 12) and none forbids it.
 */
export function detectDateOrder(values: string[]): DateOrder {
  let dayFirstImpossible = false;
  let monthFirstImpossible = false;
  for (const v of values) {
    const m = v.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (!m) continue;
    if (Number(m[1]) > 12) monthFirstImpossible = true;
    if (Number(m[2]) > 12) dayFirstImpossible = true;
  }
  return dayFirstImpossible && !monthFirstImpossible ? "mdy" : "dmy";
}

/**
 * Parse one date cell into a day number, or null. Accepts ISO dates (with an
 * optional time), "2024.03.05", "05.03.2024", "05/03/2024", "2024-03"
 * (month start), "2024-W10" (ISO week Monday) and Excel serial numbers.
 */
export function parseDate(raw: string, order: DateOrder = "dmy"): number | null {
  const s = raw.trim();
  if (s === "") return null;
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? dayFromYmd(y, mo, d) : null;
  }
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:[T\s].*)?$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const [d, mo] = order === "dmy" ? [a, b] : [b, a];
    return validYmd(y, mo, d) ? dayFromYmd(y, mo, d) : null;
  }
  m = s.match(/^(\d{4})-?W(\d{1,2})$/i);
  if (m) {
    const w = Number(m[2]);
    return w >= 1 && w <= 53 ? isoWeekMonday(Number(m[1]), w) : null;
  }
  m = s.match(/^(\d{4})[-./](\d{1,2})$/);
  if (m) {
    const [y, mo] = [Number(m[1]), Number(m[2])];
    return validYmd(y, mo, 1) ? dayFromYmd(y, mo, 1) : null;
  }
  // Excel serial date (1955–2119); Excel's day 0 is 1899-12-30.
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(Number(s));
    if (serial >= 20000 && serial <= 80000) return serial - 25569;
  }
  return null;
}

export function periodOf(day: number, freq: Freq): number {
  if (freq === "day") return day;
  if (freq === "week") return Math.floor((day + 3) / 7);
  const [y, m] = ymdFromDay(day);
  return y * 12 + (m - 1);
}

/** First day of a period. */
export function periodStart(p: number, freq: Freq): number {
  if (freq === "day") return p;
  if (freq === "week") return p * 7 - 3;
  return dayFromYmd(Math.floor(p / 12), (p % 12) + 1, 1);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isoDate(day: number): string {
  const [y, m, d] = ymdFromDay(day);
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** ISO week number and ISO year of a day. */
function isoWeek(day: number): [number, number] {
  const dow = (((day + 3) % 7) + 7) % 7; // 0 = Monday
  const thursday = day - dow + 3;
  const [y] = ymdFromDay(thursday);
  return [y, Math.floor((thursday - dayFromYmd(y, 1, 1)) / 7) + 1];
}

/** Label for tables and exports: "2024-03-05", "2024-W10" or "2024-03". */
export function periodLabel(p: number, freq: Freq): string {
  if (freq === "day") return isoDate(p);
  if (freq === "week") {
    const [y, w] = isoWeek(periodStart(p, freq));
    return `${y}-W${pad(w)}`;
  }
  return `${Math.floor(p / 12)}-${pad((p % 12) + 1)}`;
}

const LT_MONTHS = ["saus.", "vas.", "kov.", "bal.", "geg.", "birž.", "liep.", "rugp.", "rugs.", "spal.", "lapkr.", "gruod."];

/** Short axis label: "2024 kov." for months, ISO date of the Monday/day otherwise. */
export function periodShort(p: number, freq: Freq): string {
  if (freq === "month") return `${Math.floor(p / 12)} ${LT_MONTHS[p % 12]}`;
  return isoDate(periodStart(p, freq));
}

/** Season position of a period (0 … m−1), used for seasonal dummies and calendars. */
export function seasonIndex(p: number, freq: Freq): number {
  if (freq === "month") return p % 12;
  if (freq === "day") return ((p + 3) % 7 + 7) % 7; // weekday, Monday = 0
  return Math.min(51, isoWeek(periodStart(p, freq))[1] - 1);
}

/** Guess the data frequency from the median gap between distinct dates. */
export function detectFreq(days: number[]): Freq {
  const uniq = [...new Set(days)].sort((a, b) => a - b);
  if (uniq.length < 3) return "month";
  const gaps: number[] = [];
  for (let i = 1; i < uniq.length; i++) gaps.push(uniq[i] - uniq[i - 1]);
  gaps.sort((a, b) => a - b);
  const med = gaps[Math.floor(gaps.length / 2)];
  if (med <= 1.5) return "day";
  if (med <= 10) return "week";
  return "month";
}

/** Frequencies the data can be shown at: its own and every coarser one. */
export function coarserOrEqual(freq: Freq): Freq[] {
  return freq === "day" ? ["day", "week", "month"] : freq === "week" ? ["week", "month"] : ["month"];
}
