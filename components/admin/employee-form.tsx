"use client";
import { useState } from "react";
import { toPaise } from "@/lib/format";
import { normalisePhone, validateEmployee, type EmployeeInput } from "@/lib/employee";
import { Button, Field, Input, Select, Switch } from "@/components/ui";

export type OfficeLite = { id: string; name: string };
export type Option = { id: string; name: string };

export type EmployeeFormValues = {
  full_name: string; employee_code: string; email: string; phone: string; password: string; designation: string;
  department: string; joining_date: string; shift_start: string; shift_end: string; gross: string;
  ot_eligible: boolean; ot_multiplier: string; role: "admin" | "manager" | "employee"; office_ids: string[];
  staff_type: "office" | "field"; manager_id: string; vehicle_type_id: string;
};

export const emptyEmployee = (today: string, offices: OfficeLite[]): EmployeeFormValues => ({
  full_name: "", employee_code: "", email: "", phone: "", password: "", designation: "", department: "",
  joining_date: today, shift_start: "09:00", shift_end: "18:00", gross: "", ot_eligible: false, ot_multiplier: "",
  role: "employee", office_ids: offices.length === 1 ? [offices[0].id] : [],
  staff_type: "office", manager_id: "", vehicle_type_id: "",
});

export function toInput(v: EmployeeFormValues): EmployeeInput {
  return {
    full_name: v.full_name.trim(), employee_code: v.employee_code.trim() || null, email: v.email.trim().toLowerCase() || null,
    phone: normalisePhone(v.phone), password: v.password || undefined, designation: v.designation.trim() || null,
    department: v.department.trim() || null, joining_date: v.joining_date || null, shift_start: v.shift_start || null,
    shift_end: v.shift_end || null, monthly_gross_paise: toPaise(v.gross || "0"), ot_eligible: v.ot_eligible,
    ot_multiplier: v.ot_multiplier ? Number(v.ot_multiplier) : null, role: v.role, office_ids: v.office_ids,
    staff_type: v.staff_type, manager_id: v.manager_id || null, vehicle_type_id: v.vehicle_type_id || null,
  };
}

export function EmployeeForm({ initial, offices, managers = [], vehicles = [], mode, onSubmit, submitLabel }: {
  initial: EmployeeFormValues; offices: OfficeLite[]; managers?: Option[]; vehicles?: Option[]; mode: "create" | "edit";
  onSubmit: (input: EmployeeInput) => Promise<string | null>; submitLabel: string;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof EmployeeFormValues>(k: K, val: EmployeeFormValues[K]) => setV((x) => ({ ...x, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const input = toInput(v);
    const invalid = validateEmployee(input, { requirePassword: mode === "create" });
    if (invalid) { setErr(invalid); return; }
    setBusy(true); setErr(null);
    const res = await onSubmit(input);
    setBusy(false);
    if (res) setErr(res);
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2"><Input value={v.full_name} onChange={(e) => set("full_name", e.target.value)} required /></Field>
        <Field label="Employee ID"><Input value={v.employee_code} onChange={(e) => set("employee_code", e.target.value)} placeholder="EMP006" /></Field>
        <Field label="Role">
          <Select value={v.role} onChange={(e) => set("role", e.target.value as "admin" | "employee")}>
            <option value="employee">Staff</option><option value="manager">Manager (sees own team)</option><option value="admin">Admin</option>
          </Select>
        </Field>
        <Field label="Staff type" hint="Field staff use the mobile app with tracking">
          <Select value={v.staff_type} onChange={(e) => {
            const t = e.target.value as "office" | "field";
            setV((x) => ({ ...x, staff_type: t, shift_start: t === "field" && x.shift_start === "09:00" ? "09:30" : x.shift_start, shift_end: t === "field" && x.shift_end === "18:00" ? "18:30" : x.shift_end }));
          }}>
            <option value="office">Office (punch inside the office)</option><option value="field">Field (Start / End day, visits, tracking)</option>
          </Select>
        </Field>
        <Field label="Manager" hint="Their manager sees their attendance and approves leave">
          <Select value={v.manager_id} onChange={(e) => set("manager_id", e.target.value)}>
            <option value="">No manager (admins only)</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        {v.staff_type === "field" && (
          <Field label="Vehicle" hint="Sets the travel allowance rate per km">
            <Select value={v.vehicle_type_id} onChange={(e) => set("vehicle_type_id", e.target.value)}>
              <option value="">No travel allowance</option>
              {vehicles.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label="Email" hint="Used to sign in"><Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone" hint="10-digit mobile; can also sign in"><Input type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        {mode === "create" && (
          <Field label="Temporary password" hint="At least 8 characters. Share it with the employee." className="sm:col-span-2">
            <Input value={v.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" />
          </Field>
        )}
        <Field label="Designation"><Input value={v.designation} onChange={(e) => set("designation", e.target.value)} /></Field>
        <Field label="Department"><Input value={v.department} onChange={(e) => set("department", e.target.value)} /></Field>
        <Field label="Joining date"><Input type="date" value={v.joining_date} onChange={(e) => set("joining_date", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Shift start"><Input type="time" value={v.shift_start} onChange={(e) => set("shift_start", e.target.value)} /></Field>
          <Field label="Shift end"><Input type="time" value={v.shift_end} onChange={(e) => set("shift_end", e.target.value)} /></Field>
        </div>
      </div>

      {v.staff_type === "office" && <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Offices</legend>
        {offices.length === 0 && <p className="text-sm text-muted">Add an office in Settings first.</p>}
        <div className="flex flex-wrap gap-2">
          {offices.map((o) => {
            const on = v.office_ids.includes(o.id);
            return (
              <button type="button" key={o.id} onClick={() => set("office_ids", on ? v.office_ids.filter((x) => x !== o.id) : [...v.office_ids, o.id])}
                className={`h-9 rounded-full border px-3 text-sm transition ${on ? "border-fg bg-accent text-accent-fg" : "border-line hover:bg-soft"}`}>
                {o.name}
              </button>
            );
          })}
        </div>
      </fieldset>}

      <div className="grid gap-4 rounded-2xl bg-soft p-4 sm:grid-cols-2">
        <Field label="Monthly gross salary (₹)"><Input inputMode="decimal" value={v.gross} onChange={(e) => set("gross", e.target.value)} placeholder="30000" /></Field>
        <Field label="OT multiplier" hint="Blank = company default"><Input inputMode="decimal" value={v.ot_multiplier} onChange={(e) => set("ot_multiplier", e.target.value)} placeholder="1.5" disabled={!v.ot_eligible} /></Field>
        <div className="sm:col-span-2"><Switch checked={v.ot_eligible} onChange={(b) => set("ot_eligible", b)} label="Eligible for overtime" /></div>
      </div>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      <Button type="submit" loading={busy} className="w-full sm:w-auto">{submitLabel}</Button>
    </form>
  );
}
