"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, MapPin, Pause, Play } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { freshPosition, haversine, useGeolocation } from "@/lib/geo";
import { friendlyError } from "@/lib/errors";
import { hm, timeOf, TZ_DEFAULT } from "@/lib/format";
import { Button, Input, Spinner, useToast } from "@/components/ui";

type Plan = {
  seq: number; site_id: string; name: string; lat: number; lng: number; radius_m: number; address: string | null;
  visit: { id: string; in_at: string; out_at: string | null } | null;
};
type Visit = { id: string; site_id: string | null; name: string; planned: boolean; in_at: string; out_at: string | null };
type FieldToday = {
  server_now: string; today: string;
  settings: { track_interval_min: number; track_distance_m: number; block_mock: boolean; timezone: string };
  profile: { full_name: string; consent_at: string | null; staff_type: "office" | "field" };
  on_leave: boolean;
  duty: { id: string; work_date: string; start_at: string; end_at: string | null; paused: boolean; onsite: boolean; offsite_status: string; flags: string[] } | null;
  summary: { worked_min: number; break_min: number; late: boolean; late_min: number; km: number; visits_done: number; visits_planned: number; planned_done: number; unplanned: number; status: string } | null;
  plan: Plan[]; visits: Visit[];
};
type SyncResult = { ok?: boolean; error?: string; onsite?: boolean; [k: string]: unknown };

/** A stable id for this browser. (A web page cannot read the phone's boot id, so this never changes.) */
function deviceId() {
  try {
    let v = localStorage.getItem("device_id");
    if (!v) { v = crypto.randomUUID(); localStorage.setItem("device_id", v); }
    return v;
  } catch { return "web-device"; }
}
function mk(type: string, extra: Record<string, unknown> = {}) {
  return { client_id: crypto.randomUUID(), type, device_at: new Date().toISOString(), mono_ms: Math.round(performance.now()), boot_id: deviceId(), ...extra };
}
/** The only write path: the database places each event at server time and runs every rule. */
async function sync(events: object[]): Promise<SyncResult[]> {
  const { data, error } = await supabaseBrowser().rpc("field_sync", { p_events: events, p_mono_now_ms: Math.round(performance.now()), p_boot_id: deviceId() });
  if (error) throw error;
  return ((data as { results?: SyncResult[] })?.results) ?? [];
}
function one(results: SyncResult[]): SyncResult {
  const r = results[0];
  if (!r || !r.ok) throw new Error(String(r?.error ?? "Something went wrong"));
  return r;
}
function fieldError(e: unknown): string {
  const msg = typeof e === "string" ? e : (e as { message?: string })?.message ?? "";
  const m = msg.match(/^OUTSIDE_RADIUS:\s*(\d+):\s*(\d+)/);
  if (m) return `You are ${m[1]} m from the site. Move within ${m[2]} m.`;
  return friendlyError(e);
}

