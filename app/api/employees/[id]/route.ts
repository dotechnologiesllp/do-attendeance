import { NextResponse } from "next/server";
import { requireAdmin, supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Deactivate / reactivate (also blocks or restores the login) and reset passwords. Admin only. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let me;
  try { me = await requireAdmin(); } catch (r) { return r as Response; }
  const { id } = await params;
  const body = (await req.json()) as { active?: boolean; password?: string; exit_date?: string | null; email?: string; phone?: string };
  const admin = supabaseAdmin();

  if (typeof body.active === "boolean") {
    if (id === me.id && !body.active) return NextResponse.json({ error: "You can't deactivate yourself" }, { status: 400 });
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: body.active ? "none" : "876000h" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const { error: pErr } = await admin.from("profiles")
      .update({ active: body.active, exit_date: body.active ? null : body.exit_date || today }).eq("id", id);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 });
  }
  if (body.email !== undefined || body.phone !== undefined) {
    const { error } = await admin.auth.admin.updateUserById(id, {
      ...(body.email ? { email: body.email.toLowerCase(), email_confirm: true } : {}),
      ...(body.phone ? { phone: body.phone, phone_confirm: true } : {}),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (body.password) {
    if (body.password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    const { error } = await admin.auth.admin.updateUserById(id, { password: body.password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
