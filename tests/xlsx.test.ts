import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
vi.mock("server-only", () => ({}));
import { reportToXlsx } from "@/lib/server/xlsx-report";
import { EMPTY_PROFILE } from "@/lib/settings";
import type { Report } from "@/lib/report-types";

const report: Report = { slug: "t", title: "Rekapitulasi Uji", subtitle: "Tahun Anggaran 2026", landscape: true,
  columns: [{ key: "no", label: "No", kind: "int" }, { key: "uraian", label: "Uraian" }, { key: "pagu", label: "Pagu", kind: "money" }, { key: "pct", label: "%", kind: "percent" }],
  rows: [{ no: 1, uraian: "Belanja ATK", pagu: "1500000.50", pct: "25.00" }, { no: 2, uraian: "Belanja Jasa", pagu: "500000.00", pct: null }],
  totals: { uraian: "TOTAL", pagu: "2000000.50" }, notes: ["Catatan uji."] };

describe("ekspor Excel", () => {
  it("menulis judul, header, angka sebenarnya, dan total", async () => {
    const buf = await reportToXlsx(report, { ...EMPTY_PROFILE, orgName: "Dinas Contoh" }, "Budi");
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getCell("A1").value).toBe("Dinas Contoh");
    expect(ws.getCell("A2").value).toBe("REKAPITULASI UJI");
    expect(ws.getCell("B5").value).toBe("Uraian");
    expect(ws.getCell("C6").value).toBe(1500000.5);            // angka, bukan teks
    expect(ws.getCell("C6").numFmt).toBe("#,##0.00");
    expect(ws.getCell("D6").value).toBe(0.25);
    expect(ws.getCell("D7").value).toBe("-");                  // kosong -> strip
    expect(ws.getCell("B8").value).toBe("TOTAL");
    expect(ws.getCell("C8").value).toBe(2000000.5);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 5 });
  });
});

describe("sel formula/galat", () => {
  it("memakai hasil formula, dan sel galat/tanpa hasil tidak menjadi [object Object]", async () => {
    const ExcelJS = (await import("exceljs")).default, { readFirstSheet } = await import("@/lib/import/xlsx");
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("x");
    ws.addRow(["a", "b", "c"]); ws.addRow([{ formula: "1+1", result: 2 }, { formula: "1/0", result: { error: "#DIV/0!" } }, { formula: "A1+1" }]);
    const rows = await readFirstSheet((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    expect(rows[0]).toMatchObject({ a: 2, b: "#DIV/0!", c: "" });
  });
});
