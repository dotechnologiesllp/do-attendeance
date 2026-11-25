"use client";
// Leaflet maps for the field module (OpenStreetMap tiles, no API key). Load with next/dynamic { ssr: false }.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { Pause, Play } from "lucide-react";
import { LIVE, type LiveStaff, type Route } from "@/lib/field";
import { timeOf } from "@/lib/format";
import { Button, cn } from "@/components/ui";

type L = typeof Leaflet;

function useLeaflet(el: RefObject<HTMLDivElement | null>, center: [number, number], zoom: number) {
  const [ctx, setCtx] = useState<{ L: L; map: Leaflet.Map } | null>(null);
  useEffect(() => {
    let map: Leaflet.Map | null = null; let dead = false;
    (async () => {
      const L = await import("leaflet");
      if (dead || !el.current) return;
      map = L.map(el.current, { zoomControl: true, preferCanvas: true }).setView(center, zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      setCtx({ L, map });
    })();
    return () => { dead = true; map?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ctx;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function pin(L: L, text: string, color: string, ring = false) {
  return L.divIcon({
    className: "",
    iconSize: [26, 26], iconAnchor: [13, 13],
    html: `<div style="width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font:600 12px Inter,system-ui;color:${ring ? color : "#fff"};background:${ring ? "#fff" : color};border:2px solid ${ring ? color : "#fff"};box-shadow:0 1px 4px #0004">${esc(text)}</div>`,
  });
}

/** Live Map: everyone on duty, colour-coded by status. */
export function LiveMap({ staff, selected, onSelect }: { staff: LiveStaff[]; selected?: string | null; onSelect: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const ctx = useLeaflet(el, [12.9716, 77.5946], 11);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    layer.current?.remove();
    const g = L.layerGroup().addTo(map);
    const pts: [number, number][] = [];
    for (const s of staff) {
      if (s.lat == null || s.lng == null) continue;
      const st = LIVE[s.status];
      const initials = s.name.split(" ").map((x) => x[0]).slice(0, 2).join("");
      const m = L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          className: "", iconSize: [34, 34], iconAnchor: [17, 17],
          html: `<div style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:600 12px Inter,system-ui;color:#fff;background:${st.color};border:${selected === s.id ? "3px solid #0d0d0d" : "2px solid #fff"};box-shadow:0 2px 8px #0005">${esc(initials)}</div>`,
        }),
      }).addTo(g);
      m.bindTooltip(`<b>${esc(s.name)}</b><br>${st.label}${s.at_site ? " · " + esc(s.at_site) : ""}<br>${s.last_at ? "Updated " + timeOf(s.last_at) : ""}`, { direction: "top", offset: [0, -16] });
      m.on("click", () => onSelect(s.id));
      pts.push([s.lat, s.lng]);
    }
    layer.current = g;
    if (!fitted.current && pts.length) { map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 14 }); fitted.current = true; }
  }, [ctx, staff, selected, onSelect]);

  return <div ref={el} className="h-full min-h-[420px] w-full overflow-hidden rounded-2xl border border-line" />;
}

