"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { dateLabel, hm, timeOf } from "@/lib/format";
import { Badge, cn, Empty, PageHeader, Spinner } from "@/components/ui";

type Dash = {
  today: string; day_kind: string; total: number; inside: number; on_break: number; absent: number; on_leave: number; late: number;
  inside_list: { id: string; name: string; designation: string | null; since: string; office: string | null }[];
  not_in_list: { id: string; name: string; state: "leave" | "break" | "absent"; last_out: string | null }[];
  pending_leave: number; needs_review: number; flagged: number;
};

export default function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().rpc("dashboard_today");
    if (error) setErr(friendlyError(error)); else { setD(data as Dash); setErr(null); }
  }, []);
  useEffect(() => {
    load();
    const i = setInterval(load, 30_000);
    const t = setInterval(() => tick((x) => x + 1), 60_000);
    return () => { clearInterval(i); clearInterval(t); };
  }, [load]);

  if (err && !d) return <p className="text-sm text-rose-600">{err}</p>;
  if (!d) return <div className="flex justify-center py-24"><Spinner /></div>;

  const stats: [string, number, string?][] = [
    ["Employees", d.total], ["Inside now", d.inside, "text-emerald-600 dark:text-emerald-400"], ["On break", d.on_break],
    ["Not checked in", d.absent], ["On leave", d.on_leave], ["Late", d.late, d.late ? "text-amber-600 dark:text-amber-400" : undefined],
  ];
  const pending: [string, number, string][] = [
    ["Leave requests", d.pending_leave, "/admin/leave"],
    ["Auto-closed sessions", d.needs_review, "/admin/attendance?tab=review"],
    ["Flagged punches", d.flagged, "/admin/attendance?tab=review"],
  ];

  return (
    <>
      <PageHeader title="Today" sub={`${dateLabel(d.today, { weekday: "long", day: "numeric", month: "long" })}${d.day_kind !== "working" ? ` · ${d.day_kind === "holiday" ? "Holiday" : "Weekly off"}` : ""}`} />

      <div className="grid grid-cols-3 gap-y-6 border-y border-line py-6 md:grid-cols-6">
        {stats.map(([l, v, tone]) => (
          <div key={l} className="px-2">
            <div className="text-xs text-muted">{l}</div>
            <div className={cn("mt-1 text-3xl font-semibold tracking-tight tabular", tone)}>{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-2 flex items-center gap-2 font-semibold">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
            Inside the office
          </h2>
          {d.inside_list.length === 0 ? <Empty title="Nobody is checked in right now" /> : (
            <ul className="divide-y divide-line">
              {d.inside_list.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/employees/${p.id}`} className="flex items-center justify-between gap-3 py-3 hover:opacity-80">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-sm text-muted">{p.designation ?? "—"}{p.office && ` · ${p.office}`}</div>
                    </div>
                    <div className="text-right text-sm tabular">
                      <div>since {timeOf(p.since)}</div>
                      <div className="text-muted">{hm((Date.now() - new Date(p.since).getTime()) / 60000)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {d.not_in_list.length > 0 && (
            <>
              <h2 className="mt-8 mb-2 font-semibold">Not inside</h2>
              <ul className="divide-y divide-line">
                {d.not_in_list.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                    <Link href={`/admin/employees/${p.id}`} className="hover:underline">{p.name}</Link>
                    <Badge className={p.state === "leave" ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : p.state === "break" ? "bg-soft text-muted" : "bg-rose-500/10 text-rose-700 dark:text-rose-300"}>
                      {p.state === "leave" ? "On leave" : p.state === "break" ? `Out since ${timeOf(p.last_out)}` : "Not checked in"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <aside>
          <h2 className="mb-2 font-semibold">Needs your attention</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {pending.map(([l, n, href]) => (
              <li key={l}>
                <Link href={href} className="flex items-center justify-between px-4 py-3.5 text-sm hover:bg-soft">
                  <span>{l}</span>
                  <span className="flex items-center gap-1">
                    <span className={cn("tabular font-semibold", n === 0 && "text-muted font-normal")}>{n}</span>
                    <ChevronRight className="size-4 text-muted" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/admin/reports" className="mt-4 block text-sm text-muted hover:text-fg">Attendance, OT and late reports →</Link>
        </aside>
      </div>
    </>
  );
}
