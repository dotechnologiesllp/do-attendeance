// Turns a payroll row computed by the database into readable formula lines.
// Nothing is recalculated here except to *display* the inputs the server used.
import { num, rupees2 } from "./format";

export type PayrollRow = {
  employee_id: string; name: string; employee_code: string | null; designation: string | null; department: string | null;
  month: string; working_days: number; calendar_days: number; basis: "calendar" | "working" | "fixed"; basis_days: number;
  standard_daily_hours: number; present: number; half_days: number; paid_leave: number; unpaid_leave: number;
  absent: number; not_employed_days: number; late_marks: number; late_deduction_days: number; lop_days: number;
  worked_min: number; ot_min: number; ot_hours: number; ot_eligible: boolean; ot_multiplier: number; review_days: number;
  gross_paise: number; per_day_paise: number; hourly_paise: number; lop_paise: number; ot_paise: number;
  ta_paise?: number; ta?: { paise: number; km: number; items: { vehicle: string; km: number; rate_paise_per_km: number; paise: number }[] };
  allowances_paise: number; allowances: { name: string; paise: number }[];
  deductions_paise: number; deductions: { name: string; paise: number }[];
  bonus_paise: number; onetime_deductions_paise: number;
  adjustments: { id: string; kind: "bonus" | "incentive" | "advance" | "fine"; paise: number; note: string }[];
  net_exact_paise: number; net_paise: number; rounded_to_rupee: boolean; status?: string;
};

export type Line = { label: string; formula?: string; amount?: string; sign?: "+" | "−" | "="; strong?: boolean };

const BASIS_LABEL = { calendar: "calendar days", working: "working days", fixed: "fixed days" } as const;

export function breakdown(r: PayrollRow, symbol = "₹"): Line[] {
  const m = (p: number | string) => rupees2(p, symbol);
  const L: Line[] = [];
  L.push({ label: "Monthly gross", amount: m(r.gross_paise) });
  L.push({
    label: "Per-day rate",
    formula: `${m(r.gross_paise)} ÷ ${num(r.basis_days)} ${BASIS_LABEL[r.basis]}`,
    amount: `${m(Math.round(Number(r.per_day_paise)))}/day`,
  });
  L.push({
    label: "Hourly rate",
    formula: `${m(Math.round(Number(r.per_day_paise)))} ÷ ${num(r.standard_daily_hours)} h`,
    amount: `${m(Math.round(Number(r.hourly_paise)))}/h`,
  });

  const parts: string[] = [];
  if (Number(r.absent)) parts.push(`${num(r.absent)} absent`);
  if (Number(r.unpaid_leave)) parts.push(`${num(r.unpaid_leave)} unpaid leave`);
  if (Number(r.half_days)) parts.push(`${num(r.half_days)} half day${Number(r.half_days) > 1 ? "s" : ""} × 0.5`);
  if (Number(r.not_employed_days)) parts.push(`${num(r.not_employed_days)} before joining / after exit`);
  if (Number(r.late_deduction_days)) parts.push(`${num(r.late_deduction_days)} for ${r.late_marks} late marks`);
  L.push({ label: "LOP days", formula: parts.length ? parts.join(" + ") : "none", amount: `${num(r.lop_days)} days` });
  L.push({
    label: "LOP deduction",
    formula: `${num(r.lop_days)} × ${m(Math.round(Number(r.per_day_paise)))}`,
    amount: m(r.lop_paise), sign: "−",
  });
  L.push({
    label: "Overtime",
    formula: r.ot_eligible
      ? `${num(r.ot_hours)} h × ${m(Math.round(Number(r.hourly_paise)))} × ${num(r.ot_multiplier)}`
      : "not eligible",
    amount: m(r.ot_paise), sign: "+",
  });
  for (const t of r.ta?.items ?? []) {
    L.push({ label: `Travel allowance (${t.vehicle})`, formula: `${num(t.km)} km × ${m(t.rate_paise_per_km)}/km`, amount: m(t.paise), sign: "+" });
  }
  for (const a of r.allowances ?? []) L.push({ label: a.name, formula: "fixed allowance", amount: m(a.paise), sign: "+" });
  for (const a of r.adjustments ?? []) {
    const plus = a.kind === "bonus" || a.kind === "incentive";
    L.push({ label: `${a.kind[0].toUpperCase()}${a.kind.slice(1)}`, formula: a.note, amount: m(a.paise), sign: plus ? "+" : "−" });
  }
  for (const d of r.deductions ?? []) L.push({ label: d.name, formula: "fixed deduction", amount: m(d.paise), sign: "−" });

  const terms = [
    m(r.gross_paise), `− ${m(r.lop_paise)}`, `+ ${m(r.ot_paise)}`,
    Number(r.ta_paise ?? 0) ? `+ ${m(r.ta_paise ?? 0)}` : "",
    Number(r.allowances_paise) ? `+ ${m(r.allowances_paise)}` : "",
    Number(r.bonus_paise) ? `+ ${m(r.bonus_paise)}` : "",
    Number(r.deductions_paise) ? `− ${m(r.deductions_paise)}` : "",
    Number(r.onetime_deductions_paise) ? `− ${m(r.onetime_deductions_paise)}` : "",
  ].filter(Boolean).join(" ");
  L.push({ label: "Net (exact)", formula: terms, amount: m(r.net_exact_paise), sign: "=" });
  if (r.rounded_to_rupee && Number(r.net_exact_paise) !== Number(r.net_paise)) {
    L.push({ label: "Rounded to nearest rupee", amount: m(r.net_paise), strong: true });
  } else {
    L[L.length - 1].strong = true;
  }
  return L;
}

export const PAYROLL_COLUMNS: { key: keyof PayrollRow | "adjustments_net"; label: string; money?: boolean }[] = [
  { key: "employee_code", label: "Emp ID" },
  { key: "name", label: "Name" },
  { key: "working_days", label: "Working days" },
  { key: "present", label: "Present" },
  { key: "half_days", label: "Half days" },
  { key: "paid_leave", label: "Paid leave" },
  { key: "unpaid_leave", label: "Unpaid leave" },
  { key: "absent", label: "Absent" },
  { key: "lop_days", label: "LOP days" },
  { key: "ot_hours", label: "OT hours" },
  { key: "gross_paise", label: "Gross", money: true },
  { key: "lop_paise", label: "LOP deduction", money: true },
  { key: "ot_paise", label: "OT pay", money: true },
  { key: "ta_paise", label: "Travel allow.", money: true },
  { key: "adjustments_net", label: "Adjustments", money: true },
  { key: "net_paise", label: "Net pay", money: true },
];

/** Allowances + one-time additions − fixed deductions − one-time deductions (paise). */
export function adjustmentsNet(r: PayrollRow) {
  return Number(r.allowances_paise) + Number(r.bonus_paise) - Number(r.deductions_paise) - Number(r.onetime_deductions_paise);
}
