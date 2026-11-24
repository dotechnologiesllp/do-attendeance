"use client";
import { breakdown, type PayrollRow } from "@/lib/payroll";
import { hm, num, rupees } from "@/lib/format";
import { cn } from "./ui";

/** Every formula with the real numbers the database used, so the figure can be checked by hand. */
export function PayslipView({ row }: { row: PayrollRow }) {
  const lines = breakdown(row);
  const facts: [string, string | number][] = [
    ["Working days", row.working_days], ["Present", row.present], ["Half days", row.half_days],
    ["Paid leave", num(row.paid_leave)], ["Unpaid leave", num(row.unpaid_leave)], ["Absent", num(row.absent)],
    ["Late marks", row.late_marks], ["Worked", hm(row.worked_min)], ["Overtime", hm(row.ot_min)],
  ];
  return (
    <div>
      <div className="rounded-2xl bg-soft p-4 text-center">
        <div className="text-sm text-muted">Net pay</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight tabular">{rupees(row.net_paise)}</div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-y-3 text-center">
        {facts.map(([l, v]) => (
          <div key={l}><dt className="text-xs text-muted">{l}</dt><dd className="font-medium tabular">{v}</dd></div>
        ))}
      </dl>

      <h4 className="mt-6 mb-2 text-sm font-semibold">How this was calculated</h4>
      <ul className="divide-y divide-line text-sm">
        {lines.map((l, i) => (
          <li key={i} className={cn("flex items-start justify-between gap-4 py-2.5", l.strong && "font-semibold")}>
            <div className="min-w-0">
              <div>{l.label}</div>
              {l.formula && <div className="mt-0.5 text-xs text-muted tabular break-words">{l.formula}</div>}
            </div>
            <div className="shrink-0 text-right tabular whitespace-nowrap">
              {l.sign && l.sign !== "=" && <span className="text-muted">{l.sign} </span>}{l.amount}
            </div>
          </li>
        ))}
      </ul>
      {row.review_days > 0 && (
        <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {row.review_days} day(s) include an auto-closed check-out that still needs review.
        </p>
      )}
    </div>
  );
}
