// Shared types and display helpers for the field module (no calculations: the database does those).
export type LiveStatus = "on_site" | "travelling" | "idle" | "offline" | "break" | "ended" | "not_started" | "on_leave";

export type LiveStaff = {
  id: string; name: string; code: string | null; designation: string | null; lat: number | null; lng: number | null;
  accuracy_m: number | null; last_at: string | null; battery: number | null; start_at: string | null; end_at: string | null;
  at_site: string | null; onsite_start: boolean | null; offsite_status: string | null; status: LiveStatus;
};

export const LIVE: Record<LiveStatus, { label: string; color: string; tone: string }> = {
  on_site:     { label: "On site",     color: "#059669", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  travelling:  { label: "Travelling",  color: "#2563eb", tone: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  idle:        { label: "Idle 30+ min", color: "#d97706", tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  offline:     { label: "Offline",     color: "#dc2626", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  break:       { label: "On break",    color: "#7c3aed", tone: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  ended:       { label: "Day ended",   color: "#71717a", tone: "bg-soft text-muted" },
  not_started: { label: "Not started", color: "#a1a1aa", tone: "bg-soft text-muted" },
  on_leave:    { label: "On leave",    color: "#0284c7", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
};

export type RoutePoint = [number, number, string, number | null, boolean, string]; // lat, lng, at, accuracy, mock, source
export type RouteVisit = {
  n: number; id: string; site_id: string | null; name: string; lat: number; lng: number; in_at: string; out_at: string | null;
  minutes: number; planned: boolean; plan_seq: number | null; notes: string | null; photos: string[]; form: Record<string, unknown>;
  flags: string[]; distance_m: number | null;
};
export type DutyDay = {
  id: string; employee_id: string; work_date: string; start_at: string; end_at: string | null; start_lat: number | null; start_lng: number | null;
  start_accuracy_m: number | null; start_address: string | null; start_selfie: string | null; start_distance_m: number | null;
  start_onsite: boolean; offsite_status: "n/a" | "pending" | "approved" | "rejected"; offsite_note: string | null;
  end_lat: number | null; end_lng: number | null; end_address: string | null; end_selfie: string | null; end_source: string | null;
  auto_closed: boolean; needs_review: boolean; flags: string[]; km_gps: number | null; km_adjusted: number | null; km_adjust_reason: string | null;
  face_score: number | null; paused: boolean;
};
export type DaySummary = {
  worked_min: number; break_min: number; status: string; late: boolean; late_min: number; onsite: boolean; offsite_status: string;
  km: number; km_gps: number; km_adjusted: number | null; visits_done: number; visits_planned: number; planned_done: number; unplanned: number;
};
export type Route = {
  duty: DutyDay | null; summary?: DaySummary; employee?: { id: string; name: string; code: string | null };
  points: RoutePoint[]; visits: RouteVisit[];
  plan: { seq: number; site_id: string; name: string; lat: number; lng: number; radius_m: number; visited: boolean }[];
  stops: { lat: number; lng: number; from: string; to: string; minutes: number }[];
  breaks: { from: string; to: string }[];
  events: { at: string; kind: string; details: Record<string, unknown> }[];
};

export type FieldException = { kind: string; severity: "high" | "medium" | "low"; employee_id: string; name: string; at: string | null; detail: string; duty_day_id: string };

export const EXCEPTION_LABEL: Record<string, string> = {
  offsite: "Off-site check-in", mock: "Mock GPS", gap: "Tracking gap", offline: "No location", device: "Phone / GPS",
  accuracy: "GPS / clock", missed: "Missed visit", autoclosed: "Auto-closed",
};

export function km(v: number | string | null | undefined) {
  const n = Number(v ?? 0);
  return `${n.toFixed(n >= 100 ? 0 : 1)} km`;
}

export function ago(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "—";
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
}

/** Signed URL for a private photo in the field-photos bucket (valid 1 hour). */
export async function photoUrl(sb: { storage: { from: (b: string) => { createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl: string } | null }> } } }, path: string | null) {
  if (!path) return null;
  const { data } = await sb.storage.from("field-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
