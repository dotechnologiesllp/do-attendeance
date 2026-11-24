// Display helpers. Pure functions: no money or attendance is *calculated* here,
// only formatted. The database does every calculation.

export const TZ_DEFAULT = "Asia/Kolkata";

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Paise (number | string | numeric) → "₹1,153.85". */
export function rupees(paise: number | string | null | undefined, opts: { whole?: boolean; symbol?: string } = {}) {
  const p = Number(paise ?? 0);
  const r = p / 100;
  const sym = opts.symbol ?? "₹";
  const sign = r < 0 ? "−" : "";
  const abs = Math.abs(r);
  const body = opts.whole || Number.isInteger(abs) ? (Number.isInteger(abs) ? inr0.format(abs) : inr.format(abs)) : inr.format(abs);
  return `${sign}${sym}${body}`;
}

/** Always two decimals: "₹562.50". */
export function rupees2(paise: number | string | null | undefined, symbol = "₹") {
  const r = Number(paise ?? 0) / 100;
  return `${r < 0 ? "−" : ""}${symbol}${inr.format(Math.abs(r))}`;
}

/** Rupees input string → integer paise (exact; no float drift). */
export function toPaise(input: string | number): number {
  const s = String(input).replace(/[,₹\s]/g, "");
  if (!/^-?\d*(\.\d{0,2})?$/.test(s) || s === "" || s === "-") return NaN;
  const [whole, frac = ""] = s.replace("-", "").split(".");
  const v = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return s.startsWith("-") ? -v : v;
}

export function num(n: number | string | null | undefined, digits = 2) {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(digits).replace(/\.?0+$/, "");
}

/** 525 → "8h 45m" */
export function hm(minutes: number | null | undefined) {
  const m = Math.max(0, Math.floor(Number(minutes ?? 0)));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export function timeOf(iso: string | null | undefined, tz = TZ_DEFAULT) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date(iso));
}

export function dateLabel(d: string | Date, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }, tz = TZ_DEFAULT) {
  const date = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00Z") : new Date(d);
  return new Intl.DateTimeFormat("en-IN", { ...opts, timeZone: typeof d === "string" && d.length === 10 ? "UTC" : tz }).format(date);
}

export function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month.slice(0, 7) + "-01T12:00:00Z"));
}

/** Today's date (YYYY-MM-DD) in a timezone. */
export function todayIn(tz = TZ_DEFAULT, at: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export function monthStart(ymd: string) {
  return ymd.slice(0, 7) + "-01";
}

export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/** Offset (minutes) of a timezone at a given instant, e.g. Asia/Kolkata → 330. */
export function tzOffsetMinutes(tz: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** Wall-clock date + time in `tz` → ISO instant. ("2026-08-03", "09:00", Asia/Kolkata) → "2026-08-03T03:30:00.000Z" */
export function zonedToIso(ymd: string, hhmm: string, tz = TZ_DEFAULT) {
  const [y, mo, d] = ymd.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off = tzOffsetMinutes(tz, new Date(guess));
  const first = guess - off * 60000;
  const off2 = tzOffsetMinutes(tz, new Date(first));
  return new Date(guess - off2 * 60000).toISOString();
}

/** ISO instant → "HH:MM" in tz (for <input type=time>). */
export function isoToHHMM(iso: string | null | undefined, tz = TZ_DEFAULT) {
  return iso ? timeOf(iso, tz) : "";
}

export function metres(m: number) {
  if (!Number.isFinite(m)) return "—";
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export const STATUS_LABEL: Record<string, string> = {
  present: "Present", half_day: "Half day", absent: "Absent", leave: "On leave", half_leave: "Half-day leave",
  half_leave_absent: "Half leave · absent", holiday: "Holiday", weekly_off: "Weekly off", upcoming: "—",
  in_progress: "In progress", not_employed: "Not employed",
};

/** Tailwind classes for a day status chip / calendar cell. */
export const STATUS_TONE: Record<string, string> = {
  present: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  in_progress: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  half_day: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  half_leave: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  half_leave_absent: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  leave: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  absent: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  holiday: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  weekly_off: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
  upcoming: "text-zinc-400 dark:text-zinc-600",
  not_employed: "text-zinc-400 dark:text-zinc-600",
};

export function csvEscape(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
}

/** Minimal RFC 4180 CSV parser (quotes, commas and newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) out.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) out.push(row);
  return out;
}

export function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const LEAVE_TONE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  cancelled: "bg-soft text-muted",
};
