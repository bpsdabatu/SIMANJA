import "server-only";
import ExcelJS from "exceljs";
import type { Report } from "@/lib/report-types";
import type { PrintProfile } from "@/lib/settings";
import { nowWib } from "@/lib/date";

const NAVY = "FF0C1A3A", BORDER = { style: "thin" as const, color: { argb: "FF94A3B8" } };
const box = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

export async function reportToXlsx(r: Report, profile: PrintProfile, printedBy: string): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook(); wb.creator = "SIPANDABAJA"; wb.created = new Date();
  const ws = wb.addWorksheet(r.title.replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "Laporan", {
    pageSetup: { paperSize: 9, orientation: r.landscape ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } } });
  const n = r.columns.length;
  const head = (row: number, text: string, size: number, bold = true) => { ws.mergeCells(row, 1, row, n); const c = ws.getCell(row, 1); c.value = text; c.font = { bold, size, name: "Arial" }; c.alignment = { horizontal: "center" }; };
  head(1, profile.orgName || "SIPANDABAJA", 14); head(2, r.title.toUpperCase(), 12); head(3, r.subtitle ?? "", 11, false);
  const hr = 5; ws.getRow(hr).height = 32;
  r.columns.forEach((c, i) => {
    const cell = ws.getCell(hr, i + 1); cell.value = c.label;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" }; cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; cell.border = box; ws.getColumn(i + 1).width = c.width ?? (c.kind === "money" ? 18 : 16);
  });
  const put = (rowNo: number, rec: Record<string, any>, totalRow: boolean) => r.columns.forEach((c, i) => {
    const lvl = Number(rec._lvl ?? 0), bold = totalRow || lvl > 0, cell = ws.getCell(rowNo, i + 1), v = rec[c.key]; cell.border = box;
    if (v === null || v === undefined || v === "") { cell.value = bold || c.key === "no" ? null : "-"; cell.alignment = { horizontal: "center" }; }
    else if (c.kind === "money") { cell.value = Number(v); cell.numFmt = "#,##0.00"; cell.alignment = { horizontal: "right" }; }
    else if (c.kind === "percent") { cell.value = Number(v) / 100; cell.numFmt = "0.00%"; cell.alignment = { horizontal: "right" }; }
    else if (c.kind === "int") { cell.value = Number(v); cell.numFmt = "#,##0"; cell.alignment = { horizontal: c.align ?? "center" }; }
    else { cell.value = String(v); cell.alignment = { horizontal: c.align ?? "left", vertical: "top", wrapText: true, indent: c.indent ? Number(rec._ind ?? 0) : 0 }; }
    cell.font = { bold, name: "Arial", size: 10 };
    if (bold) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: lvl === 1 ? "FFCBD5E1" : lvl === 2 ? "FFE2E8F0" : "FFF1F5F9" } };
  });
  r.rows.forEach((rec, i) => put(hr + 1 + i, rec, false));
  let last = hr + r.rows.length;
  if (r.totals) { last += 1; put(last, r.totals, true); }
  ws.views = [{ state: "frozen", ySplit: hr }];
  if (r.rows.length) ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: hr + r.rows.length, column: n } };
  let row = last + 2;
  for (const note of r.notes ?? []) { ws.mergeCells(row, 1, row, n); ws.getCell(row, 1).value = `Catatan: ${note}`; ws.getCell(row, 1).font = { italic: true, size: 10, color: { argb: "FF475569" } }; row++; }
  ws.mergeCells(row + 1, 1, row + 1, n);
  ws.getCell(row + 1, 1).value = `Dicetak dari SIPANDABAJA pada ${nowWib()} oleh ${printedBy}`;
  ws.getCell(row + 1, 1).font = { size: 9, color: { argb: "FF64748B" } };
  return wb.xlsx.writeBuffer();
}
