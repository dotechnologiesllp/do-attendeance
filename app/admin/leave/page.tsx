"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { dateLabel, LEAVE_TONE, num, todayIn } from "@/lib/format";
import { Badge, Button, cn, Empty, Field, Input, PageHeader, Section, Spinner, Switch, Tabs, useToast } from "@/components/ui";

type Req = { id: string; employee_id: string; start_date: string; end_date: string; half_day: boolean; reason: string | null; status: string;
  days: number; paid_days: number; lop_days: number; created_at: string; leave_types: { name: string; paid: boolean } | null; profiles: { full_name: string } | null };
type LeaveType = { id: string; name: string; yearly_quota: number; paid: boolean; active: boolean; sort: number };
type Holiday = { day: string; name: string };

export default function LeaveAdmin() {
  const [tab, setTab] = useState<"requests" | "types" | "calendar">("requests");
  return (
    <>
      <PageHeader title="Leave" />
      <Tabs value={tab} onChange={setTab} items={[{ value: "requests", label: "Requests" }, { value: "types", label: "Leave types" }, { value: "calendar", label: "Holidays & weekly off" }]} />
      <div className="mt-6">
        {tab === "requests" && <Requests />}
        {tab === "types" && <Types />}
        {tab === "calendar" && <Calendar />}
      </div>
    </>
  );
}

