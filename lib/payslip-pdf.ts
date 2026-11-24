// Builds a one-page A4 payslip PDF from a payroll row computed by the database.
import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import { breakdown, type PayrollRow } from "./payroll";
import { hm, monthLabel, num, rupees2 } from "./format";

export type Company = { company_name: string; company_address?: string | null; logo_url?: string | null };

// Standard PDF fonts only know Windows-1252: swap the few characters they lack.
const clean = (s: string) =>
  s.replace(/₹/g, "Rs. ").replace(/−/g, "-").replace(/→/g, "->").replace(/[^\x20-\x7E -ÿ–—‘’“”•…]/g, "");

export async function buildPayslipPdf(row: PayrollRow, company: Company, opts: { draft?: boolean } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Payslip ${row.name} ${monthLabel(row.month)}`);
  pdf.setCreator("Do Attendance");
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.05, 0.05), muted = rgb(0.42, 0.42, 0.45), line = rgb(0.9, 0.9, 0.9);
  const W = 595.28, M = 48;
  let y = 841.89 - M;

  const text = (s: string, x: number, yy: number, o: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 10, f = o.f ?? font, t = clean(s);
    const w = f.widthOfTextAtSize(t, size);
    page.drawText(t, { x: o.right ? x - w : x, y: yy, size, font: f, color: o.color ?? ink });
  };
  const rule = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.6, color: line });
  const wrap = (s: string, f: PDFFont, size: number, max: number) => {
    const words = clean(s).split(" "); const out: string[] = []; let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(t, size) > max && cur) { out.push(cur); cur = w; } else cur = t;
    }
    if (cur) out.push(cur);
    return out;
  };

  // Logo (PNG/JPEG data URL from Settings)
  let textX = M;
  if (company.logo_url?.startsWith("data:image/")) {
    try {
      const bytes = Buffer.from(company.logo_url.split(",")[1], "base64");
      const img = company.logo_url.startsWith("data:image/png") ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const h = 40, w = (img.width / img.height) * h;
      page.drawImage(img, { x: M, y: y - h + 8, width: w, height: h });
      textX = M + w + 12;
    } catch { /* unsupported image: skip the logo */ }
  }
  text(company.company_name, textX, y - 4, { size: 15, f: bold });
  if (company.company_address) text(company.company_address, textX, y - 20, { size: 9, color: muted });
  text("Payslip", W - M, y - 4, { size: 15, f: bold, right: true });
  text(monthLabel(row.month), W - M, y - 20, { size: 10, color: muted, right: true });
  y -= 52; rule(y); y -= 22;

  // Employee
  const pairs: [string, string][] = [
    ["Employee", row.name], ["Employee ID", row.employee_code ?? "-"],
    ["Designation", row.designation ?? "-"], ["Department", row.department ?? "-"],
  ];
  pairs.forEach(([k, v], i) => {
    const x = i % 2 === 0 ? M : W / 2 + 10, yy = y - Math.floor(i / 2) * 16;
    text(k, x, yy, { size: 9, color: muted }); text(v, x + 80, yy, { size: 10 });
  });
  y -= 44; rule(y); y -= 20;

  // Attendance summary
  text("Attendance", M, y, { size: 11, f: bold }); y -= 18;
  const facts: [string, string][] = [
    ["Working days", String(row.working_days)], ["Present", String(row.present)], ["Half days", String(row.half_days)],
    ["Paid leave", num(row.paid_leave)], ["Unpaid leave", num(row.unpaid_leave)], ["Absent", num(row.absent)],
    ["Late marks", String(row.late_marks)], ["LOP days", num(row.lop_days)], ["Overtime", hm(row.ot_min)],
  ];
  const colW = (W - 2 * M) / 3;
  facts.forEach(([k, v], i) => {
    const x = M + (i % 3) * colW, yy = y - Math.floor(i / 3) * 16;
    text(k, x, yy, { size: 9, color: muted }); text(v, x + colW - 16, yy, { size: 10, right: true });
  });
  y -= 56; rule(y); y -= 20;

  // Earnings and deductions
  const earn: [string, number][] = [["Gross salary", Number(row.gross_paise)], ["Overtime pay", Number(row.ot_paise)],
    ...row.allowances.map((a) => [a.name, Number(a.paise)] as [string, number]),
    ...row.adjustments.filter((a) => a.kind === "bonus" || a.kind === "incentive").map((a) => [`${a.kind === "bonus" ? "Bonus" : "Incentive"}: ${a.note}`, Number(a.paise)] as [string, number])];
  const ded: [string, number][] = [["Loss of pay", Number(row.lop_paise)],
    ...row.deductions.map((d) => [d.name, Number(d.paise)] as [string, number]),
    ...row.adjustments.filter((a) => a.kind === "advance" || a.kind === "fine").map((a) => [`${a.kind === "advance" ? "Advance" : "Fine"}: ${a.note}`, Number(a.paise)] as [string, number])];
  const half = (W - 2 * M - 20) / 2;
  text("Earnings", M, y, { size: 11, f: bold }); text("Deductions", M + half + 20, y, { size: 11, f: bold }); y -= 18;
  const fit = (str: string, max: number) => {
    let t = clean(str);
    if (font.widthOfTextAtSize(t, 9.5) <= max) return t;
    while (t.length > 1 && font.widthOfTextAtSize(t + "...", 9.5) > max) t = t.slice(0, -1);
    return t.trimEnd() + "...";
  };
  const rows = Math.max(earn.length, ded.length);
  for (let i = 0; i < rows; i++) {
    const yy = y - i * 16;
    if (earn[i]) { text(fit(earn[i][0], half - 85), M, yy, { size: 9.5 }); text(rupees2(earn[i][1], "Rs. "), M + half, yy, { size: 9.5, right: true }); }
    if (ded[i]) { text(fit(ded[i][0], half - 85), M + half + 20, yy, { size: 9.5 }); text(rupees2(ded[i][1], "Rs. "), W - M, yy, { size: 9.5, right: true }); }
  }
  y -= rows * 16 + 4;
  const tE = earn.reduce((s, x) => s + x[1], 0), tD = ded.reduce((s, x) => s + x[1], 0);
  text("Total earnings", M, y, { size: 9.5, f: bold }); text(rupees2(tE, "Rs. "), M + half, y, { size: 9.5, f: bold, right: true });
  text("Total deductions", M + half + 20, y, { size: 9.5, f: bold }); text(rupees2(tD, "Rs. "), W - M, y, { size: 9.5, f: bold, right: true });
  y -= 16; rule(y); y -= 28;

  // Net pay
  page.drawRectangle({ x: M, y: y - 14, width: W - 2 * M, height: 40, color: rgb(0.97, 0.97, 0.975) });
  text("Net pay", M + 14, y, { size: 12, f: bold });
  text(rupees2(row.net_paise, "Rs. "), W - M - 14, y, { size: 16, f: bold, right: true });
  if (row.rounded_to_rupee && Number(row.net_exact_paise) !== Number(row.net_paise)) {
    text(`rounded from ${rupees2(row.net_exact_paise, "Rs. ")}`, W - M - 14, y - 11, { size: 8, color: muted, right: true });
  }
  y -= 44;

  // Formulas
  text("How this was calculated", M, y, { size: 11, f: bold }); y -= 16;
  for (const l of breakdown(row, "Rs. ")) {
    if (y < 90) break;
    const left = `${l.label}${l.formula ? ":  " + l.formula : ""}`;
    const lines = wrap(left, font, 9, W - 2 * M - 120);
    lines.forEach((ln, i) => text(ln, M, y - i * 12, { size: 9, color: i === 0 ? ink : muted }));
    if (l.amount) text(`${l.sign && l.sign !== "=" ? l.sign + " " : ""}${l.amount}`, W - M, y, { size: 9, f: l.strong ? bold : font, right: true });
    y -= lines.length * 12 + 4;
  }

  text("This is a computer-generated payslip and does not need a signature.", M, 40, { size: 8, color: muted });
  text(`Generated ${new Date().toISOString().slice(0, 10)} · Do Attendance`, W - M, 40, { size: 8, color: muted, right: true });

  if (opts.draft) {
    page.drawText("DRAFT", { x: 150, y: 380, size: 110, font: bold, color: rgb(0.85, 0.85, 0.85), opacity: 0.35, rotate: degrees(35) });
  }
  return pdf.save();
}

