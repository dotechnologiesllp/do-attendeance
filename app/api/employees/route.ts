import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/server";
import { createEmployee } from "@/lib/employee-server";
import type { EmployeeInput } from "@/lib/employee";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try { await requireAdmin(); } catch (r) { return r as Response; }
  const body = (await req.json()) as EmployeeInput;
  const res = await createEmployee(body);
  return NextResponse.json(res, { status: res.error ? 400 : 201 });
}