function Requests() {
  const toast = useToast();
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "cancelled">("pending");
  const [items, setItems] = useState<Req[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setItems(null);
    const { data } = await supabaseBrowser().from("leave_requests")
      .select("id, employee_id, start_date, end_date, half_day, reason, status, days, paid_days, lop_days, created_at, leave_types(name, paid), profiles!leave_requests_employee_id_fkey(full_name)")
      .eq("status", status).order(status === "pending" ? "start_date" : "decided_at", { ascending: status === "pending" }).limit(200);
    const list = (data as unknown as Req[]) ?? [];
    setItems(list);
    if (status === "pending") {
      // Show the remaining balance next to each pending request so the admin can see LOP coming.
      const year = Number(todayIn().slice(0, 4));
      const sb = supabaseBrowser();
      const out: Record<string, number> = {};
      await Promise.all([...new Set(list.map((r) => r.employee_id))].map(async (emp) => {
        const { data: b } = await sb.rpc("leave_balances", { p_emp: emp, p_year: year });
        for (const x of (b as { name: string; remaining: number }[]) ?? []) out[`${emp}:${x.name}`] = Number(x.remaining);
      }));
      setBalances(out);
    }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  async function decide(r: Req, approve: boolean) {
    setBusy(r.id);
    const { data, error } = await supabaseBrowser().rpc("decide_leave", { p_id: r.id, p_approve: approve, p_note: null });
    setBusy(null);
    if (error) { toast(friendlyError(error), "error"); return; }
    const lop = Number((data as { lop_days: number }).lop_days);
    toast(approve ? (lop > 0 ? `Approved · ${num(lop)} day(s) loss of pay` : "Approved") : "Rejected");
    load();
  }

  return (
    <>
      <Tabs value={status} onChange={setStatus} items={["pending", "approved", "rejected", "cancelled"].map((s) => ({ value: s as "pending", label: s[0].toUpperCase() + s.slice(1) }))} />
      {!items ? <Spinner className="mt-6" /> : items.length === 0 ? <Empty title={`No ${status} requests`} /> : (
        <ul className="mt-4 divide-y divide-line">
          {items.map((r) => {
            const bal = balances[`${r.employee_id}:${r.leave_types?.name}`];
            const willLop = status === "pending" && r.leave_types?.paid && bal !== undefined && Number(r.days) > bal;
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div>
                  <div className="font-medium">{r.profiles?.full_name}</div>
                  <div className="text-sm">
                    {r.leave_types?.name} · {dateLabel(r.start_date)}{r.end_date !== r.start_date && ` – ${dateLabel(r.end_date)}`} · {num(r.days)} day{Number(r.days) === 1 ? "" : "s"}{r.half_day && " (half)"}
                  </div>
                  {r.reason && <div className="text-sm text-muted">{r.reason}</div>}
                  {status === "pending" && r.leave_types?.paid && bal !== undefined && (
                    <div className={cn("mt-0.5 text-xs", willLop ? "text-amber-600 dark:text-amber-400" : "text-muted")}>
                      {num(bal)} left{willLop && ` · ${num(Number(r.days) - bal)} day(s) will be loss of pay`}
                    </div>
                  )}
                  {status === "approved" && Number(r.lop_days) > 0 && <div className="text-xs text-amber-600">{num(r.lop_days)} day(s) loss of pay</div>}
                </div>
                {status === "pending" ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={busy === r.id} onClick={() => decide(r, false)}><X className="size-4" />Reject</Button>
                    <Button size="sm" loading={busy === r.id} onClick={() => decide(r, true)}><Check className="size-4" />Approve</Button>
                  </div>
                ) : status === "approved" ? (
                  <Button variant="ghost" size="sm" onClick={async () => {
                    const { error } = await supabaseBrowser().rpc("cancel_leave", { p_id: r.id });
                    if (error) toast(friendlyError(error), "error"); else { toast("Leave cancelled"); load(); }
                  }}>Cancel leave</Button>
                ) : <Badge className={LEAVE_TONE[r.status]}>{r.status}</Badge>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Types() {
  const toast = useToast();
  const [items, setItems] = useState<LeaveType[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("leave_types").select("*").order("sort").order("name");
    setItems((data as LeaveType[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(t: Partial<LeaveType> & { id?: string }) {
    const sb = supabaseBrowser();
    const { error } = t.id ? await sb.from("leave_types").update(t).eq("id", t.id) : await sb.from("leave_types").insert(t);
    if (error) toast(friendlyError(error), "error"); else load();
  }

  if (!items) return <Spinner />;
  return (
    <div className="max-w-2xl">
      <ul className="divide-y divide-line">
        {items.map((t) => (
          <li key={t.id} className="grid grid-cols-[1fr_96px_auto] items-center gap-3 py-3 sm:grid-cols-[1fr_110px_140px_auto]">
            <Input defaultValue={t.name} onBlur={(e) => e.target.value !== t.name && save({ id: t.id, name: e.target.value })} aria-label="Name" />
            <Input inputMode="decimal" defaultValue={String(t.yearly_quota)} disabled={!t.paid} aria-label="Days per year"
              onBlur={(e) => Number(e.target.value) !== Number(t.yearly_quota) && save({ id: t.id, yearly_quota: Number(e.target.value) || 0 })} />
            <div className="hidden sm:block"><Switch checked={t.paid} onChange={(v) => save({ id: t.id, paid: v })} label="Paid" /></div>
            <Switch checked={t.active} onChange={(v) => save({ id: t.id, active: v })} label="On" />
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">Days per year applies to paid types. Approved leave beyond the paid balance becomes loss of pay automatically.</p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={() => save({ name: `New type ${items.length + 1}`, yearly_quota: 0, paid: true, sort: items.length + 1 })}>
        <Plus className="size-4" />Add leave type
      </Button>
    </div>
  );
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Calendar() {
  const toast = useToast();
  const [hol, setHol] = useState<Holiday[] | null>(null);
  const [offs, setOffs] = useState<number[]>([]);
  const [sats, setSats] = useState<number[]>([]);
  const [day, setDay] = useState("");
  const [name, setName] = useState("");
  const year = todayIn().slice(0, 4);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [h, s] = await Promise.all([
      sb.from("holidays").select("*").gte("day", `${Number(year) - 1}-01-01`).order("day"),
      sb.from("org_settings").select("weekly_off_days, off_saturdays").eq("id", 1).single(),
    ]);
    setHol((h.data as Holiday[]) ?? []);
    setOffs(s.data?.weekly_off_days ?? []); setSats(s.data?.off_saturdays ?? []);
  }, [year]);
  useEffect(() => { load(); }, [load]);

  async function saveOffs(o: number[], s: number[]) {
    setOffs(o); setSats(s);
    const { error } = await supabaseBrowser().from("org_settings").update({ weekly_off_days: o, off_saturdays: s, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) toast(friendlyError(error), "error"); else toast("Weekly off saved");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Section title="Weekly off" sub="Days nobody is expected to work. Work on these days counts as overtime (if enabled).">
        <div className="flex flex-wrap gap-2">
          {DOW.map((d, i) => {
            const on = offs.includes(i);
            return <button key={d} type="button" onClick={() => saveOffs(on ? offs.filter((x) => x !== i) : [...offs, i].sort(), sats)}
              className={cn("h-10 w-14 rounded-xl border text-sm transition", on ? "border-fg bg-accent text-accent-fg" : "border-line hover:bg-soft")}>{d}</button>;
          })}
        </div>
        {!offs.includes(6) && (
          <div className="mt-5">
            <div className="mb-2 text-sm font-medium">Saturdays off</div>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => {
                const on = sats.includes(n);
                return <button key={n} type="button" onClick={() => saveOffs(offs, on ? sats.filter((x) => x !== n) : [...sats, n].sort())}
                  className={cn("h-10 rounded-xl border px-3 text-sm transition", on ? "border-fg bg-accent text-accent-fg" : "border-line hover:bg-soft")}>
                  {["1st", "2nd", "3rd", "4th", "5th"][n - 1]}
                </button>;
              })}
            </div>
          </div>
        )}
      </Section>

      <Section title="Public holidays">
        <form className="mb-4 grid grid-cols-[1fr_1fr_auto] gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (!day || !name.trim()) return;
          const { error } = await supabaseBrowser().from("holidays").upsert({ day, name: name.trim() });
          if (error) toast(friendlyError(error), "error"); else { setDay(""); setName(""); load(); }
        }}>
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date" />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali" aria-label="Holiday name" />
          <Button type="submit" variant="secondary">Add</Button>
        </form>
        {!hol ? <Spinner /> : hol.length === 0 ? <p className="text-sm text-muted">No holidays yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {hol.map((h) => (
              <li key={h.day} className="flex items-center justify-between py-2">
                <span><span className="tabular">{dateLabel(h.day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span> · {h.name}</span>
                <button aria-label={`Remove ${h.name}`} className="text-muted hover:text-rose-600" onClick={async () => {
                  const { error } = await supabaseBrowser().from("holidays").delete().eq("day", h.day);
                  if (error) toast(friendlyError(error), "error"); else load();
                }}><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
