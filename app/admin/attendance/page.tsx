"use client";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { dateLabel, hm, isoToHHMM, STATUS_LABEL, STATUS_TONE, timeOf, todayIn, zonedToIso } from "@/lib/format";
import { Badge, Button, ConfirmDialog, Empty, Field, Input, Modal, PageHeader, Spinner, Tabs, Textarea, useToast } from "@/components/ui";

type Session = {
  id: string; employee_id: string; work_date: string; check_in_at: string; check_out_at: string | null;
  in_accuracy_m: number | null; in_distance_m: number | null; out_accuracy_m: number | null; out_distance_m: number | null;
  in_source: string; out_source: string | null; auto_closed: boolean; needs_review: boolean; flagged: boolean;
  flag_reasons: string[]; reviewed_at: string | null; profile?: { full_name: string } | null;
};
type DayRow = { employee_id: string; full_name: string; employee_code: string | null; status: string; worked_min: number; break_min: number; late: boolean; late_min: number; ot_min: number };
type Audit = { id: number; at: string; actor: string | null; source: string | null; entity: string; entity_id: string; employee_id: string | null; action: string; reason: string | null; old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null };

const SESSION_COLS = "id, employee_id, work_date, check_in_at, check_out_at, in_accuracy_m, in_distance_m, out_accuracy_m, out_distance_m, in_source, out_source, auto_closed, needs_review, flagged, flag_reasons, reviewed_at";

export default function AttendancePage() {
  return <Suspense fallback={<Spinner />}><Attendance /></Suspense>;
}

function Attendance() {
  const params = useSearchParams();
  const [tab, setTab] = useState<"day" | "review" | "audit">((params.get("tab") as "review") || "day");
  const [tz, setTz] = useState("Asia/Kolkata");
  useEffect(() => {
    supabaseBrowser().from("org_settings").select("timezone").eq("id", 1).single().then(({ data }) => data?.timezone && setTz(data.timezone));
  }, []);
  return (
    <>
      <PageHeader title="Attendance" sub="Every edit needs a reason and is kept in the audit log." />
      <Tabs value={tab} onChange={setTab} items={[{ value: "day", label: "By day" }, { value: "review", label: "Needs review" }, { value: "audit", label: "Audit log" }]} />
      <div className="mt-6">
        {tab === "day" && <DayView tz={tz} />}
        {tab === "review" && <ReviewView tz={tz} />}
        {tab === "audit" && <AuditView tz={tz} />}
      </div>
    </>
  );
}

