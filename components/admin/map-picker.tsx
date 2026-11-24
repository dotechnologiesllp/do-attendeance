"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";

/** Tap the map to place the office; the circle shows the punch radius. OpenStreetMap tiles, no API key. */
export function MapPicker({ lat, lng, radius, onChange }: { lat: number; lng: number; radius: number; onChange: (lat: number, lng: number) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const dot = useRef<Leaflet.CircleMarker | null>(null);
  const ring = useRef<Leaflet.Circle | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 17);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "&copy; OpenStreetMap contributors",
      }).addTo(m);
      ring.current = L.circle([lat, lng], { radius, color: "#0d0d0d", weight: 1.5, fillOpacity: 0.08 }).addTo(m);
      dot.current = L.circleMarker([lat, lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#0d0d0d", fillOpacity: 1 }).addTo(m);
      m.on("click", (e: Leaflet.LeafletMouseEvent) => cb.current(e.latlng.lat, e.latlng.lng));
      map.current = m;
    })();
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    dot.current?.setLatLng([lat, lng]);
    ring.current?.setLatLng([lat, lng]);
    ring.current?.setRadius(radius);
    if (map.current && !map.current.getBounds().contains([lat, lng])) map.current.setView([lat, lng]);
  }, [lat, lng, radius]);

  return <div ref={el} className="h-72 w-full overflow-hidden rounded-xl border border-line" />;
}
