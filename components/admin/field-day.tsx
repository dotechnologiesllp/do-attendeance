"use client";
// One field staff member's day: selfies, map with route replay, visits in order, hours and km, and the admin actions.
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { dateLabel, hm, metres, STATUS_LABEL, STATUS_TONE, timeOf } from "@/lib/format";
import { km, photoUrl, type Route } from "@/lib/field";
import { Badge, Button, ConfirmDialog, Empty, Field, Input, Modal, Spinner, Textarea, useToast } from "@/components/ui";

const RouteMap = dynamic(() => import("./field-maps").then((m) => m.RouteMap), { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-2xl bg-soft" /> });

function Photo({ path, label }: { path: string | null; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { photoUrl(supabaseBrowser(), path).then(setUrl); }, [path]);
  return (
    <figure className="text-center">
      <div className="mx-auto grid aspect-[3/4] w-28 place-items-center overflow-hidden rounded-2xl bg-soft text-xs text-muted">
        {url && !failed ? <img src={url} alt={label} className="size-full object-cover" onError={() => setFailed(true)} /> : path ? "Photo unavailable" : "No photo"}
      </div>
      <figcaption className="mt-1 text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

export function FieldDay({ employeeId, date, onChanged }: { employeeId: string; date: string; onChanged?: () => void }) {
  const toast = useToast();
  const [r, setR] = useState<Route | null>(null);
  const [decide, setDecide] = useState<null | boolean>(null);
  const [kmOpen, setKmOpen] = useState(false);

  const load = useCallback(async () => {
    setR(null);
    const { data, error } = await supabaseBrowser().rpc("route_for_day", { p_emp: employeeId, p_day: date });
    if (error) toast(friendlyError(error), "error"); else setR(data as Route);
  }, [employeeId, date, toast]);
  useEffect(() => { load(); }, [load]);

  if (!r) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!r.duty) return <Empty title="No duty on this day">The staff member didn&apos;t press Start day.</Empty>;
  const d = r.duty, s = r.summary!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5">
        <Badge className={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
        {d.start_onsite ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">On-site start</Badge>
          : <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300">Off-site start · {d.offsite_status}</Badge>}
        {s.late ? <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">Late {s.late_min} min</Badge> : <Badge>On time</Badge>}
        {d.auto_closed && <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300">Auto-closed</Badge>}
        {d.flags.filter((f) => !/^Off-site start/.test(f)).map((f) => (
          <Badge key={f} className="bg-amber-500/15 text-amber-700 dark:text-amber-300"><AlertTriangle className="size-3" />{f}</Badge>
        ))}
      </div>

      {(!d.start_onsite && d.offsite_status === "pending") || d.needs_review ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-soft p-3">
          {!d.start_onsite && d.offsite_status === "pending" && (
            <>
              <span className="mr-auto text-sm">Started {metres(d.start_distance_m ?? 0)} from the first site. Accept it?</span>
              <Button size="sm" variant="outline" onClick={() => setDecide(false)}><X className="size-4" />Reject</Button>
              <Button size="sm" onClick={() => setDecide(true)}><Check className="size-4" />Accept</Button>
            </>
          )}
          {d.needs_review && (
            <Button size="sm" variant="secondary" onClick={async () => {
              const { error } = await supabaseBrowser().rpc("review_duty_day", { p_duty: d.id, p_note: null });
              if (error) toast(friendlyError(error), "error"); else { toast("Marked as reviewed"); load(); onChanged?.(); }
            }}>Mark reviewed</Button>
          )}
        </div>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div className="flex gap-3">
          <Photo path={d.start_selfie} label={`Start ${timeOf(d.start_at)}`} />
          <Photo path={d.end_selfie} label={d.end_at ? `End ${timeOf(d.end_at)}` : "Not ended"} />
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {([
            ["Start day", `${timeOf(d.start_at)} · ±${Math.round(d.start_accuracy_m ?? 0)} m`],
            ["End day", d.end_at ? `${timeOf(d.end_at)}${d.end_source === "auto" ? " (auto)" : ""}` : "—"],
            ["Worked", hm(s.worked_min)], ["Breaks", hm(s.break_min)],
            ["Visits", `${s.planned_done}/${s.visits_planned} planned${s.unplanned ? ` + ${s.unplanned} unplanned` : ""}`],
            ["Distance", <span key="k">{km(s.km)}{s.km_adjusted != null && <span className="text-muted"> (GPS {km(s.km_gps)})</span>}</span>],
          ] as [string, React.ReactNode][]).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium tabular">{v}</dd></div>
          ))}
          <div className="col-span-full text-xs text-muted">{d.start_address ?? ""}{d.km_adjust_reason && ` · km adjusted: ${d.km_adjust_reason}`}</div>
          <div className="col-span-full"><Button size="sm" variant="outline" onClick={() => setKmOpen(true)}>Adjust km</Button></div>
        </dl>
      </div>

      <RouteMap route={r} height={380} />

      <section>
        <h4 className="mb-2 text-sm font-semibold">Timeline</h4>
        <ol className="relative space-y-3 border-l border-line pl-5 text-sm">
          <li><span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-fg" /><b className="tabular">{timeOf(d.start_at)}</b> Start day {d.start_onsite ? "on-site" : <span className="text-rose-600">off-site</span>}</li>
          {[...r.visits.map((v) => ({ at: v.in_at, kind: "visit" as const, v })), ...r.breaks.map((b) => ({ at: b.from, kind: "break" as const, b })),
            ...r.events.map((e) => ({ at: e.at, kind: "event" as const, e }))]
            .sort((a, b) => a.at.localeCompare(b.at)).map((x, i) => (
              <li key={i}>
                <span className={`absolute -left-1.5 mt-1.5 size-3 rounded-full ${x.kind === "visit" ? (x.v.planned ? "bg-emerald-600" : "bg-amber-600") : x.kind === "break" ? "bg-violet-500" : "bg-rose-500"}`} />
                {x.kind === "visit" && (
                  <div>
                    <b className="tabular">{timeOf(x.v.in_at)}–{x.v.out_at ? timeOf(x.v.out_at) : "now"}</b> {x.v.n}. {x.v.name}
                    <span className="text-muted"> · {x.v.minutes} min{x.v.planned ? ` · plan #${x.v.plan_seq}` : " · Unplanned"}</span>
                    {x.v.notes && <div className="text-muted">{x.v.notes}</div>}
                    {Object.keys(x.v.form ?? {}).length > 0 && <div className="text-xs text-muted">{Object.entries(x.v.form).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`).join(" · ")}</div>}
                    {x.v.photos?.length > 0 && <div className="mt-1 flex gap-2">{x.v.photos.map((p) => <Photo key={p} path={p} label="" />)}</div>}
                    {x.v.flags?.map((f) => <div key={f} className="text-xs text-amber-600">{f}</div>)}
                  </div>
                )}
                {x.kind === "break" && <div><b className="tabular">{timeOf(x.b.from)}–{timeOf(x.b.to)}</b> Break</div>}
                {x.kind === "event" && <div className="text-rose-600"><b className="tabular">{timeOf(x.e.at)}</b> {x.e.kind.replace(/_/g, " ")}</div>}
              </li>
            ))}
          {r.plan.filter((p) => !p.visited).map((p) => (
            <li key={p.site_id} className="text-rose-600"><span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-rose-500 bg-bg" />Missed planned #{p.seq}: {p.name}</li>
          ))}
          {d.end_at && <li><span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-fg" /><b className="tabular">{timeOf(d.end_at)}</b> End day{d.auto_closed && " (auto-closed at last location)"}</li>}
        </ol>
      </section>

      <ConfirmDialog open={decide !== null} onClose={() => setDecide(null)} title={decide ? "Accept off-site start?" : "Reject off-site start?"}
        body={decide ? "The day is no longer counted late for being off-site (it can still be late by time)." : "The day stays marked late. Hours are kept; edit punches in By day if needed."}
        confirmLabel={decide ? "Accept" : "Reject"} danger={decide === false} reason="optional"
        onConfirm={async (note) => {
          const { error } = await supabaseBrowser().rpc("decide_offsite", { p_duty: d.id, p_approve: decide, p_note: note || null });
          if (error) toast(friendlyError(error), "error"); else { toast(decide ? "Accepted" : "Rejected"); load(); onChanged?.(); }
        }} />
      <AdjustKm open={kmOpen} onClose={() => setKmOpen(false)} dutyId={d.id} current={s.km} gps={s.km_gps} onSaved={() => { setKmOpen(false); load(); onChanged?.(); }} />
      <p className="text-xs text-muted">{dateLabel(d.work_date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
    </div>
  );
}

function AdjustKm({ open, onClose, dutyId, current, gps, onSaved }: { open: boolean; onClose: () => void; dutyId: string; current: number; gps: number; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setV(String(current)); setReason(""); } }, [open, current]);
  return (
    <Modal open={open} onClose={onClose} title="Adjust km" footer={
      <><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={busy} disabled={reason.trim().length < 3 || v === "" || Number.isNaN(Number(v))} onClick={async () => {
          setBusy(true);
          const { error } = await supabaseBrowser().rpc("adjust_km", { p_duty: dutyId, p_km: Number(v), p_reason: reason });
          setBusy(false);
          if (error) toast(friendlyError(error), "error"); else { toast("Km updated · logged"); onSaved(); }
        }}>Save</Button></>
    }>
      <p className="mb-3 text-sm text-muted">GPS measured {km(gps)}. The adjusted value is used for the travel allowance.</p>
      <Field label="Km for this day"><Input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} /></Field>
      <Field label="Reason (required)" className="mt-3"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. GPS lost in the tunnel, odometer photo checked" /></Field>
    </Modal>
  );
}
