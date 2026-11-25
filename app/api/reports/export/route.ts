import ExcelJS from "exceljs";
import { requireStaffViewer, supabaseServer } from "@/lib/supabase/server";
import { buildTablePdf } from "@/lib/table-pdf";

export const runtime = "nodejs";

/**
 * POST { format: "xlsx" | "pdf", title, headers, rows, numeric } → a file.
 * The rows come from the report functions in the database (which already limit
 * managers to their team); this route only lays them out.
 */
export async function POST(req: Request) {
  try { await requireStaffViewer(); } catch (r) { return r as Response; }
  const { format, title, headers, rows, numeric } = (await req.json()) as {
    format: "xlsx" | "pdf"; title: string; headers: string[]; rows: (string | number)[][]; numeric?: boolean[];
  };
  if (!Array.isArray(headers) || !Array.isArray(rows) || rows.length > 50000) return new Response("Bad request", { status: 400 });
  const sb = await supabaseServer();
  const { data: company } = await sb.from("org_settings").select("company_name").eq("id", 1).single();
  const heading = `${company?.company_name ?? ""} · ${title}`;

  if (format === "pdf") {
    const bytes = await buildTablePdf(heading, headers, rows, numeric ?? []);
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="report.pdf"' } });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Report", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.addRow([heading]).font = { bold: true, size: 13 };
  ws.addRow([]);
  const h = ws.addRow(headers);
  h.font = { bold: true };
  h.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } }; });
  for (const r of rows) ws.addRow(r.map((v) => (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v)));
  headers.forEach((t, i) => {
    const longest = Math.max(t.length, ...rows.slice(0, 500).map((r) => String(r[i] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(48, Math.max(10, longest + 2));
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="report.xlsx"' },
  });
}