async function toJpeg(file: File, max = 800): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not read the photo"))), "image/jpeg", 0.7));
}
async function uploadSelfie(file: File, kind: "start" | "end", day: string): Promise<string> {
  const sb = supabaseBrowser();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Please sign in again");
  const blob = await toJpeg(file);
  const path = `${user.id}/${day}/${kind}-${Date.now()}.jpg`;
  const { error } = await sb.storage.from("field-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export default function FieldHome() {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<FieldToday | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState("");
  const [place, setPlace] = useState("");
  const geo = useGeolocation();
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<"start" | "end" | null>(null);
  const lastPoint = useRef<{ t: number; lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    const { data: d, error } = await supabaseBrowser().rpc("my_field_today");
    if (error) { setLoadError(friendlyError(error)); return; }
    setData(d as FieldToday); setLoadError(null);
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 60_000);
    const v = () => !document.hidden && load();
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", v); };
  }, [load]);

  // Office staff do not use this page.
  useEffect(() => { if (data && data.profile.staff_type !== "field") router.replace("/"); }, [data, router]);

  const running = !!data?.duty && !data.duty.end_at && !data.duty.paused;
  const interval = data?.settings.track_interval_min ?? 5;
  const moveDist = data?.settings.track_distance_m ?? 200;

  // Route tracking: only while this page is open and the screen is on (a web page cannot track in the background).
  useEffect(() => {
    if (!running) return;
    const id = setInterval(async () => {
      const g = geoRef.current;
      if (g.kind !== "fix" || Date.now() - g.at > 120_000) return;
      const last = lastPoint.current, now = Date.now();
      const moved = last ? haversine(last.lat, last.lng, g.lat, g.lng) : Infinity;
      if (last && now - last.t < interval * 60_000 && moved < moveDist) return;
      lastPoint.current = { t: now, lat: g.lat, lng: g.lng };
      try { await sync([mk("point", { lat: g.lat, lng: g.lng, accuracy: g.accuracy, mock: g.mocked, source: moved >= moveDist ? "movement" : "interval" })]); } catch { /* retried at the next tick */ }
    }, 20_000);
    return () => clearInterval(id);
  }, [running, interval, moveDist]);

  // Keep the screen on during duty so tracking continues.
  useEffect(() => {
    if (!running) return;
    type Lock = { release: () => Promise<void> };
    const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<Lock> } };
    let lock: Lock | null = null;
    const req = async () => { try { lock = (await nav.wakeLock?.request("screen")) ?? null; } catch { /* not supported */ } };
    req();
    const onVis = () => { if (!document.hidden) req(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); lock?.release().catch(() => {}); };
  }, [running]);

  async function currentFix() {
    const g = geoRef.current;
    if (g.kind === "fix" && Date.now() - g.at < 10_000) return { lat: g.lat, lng: g.lng, accuracy: g.accuracy, mock: g.mocked };
    const p = await freshPosition();
    const mock = Boolean((p as unknown as { mocked?: boolean }).mocked || (p.coords as unknown as { mocked?: boolean }).mocked);
    return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, mock };
  }
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await fn(); await load(); } catch (e) { toast(fieldError(e), "error"); } finally { setBusy(false); }
  }

  function askSelfie(kind: "start" | "end") { pending.current = kind; fileRef.current?.click(); }
  function onSelfie(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    const kind = pending.current;
    pending.current = null;
    if (!f || !kind || !data) return;
    act(async () => {
      const fix = await currentFix();
      const path = await uploadSelfie(f, kind, data.today);
      const r = one(await sync([mk(kind, { ...fix, selfie: path })]));
      if (kind === "start") {
        lastPoint.current = { t: Date.now(), lat: fix.lat, lng: fix.lng };
        toast(r.onsite ? "Day started" : "Day started. You are away from your first site, so your manager will review it.");
      } else toast("Day ended. Good work.");
    });
  }
  const togglePause = () => act(async () => {
    const g = geoRef.current;
    const pos = g.kind === "fix" ? { lat: g.lat, lng: g.lng, accuracy: g.accuracy, mock: g.mocked } : {};
    one(await sync([mk(data?.duty?.paused ? "resume" : "pause", pos)]));
  });
  const visitIn = (site_id: string | null, place_name?: string) => act(async () => {
    const fix = await currentFix();
    one(await sync([mk("visit_in", { ...fix, site_id, place_name: place_name ?? null })]));
    setPlace(""); toast("Visit started");
  });
  const visitOut = () => act(async () => {
    const open = data?.visits.find((v) => !v.out_at);
    if (!open) return;
    const fix = await currentFix();
    one(await sync([mk("visit_out", { ...fix, visit_id: open.id, notes })]));
    setNotes(""); toast("Visit completed");
  });
  const consent = async () => {
    const { error } = await supabaseBrowser().rpc("accept_tracking_consent");
    if (error) toast(friendlyError(error), "error"); else await load();
  };

  if (loadError && !data) return <p className="mt-16 text-center text-sm text-muted">{loadError}</p>;
  if (!data || data.profile.staff_type !== "field") return <div className="mt-32 flex justify-center"><Spinner /></div>;

  const tz = data.settings.timezone ?? TZ_DEFAULT;
  const first = data.profile.full_name.split(" ")[0];
  const duty = data.duty;
  const ended = !!duty?.end_at;
  const open = data.visits.find((v) => !v.out_at) ?? null;
  const here = geo.kind === "fix" ? geo : null;
  const dateText = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date());
  const s = data.summary;

  if (!data.profile.consent_at) {
    return (
      <div className="mt-10 space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Before you start</h1>
        <p className="text-sm text-muted">
          While your day is running, this app records your location at Start day, End day, at visits and every few minutes.
          It records only between Start day and End day, and only while the app is open on your phone.
          A selfie is taken at Start day and End day.
        </p>
        <Button className="w-full" onClick={consent}>I understand and agree</Button>
      </div>
    );
  }

  return (
    <div className="pb-6 pt-2">
      <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onSelfie} />
      <p className="text-center text-sm text-muted">{dateText}</p>
      <h1 className="mt-1 text-center text-2xl font-semibold tracking-tight">Hi {first}</h1>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted">
        <MapPin className="size-4" />
        {geo.kind === "fix" ? `GPS ±${Math.round(geo.accuracy)} m` : geo.kind === "denied" ? "Allow location in your browser settings" : geo.kind === "error" ? geo.message : "Finding your location…"}
      </p>

      {data.on_leave && !duty && <p className="mt-6 rounded-2xl border border-line p-4 text-center text-sm text-muted">You are on approved leave today.</p>}

      {!duty && !data.on_leave && (
        <div className="mt-8">
          <Button className="h-14 w-full text-base" loading={busy} onClick={() => askSelfie("start")}><Camera className="size-5" />Start day (selfie)</Button>
          <p className="mt-2 text-center text-xs text-muted">Your selfie and location are recorded.</p>
        </div>
      )}

      {duty && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-3 gap-2 rounded-2xl border border-line p-4 text-center">
            <div><div className="text-xs text-muted">Started</div><div className="text-lg font-semibold">{timeOf(duty.start_at, tz)}</div></div>
            <div><div className="text-xs text-muted">Worked</div><div className="text-lg font-semibold">{hm(s?.worked_min)}</div></div>
            <div><div className="text-xs text-muted">Distance</div><div className="text-lg font-semibold">{Number(s?.km ?? 0).toFixed(1)} km</div></div>
          </div>
          {duty.offsite_status === "pending" && <p className="rounded-xl bg-amber-500/15 p-3 text-sm text-amber-700 dark:text-amber-300">Your start was away from your first site. Your manager will review it.</p>}
          {s?.late && <p className="text-center text-sm text-amber-600 dark:text-amber-400">Late by {hm(s.late_min)}</p>}

          {!ended && (
            <>
              <p className="text-center text-xs text-muted">{duty.paused ? "Day is paused." : "Route tracking is on while this app is open and the screen is on."}</p>

              {open && (
                <div className="space-y-3 rounded-2xl border border-line p-4">
                  <div className="font-medium">{open.name}</div>
                  <div className="text-sm text-muted">In since {timeOf(open.in_at, tz)}</div>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visit notes (optional)" />
                  <Button className="w-full" loading={busy} onClick={visitOut}><CheckCircle2 className="size-4" />Complete visit</Button>
                </div>
              )}

              {data.plan.length > 0 && (
                <div className="rounded-2xl border border-line">
                  <div className="px-4 pt-3 text-sm font-medium">Today&apos;s plan · {s?.planned_done ?? 0}/{data.plan.length}</div>
                  <ul className="divide-y divide-line">
                    {data.plan.map((p) => {
                      const dist = here ? haversine(here.lat, here.lng, p.lat, p.lng) : null;
                      const near = dist !== null && dist <= p.radius_m;
                      const done = !!p.visit?.out_at;
                      const inside = !!p.visit && !p.visit.out_at;
                      return (
                        <li key={p.site_id} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium">{p.seq}. {p.name}</div>
                            <div className="text-xs text-muted">{done ? `Done ${timeOf(p.visit?.out_at, tz)}` : inside ? "In progress" : dist !== null ? `${dist >= 1000 ? (dist / 1000).toFixed(1) + " km" : Math.round(dist) + " m"} away · radius ${p.radius_m} m` : "Locating…"}</div>
                          </div>
                          {!done && !inside && (
                            <Button size="sm" variant={near ? "primary" : "outline"} disabled={!!open || duty.paused || !near} loading={busy} onClick={() => visitIn(p.site_id)}>Check in</Button>
                          )}
                          {done && <CheckCircle2 className="size-5 text-emerald-600" />}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {!open && !duty.paused && (
                <div className="flex gap-2">
                  <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Unplanned stop: place name" />
                  <Button variant="outline" disabled={!place.trim()} loading={busy} onClick={() => visitIn(null, place.trim())}>Check in</Button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" loading={busy} onClick={togglePause}>{duty.paused ? <><Play className="size-4" />Resume</> : <><Pause className="size-4" />Break</>}</Button>
                <Button loading={busy} disabled={!!open} onClick={() => askSelfie("end")}><Camera className="size-4" />End day</Button>
              </div>
              {open && <p className="text-center text-xs text-muted">Complete your visit before ending the day.</p>}
            </>
          )}

          {ended && s && (
            <div className="space-y-1 rounded-2xl border border-line p-4 text-center">
              <div className="font-medium">Day ended at {timeOf(duty.end_at, tz)}</div>
              <div className="text-sm text-muted">Worked {hm(s.worked_min)} · {Number(s.km).toFixed(1)} km · {s.visits_done} visits ({s.planned_done}/{s.visits_planned} planned)</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
