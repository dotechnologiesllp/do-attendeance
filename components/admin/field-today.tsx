"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { timeOf, todayIn } from "@/lib/format";
import { EXCEPTION_LABEL, type FieldException } from "@/lib/field";
import { Badge, cn, Sheet } from "@/components/ui";
import { FieldDay } from "./field-day";

type Dash = { today: string; field_staff: number; on_duty: number; reached_first_site: number; late: number; not_started: number;
  on_leave: number; offline: number; exceptions: FieldException[] };

const SEV = { high: "bg-rose-500/15 text-rose-700 dark:text-rose-300", medium: "bg-amber-500/15 text-amber-700 dark:text-amber-300", low: "bg-soft text-muted" };

/** Dashboard block for field staff: today's counts and the exceptions list. */
export function FieldToday() {
  const [d, setD] = useState<Dash | null>(null);
  const [open, setOpen] = useState<FieldException | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().rpc("field_dashboard");
    if (data) setD(data as Dash);
  }, []);
  useEffect(() => { load(); const i = setInterval(load, 60_000); return () => clearInterval(i); }, [load]);
  if (!d || d.field_staff === 0) return null;

  const stats: [string, number, string?][] = [
    ["On duty", d.on_duty, "text-emerald-600 dark:text-emerald-400"], ["Reached first site by shift", d.reached_first_site],
    ["Late", d.late, d.late ? "text-amber-600 dark:text-amber-400" : undefined], ["Not started", d.not_started],
    ["On leave", d.on_leave], ["Offline", d.offline, d.offline ? "text-rose-600 dark:text-rose-400" : undefined],
  ];
  return (
    <section className="mb-10">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="font-semibold">Field staff · {d.field_staff}</h2>
        <Link href="/admin/live" className="text-sm text-muted hover:text-fg">Open Live Map →</Link>
      </div>
      <div className="grid grid-cols-3 gap-y-6 border-y border-line py-5 md:grid-cols-6">
        {stats.map(([l, v, tone]) => (
          <div key={l} className="px-2">
            <div className="text-xs text-muted">{l}</div>
            <div className={cn("mt-1 text-3xl font-semibold tracking-tight tabular", tone)}>{v}</div>
          </div>
        ))}
      </div>
      <h3 className="mt-6 mb-2 text-sm font-semibold">Exceptions today {d.exceptions.length > 0 && <span className="text-muted">· {d.exceptions.length}</span>}</h3>
      {d.exceptions.length === 0 ? <p className="text-sm text-muted">Nothing unusual so far.</p> : (
        <ul className="divide-y divide-line">
          {d.exceptions.map((e, i) => (
            <li key={i}>
              <button onClick={() => setOpen(e)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left text-sm hover:bg-soft">
                <Badge className={SEV[e.severity]}>{EXCEPTION_LABEL[e.kind] ?? e.kind}</Badge>
                <span className="font-medium">{e.name}</span>
                <span className="flex-1 text-muted">{e.detail}</span>
                <span className="tabular text-muted">{e.at ? timeOf(e.at) : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} sub="Today">
        {open && <FieldDay employeeId={open.employee_id} date={todayIn()} onChanged={load} />}
      </Sheet>
    </section>
  );
}
