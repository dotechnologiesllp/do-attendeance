import ExcelJS from "exceljs";
import { requireAdmin, supabaseServer } from "@/lib/supabase/server";
import { adjustmentsNet, PAYROLL_COLUMNS, type PayrollRow } from "@/lib/payroll";

export const runtime = "nodejs";

/** GET /api/payroll/export?month=YYYY-MM-01 → .xlsx payroll sheet. Admin only. */
export async function GET(req: Request) {
  try { await requireAdmin(); } catch (r) { return r as Response; }
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}-01$/.test(month)) return new Response("Bad request", { status: 400 });

  const sb = await supabaseServer();
  const [{ data, error }, { data: company }] = await Promise.all([
    sb.rpc("compute_payroll", { p_month: month }),
    sb.from("org_settings").select("company_name").eq("id", 1).single(),
  ]);
  if (error) return new Response(error.message, { status: 400 });
  const payroll = data as { status: string; rows: PayrollRow[] };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Do Attendance";
  const ws = wb.addWorksheet(`Payroll ${month.slice(0, 7)}`, { views: [{ state: "frozen", ySplit: 3 }] });
  ws.addRow([`${company?.company_name ?? ""} · Payroll ${month.slice(0, 7)} · ${payroll.status === "finalized" ? "Finalized" : "Draft"}`]).font = { bold: true, size: 13 };
  ws.addRow([]);
  const header = ws.addRow([...PAYROLL_COLUMNS.map((c) => c.label), "Per-day rate", "Hourly rate", "Late marks"]);
  header.font = { bold: true };
  header.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } }; c.border = { bottom: { style: "thin", color: { argb: "FFDDDDDD" } } }; });

  const money = '"₹"#,##0.00';
  for (const r of payroll.rows) {
    const vals = PAYROLL_COLUMNS.map((c) => {
      const v = c.key === "adjustments_net" ? adjustmentsNet(r) : r[c.key as keyof PayrollRow];
      return c.money ? Number(v ?? 0) / 100 : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    });
    ws.addRow([...vals, Number(r.per_day_paise) / 100, Number(r.hourly_paise) / 100, r.late_marks]);
  }
  const first = 4, last = 3 + payroll.rows.length;
  const total = ws.addRow(PAYROLL_COLUMNS.map((c, i) => {
    if (i === 1) return "Total";
    if (!c.money || last < first) return null;
    const col = ws.getColumn(i + 1).letter;
    return { formula: `SUM(${col}${first}:${col}${last})` };
  }));
  total.font = { bold: true };

  PAYROLL_COLUMNS.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.key === "name" ? 24 : c.money ? 14 : 11;
    if (c.money) col.numFmt = money;
  });
  ws.getColumn(PAYROLL_COLUMNS.length + 1).numFmt = money;
  ws.getColumn(PAYROLL_COLUMNS.length + 2).numFmt = money;
  ws.getColumn(PAYROLL_COLUMNS.length + 1).width = 14;
  ws.getColumn(PAYROLL_COLUMNS.length + 2).width = 14;

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="payroll-${month.slice(0, 7)}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
