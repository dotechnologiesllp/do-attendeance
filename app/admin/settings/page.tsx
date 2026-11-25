"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { LocateFixed, Pencil, Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toPaise } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import { Badge, Button, Field, Input, Modal, PageHeader, Section, Select, Spinner, Switch, Textarea, useToast } from "@/components/ui";

const MapPicker = dynamic(() => import("@/components/admin/map-picker").then((m) => m.MapPicker), {
  ssr: false, loading: () => <div className="h-72 animate-pulse rounded-xl bg-soft" />,
});

type Settings = {
  company_name: string; company_address: string | null; logo_url: string | null; timezone: string;
  full_day_hours: number; half_day_hours: number; grace_minutes: number; late_deduction_enabled: boolean;
  late_marks_per_deduction: number; late_deduction_days: number; auto_close_cutoff: string; default_shift_start: string;
  default_shift_end: string; pay_basis: "calendar" | "working" | "fixed"; fixed_basis_days: number; standard_daily_hours: number;
  ot_multiplier: number; ot_off_day_full: boolean; ot_block_minutes: number; round_to_rupee: boolean;
  track_interval_min: number; track_distance_m: number; default_site_radius_m: number; poor_accuracy_m: number; block_mock: boolean;
  idle_minutes: number; offline_alert_min: number; clock_skew_flag_s: number; retention_months: number; field_shift_start: string;
};
type Vehicle = { id: string; name: string; rate_paise_per_km: number; active: boolean };
type Office = { id: string; name: string; address: string | null; lat: number; lng: number; radius_m: number; active: boolean };

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [offices, setOffices] = useState<Office[] | null>(null);
  const [editing, setEditing] = useState<Partial<Office> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [a, b] = await Promise.all([sb.from("org_settings").select("*").eq("id", 1).single(), sb.from("offices").select("*").order("name")]);
    setS(a.data as Settings); setOffices((b.data as Office[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!s) return <div className="flex justify-center py-24"><Spinner /></div>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });

  async function save() {
    if (!s) return;
    if (Number(s.half_day_hours) > Number(s.full_day_hours)) { toast("Half-day hours can't be more than full-day hours", "error"); return; }
    setSaving(true);
    const { error } = await supabaseBrowser().from("org_settings").update({ ...s, updated_at: new Date().toISOString() }).eq("id", 1);
    setSaving(false);
    if (error) toast(friendlyError(error), "error"); else toast("Settings saved");
  }

  const numIn = (k: keyof Settings, step = "1") => (
    <Input type="number" inputMode="decimal" step={step} value={String(s[k] ?? "")} onChange={(e) => set(k, (e.target.value === "" ? "" : Number(e.target.value)) as never)} />
  );

  return (
    <>
      <PageHeader title="Settings" actions={<Button onClick={save} loading={saving}>Save changes</Button>} />
      <div className="space-y-6">
        <Section title="Offices" sub="Employees can punch only inside an assigned office's radius." actions={
          <Button size="sm" variant="secondary" onClick={() => setEditing({ name: "", radius_m: 100, active: true, lat: 12.9716, lng: 77.5946 })}><Plus className="size-4" />Add office</Button>
        }>
          {!offices ? <Spinner /> : offices.length === 0 ? <p className="text-sm text-muted">No offices yet.</p> : (
            <ul className="divide-y divide-line">
              {offices.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-medium">{o.name} {!o.active && <Badge>Inactive</Badge>}</div>
                    <div className="text-sm tabular text-muted">{o.radius_m} m radius · {o.lat.toFixed(5)}, {o.lng.toFixed(5)}</div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(o)}><Pencil className="size-4" />Edit</Button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Company" sub="Shown on payslips.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name"><Input value={s.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
            <Field label="Timezone" hint="All punches use server time in this zone."><Input value={s.timezone} onChange={(e) => set("timezone", e.target.value)} /></Field>
            <Field label="Address" className="sm:col-span-2"><Textarea value={s.company_address ?? ""} onChange={(e) => set("company_address", e.target.value)} /></Field>
            <Field label="Logo" hint="PNG or JPG, up to 200 KB." className="sm:col-span-2">
              <div className="flex items-center gap-3">
                {s.logo_url && <img src={s.logo_url} alt="Logo" className="h-10 w-auto rounded" />}
                <input type="file" accept="image/png,image/jpeg" className="text-sm file:mr-3 file:h-10 file:rounded-xl file:border-0 file:bg-soft file:px-4"
                  onChange={(e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    if (f.size > 200 * 1024) { toast("Logo must be under 200 KB", "error"); return; }
                    const r = new FileReader(); r.onload = () => set("logo_url", String(r.result)); r.readAsDataURL(f);
                  }} />
                {s.logo_url && <Button variant="ghost" size="sm" onClick={() => set("logo_url", null)}>Remove</Button>}
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Attendance rules">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Full day (hours)" hint="Present at or above this">{numIn("full_day_hours", "0.25")}</Field>
            <Field label="Half day (hours)" hint="Half day at or above this">{numIn("half_day_hours", "0.25")}</Field>
            <Field label="Late grace (minutes)" hint="After shift start">{numIn("grace_minutes")}</Field>
            <Field label="Default shift start"><Input type="time" value={s.default_shift_start.slice(0, 5)} onChange={(e) => set("default_shift_start", e.target.value)} /></Field>
            <Field label="Default shift end"><Input type="time" value={s.default_shift_end.slice(0, 5)} onChange={(e) => set("default_shift_end", e.target.value)} /></Field>
            <Field label="Auto check-out cut-off" hint="Open sessions close at shift end and are flagged"><Input type="time" value={s.auto_close_cutoff.slice(0, 5)} onChange={(e) => set("auto_close_cutoff", e.target.value)} /></Field>
          </div>
          <div className="mt-5 border-t border-line pt-4">
            <Switch checked={s.late_deduction_enabled} onChange={(v) => set("late_deduction_enabled", v)} label="Deduct pay for repeated late marks" />
            {s.late_deduction_enabled && (
              <div className="mt-3 grid max-w-md grid-cols-2 gap-3">
                <Field label="Every N late marks">{numIn("late_marks_per_deduction")}</Field>
                <Field label="Deduct (days)">
                  <Select value={String(s.late_deduction_days)} onChange={(e) => set("late_deduction_days", Number(e.target.value))}>
                    <option value="0.5">0.5 day</option><option value="1">1 day</option>
                  </Select>
                </Field>
              </div>
            )}
          </div>
        </Section>

        <Section title="Field tracking" sub="Applies to field staff. Tracking runs only between Start day and End day.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Location every (minutes)" hint="Plus a point on significant movement">{numIn("track_interval_min")}</Field>
            <Field label="Significant movement (m)">{numIn("track_distance_m")}</Field>
            <Field label="Default site radius (m)" hint="For new sites">{numIn("default_site_radius_m")}</Field>
            <Field label="Field shift start" hint="Default for new field staff"><Input type="time" value={s.field_shift_start.slice(0, 5)} onChange={(e) => set("field_shift_start", e.target.value)} /></Field>
            <Field label="Flag GPS accuracy worse than (m)">{numIn("poor_accuracy_m")}</Field>
            <Field label="Idle after (minutes)" hint="No movement beyond 75 m">{numIn("idle_minutes")}</Field>
            <Field label="Alert: no location for (minutes)" hint="GPS/internet off, phone off">{numIn("offline_alert_min")}</Field>
            <Field label="Flag phone clock off by (seconds)">{numIn("clock_skew_flag_s")}</Field>
            <Field label="Keep raw location points (months)" hint="Then deleted; daily summaries stay">{numIn("retention_months")}</Field>
          </div>
          <div className="mt-5 space-y-3 border-t border-line pt-4">
            <Switch checked={s.block_mock} onChange={(v) => set("block_mock", v)} label="Block punches from a mock-location app"
              hint="Off: the punch is accepted but flagged for the admin. On: the punch is refused." />
            <Button variant="outline" size="sm" onClick={async () => {
              const { data, error } = await supabaseBrowser().rpc("purge_location_history");
              if (error) toast(friendlyError(error), "error"); else toast(`Deleted ${(data as { points_deleted: number }).points_deleted} old location points`);
            }}>Delete location history older than {s.retention_months} months now</Button>
            <p className="text-xs text-muted">This also runs every night when pg_cron is enabled in Supabase.</p>
          </div>
        </Section>

        <Vehicles />

        <Section title="Payroll rules">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Per-day rate basis">
              <Select value={s.pay_basis} onChange={(e) => set("pay_basis", e.target.value as Settings["pay_basis"])}>
                <option value="working">Working days in month</option>
                <option value="calendar">Calendar days in month</option>
                <option value="fixed">Fixed days</option>
              </Select>
            </Field>
            {s.pay_basis === "fixed" && (
              <Field label="Fixed days">
                <Select value={String(s.fixed_basis_days)} onChange={(e) => set("fixed_basis_days", Number(e.target.value))}>
                  <option value="26">26 days</option><option value="30">30 days</option>
                </Select>
              </Field>
            )}
            <Field label="Standard daily hours" hint="Hourly rate = per-day rate ÷ this">{numIn("standard_daily_hours", "0.25")}</Field>
            <Field label="Overtime multiplier" hint="Per-employee override on their profile">{numIn("ot_multiplier", "0.25")}</Field>
            <Field label="Count OT in blocks of">
              <Select value={String(s.ot_block_minutes)} onChange={(e) => set("ot_block_minutes", Number(e.target.value))}>
                <option value="0">Every minute</option><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">1 hour</option>
              </Select>
            </Field>
          </div>
          <div className="mt-5 space-y-2 border-t border-line pt-4">
            <Switch checked={s.ot_off_day_full} onChange={(v) => set("ot_off_day_full", v)} label="Work on holidays and weekly offs is all overtime"
              hint="Off: only hours beyond the standard day count, like a working day" />
            <Switch checked={s.round_to_rupee} onChange={(v) => set("round_to_rupee", v)} label="Round net pay to the nearest rupee" />
          </div>
        </Section>
      </div>

      <OfficeEditor office={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </>
  );
}

function OfficeEditor({ office, onClose, onSaved }: { office: Partial<Office> | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [o, setO] = useState<Partial<Office>>({});
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  useEffect(() => { if (office) setO(office); }, [office]);

  function useMyLocation() {
    if (!navigator.geolocation) { toast("This browser can't share location", "error"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setO((x) => ({ ...x, lat: p.coords.latitude, lng: p.coords.longitude })); toast(`Location set (±${Math.round(p.coords.accuracy)} m)`); },
      () => { setLocating(false); toast("Couldn't get your location. Allow location access and try again.", "error"); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function save() {
    if (!o.name?.trim()) { toast("Name the office", "error"); return; }
    setBusy(true);
    const sb = supabaseBrowser();
    const row = { name: o.name.trim(), address: o.address ?? null, lat: o.lat, lng: o.lng, radius_m: o.radius_m, active: o.active ?? true };
    const { error } = o.id ? await sb.from("offices").update(row).eq("id", o.id) : await sb.from("offices").insert(row);
    setBusy(false);
    if (error) toast(friendlyError(error), "error"); else { toast("Office saved"); onSaved(); }
  }

  return (
    <Modal open={!!office} onClose={onClose} title={o.id ? "Edit office" : "Add office"} wide footer={
      <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save office</Button></>
    }>
      <div className="space-y-4">
        <Field label="Name"><Input value={o.name ?? ""} onChange={(e) => setO({ ...o, name: e.target.value })} placeholder="Head office" /></Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted">Tap the map to place the office, or</span>
          <Button variant="outline" size="sm" onClick={useMyLocation} loading={locating}><LocateFixed className="size-4" />Use my current location</Button>
        </div>
        {o.lat != null && o.lng != null && (
          <MapPicker lat={o.lat} lng={o.lng} radius={o.radius_m ?? 100} onChange={(lat, lng) => setO((x) => ({ ...x, lat, lng }))} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude"><Input inputMode="decimal" value={o.lat ?? ""} onChange={(e) => setO({ ...o, lat: Number(e.target.value) })} /></Field>
          <Field label="Longitude"><Input inputMode="decimal" value={o.lng ?? ""} onChange={(e) => setO({ ...o, lng: Number(e.target.value) })} /></Field>
        </div>
        <Field label={`Radius: ${o.radius_m ?? 100} m`} hint="Bigger radius = easier punching but less strict. 100 m suits most offices. Below about 20 m, GPS error makes punching unreliable.">
          <input type="range" min={5} max={1000} step={5} value={o.radius_m ?? 100} onChange={(e) => setO({ ...o, radius_m: Number(e.target.value) })}
            className="w-full accent-[var(--accent)]" />
        </Field>
        <Field label="Address"><Input value={o.address ?? ""} onChange={(e) => setO({ ...o, address: e.target.value })} /></Field>
        <Switch checked={o.active ?? true} onChange={(v) => setO({ ...o, active: v })} label="Active" />
      </div>
    </Modal>
  );
}

function Vehicles() {
  const toast = useToast();
  const [items, setItems] = useState<Vehicle[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("vehicle_types").select("*").order("name");
    setItems((data as Vehicle[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function save(v: Partial<Vehicle>) {
    const sb = supabaseBrowser();
    const { error } = v.id ? await sb.from("vehicle_types").update(v).eq("id", v.id) : await sb.from("vehicle_types").insert(v);
    if (error) toast(friendlyError(error), "error"); else load();
  }
  return (
    <Section title="Travel allowance" sub="Rate per km for each vehicle type. Monthly TA = km travelled (GPS, or the admin's adjusted value) × rate, added to payroll.">
      {!items ? <Spinner /> : (
        <ul className="divide-y divide-line">
          {items.map((v) => (
            <li key={v.id} className="grid grid-cols-[1fr_120px_auto] items-center gap-3 py-2.5">
              <Input defaultValue={v.name} aria-label="Vehicle" onBlur={(e) => e.target.value !== v.name && save({ id: v.id, name: e.target.value })} />
              <div className="relative">
                <Input inputMode="decimal" defaultValue={(v.rate_paise_per_km / 100).toFixed(2)} aria-label="Rupees per km" className="pr-12"
                  onBlur={(e) => { const p = toPaise(e.target.value); if (Number.isFinite(p) && p !== v.rate_paise_per_km) save({ id: v.id, rate_paise_per_km: p }); }} />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">₹/km</span>
              </div>
              <Switch checked={v.active} onChange={(a) => save({ id: v.id, active: a })} label="On" />
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => save({ name: `Vehicle ${(items?.length ?? 0) + 1}`, rate_paise_per_km: 300, active: true })}><Plus className="size-4" />Add vehicle type</Button>
      <p className="mt-2 text-xs text-muted">Rate changes apply to days ended after the change; past days keep the rate they were ended with.</p>
    </Section>
  );
}
