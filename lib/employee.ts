// Validation shared by the "Add employee" form, CSV import and the API routes.
import { toPaise } from "./format";

export type EmployeeInput = {
  full_name: string; employee_code?: string | null; email?: string | null; phone?: string | null; password?: string;
  designation?: string | null; department?: string | null; joining_date?: string | null;
  shift_start?: string | null; shift_end?: string | null; monthly_gross_paise: number;
  ot_eligible: boolean; ot_multiplier?: number | null; role?: "admin" | "employee"; office_ids: string[];
};

export const CSV_HEADERS = [
  "name", "employee_id", "email", "phone", "designation", "department", "joining_date",
  "shift_start", "shift_end", "monthly_gross", "ot_eligible", "office", "password",
] as const;

export function normalisePhone(v: string | null | undefined) {
  if (!v) return null;
  const d = v.replace(/[^\d+]/g, "");
  if (!d) return null;
  if (/^\d{10}$/.test(d)) return "+91" + d;
  return d.startsWith("+") ? d : "+" + d;
}

export function validateEmployee(e: EmployeeInput, { requirePassword }: { requirePassword: boolean }): string | null {
  if (!e.full_name?.trim()) return "Name is required";
  if (!e.email && !e.phone) return "Email or phone is required (it is the login)";
  if (e.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) return "Email looks wrong";
  if (e.phone && !/^\+\d{8,15}$/.test(e.phone)) return "Phone looks wrong (use 10 digits or +country code)";
  if (requirePassword && (!e.password || e.password.length < 8)) return "Password must be at least 8 characters";
  if (!Number.isInteger(e.monthly_gross_paise) || e.monthly_gross_paise < 0) return "Monthly gross must be a positive amount";
  if (e.joining_date && !/^\d{4}-\d{2}-\d{2}$/.test(e.joining_date)) return "Joining date must be YYYY-MM-DD";
  for (const t of [e.shift_start, e.shift_end]) if (t && !/^\d{2}:\d{2}$/.test(t)) return "Shift times must be HH:MM";
  if (e.ot_multiplier != null && (e.ot_multiplier < 0 || e.ot_multiplier > 5)) return "OT multiplier must be between 0 and 5";
  return null;
}

/** One CSV row (already split into cells, header-mapped) → EmployeeInput. */
export function fromCsvRow(row: Record<string, string>, officesByName: Map<string, string>, defaultOffice?: string): EmployeeInput | string {
  const gross = toPaise(row.monthly_gross || "0");
  if (Number.isNaN(gross)) return "monthly_gross is not a number";
  const officeNames = (row.office || "").split(/[;|]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const office_ids: string[] = [];
  for (const n of officeNames) {
    const id = officesByName.get(n);
    if (!id) return `Unknown office "${n}"`;
    office_ids.push(id);
  }
  if (!office_ids.length && defaultOffice) office_ids.push(defaultOffice);
  return {
    full_name: (row.name || "").trim(),
    employee_code: row.employee_id?.trim() || null,
    email: row.email?.trim().toLowerCase() || null,
    phone: normalisePhone(row.phone),
    designation: row.designation?.trim() || null,
    department: row.department?.trim() || null,
    joining_date: row.joining_date?.trim() || null,
    shift_start: row.shift_start?.trim() || null,
    shift_end: row.shift_end?.trim() || null,
    monthly_gross_paise: gross,
    ot_eligible: /^(y|yes|true|1)$/i.test(row.ot_eligible?.trim() || ""),
    password: row.password?.trim() || undefined,
    office_ids,
    role: "employee",
  };
}