/** Route replay: the GPS trail, planned sites, numbered visits, stops, and a time scrubber. */
export function RouteMap({ route, height = 460 }: { route: Route; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const ctx = useLeaflet(el, [12.9716, 77.5946], 13);
  const dot = useRef<Leaflet.CircleMarker | null>(null);
  const pts = useMemo(() => route.points.filter((p) => !p[4]), [route]);
  const t0 = pts.length ? new Date(pts[0][2]).getTime() : 0;
  const t1 = pts.length ? new Date(pts[pts.length - 1][2]).getTime() : 0;
  const [t, setT] = useState(t1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => { setT(t1); setPlaying(false); }, [t1]);

  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    const g = L.layerGroup().addTo(map);
    const line = pts.map((p) => [p[0], p[1]] as [number, number]);
    if (line.length > 1) {
      L.polyline(line, { color: "#0d0d0d", weight: 6, opacity: 0.12 }).addTo(g);
      L.polyline(line, { color: "#2563eb", weight: 3, opacity: 0.9 }).addTo(g);
    }
    for (const p of route.points.filter((x) => x[4])) {
      L.circleMarker([p[0], p[1]], { radius: 5, color: "#dc2626", fillOpacity: 1 }).bindTooltip(`Mock location · ${timeOf(p[2])}`).addTo(g);
    }
    for (const s of route.plan) {
      L.circle([s.lat, s.lng], { radius: s.radius_m, color: s.visited ? "#059669" : "#dc2626", weight: 1, fillOpacity: 0.05, dashArray: s.visited ? undefined : "4 4" }).addTo(g);
      if (!s.visited) L.marker([s.lat, s.lng], { icon: pin(L, String(s.seq), "#dc2626", true) }).bindTooltip(`Planned #${s.seq}: ${esc(s.name)} · not visited`).addTo(g);
    }
    for (const st of route.stops) {
      L.circleMarker([st.lat, st.lng], { radius: 6, color: "#71717a", weight: 2, fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip(`Stop ${timeOf(st.from)}–${timeOf(st.to)} · ${st.minutes} min`).addTo(g);
    }
    for (const v of route.visits) {
      L.marker([v.lat, v.lng], { icon: pin(L, String(v.n), v.planned ? "#059669" : "#d97706"), zIndexOffset: 500 })
        .bindTooltip(`<b>${v.n}. ${esc(v.name)}</b>${v.planned ? "" : " · Unplanned"}<br>${timeOf(v.in_at)} – ${v.out_at ? timeOf(v.out_at) : "now"} · ${v.minutes} min`, { direction: "top", offset: [0, -12] }).addTo(g);
    }
    const d = route.duty;
    if (d?.start_lat != null && d.start_lng != null) L.marker([d.start_lat, d.start_lng], { icon: pin(L, "S", d.start_onsite ? "#0d0d0d" : "#dc2626") }).bindTooltip(`Start day ${timeOf(d.start_at)}${d.start_onsite ? " · on-site" : " · OFF-SITE"}`).addTo(g);
    if (d?.end_lat != null && d.end_lng != null && d.end_at) L.marker([d.end_lat, d.end_lng], { icon: pin(L, "E", "#0d0d0d") }).bindTooltip(`End day ${timeOf(d.end_at)}${d.auto_closed ? " · auto-closed" : ""}`).addTo(g);
    dot.current = L.circleMarker([0, 0], { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(g);
    const all: [number, number][] = [...line, ...route.plan.map((s) => [s.lat, s.lng] as [number, number])];
    if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.15), { maxZoom: 16 });
    return () => { g.remove(); };
  }, [ctx, route, pts]);

  // Position at time t (linear between points)
  useEffect(() => {
    if (!dot.current || pts.length === 0) return;
    let i = pts.findIndex((p) => new Date(p[2]).getTime() >= t);
    if (i === -1) i = pts.length - 1;
    const b = pts[i], a = pts[Math.max(0, i - 1)];
    const ta = new Date(a[2]).getTime(), tb = new Date(b[2]).getTime();
    const f = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 1;
    dot.current.setLatLng([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }, [t, pts]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setT((x) => { const n = x + (t1 - t0) / 300; if (n >= t1) { setPlaying(false); return t1; } return n; }), 50);
    return () => clearInterval(id);
  }, [playing, t0, t1]);

  const at = pts.length ? new Date(t).toISOString() : null;
  const visitNow = route.visits.find((v) => at && v.in_at <= at && (!v.out_at || v.out_at >= at));
  return (
    <div>
      <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-2xl border border-line" />
      {pts.length > 1 && (
        <div className="mt-3 flex items-center gap-3">
          <Button variant="secondary" size="icon" onClick={() => { if (t >= t1) setT(t0); setPlaying(!playing); }} aria-label={playing ? "Pause replay" : "Play replay"}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <input type="range" min={t0} max={t1} step={1000} value={t} onChange={(e) => { setPlaying(false); setT(Number(e.target.value)); }}
            className="flex-1 accent-[var(--accent)]" aria-label="Replay time" />
          <span className={cn("w-40 text-right text-sm tabular", visitNow && "font-medium")}>{at && timeOf(at)}{visitNow ? ` · ${visitNow.name}` : ""}</span>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span><span className="mr-1 inline-block size-2.5 rounded-full bg-emerald-600" />Planned visit</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-full bg-amber-600" />Unplanned</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-full border-2 border-rose-600" />Planned, missed</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-full border-2 border-zinc-500" />Stop ≥ 10 min</span>
        <span><span className="mr-1 inline-block h-0.5 w-4 bg-blue-600 align-middle" />GPS route</span>
      </div>
    </div>
  );
}

export function liveColor(s: keyof typeof LIVE) { return LIVE[s].color; }
