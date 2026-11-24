"use client";
import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { dateLabel, downloadText, hm, monthStart, num, STATUS_LABEL, timeOf, todayIn, toCsv } from "@/lib/format";
import { Button, Empty, Field, Input, PageHeader, Select, Spinner, Tabs } from "@/components/ui";

type R = { employee_id: string; full_name: string; employee_code: string | null; department: string | null; day: string; day_type: string;
  status: string; worked_min: number; break_min: number; session_count: number; first_in: string | null; last_out: string | null;
  late: boolean; late_min: number; leave_fraction: number; leave_type: string | null; lop: number; ot_min: number; needs_review: boolean };
type Kind = "attendance" | "summary" | "ot" | "late";

export default function Reports() {
  const today = todayIn();
  const [kind, setKind] = useState<Kind>("summary");
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [emp, setEmp] = useState("");
  const [emps, setEmps] = useState<{ id: string; full_name: string }[]>([]);
  const [rows, setRows] = useState<R[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser().from("profiles").select("id, full_name").order("full_name").then(({ data }) => setEmps(data ?? []));
  }, []);
  useEffect(() => {
    if (!from || !to || to < from) return;
    setRows(null); setErr(null);
    supabaseBrowser().rpc("report_days", { p_from: from, p_to: to, p_emp: emp || null })
      .then(({ data, error }) => { if (error) setErr(friendlyError(error)); else setRows(data as R[]); });
  }, [from, to, emp]);

  const table = useMemo((): { headers: string[]; rows: (string | number)[][]; numeric: boolean[] } => {
    const list = rows ?? [];
    if (kind === "summary") {
      const m = new Map<string, R[]>();
      list.forEach((r) => m.set(r.employee_id, [...(m.get(r.employee_id) ?? []), r]));
      return {
        headers: ["Employee", "Emp ID", "Working days", "Present", "Half days", "Leave", "Absent", "Late", "Worked", "OT", "LOP days"],
        numeric: [false, false, true, true, true, true, true, true, true, true, true],
        rows: [...m.values()].map((rs) => {
          const c = (f: (r: R) => boolean) => rs.filter(f).length;
          return [rs[0].full_name, rs[0].employee_code ?? "",
            c((r) => r.day_type === "working" && r.status !== "not_employed" && r.status !== "upcoming"),
            c((r) => r.status === "present"), c((r) => r.status === "half_day"),
            num(rs.reduce((s, r) => s + Number(r.leave_fraction), 0)),
            num(rs.reduce((s, r) => s + (r.status === "absent" ? 1 : r.status === "half_leave_absent" ? 0.5 : 0), 0)),
            c((r) => r.late), hm(rs.reduce((s, r) => s + r.worked_min, 0)), hm(rs.reduce((s, r) => s + r.ot_min, 0)),
            num(rs.reduce((s, r) => s + Number(r.lop), 0))];
        }),
      };
    }
    const filtered = kind === "ot" ? list.filter((r) => r.ot_min > 0) : kind === "late" ? list.filter((r) => r.late) : list.filter((r) => r.status !== "upcoming");
    if (kind === "ot") return {
      headers: ["Date", "Employee", "Day", "Worked", "OT"], numeric: [false, false, false, true, true],
      rows: filtered.map((r) => [r.day, r.full_name, r.day_type === "working" ? "Working day" : r.day_type === "holiday" ? "Holiday" : "Weekly off", hm(r.worked_min), hm(r.ot_min)]),
    };
    if (kind === "late") return {
      headers: ["Date", "Employee", "First in", "Late by"], numeric: [false, false, true, true],
      rows: filtered.map((r) => [r.day, r.full_name, timeOf(r.first_in), `${r.late_min} min`]),
    };
    return {
      headers: ["Date", "Employee", "Status", "First in", "Last out", "Sessions", "Worked", "Break", "OT", "Late", "Leave"],
      numeric: [false, false, false, true, true, true, true, true, true, false, false],
      rows: filtered.map((r) => [r.day, r.full_name, STATUS_LABEL[r.status] ?? r.status, timeOf(r.first_in), timeOf(r.last_out), r.session_count,
        hm(r.worked_min), hm(r.break_min), hm(r.ot_min), r.late ? `${r.late_min} min` : "", r.leave_type ?? ""]),
    };
  }, [rows, kind]);

  return (
    <>
      <PageHeader title="Reports" actions={
        <Button variant="outline" size="sm" disabled={!table.rows.length}
          onClick={() => downloadText(`${kind}-report-${from}-to-${to}.csv`, toCsv(table.headers, table.rows))}><Download className="size-4" />Export CSV</Button>
      } />
      <Tabs value={kind} onChange={setKind} items={[
        { value: "summary", label: "Monthly summary" }, { value: "attendance", label: "Attendance" }, { value: "ot", label: "Overtime" }, { value: "late", label: "Late" },
      ]} />
      <div className="my-5 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Employee" className="col-span-2 sm:col-span-1">
          <Select value={emp} onChange={(e) => setEmp(e.target.value)}>
            <option value="">Everyone</option>
            {emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </Select>
        </Field>
      </div>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      {!rows && !err ? <Spinner /> : table.rows.length === 0 ? <Empty title="Nothing in this range" /> : (
        <div className="scroll-x">
          <table className="data">
            <thead><tr>{table.headers.map((h, i) => <th key={h} className={table.numeric[i] ? "num" : ""}>{h}</th>)}</tr></thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={table.numeric[j] ? "num" : "whitespace-nowrap"}>{j === 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(c)) ? dateLabel(String(c)) : c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
