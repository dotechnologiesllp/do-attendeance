"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Lock, Trash2, Unlock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { addMonths, downloadText, monthLabel, monthStart, num, rupees, todayIn, toCsv, toPaise } from "@/lib/format";
import { adjustmentsNet, PAYROLL_COLUMNS, type PayrollRow } from "@/lib/payroll";
import { Badge, Button, ConfirmDialog, Empty, Field, Input, PageHeader, Select, Sheet, Spinner, useToast } from "@/components/ui";
import { PayslipView } from "@/components/payslip-view";

type Payroll = { month: string; status: "draft" | "finalized"; working_days: number; rows: PayrollRow[] };

export default function PayrollPage() {
  const toast = useToast();
  const [month, setMonth] = useState(() => addMonths(monthStart(todayIn()), -1));
  const [data, setData] = useState<Payroll | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<PayrollRow | null>(null);
  const [confirmFinal, setConfirmFinal] = useState(false);
  const [confirmUnlock, setConfirmUnlock] = useState(false);

  const load = useCallback(async () => {
    setData(null); setErr(null);
    const { data, error } = await supabaseBrowser().rpc("compute_payroll", { p_month: month });
    if (error) setErr(friendlyError(error)); else setData(data as Payroll);
  }, [month]);
  useEffect(() => { load(); }, [load]);

  // Keep the open drawer in sync after adjustments change.
  useEffect(() => {
    if (open && data) setOpen(data.rows.find((r) => r.employee_id === open.employee_id) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const totals = useMemo(() => {
    const t = { gross: 0, lop: 0, ot: 0, adj: 0, net: 0 };
    for (const r of data?.rows ?? []) { t.gross += Number(r.gross_paise); t.lop += Number(r.lop_paise); t.ot += Number(r.ot_paise); t.adj += adjustmentsNet(r); t.net += Number(r.net_paise); }
    return t;
  }, [data]);

  const locked = data?.status === "finalized";
  const reviewDays = (data?.rows ?? []).reduce((s, r) => s + Number(r.review_days), 0);
  const current = monthStart(todayIn());

  function exportCsv() {
    if (!data) return;
    const headers = PAYROLL_COLUMNS.map((c) => c.label);
    const rows = data.rows.map((r) => PAYROLL_COLUMNS.map((c) => {
      const v = c.key === "adjustments_net" ? adjustmentsNet(r) : r[c.key as keyof PayrollRow];
      return c.money ? (Number(v) / 100).toFixed(2) : (v as string | number);
    }));
    downloadText(`payroll-${month.slice(0, 7)}.csv`, toCsv(headers, rows));
  }

  return (
    <>
      <PageHeader title="Payroll" sub={data ? `${data.working_days} working days · ${data.rows.length} employees` : undefined} actions={
        <>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.rows.length}><Download className="size-4" />CSV</Button>
          <a href={`/api/payroll/export?month=${month}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-line px-3 text-sm font-medium hover:bg-soft"><FileSpreadsheet className="size-4" />Excel</a>
          {locked
            ? <Button variant="outline" size="sm" onClick={() => setConfirmUnlock(true)}><Unlock className="size-4" />Unlock</Button>
            : <Button size="sm" onClick={() => setConfirmFinal(true)} disabled={!data?.rows.length}><Lock className="size-4" />Finalize payroll</Button>}
        </>
      } />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft className="size-5" /></Button>
        <span className="min-w-36 text-center font-medium">{monthLabel(month)}</span>
        <Button variant="ghost" size="icon" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= current} aria-label="Next month"><ChevronRight className="size-5" /></Button>
        {data && (locked
          ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><Lock className="size-3" />Finalized · locked</Badge>
          : <Badge>{month === current ? "Draft · month in progress" : "Draft"}</Badge>)}
        {!locked && reviewDays > 0 && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">{reviewDays} auto-closed day(s) to review</Badge>}
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {!data && !err ? <div className="flex justify-center py-20"><Spinner /></div> : data && data.rows.length === 0 ? <Empty title="No employees on payroll this month" /> : data && (
        <div className="scroll-x -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="data">
            <thead>
              <tr>{PAYROLL_COLUMNS.filter((c) => c.key !== "employee_code").map((c) => <th key={c.key} className={c.key === "name" ? "" : "num"}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.employee_id} className="clickable" onClick={() => setOpen(r)}>
                  <td className="font-medium whitespace-nowrap">{r.name}{Number(r.review_days) > 0 && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-500 align-middle" title="Has days to review" />}</td>
                  <td className="num">{r.working_days}</td>
                  <td className="num">{r.present}</td>
                  <td className="num">{r.half_days}</td>
                  <td className="num">{num(r.paid_leave)}</td>
                  <td className="num">{num(r.unpaid_leave)}</td>
                  <td className="num">{num(r.absent)}</td>
                  <td className="num">{num(r.lop_days)}</td>
                  <td className="num">{num(r.ot_hours)}</td>
                  <td className="num">{rupees(r.gross_paise)}</td>
                  <td className="num">{Number(r.lop_paise) ? `−${rupees(r.lop_paise)}` : "—"}</td>
                  <td className="num">{Number(r.ot_paise) ? `+${rupees(r.ot_paise)}` : "—"}</td>
                  <td className="num">{adjustmentsNet(r) ? (adjustmentsNet(r) > 0 ? "+" : "") + rupees(adjustmentsNet(r)) : "—"}</td>
                  <td className="num font-semibold">{rupees(r.net_paise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="py-3">Total</td><td colSpan={8} />
                <td className="num">{rupees(totals.gross)}</td>
                <td className="num">−{rupees(totals.lop)}</td>
                <td className="num">+{rupees(totals.ot)}</td>
                <td className="num">{rupees(totals.adj)}</td>
                <td className="num">{rupees(totals.net)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} sub={open ? `${monthLabel(month)} · ${open.designation ?? ""}` : ""}
        footer={open && (
          <a href={`/api/payslip?month=${month}&employee=${open.employee_id}`} target="_blank" rel="noopener"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-[15px] font-medium text-accent-fg">
            <Download className="size-4" />Payslip PDF{!locked && " (draft)"}
          </a>
        )}>
        {open && (
          <>
            <PayslipView row={open} />
            <Adjustments row={open} month={month} locked={locked} onChange={load} />
          </>
        )}
      </Sheet>

      <ConfirmDialog open={confirmFinal} onClose={() => setConfirmFinal(false)} title={`Finalize ${monthLabel(month)}?`} confirmLabel="Finalize and lock"
        body={<>
          This saves every payslip as it is now and locks {monthLabel(month)}: punches, leave and adjustments for this month can't change until you unlock it. Employees will see their payslips.
          {reviewDays > 0 && <span className="mt-2 block text-amber-700 dark:text-amber-300">{reviewDays} auto-closed day(s) haven't been reviewed yet.</span>}
        </>}
        onConfirm={async () => {
          const { error } = await supabaseBrowser().rpc("finalize_payroll", { p_month: month });
          if (error) toast(friendlyError(error), "error"); else { toast("Payroll finalized"); load(); }
        }} />
      <ConfirmDialog open={confirmUnlock} onClose={() => setConfirmUnlock(false)} title={`Unlock ${monthLabel(month)}?`} confirmLabel="Unlock" danger reason="required"
        body="Payslips for this month are withdrawn until you finalize again. The unlock is recorded in the audit log."
        onConfirm={async (reason) => {
          const { error } = await supabaseBrowser().rpc("unlock_payroll", { p_month: month, p_reason: reason });
          if (error) toast(friendlyError(error), "error"); else { toast("Month unlocked"); load(); }
        }} />
    </>
  );
}

const KINDS = [
  { v: "bonus", l: "Bonus (+)" }, { v: "incentive", l: "Incentive (+)" }, { v: "advance", l: "Advance recovery (−)" }, { v: "fine", l: "Fine (−)" },
] as const;

function Adjustments({ row, month, locked, onChange }: { row: PayrollRow; month: string; locked: boolean; onChange: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<(typeof KINDS)[number]["v"]>("bonus");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const paise = toPaise(amount);
    if (!Number.isFinite(paise) || paise <= 0) { toast("Enter an amount", "error"); return; }
    if (!note.trim()) { toast("Add a note", "error"); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().from("payroll_adjustments").insert({ employee_id: row.employee_id, month, kind, amount_paise: paise, note: note.trim() });
    setBusy(false);
    if (error) toast(friendlyError(error), "error"); else { setAmount(""); setNote(""); onChange(); }
  }

  return (
    <div className="mt-8">
      <h4 className="mb-2 text-sm font-semibold">One-time adjustments this month</h4>
      {row.adjustments.length === 0 && <p className="text-sm text-muted">None</p>}
      <ul className="divide-y divide-line text-sm">
        {row.adjustments.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2">
            <span>{a.kind} · {a.note}</span>
            <span className="flex items-center gap-2 tabular">
              {a.kind === "bonus" || a.kind === "incentive" ? "+" : "−"}{rupees(a.paise)}
              {!locked && <button aria-label="Remove" className="text-muted hover:text-rose-600" onClick={async () => {
                const { error } = await supabaseBrowser().from("payroll_adjustments").delete().eq("id", a.id);
                if (error) toast(friendlyError(error), "error"); else onChange();
              }}><Trash2 className="size-4" /></button>}
            </span>
          </li>
        ))}
      </ul>
      {locked ? <p className="mt-3 text-xs text-muted">Unlock the month to change adjustments.</p> : (
        <form onSubmit={add} className="mt-3 space-y-2 rounded-2xl bg-soft p-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}</Select>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ amount" />
          </div>
          <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Diwali bonus" /></Field>
          <Button type="submit" size="sm" variant="secondary" loading={busy}>Add adjustment</Button>
        </form>
      )}
    </div>
  );
}
