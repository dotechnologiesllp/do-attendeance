"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { freshPosition, nearestOffice, useGeolocation, type Office } from "@/lib/geo";
import { friendlyError } from "@/lib/errors";
import { hm, metres, timeOf, TZ_DEFAULT } from "@/lib/format";
import { cn, Spinner, useToast } from "@/components/ui";
import { Fingerprint, LocateFixed, LocateOff, MapPin } from "lucide-react";

type Today = {
  server_now: string; today: string; timezone: string;
  profile: { full_name: string };
  sessions: { id: string; in: string; out: string | null; auto_closed: boolean }[];
  open_session: { id: string; in: string } | null;
  offices: Office[];
  day: { status: string; worked_min: number; break_min: number; late: boolean; late_min: number } | null;
};

function greeting(tz: string) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function EmployeeHome() {
  const toast = useToast();
  const [data, setData] = useState<Today | null>(null);
  const [offset, setOffset] = useState(0);          // server clock − device clock (ms), for the live counter only
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ticks, tick] = useState(0);
  const geo = useGeolocation();

  const load = useCallback(async () => {
    const t0 = Date.now();
    const { data, error } = await supabaseBrowser().rpc("my_today");
    if (error) { setLoadError(friendlyError(error)); return; }
    const d = data as Today;
    setOffset(new Date(d.server_now).getTime() - (t0 + Date.now()) / 2);
    setData(d); setLoadError(null);
  }, []);

  useEffect(() => {
    load();
    const i = setInterval(load, 60_000);
    const t = setInterval(() => tick((x) => x + 1), 15_000);
    const v = () => !document.hidden && load();
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(i); clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [load]);

  const tz = data?.timezone ?? TZ_DEFAULT;
  const isIn = Boolean(data?.open_session);

  const where = useMemo(() => {
    if (!data || geo.kind !== "fix" || data.offices.length === 0) return null;
    return nearestOffice(geo.lat, geo.lng, data.offices);
  }, [data, geo]);

  const inside = !!where && geo.kind === "fix" && where.distance <= where.office.radius_m && geo.accuracy <= where.office.radius_m;
  const lowAccuracy = !!where && geo.kind === "fix" && geo.accuracy > where.office.radius_m;

  // Auto check-out: if the employee is clearly outside the office radius for 30 s while the app is open,
  // ask the server to close the open session. (A web app cannot track location once it is closed.)
  const outsideSince = useRef<number | null>(null);
  const autoBusy = useRef(false);
  useEffect(() => {
    const clearlyOutside = isIn && geo.kind === "fix" && !!where
      && geo.accuracy <= where.office.radius_m && where.distance - geo.accuracy > where.office.radius_m;
    if (!clearlyOutside || geo.kind !== "fix") { outsideSince.current = null; return; }
    const now = Date.now();
    if (outsideSince.current === null) outsideSince.current = now;
    if (now - outsideSince.current < 30_000 || autoBusy.current) return;
    autoBusy.current = true;
    (async () => {
      try {
        const { data: r, error } = await supabaseBrowser().rpc("auto_checkout_if_outside", { p_lat: geo.lat, p_lng: geo.lng, p_accuracy: geo.accuracy });
        if (!error && (r as { closed?: boolean } | null)?.closed) {
          if (navigator.vibrate) navigator.vibrate(30);
          toast("You left the office area. Checked out automatically.");
          await load();
        }
      } finally {
        autoBusy.current = false;
        outsideSince.current = null;
      }
    })();
  }, [geo, where, isIn, ticks, load, toast]);

  // Live worked time = completed sessions (server) + the open session so far.
  // (Recomputed on every render; a 15-second tick keeps it moving.)
  const nowMs = Date.now() + offset;
  const workedMin = (data?.sessions ?? []).reduce((sum, s) => {
    const end = s.out ? new Date(s.out).getTime() : nowMs;
    return sum + Math.max(0, (end - new Date(s.in).getTime()) / 60000);
  }, 0);

  async function punch() {
    if (!data || busy) return;
    setBusy(true);
    try {
      let lat: number, lng: number, accuracy: number, mocked = false;
      if (geo.kind === "fix" && Date.now() - geo.at < 10_000) {
        ({ lat, lng, accuracy, mocked } = geo);
      } else {
        const p = await freshPosition();
        lat = p.coords.latitude; lng = p.coords.longitude; accuracy = p.coords.accuracy;
        mocked = Boolean((p as unknown as { mocked?: boolean }).mocked || (p.coords as unknown as { mocked?: boolean }).mocked);
      }
      const { data: r, error } = await supabaseBrowser().rpc("punch", { p_lat: lat, p_lng: lng, p_accuracy: accuracy, p_mocked: mocked });
      if (error) throw error;
      const res = r as { action: "in" | "out"; at: string };
      if (navigator.vibrate) navigator.vibrate(30);
      toast(`${res.action === "in" ? "Checked in" : "Checked out"} at ${timeOf(res.at, tz)}`);
      await load();
    } catch (e) {
      toast(friendlyError(e), "error");
    } finally {
      setBusy(false);
    }
  }

  if (loadError && !data) return <p className="mt-16 text-center text-sm text-muted">{loadError}</p>;
  if (!data) return <div className="mt-32 flex justify-center"><Spinner /></div>;

  const first = data.profile.full_name.split(" ")[0];
  const dateText = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(new Date());

  let statusIcon = <LocateFixed className="size-4" />;
  let statusText: React.ReactNode = "Finding your location…";
  let statusTone = "text-muted";
  if (data.offices.length === 0) { statusIcon = <LocateOff className="size-4" />; statusText = "No office assigned. Ask your admin."; }
  else if (geo.kind === "denied") { statusIcon = <LocateOff className="size-4" />; statusText = "Location is blocked. Allow location for this site in your browser settings."; statusTone = "text-rose-600 dark:text-rose-400"; }
  else if (geo.kind === "unsupported") { statusIcon = <LocateOff className="size-4" />; statusText = "This browser can't share location."; }
  else if (geo.kind === "error") { statusText = geo.message; }
  else if (where && lowAccuracy) { statusText = `Weak GPS (±${Math.round((geo as { accuracy: number }).accuracy)} m). Waiting for a better signal…`; statusTone = "text-amber-600 dark:text-amber-400"; }
  else if (where && inside) { statusIcon = <MapPin className="size-4" />; statusText = <>Inside office · {where.office.name}</>; statusTone = "text-emerald-600 dark:text-emerald-400"; }
  else if (where) { statusIcon = <MapPin className="size-4" />; statusText = <>Outside office · {metres(where.distance)} away</>; }

  const ready = inside && !busy;

  return (
    <div className="flex flex-col items-center pt-6 text-center sm:pt-12">
      <p className="text-sm text-muted">{dateText}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greeting(tz)}, {first}</h1>
      <p className={cn("mt-3 inline-flex items-center gap-1.5 text-sm", statusTone)} aria-live="polite">{statusIcon}{statusText}</p>

      <button
        onClick={punch}
        disabled={!ready}
        aria-label={isIn ? "Check out" : "Check in"}
        className={cn(
          "mt-12 grid size-52 place-items-center rounded-full border text-lg font-semibold transition-all duration-300 select-none sm:size-56",
          ready
            ? isIn
              ? "punch-ready border-line bg-bg text-fg shadow-[0_8px_30px_rgba(0,0,0,0.08)] active:scale-[0.97]"
              : "punch-ready border-transparent bg-accent text-accent-fg active:scale-[0.97]"
            : "cursor-not-allowed border-line bg-soft text-muted",
        )}
      >
        <span className="flex flex-col items-center gap-2">
          {busy ? <Spinner className="size-7 text-current" /> : <Fingerprint className="size-8 opacity-80" />}
          {isIn ? "Check out" : "Check in"}
        </span>
      </button>

      {!inside && where && geo.kind === "fix" && !lowAccuracy && (
        <p className="mt-5 text-xs text-muted">Move within {where.office.radius_m} m of {where.office.name} to {isIn ? "check out" : "check in"}.</p>
      )}

      <div className="mt-12 w-full max-w-sm">
        {data.sessions.length > 0 ? (
          <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm tabular" aria-label="Today's timeline">
            {data.sessions.flatMap((s, i) => {
              const items = [
                <li key={s.id + "i"} className="rounded-full bg-soft px-3 py-1"><span className="font-medium">{timeOf(s.in, tz)}</span> <span className="text-muted">in</span></li>,
              ];
              if (s.out) items.push(
                <li key={s.id + "a"} aria-hidden className="text-muted">→</li>,
                <li key={s.id + "o"} className="rounded-full bg-soft px-3 py-1">
                  <span className="font-medium">{timeOf(s.out, tz)}</span> <span className="text-muted">{s.auto_closed ? "auto-out" : "out"}</span>
                </li>,
              );
              if (i < data.sessions.length - 1) items.push(<li key={s.id + "b"} aria-hidden className="text-muted">→</li>);
              return items;
            })}
          </ol>
        ) : (
          <p className="text-sm text-muted">No punches yet today.</p>
        )}

        <div className="mt-8 grid grid-cols-2 divide-x divide-line rounded-2xl border border-line py-4">
          <div>
            <div className="text-xs text-muted">Worked today</div>
            <div className="mt-1 text-xl font-semibold tabular">{hm(workedMin)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Break</div>
            <div className="mt-1 text-xl font-semibold tabular">{hm(data.day?.break_min ?? 0)}</div>
          </div>
        </div>
        {data.day?.late && <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">Marked late today ({data.day.late_min} min after shift start).</p>}
      </div>
    </div>
  );
}
