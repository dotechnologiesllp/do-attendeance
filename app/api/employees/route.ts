import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";
import { createEmployee } from "@/lib/employee-server";
import type { EmployeeInput } from "@/lib/employee";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try { await requireAdmin(); } catch (r) { return r as Response; }
  const body = (await req.json()) as EmployeeInput;
  const res = await createEmployee(body);
  return NextResponse.json(res, { status: res.error ? 400 : 201 });
}

/**
 * Permanently delete employees (login + profile). Admin only.
 * Skips: yourself, and anyone with a finalized payslip (their payroll history must be kept: deactivate them instead).
 * Anything the database refuses to delete (linked records) is reported per person and left untouched.
 */
export async function DELETE(req: Request) {
  let me;
  try { me = await requireAdmin(); } catch (r) { return r as Response; }
  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.from(new Set((body.ids ?? []).filter((x) => typeof x === "string")));
  if (!ids.length) return NextResponse.json({ error: "No employees selected" }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ error: "Select at most 200 at a time" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: profs } = await admin.from("profiles").select("id, full_name").in("id", ids);
  const names = new Map((profs ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]));
  const { data: slips } = await admin.from("payslips").select("employee_id").in("employee_id", ids);
  const hasSlip = new Set((slips ?? []).map((x: { employee_id: string }) => x.employee_id));

  const results: { id: string; name: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    const name = names.get(id) ?? id;
    if (id === me.id) { results.push({ id, name, ok: false, error: "You can't delete yourself" }); continue; }
    if (hasSlip.has(id)) { results.push({ id, name, ok: false, error: "Has finalized payslips. Deactivate instead to keep payroll history" }); continue; }
    const { error: pErr } = await admin.from("profiles").delete().eq("id", id);
    if (pErr) { results.push({ id, name, ok: false, error: "Has linked records (attendance, leave…). Deactivate instead" }); continue; }
    const { error: aErr } = await admin.auth.admin.deleteUser(id);
    // "User not found" means the cascade already removed the login: that is fine.
    if (aErr && !/not found/i.test(aErr.message)) { results.push({ id, name, ok: false, error: aErr.message }); continue; }
    results.push({ id, name, ok: true });
  }
  return NextResponse.json({ results });
}
