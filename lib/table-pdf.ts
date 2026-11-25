// A simple, readable landscape A4 table PDF for report exports.
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const clean = (s: string) => s.replace(/₹/g, "Rs. ").replace(/[−–]/g, "-").replace(/→/g, "->").replace(/[^\x20-\x7E -ÿ…]/g, "");

export async function buildTablePdf(title: string, headers: string[], rows: (string | number)[][], numeric: boolean[]) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 32, size = 8, rowH = 15;
  const ink = rgb(0.06, 0.06, 0.06), muted = rgb(0.45, 0.45, 0.48), line = rgb(0.9, 0.9, 0.9);

  // column widths from content, scaled to fit the page
  const want = headers.map((h, i) => Math.min(220, Math.max(bold.widthOfTextAtSize(clean(h), size),
    ...rows.slice(0, 300).map((r) => font.widthOfTextAtSize(clean(String(r[i] ?? "")), size))) + 10));
  const scale = Math.min(1, (W - 2 * M) / want.reduce((a, b) => a + b, 0));
  const widths = want.map((w) => w * scale);
  const fit = (t: string, w: number, f = font) => {
    let s = clean(t);
    if (f.widthOfTextAtSize(s, size) <= w - 6) return s;
    while (s.length > 1 && f.widthOfTextAtSize(s + "...", size) > w - 6) s = s.slice(0, -1);
    return s + "...";
  };

  let page = pdf.addPage([W, H]); let y = H - M; let pageNo = 1;
  const header = () => {
    page.drawText(clean(title), { x: M, y: y - 4, size: 12, font: bold, color: ink });
    page.drawText(`Generated ${new Date().toISOString().slice(0, 10)} · page ${pageNo}`, { x: W - M - 150, y: y - 4, size: 8, font, color: muted });
    y -= 26;
    let x = M;
    headers.forEach((h, i) => {
      const t = fit(h, widths[i], bold);
      const tx = numeric[i] ? x + widths[i] - 3 - bold.widthOfTextAtSize(t, size) : x + 3;
      page.drawText(t, { x: tx, y, size, font: bold, color: muted });
      x += widths[i];
    });
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: line });
    y -= rowH - 4;
  };
  header();
  for (const r of rows) {
    if (y < M + 10) { page = pdf.addPage([W, H]); y = H - M; pageNo++; header(); }
    let x = M;
    r.forEach((c, i) => {
      const t = fit(String(c ?? ""), widths[i]);
      const tx = numeric[i] ? x + widths[i] - 3 - font.widthOfTextAtSize(t, size) : x + 3;
      page.drawText(t, { x: tx, y, size, font, color: ink });
      x += widths[i];
    });
    page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.4, color: line });
    y -= rowH;
  }
  return pdf.save();
}
