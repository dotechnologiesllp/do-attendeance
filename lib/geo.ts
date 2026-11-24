"use client";
import { useEffect, useRef, useState } from "react";

export type Office = { id: string; name: string; lat: number; lng: number; radius_m: number };

export function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export type GeoState =
  | { kind: "locating" }
  | { kind: "unsupported" }
  | { kind: "denied" }
  | { kind: "error"; message: string }
  | { kind: "fix"; lat: number; lng: number; accuracy: number; at: number; mocked: boolean };

/**
 * Watches the device position with high accuracy. Battery-friendly: pauses while
 * the page is hidden and resumes when it comes back.
 */
export function useGeolocation(enabled = true) {
  const [state, setState] = useState<GeoState>({ kind: "locating" });
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ kind: "unsupported" });
      return;
    }
    const start = () => {
      if (watchId.current !== null) return;
      watchId.current = navigator.geolocation.watchPosition(
        (p) => {
          // Some Android WebViews expose `mocked` on the position; browsers generally don't.
          const mocked = Boolean((p as unknown as { mocked?: boolean }).mocked || (p.coords as unknown as { mocked?: boolean }).mocked);
          setState({ kind: "fix", lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp, mocked });
        },
        (e) => {
          if (e.code === e.PERMISSION_DENIED) setState({ kind: "denied" });
          else if (e.code === e.TIMEOUT) setState((s) => (s.kind === "fix" ? s : { kind: "error", message: "Still looking for GPS…" }));
          else setState({ kind: "error", message: "Location unavailable. Turn on GPS." });
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
      );
    };
    const stop = () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
    const onVis = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [enabled]);

  return state;
}

/** One fresh high-accuracy reading (used right before a punch if the watched fix is stale). */
export function freshPosition(timeout = 15000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout }),
  );
}

export function nearestOffice(lat: number, lng: number, offices: Office[]) {
  let best: { office: Office; distance: number } | null = null;
  for (const o of offices) {
    const distance = haversine(lat, lng, o.lat, o.lng);
    if (!best || distance / o.radius_m < best.distance / best.office.radius_m) best = { office: o, distance };
  }
  return best;
}
