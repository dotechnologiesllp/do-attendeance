"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { addMonths, dateLabel, hm, monthEnd, monthLabel, monthStart, num, STATUS_LABEL, STATUS_TONE, timeOf, todayIn, TZ_DEFAULT } from "@/lib/format";
import { Badge, Button, cn, Spinner } from "./ui";

export type DayRow = {
  day: string; day_type: string; status: string; worked_min: number; break_min: number; session_count: number;
  open_session: boolean; first_in: string | null; last_out: string | null; late: boolean; late_min: number;
  leave_fraction: number; leave_paid: number; leave_unpaid: number; leave_type: string | null; lop: number;
  ot_min: number; needs_review: boolean; flagged: boolean; holiday_name: string | null;
};

type Session = { id: string; check_in_at: string; check_out_at: string | null; auto_closed: boolean; flagged: boolean; in_source: string; out_source: string | null };

export function summarise(rows: DayRow[]) {
  const s = { present: 0, half: 0, leave: 0, absent: 0, late: 0, worked: 0, ot: 0, lop: 0, working: 0 };
  for (const r of rows) {
    if (r.day_type === "working" && r.status !== "not_employed") s.working++;
    if (r.status === "present") s.present++;
    if (r.status === "half_day") s.half++;
    if (r.status === "absent") s.absent++;
    if (r.status === "half_leave_absent") s.absent += 0.5;
    s.leave += Number(r.leave_fraction);
    if (r.late) s.late++;
    s.worked += r.worked_min; s.ot += r.ot_min; s.lop += Number(r.lop);
  }
  return s;
}

export function AttendanceMonth({ employeeId, tz = TZ_DEFAULT, onDay }: { employeeId: string; tz?: string; onDay?: (day: string) => void }) {
  const [month, setMonth] = useState(() => monthStart(todayIn(tz)));
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[] | null>(null);

  useEffect(() => {
    let live = true;
    setRows(null); setSelected(null);
    supabaseBrowser().rpc("attendance_days", { p_emp: employeeId, p_from: month, p_to: monthEnd(month) })
      .then(({ data, error }) => { if (!live) return; if (error) setError(error.message); else setRows(data as DayRow[]); });
    return () => { live = false; };
  }, [employeeId, month]);

  useEffect(() => {
    if (!selected) return;
    setSessions(null);
    supabaseBrowser().from("sessions")
      .select("id, check_in_at, check_out_at, auto_closed, flagged, in_source, out_source")
      .eq("employee_id", employeeId).eq("work_date", selected).order("check_in_at")
      .then(({ data }) => setSessions((data as Session[]) ?? []));
  }, [selected, employeeId]);

  const s = useMemo(() => summarise(rows ?? []), [rows]);
  const lead = rows?.length ? (new Date(rows[0].day + "T12:00:00Z").getUTCDay() + 6) % 7 : 0; // Monday-first grid
  const sel = rows?.find((r) => r.day === selected);
  const thisMonth = monthStart(todayIn(tz));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft className="size-5" /></Button>
        <span className="font-medium">{monthLabel(month)}</span>
        <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= thisMonth} aria-label="Next month"><ChevronRight className="size-5" /></Button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!rows ? <div className="flex justify-center py-16"><Spinner /></div> : (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="pb-1">{d}</div>)}
            {Array.from({ length: lead }).map((_, i) => <div key={"l" + i} />)}
            {rows.map((r) => (
              <button key={r.day} type="button"
                onClick={() => { setSelected(r.day === selected ? null : r.day); onDay?.(r.day); }}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition",
                  STATUS_TONE[r.status] ?? "",
                  selected === r.day && "ring-2 ring-fg/60",
                )}
                title={`${dateLabel(r.day)} · ${STATUS_LABEL[r.status] ?? r.status}`}>
                <span className="font-medium tabular">{Number(r.day.slice(8))}</span>
                {r.worked_min > 0 && <span className="text-[10px] opacity-80 tabular">{Math.floor(r.worked_min / 60)}h{r.worked_min % 60 ? String(r.worked_min % 60).padStart(2, "0") : ""}</span>}
                {(r.late || r.needs_review) && <span className={cn("absolute top-1 right-1 size-1.5 rounded-full", r.needs_review ? "bg-rose-500" : "bg-amber-500")} />}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            {[["present", "Present"], ["half_day", "Half day"], ["leave", "Leave"], ["absent", "Absent"], ["holiday", "Holiday"], ["weekly_off", "Off"]].map(([k, l]) => (
              <span key={k} className="inline-flex items-center gap-1"><span className={cn("size-2.5 rounded-sm", STATUS_TONE[k])} />{l}</span>
            ))}
            <span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-amber-500" />Late</span>
          </div>

          {sel && (
            <div className="mt-4 rounded-2xl bg-soft p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{dateLabel(sel.day, { weekday: "long", day: "numeric", month: "long" })}</span>
                <Badge className={STATUS_TONE[sel.status]}>{STATUS_LABEL[sel.status] ?? sel.status}</Badge>
              </div>
              {sel.holiday_name && <p className="mt-1 text-muted">{sel.holiday_name}</p>}
              {sel.leave_type && <p className="mt-1 text-muted">{sel.leave_type} leave · {num(sel.leave_fraction)} day{Number(sel.leave_unpaid) > 0 ? ` (${num(sel.leave_unpaid)} unpaid)` : ""}</p>}
              {!sessions ? <Spinner className="mt-3" /> : sessions.length > 0 && (
                <ul className="mt-3 space-y-1 tabular">
                  {sessions.map((x) => (
                    <li key={x.id} className="flex justify-between">
                      <span>{timeOf(x.check_in_at, tz)} → {x.check_out_at ? timeOf(x.check_out_at, tz) : "now"}</span>
                      <span className="text-muted">
                        {x.auto_closed ? "auto-closed" : x.in_source === "admin" || x.out_source === "admin" ? "edited by admin" : ""}
                        {x.flagged ? " · flagged" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-muted">
                <span>Worked {hm(sel.worked_min)}</span>
                <span>Break {hm(sel.break_min)}</span>
                {sel.ot_min > 0 && <span>OT {hm(sel.ot_min)}</span>}
                {sel.late && <span className="text-amber-600 dark:text-amber-400">Late {sel.late_min} min</span>}
              </div>
            </div>
          )}

          <dl className="mt-6 grid grid-cols-3 gap-y-4 text-center sm:grid-cols-6">
            {[
              ["Present", s.present], ["Half days", s.half], ["Leave", num(s.leave)], ["Absent", num(s.absent)], ["Late", s.late], ["LOP days", num(s.lop)],
            ].map(([l, v]) => (
              <div key={l as string}><dt className="text-xs text-muted">{l}</dt><dd className="mt-0.5 text-lg font-semibold tabular">{v}</dd></div>
            ))}
          </dl>
          <p className="mt-4 text-center text-sm text-muted">Worked {hm(s.worked)} · Overtime {hm(s.ot)} · {s.working} working days</p>
        </>
      )}
    </div>
  );
}
