"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { dateLabel, downloadText, hm, monthStart, num, STATUS_LABEL, timeOf, todayIn, toCsv } from "@/lib/format";
import { Button, Empty, Field, Input, PageHeader, Select, Spinner, useToast } from "@/components/ui";

type Day = { employee_id: string; full_name: string; employee_code: string | null; day: string; day_type: string; status: string; worked_min: number;
  break_min: number; session_count: number; first_in: string | null; last_out: string | null; late: boolean; late_min: number;
  leave_fraction: number; leave_type: string | null; lop: number; ot_min: number };
type FieldDayRow = { employee_id: string; full_name: string; employee_code: string | null; work_date: string; start_at: string; end_at: string | null;
  onsite: boolean; offsite_status: string; late: boolean; late_min: number; worked_min: number; break_min: number; km: number; km_adjusted: boolean;
  visits_planned: number; visits_done: number; planned_done: number; unplanned: number; missed: number; auto_closed: boolean; flags: string[] };
type Visit = { employee_id: string; full_name: string; work_date: string; seq: number; site: string; category: string | null; planned: boolean;
  plan_seq: number | null; in_at: string; out_at: string | null; minutes: number; notes: string | null };
type SiteTime = { site: string; category: string | null; visits: number; staff: number; total_min: number; avg_min: number; last_visit: string | null };

type Kind = "summary" | "attendance" | "late" | "ot" | "field" | "visits" | "visitlog" | "km" | "sites";
const KINDS: { value: Kind; label: string; group: string }[] = [
  { value: "summary", label: "Monthly summary", group: "Attendance" }, { value: "attendance", label: "Daily attendance", group: "Attendance" },
  { value: "late", label: "Late arrivals", group: "Attendance" }, { value: "ot", label: "Overtime", group: "Attendance" },
  { value: "field", label: "Field days", group: "Field" }, { value: "visits", label: "Visits: planned vs completed", group: "Field" },
  { value: "visitlog", label: "Visit log", group: "Field" }, { value: "km", label: "Km travelled", group: "Field" },
  { value: "sites", label: "Time spent per site", group: "Field" },
];

type Table = { headers: string[]; rows: (string | number)[][]; numeric: boolean[] };

