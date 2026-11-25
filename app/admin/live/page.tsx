"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Battery, ChevronLeft, ChevronRight } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { dateLabel, timeOf, todayIn } from "@/lib/format";
import { ago, LIVE, type LiveStaff, type LiveStatus } from "@/lib/field";
import { Badge, Button, cn, Empty, PageHeader, Sheet, Spinner } from "@/components/ui";
import { FieldDay } from "@/components/admin/field-day";

const LiveMap = dynamic(() => import("@/components/admin/field-maps").then((m) => m.LiveMap), {
  ssr: false, loading: () => <div className="h-full min-h-[420px] animate-pulse rounded-2xl bg-soft" />,
});

function shift(ymd: string, n: number) { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export default function LivePage() {
  const [staff, setStaff] = useState<LiveStaff[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<LiveStatus | "all">("all");
  const [open, setOpen] = useState<LiveStaff | null>(null);
  const [day, setDay] = useState(todayIn());
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc("field_live");
    if (error) setErr(friendlyError(error)); else { setStaff((data as { staff: LiveStaff[] }).staff); setErr(null); }
  }, []);
  useEffect(() => {
    load();
    const a = setInterval(load, 30_000), b = setInterval(() => tick((x) => x + 1), 30_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);

  const counts = useMemo(() => {
    const c: Partial<Record<LiveStatus, number>> = {};
    for (const s of staff ?? []) c[s.status] = (c[s.status] ?? 0) + 1;
    return c;
  }, [staff]);
  const shown = (staff ?? []).filter((s) => filter === "all" || s.status === filter);
  const select = useCallback((id: string) => { const s = staff?.find((x) => x.id === id); if (s) { setOpen(s); setDay(todayIn()); } }, [staff]);

  return (
    <>
      <PageHeader title="Live Map" sub="Everyone on duty, updated every 30 seconds. Click a person for today's route." />
      {err && <p className="text-sm text-rose-600">{err}</p>}
      {!staff ? <div className="flex justify-center py-24"><Spinner /></div> : staff.length === 0 ? (
        <Empty title="No field staff yet">Set a person&apos;s staff type to Field in Staff.</Empty>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button onClick={() => setFilter("all")} className={cn("h-8 rounded-full border px-3 text-sm", filter === "all" ? "border-fg bg-accent text-accent-fg" : "border-line")}>All {staff.length}</button>
            {(Object.keys(LIVE) as LiveStatus[]).filter((k) => counts[k]).map((k) => (
              <button key={k} onClick={() => setFilter(k)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm", filter === k ? "border-fg" : "border-line")}>
                <span className="size-2.5 rounded-full" style={{ background: LIVE[k].color }} />{LIVE[k].label} {counts[k]}
              </button>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" style={{ minHeight: "calc(100dvh - 260px)" }}>
            <LiveMap staff={shown} selected={open?.id} onSelect={select} />
            <ul className="divide-y divide-line overflow-y-auto rounded-2xl border border-line lg:max-h-[calc(100dvh-260px)]">
              {shown.map((s) => (
                <li key={s.id}>
                  <button onClick={() => select(s.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-soft">
                    <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: LIVE[s.status].color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{s.name}</span>
                      <span className="block truncate text-sm text-muted">
                        {LIVE[s.status].label}{s.at_site ? ` · ${s.at_site}` : ""}
                        {s.status !== "not_started" && s.status !== "on_leave" && s.last_at ? ` · ${ago(s.last_at)}` : ""}
                      </span>
                      {s.start_at && <span className="block text-xs text-muted">Started {timeOf(s.start_at)}{s.onsite_start === false ? " · off-site" : ""}{s.end_at ? ` · ended ${timeOf(s.end_at)}` : ""}</span>}
                    </span>
                    {s.battery != null && <span className="flex items-center gap-0.5 text-xs text-muted"><Battery className="size-3.5" />{s.battery}%</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} sub={
        <span className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setDay(shift(day, -1))} aria-label="Previous day"><ChevronLeft className="size-4" /></Button>
          {dateLabel(day, { weekday: "short", day: "numeric", month: "short" })}
          <Button variant="ghost" size="icon" onClick={() => setDay(shift(day, 1))} disabled={day >= todayIn()} aria-label="Next day"><ChevronRight className="size-4" /></Button>
          {open && day === todayIn() && <Badge className={LIVE[open.status].tone}>{LIVE[open.status].label}</Badge>}
        </span>
      }>
        {open && <FieldDay key={open.id + day} employeeId={open.id} date={day} onChanged={load} />}
      </Sheet>
    </>
  );
}
