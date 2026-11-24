"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { dateLabel, LEAVE_TONE, num, rupees, todayIn, toPaise } from "@/lib/format";
import { AttendanceMonth } from "@/components/attendance-month";
import { EmployeeForm, type EmployeeFormValues, type OfficeLite } from "@/components/admin/employee-form";
import { Badge, Button, ConfirmDialog, Field, Input, Modal, Section, Select, Spinner, Tabs, useToast } from "@/components/ui";

type Profile = {
  id: string; role: "admin" | "employee"; full_name: string; employee_code: string | null; phone: string | null; email: string | null;
  designation: string | null; department: string | null; joining_date: string; exit_date: string | null; shift_start: string | null;
  shift_end: string | null; active: boolean; monthly_gross_paise: number; ot_eligible: boolean; ot_multiplier: number | null;
};
type Component = { id: string; kind: "allowance" | "deduction"; name: string; amount_paise: number };
type Balance = { leave_type_id: string; name: string; paid: boolean; quota: number; used: number; pending: number; remaining: number };
type Req = { id: string; start_date: string; end_date: string; status: string; days: number; lop_days: number; leave_types: { name: string } | null };

export default function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [p, setP] = useState<Profile | null>(null);
  const [offices, setOffices] = useState<OfficeLite[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [comps, setComps] = useState<Component[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [tab, setTab] = useState<"attendance" | "leave" | "profile">("attendance");
  const [confirmActive, setConfirmActive] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [tz, setTz] = useState("Asia/Kolkata");

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [pr, of, eo, sc, lb, lr, st] = await Promise.all([
      sb.from("profiles").select("*").eq("id", id).single(),
      sb.from("offices").select("id, name").order("name"),
      sb.from("employee_offices").select("office_id").eq("employee_id", id),
      sb.from("salary_components").select("id, kind, name, amount_paise").eq("employee_id", id).order("kind"),
      sb.rpc("leave_balances", { p_emp: id, p_year: Number(todayIn().slice(0, 4)) }),
      sb.from("leave_requests").select("id, start_date, end_date, status, days, lop_days, leave_types(name)").eq("employee_id", id).order("start_date", { ascending: false }).limit(20),
      sb.from("org_settings").select("timezone").eq("id", 1).single(),
    ]);
    setP(pr.data as Profile);
    setOffices((of.data as OfficeLite[]) ?? []);
    setAssigned(((eo.data as { office_id: string }[]) ?? []).map((x) => x.office_id));
    setComps((sc.data as Component[]) ?? []);
    setBalances((lb.data as Balance[]) ?? []);
    setReqs((lr.data as unknown as Req[]) ?? []);
    if (st.data?.timezone) setTz(st.data.timezone);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (!p) return <div className="flex justify-center py-24"><Spinner /></div>;

  const initial: EmployeeFormValues = {
    full_name: p.full_name, employee_code: p.employee_code ?? "", email: p.email ?? "", phone: p.phone ?? "", password: "",
    designation: p.designation ?? "", department: p.department ?? "", joining_date: p.joining_date,
    shift_start: p.shift_start?.slice(0, 5) ?? "", shift_end: p.shift_end?.slice(0, 5) ?? "",
    gross: String(p.monthly_gross_paise / 100), ot_eligible: p.ot_eligible, ot_multiplier: p.ot_multiplier != null ? String(p.ot_multiplier) : "",
    role: p.role, office_ids: assigned,
  };

  return (
    <>
      <Link href="/admin/employees" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />Employees</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{p.full_name}</h1>
          <p className="mt-1 text-sm text-muted">
            {[p.employee_code, p.designation, p.department].filter(Boolean).join(" · ")} · joined {dateLabel(p.joining_date, { day: "numeric", month: "short", year: "numeric" })}
          </p>
          <div className="mt-2 flex gap-2">
            {!p.active && <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300">Deactivated{p.exit_date && ` · ${dateLabel(p.exit_date)}`}</Badge>}
            {p.role === "admin" && <Badge>Admin</Badge>}
            <Badge>{rupees(p.monthly_gross_paise)}/month</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>Reset password</Button>
          <Button variant={p.active ? "outline" : "primary"} size="sm" onClick={() => setConfirmActive(true)}>{p.active ? "Deactivate" : "Reactivate"}</Button>
        </div>
      </div>

      <Tabs value={tab} onChange={setTab} items={[{ value: "attendance", label: "Attendance" }, { value: "leave", label: "Leave" }, { value: "profile", label: "Profile & salary" }]} />

      <div className="mt-6">
        {tab === "attendance" && <div className="max-w-xl"><AttendanceMonth employeeId={id} tz={tz} /></div>}

        {tab === "leave" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {balances.map((b) => (
                <div key={b.leave_type_id} className="rounded-2xl border border-line p-4">
                  <div className="text-sm text-muted">{b.name}</div>
                  <div className="mt-1 text-2xl font-semibold tabular">{b.paid ? num(b.remaining) : "—"}</div>
                  <div className="text-xs text-muted">{b.paid ? `of ${num(b.quota)} · ${num(b.used)} used` : "Unpaid"}</div>
                </div>
              ))}
            </div>
            <ul className="divide-y divide-line">
              {reqs.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-3 text-sm">
                  <span>{r.leave_types?.name} · {dateLabel(r.start_date)}{r.end_date !== r.start_date && ` – ${dateLabel(r.end_date)}`} · {num(r.days)}d{Number(r.lop_days) > 0 && ` (${num(r.lop_days)} LOP)`}</span>
                  <Badge className={LEAVE_TONE[r.status]}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "profile" && (
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <EmployeeForm key={JSON.stringify(initial)} mode="edit" offices={offices} initial={initial} submitLabel="Save changes"
              onSubmit={async (input) => {
                const sb = supabaseBrowser();
                const { error } = await sb.from("profiles").update({
                  role: input.role, full_name: input.full_name, employee_code: input.employee_code, email: input.email, phone: input.phone,
                  designation: input.designation, department: input.department, joining_date: input.joining_date,
                  shift_start: input.shift_start, shift_end: input.shift_end, monthly_gross_paise: input.monthly_gross_paise,
                  ot_eligible: input.ot_eligible, ot_multiplier: input.ot_multiplier,
                }).eq("id", id);
                if (error) return friendlyError(error);
                await sb.from("employee_offices").delete().eq("employee_id", id);
                if (input.office_ids.length) await sb.from("employee_offices").insert(input.office_ids.map((office_id) => ({ employee_id: id, office_id })));
                if ((input.email ?? "") !== (p.email ?? "") || (input.phone ?? "") !== (p.phone ?? "")) {
                  const r = await fetch(`/api/employees/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: input.email ?? undefined, phone: input.phone ?? undefined }) });
                  if (!r.ok) return (await r.json()).error ?? "Saved, but the login email/phone could not be changed";
                }
                toast("Saved"); load();
                return null;
              }} />
            <SalaryComponents employeeId={id} items={comps} onChange={load} />
          </div>
        )}
      </div>

      <ConfirmDialog open={confirmActive} onClose={() => setConfirmActive(false)}
        title={p.active ? `Deactivate ${p.full_name}?` : `Reactivate ${p.full_name}?`}
        body={p.active ? "They can no longer sign in. Their history and payslips are kept. Today becomes their exit date." : "They can sign in again."}
        confirmLabel={p.active ? "Deactivate" : "Reactivate"} danger={p.active}
        onConfirm={async () => {
          const r = await fetch(`/api/employees/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !p.active }) });
          if (!r.ok) toast((await r.json()).error ?? "Failed", "error"); else { toast(p.active ? "Deactivated" : "Reactivated"); load(); }
        }} />
      <ResetPassword open={pwOpen} onClose={() => setPwOpen(false)} id={id} />
    </>
  );
}

function SalaryComponents({ employeeId, items, onChange }: { employeeId: string; items: Component[]; onChange: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<"allowance" | "deduction">("deduction");
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const paise = toPaise(amount);
    if (!name.trim() || !Number.isFinite(paise) || paise <= 0) { toast("Enter a name and an amount", "error"); return; }
    setBusy(true);
    const { error } = await supabaseBrowser().from("salary_components").insert({ employee_id: employeeId, kind, name: name.trim(), amount_paise: paise });
    setBusy(false);
    if (error) toast(friendlyError(error), "error"); else { setName(""); setAmount(""); onChange(); }
  }

  return (
    <Section title="Fixed monthly items" sub="Applied every month (e.g. PF, ESI, travel allowance, advance recovery).">
      <ul className="mb-4 divide-y divide-line text-sm">
        {items.length === 0 && <li className="py-2 text-muted">None</li>}
        {items.map((c) => (
          <li key={c.id} className="flex items-center justify-between py-2">
            <span>{c.name} <span className="text-muted">· {c.kind}</span></span>
            <span className="flex items-center gap-2 tabular">
              {c.kind === "deduction" ? "−" : "+"}{rupees(c.amount_paise)}
              <button aria-label={`Remove ${c.name}`} className="text-muted hover:text-rose-600"
                onClick={async () => { await supabaseBrowser().from("salary_components").delete().eq("id", c.id); onChange(); }}>
                <Trash2 className="size-4" />
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as "allowance" | "deduction")}>
            <option value="deduction">Deduction</option><option value="allowance">Allowance</option>
          </Select>
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="₹ amount" />
        </div>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Provident Fund (PF)" />
        <Button variant="secondary" size="sm" onClick={add} loading={busy}>Add item</Button>
      </div>
    </Section>
  );
}

function ResetPassword({ open, onClose, id }: { open: boolean; onClose: () => void; id: string }) {
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setPw(""); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Set a new password" footer={
      <><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={busy} disabled={pw.length < 8} onClick={async () => {
          setBusy(true);
          const r = await fetch(`/api/employees/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
          setBusy(false);
          if (!r.ok) toast((await r.json()).error ?? "Failed", "error"); else { toast("Password updated"); onClose(); }
        }}>Save</Button></>
    }>
      <Field label="New password" hint="At least 8 characters. Share it with the employee privately."><Input value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
    </Modal>
  );
}