function shiftDate(ymd: string, n: number) {
  const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

function DayView({ tz }: { tz: string }) {
  const toast = useToast();
  const [date, setDate] = useState(() => todayIn(tz));
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [edit, setEdit] = useState<{ employee_id: string; name: string; session?: Session } | null>(null);
  const [del, setDel] = useState<Session | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    const sb = supabaseBrowser();
    const [r, s] = await Promise.all([
      sb.rpc("report_days", { p_from: date, p_to: date }),
      sb.from("sessions").select(SESSION_COLS).eq("work_date", date).order("check_in_at"),
    ]);
    if (r.error) toast(friendlyError(r.error), "error");
    setRows((r.data as DayRow[]) ?? []);
    setSessions((s.data as Session[]) ?? []);
  }, [date, toast]);
  useEffect(() => { load(); }, [load]);

  const byEmp = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const s of sessions) m.set(s.employee_id, [...(m.get(s.employee_id) ?? []), s]);
    return m;
  }, [sessions]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day"><ChevronLeft className="size-5" /></Button>
        <Input type="date" value={date} max={todayIn(tz)} onChange={(e) => e.target.value && setDate(e.target.value)} className="min-w-0 flex-1 sm:w-auto sm:flex-none" />
        <Button variant="ghost" size="icon" onClick={() => setDate(shiftDate(date, 1))} disabled={date >= todayIn(tz)} aria-label="Next day"><ChevronRight className="size-5" /></Button>
        <span className="w-full text-sm text-muted sm:w-auto">{dateLabel(date, { weekday: "long" })}</span>
      </div>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty title="No employees" /> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const ss = byEmp.get(r.employee_id) ?? [];
            return (
              <li key={r.employee_id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/employees/${r.employee_id}`} className="font-medium hover:underline">{r.full_name}</Link>
                    <Badge className={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    {r.late && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">Late {r.late_min}m</Badge>}
                  </div>
                  <div className="text-sm tabular text-muted">
                    {hm(r.worked_min)} worked{r.break_min > 0 && ` · ${hm(r.break_min)} break`}{r.ot_min > 0 && ` · ${hm(r.ot_min)} OT`}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {ss.map((s) => (
                    <span key={s.id} className="group inline-flex items-center gap-1 rounded-full bg-soft py-1 pr-1 pl-3 text-sm tabular">
                      {timeOf(s.check_in_at, tz)} – {s.check_out_at ? timeOf(s.check_out_at, tz) : "now"}
                      {s.auto_closed && <span className="text-xs text-rose-600">auto</span>}
                      {s.flagged && !s.reviewed_at && <AlertTriangle className="size-3.5 text-amber-600" />}
                      <button className="grid size-6 place-items-center rounded-full text-muted hover:bg-bg hover:text-fg" aria-label="Edit session"
                        onClick={() => setEdit({ employee_id: r.employee_id, name: r.full_name, session: s })}><Pencil className="size-3" /></button>
                      <button className="grid size-6 place-items-center rounded-full text-muted hover:bg-bg hover:text-rose-600" aria-label="Delete session"
                        onClick={() => setDel(s)}><Trash2 className="size-3" /></button>
                    </span>
                  ))}
                  <button className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-sm text-muted hover:bg-soft hover:text-fg"
                    onClick={() => setEdit({ employee_id: r.employee_id, name: r.full_name })}><Plus className="size-3.5" />Add punch</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <EditSession target={edit} date={date} tz={tz} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Delete this session?" danger confirmLabel="Delete" reason="required"
        body={del ? `${timeOf(del.check_in_at, tz)} – ${del.check_out_at ? timeOf(del.check_out_at, tz) : "now"}` : ""}
        onConfirm={async (reason) => {
          const { error } = await supabaseBrowser().rpc("admin_delete_session", { p_id: del!.id, p_reason: reason });
          if (error) toast(friendlyError(error), "error"); else { toast("Session deleted"); load(); }
        }} />
    </>
  );
}

function EditSession({ target, date, tz, onClose, onSaved }: {
  target: { employee_id: string; name: string; session?: Session } | null; date: string; tz: string; onClose: () => void; onSaved: () => void;
}) {
  const [inT, setIn] = useState("");
  const [outT, setOut] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const day = target?.session?.work_date ?? date;

  useEffect(() => {
    if (!target) return;
    setIn(target.session ? isoToHHMM(target.session.check_in_at, tz) : "09:00");
    setOut(target.session ? isoToHHMM(target.session.check_out_at, tz) : "18:00");
    setReason(target.session?.auto_closed ? "Corrected forgotten check-out" : ""); setErr(null);
  }, [target, tz]);

  async function save() {
    if (!inT) { setErr("Check-in time is required"); return; }
    const inIso = zonedToIso(day, inT, tz);
    // A check-out earlier than the check-in means it was after midnight.
    let outIso: string | null = outT ? zonedToIso(day, outT, tz) : null;
    if (outIso && outIso <= inIso) outIso = zonedToIso(shiftDate(day, 1), outT, tz);
    setBusy(true); setErr(null);
    const { error } = await supabaseBrowser().rpc("admin_save_session", {
      p_id: target!.session?.id ?? null, p_employee: target!.employee_id, p_in: inIso, p_out: outIso, p_reason: reason,
    });
    setBusy(false);
    if (error) setErr(friendlyError(error)); else onSaved();
  }

  const s = target?.session;
  return (
    <Modal open={!!target} onClose={onClose} title={s ? "Edit punch" : "Add punch"} footer={
      <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy} disabled={reason.trim().length < 3}>Save</Button></>
    }>
      <p className="mb-4 text-sm text-muted">{target?.name} · {dateLabel(day, { weekday: "long", day: "numeric", month: "long" })}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check in"><Input type="time" value={inT} onChange={(e) => setIn(e.target.value)} /></Field>
        <Field label="Check out" hint="Leave empty if still inside"><Input type="time" value={outT} onChange={(e) => setOut(e.target.value)} /></Field>
      </div>
      <Field label="Reason (required)" className="mt-4"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Forgot to check out, confirmed with manager" /></Field>
      {s && (s.in_distance_m != null || s.flag_reasons.length > 0) && (
        <div className="mt-4 rounded-xl bg-soft p-3 text-xs text-muted">
          {s.in_distance_m != null && <div>In: {Math.round(s.in_distance_m)} m from office, ±{Math.round(s.in_accuracy_m ?? 0)} m accuracy</div>}
          {s.out_distance_m != null && <div>Out: {Math.round(s.out_distance_m)} m from office, ±{Math.round(s.out_accuracy_m ?? 0)} m accuracy</div>}
          {s.flag_reasons.map((f) => <div key={f} className="text-amber-700 dark:text-amber-300">Flag: {f}</div>)}
        </div>
      )}
      {err && <p className="mt-3 text-sm text-rose-600">{err}</p>}
    </Modal>
  );
}

function ReviewView({ tz }: { tz: string }) {
  const toast = useToast();
  const [items, setItems] = useState<Session[] | null>(null);
  const [edit, setEdit] = useState<{ employee_id: string; name: string; session?: Session } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("sessions")
      .select(`${SESSION_COLS}, profile:profiles!sessions_employee_id_fkey(full_name)`)
      .or("needs_review.eq.true,and(flagged.eq.true,reviewed_at.is.null)")
      .order("check_in_at", { ascending: false }).limit(200);
    setItems((data as unknown as Session[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!items) return <Spinner />;
  if (items.length === 0) return <Empty title="Nothing to review">Auto-closed sessions and flagged punches show up here.</Empty>;
  return (
    <>
      <ul className="divide-y divide-line">
        {items.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <div className="font-medium">{s.profile?.full_name} · {dateLabel(s.work_date)}</div>
              <div className="text-sm tabular text-muted">{timeOf(s.check_in_at, tz)} – {s.check_out_at ? timeOf(s.check_out_at, tz) : "now"}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {s.needs_review && <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300">Auto-closed – needs review</Badge>}
                {s.flag_reasons.map((f) => <Badge key={f} className="bg-amber-500/15 text-amber-700 dark:text-amber-300">{f}</Badge>)}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEdit({ employee_id: s.employee_id, name: s.profile?.full_name ?? "", session: s })}>Edit times</Button>
              <Button variant="secondary" size="sm" onClick={async () => {
                const { error } = await supabaseBrowser().rpc("review_session", { p_id: s.id, p_note: null });
                if (error) toast(friendlyError(error), "error"); else { toast("Marked as reviewed"); load(); }
              }}>Accept as is</Button>
            </div>
          </li>
        ))}
      </ul>
      <EditSession target={edit} date={edit?.session?.work_date ?? todayIn(tz)} tz={tz} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    </>
  );
}

function AuditView({ tz }: { tz: string }) {
  const [items, setItems] = useState<Audit[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [entity, setEntity] = useState<"session" | "all">("session");

  useEffect(() => {
    const sb = supabaseBrowser();
    let q = sb.from("audit_log").select("*").order("at", { ascending: false }).limit(300);
    if (entity === "session") q = q.eq("entity", "session").neq("source", "device");
    q.then(({ data }) => setItems((data as Audit[]) ?? []));
    sb.from("profiles").select("id, full_name").then(({ data }) => setNames(new Map(((data as { id: string; full_name: string }[]) ?? []).map((p) => [p.id, p.full_name]))));
  }, [entity]);

  const t = (v: unknown) => (typeof v === "string" ? timeOf(v, tz) : "—");
  return (
    <>
      <Tabs value={entity} onChange={setEntity} items={[{ value: "session", label: "Punch edits" }, { value: "all", label: "Everything" }]} />
      {!items ? <Spinner className="mt-6" /> : items.length === 0 ? <Empty title="No entries yet" /> : (
        <div className="scroll-x mt-4">
          <table className="data">
            <thead><tr><th>When</th><th>Who</th><th>Employee</th><th>What</th><th>Old → new</th><th>Reason</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap tabular">{dateLabel(a.at, { day: "numeric", month: "short" }, tz)} {timeOf(a.at, tz)}</td>
                  <td className="whitespace-nowrap">{a.actor ? names.get(a.actor) ?? "Admin" : a.source === "auto" ? "System (auto)" : "System"}</td>
                  <td className="whitespace-nowrap">{a.employee_id ? names.get(a.employee_id) ?? "—" : "—"}</td>
                  <td className="whitespace-nowrap">{a.entity} · {a.action}</td>
                  <td className="whitespace-nowrap tabular text-muted">
                    {a.entity === "session"
                      ? <>{a.old_data ? `${t(a.old_data.check_in_at)}–${t(a.old_data.check_out_at)}` : "∅"} → {a.new_data ? `${t(a.new_data.check_in_at)}–${t(a.new_data.check_out_at)}` : "deleted"}</>
                      : a.entity_id}
                  </td>
                  <td className="min-w-48">{a.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
