"use client";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { dateLabel, LEAVE_TONE, num, todayIn } from "@/lib/format";
import { Badge, Button, ConfirmDialog, Empty, Field, Input, Modal, Select, Spinner, Switch, Textarea, useToast } from "@/components/ui";
import { Plus } from "lucide-react";

type Balance = { leave_type_id: string; name: string; paid: boolean; quota: number; used: number; pending: number; remaining: number };
type Req = { id: string; start_date: string; end_date: string; half_day: boolean; reason: string | null; status: string;
  days: number; paid_days: number; lop_days: number; admin_note: string | null; leave_types: { name: string } | null };


export default function LeavePage() {
  const toast = useToast();
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [reqs, setReqs] = useState<Req[] | null>(null);
  const [open, setOpen] = useState(false);
  const [cancel, setCancel] = useState<Req | null>(null);
  const year = Number(todayIn().slice(0, 4));

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    const [b, r] = await Promise.all([
      sb.rpc("leave_balances", { p_emp: user.id, p_year: year }),
      sb.from("leave_requests").select("id, start_date, end_date, half_day, reason, status, days, paid_days, lop_days, admin_note, leave_types(name)")
        .eq("employee_id", user.id).order("start_date", { ascending: false }).limit(50),
    ]);
    setBalances((b.data as Balance[]) ?? []);
    setReqs((r.data as unknown as Req[]) ?? []);
  }, [year]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="pt-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Leave</h1>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-4" />Apply</Button>
      </div>

      {!balances ? <Spinner /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {balances.map((b) => (
            <div key={b.leave_type_id} className="rounded-2xl border border-line p-4">
              <div className="text-sm text-muted">{b.name}</div>
              <div className="mt-1 text-2xl font-semibold tabular">{b.paid ? num(b.remaining) : "—"}</div>
              <div className="mt-0.5 text-xs text-muted">{b.paid ? `of ${num(b.quota)} left · ${num(b.used)} used` : "Unpaid (loss of pay)"}</div>
              {Number(b.pending) > 0 && <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">{num(b.pending)} pending</div>}
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-10 mb-2 font-semibold">My requests</h2>
      {!reqs ? <Spinner /> : reqs.length === 0 ? <Empty title="No leave requests yet" /> : (
        <ul className="divide-y divide-line">
          {reqs.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-3">
              <div>
                <div className="font-medium">
                  {r.leave_types?.name} · {dateLabel(r.start_date)}{r.end_date !== r.start_date && ` – ${dateLabel(r.end_date)}`}
                </div>
                <div className="text-sm text-muted">
                  {num(r.days)} day{Number(r.days) === 1 ? "" : "s"}{r.half_day && " (half day)"}
                  {r.status === "approved" && Number(r.lop_days) > 0 && ` · ${num(r.lop_days)} loss of pay`}
                  {r.reason && ` · ${r.reason}`}
                </div>
                {r.admin_note && <div className="mt-0.5 text-sm text-muted">Admin: {r.admin_note}</div>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Badge className={LEAVE_TONE[r.status]}>{r.status[0].toUpperCase() + r.status.slice(1)}</Badge>
                {r.status === "pending" && <button className="text-xs text-muted hover:text-fg" onClick={() => setCancel(r)}>Cancel</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ApplyLeave open={open} onClose={() => setOpen(false)} balances={balances ?? []} onDone={() => { setOpen(false); load(); toast("Leave request sent"); }} />
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} title="Cancel this request?" confirmLabel="Cancel request" danger
        onConfirm={async () => {
          const { error } = await supabaseBrowser().rpc("cancel_leave", { p_id: cancel!.id });
          if (error) toast(friendlyError(error), "error"); else { toast("Request cancelled"); load(); }
        }} />
    </div>
  );
}

function ApplyLeave({ open, onClose, balances, onDone }: { open: boolean; onClose: () => void; balances: Balance[]; onDone: () => void }) {
  const today = todayIn();
  const [type, setType] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [half, setHalf] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setType(balances[0]?.leave_type_id ?? ""); setFrom(today); setTo(today); setHalf(false); setReason(""); setErr(null); } }, [open, balances, today]);
  const bal = balances.find((b) => b.leave_type_id === type);

  async function submit() {
    setBusy(true); setErr(null);
    const { error } = await supabaseBrowser().rpc("apply_leave", { p_type: type, p_from: from, p_to: half ? from : to, p_half: half, p_reason: reason });
    setBusy(false);
    if (error) setErr(friendlyError(error)); else onDone();
  }

  return (
    <Modal open={open} onClose={onClose} title="Apply for leave" footer={
      <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!type}>Send request</Button></>
    }>
      <div className="space-y-4">
        <Field label="Leave type" hint={bal ? (bal.paid ? `${num(bal.remaining)} days left this year. Days beyond the balance become loss of pay.` : "Unpaid: every day is loss of pay.") : undefined}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {balances.map((b) => <option key={b.leave_type_id} value={b.leave_type_id}>{b.name}</option>)}
          </Select>
        </Field>
        <Switch checked={half} onChange={setHalf} label="Half day" hint="Only for a single date" />
        <div className="grid grid-cols-2 gap-3">
          <Field label={half ? "Date" : "From"}><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></Field>
          {!half && <Field label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>}
        </div>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" /></Field>
        <p className="text-xs text-muted">Holidays and weekly offs inside the range are not counted.</p>
        {err && <p className="text-sm text-rose-600">{err}</p>}
      </div>
    </Modal>
  );
}
