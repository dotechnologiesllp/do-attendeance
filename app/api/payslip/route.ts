import { supabaseServer } from "@/lib/supabase/server";
import { buildPayslipPdf } from "@/lib/payslip-pdf";
import type { PayrollRow } from "@/lib/payroll";

export const runtime = "nodejs";

/**
 * GET /api/payslip?month=YYYY-MM-01&employee=<uuid>
 * Employees: their own finalized payslips only (row-level security decides).
 * Admins: any employee; a month that isn't finalized yet comes out as a DRAFT.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const month = url.searchParams.get("month") ?? "";
  const employee = url.searchParams.get("employee") ?? "";
  if (!/^\d{4}-\d{2}-01$/.test(month) || !/^[0-9a-f-]{36}$/i.test(employee)) return new Response("Bad request", { status: 400 });

  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("Sign in first", { status: 401 });

  const [{ data: slip }, { data: company }] = await Promise.all([
    sb.from("payslips").select("data").eq("month", month).eq("employee_id", employee).maybeSingle(),
    sb.from("org_settings").select("company_name, company_address, logo_url").eq("id", 1).single(),
  ]);

  let row = slip?.data as PayrollRow | undefined;
  let draft = false;
  if (!row) {
    // Not finalized: only an admin may preview (payroll_row checks permissions itself).
    const { data: me } = await sb.from("profiles").select("role").eq("id", user.id).single();
    if (me?.role !== "admin") return new Response("This payslip isn't available yet", { status: 404 });
    const { data, error } = await sb.rpc("payroll_row", { p_emp: employee, p_month: month });
    if (error || !data) return new Response(error?.message ?? "Not found", { status: 404 });
    row = data as PayrollRow; draft = true;
  }

  const bytes = await buildPayslipPdf(row, company ?? { company_name: "Company" }, { draft });
  const name = `payslip-${row.employee_code ?? row.name.replace(/\W+/g, "-")}-${month.slice(0, 7)}${draft ? "-draft" : ""}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
