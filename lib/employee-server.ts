import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { normalisePhone, validateEmployee, type EmployeeInput } from "@/lib/employee";

/** Creates a login (Supabase Auth) and the employee profile. Admin only. */
export async function createEmployee(input: EmployeeInput): Promise<{ id?: string; error?: string }> {
  const e: EmployeeInput = { ...input, email: input.email?.trim().toLowerCase() || null, phone: normalisePhone(input.phone) };
  const invalid = validateEmployee(e, { requirePassword: true });
  if (invalid) return { error: invalid };

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: e.email ?? undefined,
    phone: e.phone ?? undefined,
    password: e.password,
    email_confirm: true,
    phone_confirm: true,
    user_metadata: { full_name: e.full_name },
  });
  if (error || !data.user) return { error: error?.message ?? "Could not create the login" };
  const id = data.user.id;

  const { error: pErr } = await admin.from("profiles").insert({
    id, role: e.role ?? "employee", full_name: e.full_name.trim(), employee_code: e.employee_code || null,
    email: e.email, phone: e.phone, designation: e.designation || null, department: e.department || null,
    joining_date: e.joining_date || undefined, shift_start: e.shift_start || null, shift_end: e.shift_end || null,
    monthly_gross_paise: e.monthly_gross_paise, ot_eligible: e.ot_eligible, ot_multiplier: e.ot_multiplier ?? null,
    staff_type: e.staff_type ?? "office", manager_id: e.manager_id || null, vehicle_type_id: e.vehicle_type_id || null,
  });
  if (pErr) {
    await admin.auth.admin.deleteUser(id);
    return { error: /employee_code/.test(pErr.message) ? "That employee ID is already used" : pErr.message };
  }
  if (e.office_ids.length) {
    await admin.from("employee_offices").insert(e.office_ids.map((office_id) => ({ employee_id: id, office_id })));
  }
  return { id };
}