export default function Reports() {
  const toast = useToast();
  const today = todayIn();
  const [kind, setKind] = useState<Kind>("summary");
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [emp, setEmp] = useState("");
  const [emps, setEmps] = useState<{ id: string; full_name: string }[]>([]);
  const [data, setData] = useState<unknown[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser().from("profiles").select("id, full_name").neq("role", "admin").order("full_name").then(({ data }) => setEmps(data ?? []));
  }, []);

  const source = ["summary", "attendance", "late", "ot"].includes(kind) ? "report_days"
    : kind === "visitlog" ? "report_visits" : kind === "sites" ? "report_site_time" : "report_field_days";
  useEffect(() => {
    if (!from || !to || to < from) return;
    setData(null); setErr(null);
    const args: Record<string, unknown> = { p_from: from, p_to: to };
    if (source !== "report_site_time") args.p_emp = emp || null;
    supabaseBrowser().rpc(source, args).then(({ data, error }) => { if (error) setErr(friendlyError(error)); else setData(data as unknown[]); });
  }, [from, to, emp, source]);

  const table = useMemo((): Table => build(kind, data ?? []), [kind, data]);
  const title = `${KINDS.find((k) => k.value === kind)!.label} · ${from} to ${to}`;

  async function exportAs(format: "xlsx" | "pdf") {
    setBusy(format);
    const res = await fetch("/api/reports/export", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, title, headers: table.headers, rows: table.rows, numeric: table.numeric }) });
    setBusy(null);
    if (!res.ok) { toast("Export failed", "error"); return; }
    const blob = await res.blob();
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${kind}-${from}-to-${to}.${format}`; a.click();
  }

  return (
    <>
      <PageHeader title="Reports" actions={
        <>
          <Button variant="outline" size="sm" disabled={!table.rows.length} onClick={() => downloadText(`${kind}-${from}-to-${to}.csv`, toCsv(table.headers, table.rows))}><Download className="size-4" />CSV</Button>
          <Button variant="outline" size="sm" disabled={!table.rows.length} loading={busy === "xlsx"} onClick={() => exportAs("xlsx")}><FileSpreadsheet className="size-4" />Excel</Button>
          <Button variant="outline" size="sm" disabled={!table.rows.length} loading={busy === "pdf"} onClick={() => exportAs("pdf")}><FileText className="size-4" />PDF</Button>
        </>
      } />
      <div className="mb-5 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Report" className="col-span-2 sm:col-span-1">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {["Attendance", "Field"].map((g) => <optgroup key={g} label={g}>{KINDS.filter((k) => k.group === g).map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</optgroup>)}
          </Select>
        </Field>
        <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        {kind !== "sites" && (
          <Field label="Staff" className="col-span-2 sm:col-span-1">
            <Select value={emp} onChange={(e) => setEmp(e.target.value)}>
              <option value="">Everyone</option>
              {emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      {!data && !err ? <Spinner /> : table.rows.length === 0 ? <Empty title="Nothing in this range" /> : (
        <div className="scroll-x">
          <table className="data">
            <thead><tr>{table.headers.map((h, i) => <th key={h} className={table.numeric[i] ? "num" : ""}>{h}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={table.numeric[j] ? "num" : "whitespace-nowrap"}>{j <= 1 && /^\d{4}-\d{2}-\d{2}$/.test(String(c)) ? dateLabel(String(c)) : c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function group<T extends { employee_id: string }>(list: T[]) {
  const m = new Map<string, T[]>();
  list.forEach((r) => m.set(r.employee_id, [...(m.get(r.employee_id) ?? []), r]));
  return [...m.values()];
}

function build(kind: Kind, raw: unknown[]): Table {
  if (kind === "summary" || kind === "attendance" || kind === "late" || kind === "ot") {
    const list = raw as Day[];
    if (kind === "summary") return {
      headers: ["Staff", "Emp ID", "Working days", "Present", "Half days", "Leave", "Absent", "Late", "Worked", "OT", "LOP days"],
      numeric: [false, false, true, true, true, true, true, true, true, true, true],
      rows: group(list).map((rs) => {
        const c = (f: (r: Day) => boolean) => rs.filter(f).length;
        return [rs[0].full_name, rs[0].employee_code ?? "", c((r) => r.day_type === "working" && r.status !== "not_employed" && r.status !== "upcoming"),
          c((r) => r.status === "present"), c((r) => r.status === "half_day"), num(rs.reduce((s, r) => s + Number(r.leave_fraction), 0)),
          num(rs.reduce((s, r) => s + (r.status === "absent" ? 1 : r.status === "half_leave_absent" ? 0.5 : 0), 0)), c((r) => r.late),
          hm(rs.reduce((s, r) => s + r.worked_min, 0)), hm(rs.reduce((s, r) => s + r.ot_min, 0)), num(rs.reduce((s, r) => s + Number(r.lop), 0))];
      }),
    };
    if (kind === "ot") return { headers: ["Date", "Staff", "Day", "Worked", "OT"], numeric: [false, false, false, true, true],
      rows: list.filter((r) => r.ot_min > 0).map((r) => [r.day, r.full_name, r.day_type === "working" ? "Working day" : r.day_type === "holiday" ? "Holiday" : "Weekly off", hm(r.worked_min), hm(r.ot_min)]) };
    if (kind === "late") return { headers: ["Date", "Staff", "First in", "Late by"], numeric: [false, false, true, true],
      rows: list.filter((r) => r.late).map((r) => [r.day, r.full_name, timeOf(r.first_in), `${r.late_min} min`]) };
    return { headers: ["Date", "Staff", "Status", "First in", "Last out", "Sessions", "Worked", "Break", "OT", "Late", "Leave"],
      numeric: [false, false, false, true, true, true, true, true, true, false, false],
      rows: list.filter((r) => r.status !== "upcoming").map((r) => [r.day, r.full_name, STATUS_LABEL[r.status] ?? r.status, timeOf(r.first_in), timeOf(r.last_out),
        r.session_count, hm(r.worked_min), hm(r.break_min), hm(r.ot_min), r.late ? `${r.late_min} min` : "", r.leave_type ?? ""]) };
  }
  if (kind === "visitlog") {
    const list = raw as Visit[];
    return { headers: ["Date", "Staff", "#", "Site", "Category", "Planned", "In", "Out", "Minutes", "Notes"],
      numeric: [false, false, true, false, false, false, true, true, true, false],
      rows: list.map((v) => [v.work_date, v.full_name, v.seq, v.site, v.category ?? "", v.planned ? `Yes (#${v.plan_seq})` : "Unplanned",
        timeOf(v.in_at), timeOf(v.out_at), Number(v.minutes), v.notes ?? ""]) };
  }
  if (kind === "sites") {
    const list = raw as SiteTime[];
    return { headers: ["Site", "Category", "Visits", "Staff", "Total time", "Average visit", "Last visit"],
      numeric: [false, false, true, true, true, true, true],
      rows: list.map((s) => [s.site, s.category ?? "", Number(s.visits), Number(s.staff), hm(Number(s.total_min)), hm(Number(s.avg_min)), s.last_visit ? dateLabel(s.last_visit.slice(0, 10)) : "—"]) };
  }
  const list = raw as FieldDayRow[];
  if (kind === "field") return {
    headers: ["Date", "Staff", "Start", "Start type", "Late", "End", "Worked", "Breaks", "Km", "Visits", "Flags"],
    numeric: [false, false, true, false, false, true, true, true, true, true, false],
    rows: list.map((r) => [r.work_date, r.full_name, timeOf(r.start_at), r.onsite ? "On-site" : `Off-site (${r.offsite_status})`, r.late ? `${r.late_min} min` : "",
      r.end_at ? timeOf(r.end_at) + (r.auto_closed ? " (auto)" : "") : "on duty", hm(r.worked_min), hm(r.break_min), num(r.km) + (r.km_adjusted ? "*" : ""),
      `${r.planned_done}/${r.visits_planned}${r.unplanned ? ` +${r.unplanned}` : ""}`, r.flags.filter((f) => !/^Off-site start/.test(f)).join("; ")]),
  };
  if (kind === "visits") return {
    headers: ["Staff", "Emp ID", "Days", "Planned", "Completed", "Missed", "Unplanned", "Completion"],
    numeric: [false, false, true, true, true, true, true, true],
    rows: group(list).map((rs) => {
      const s = (f: (r: FieldDayRow) => number) => rs.reduce((a, r) => a + f(r), 0);
      const planned = s((r) => r.visits_planned), done = s((r) => r.planned_done);
      return [rs[0].full_name, rs[0].employee_code ?? "", rs.length, planned, done, s((r) => r.missed), s((r) => r.unplanned), planned ? `${Math.round((done / planned) * 100)}%` : "—"];
    }),
  };
  return {
    headers: ["Staff", "Emp ID", "Days", "Km (GPS / adjusted)", "Average per day", "Days adjusted"],
    numeric: [false, false, true, true, true, true],
    rows: group(list).map((rs) => {
      const total = rs.reduce((a, r) => a + Number(r.km), 0);
      return [rs[0].full_name, rs[0].employee_code ?? "", rs.length, num(total), num(total / rs.length), rs.filter((r) => r.km_adjusted).length];
    }),
  };
}
