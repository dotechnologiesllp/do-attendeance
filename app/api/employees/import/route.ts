import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/server";
import { createEmployee } from "@/lib/employee-server";
import type { EmployeeInput } from "@/lib/employee";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Bulk import: creates each row independently and reports a result per row. */
export async function POST(req: Request) {
  try { await requireAdmin(); } catch (r) { return r as Response; }
  const { rows } = (await req.json()) as { rows: EmployeeInput[] };
  if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: "No rows" }, { status: 400 });
  if (rows.length > 500) return NextResponse.json({ error: "Import at most 500 rows at a time" }, { status: 400 });
  const results: { row: number; name: string; id?: string; error?: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = await createEmployee(rows[i]);
    results.push({ row: i + 2, name: rows[i].full_name, ...r });   // +2: header line, 1-based
  }
  return NextResponse.json({ results });
}
