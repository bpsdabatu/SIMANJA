import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseRupiah } from "@/lib/import/parse";
import { sha256 } from "@/lib/import/hash";
import { readFirstSheet } from "@/lib/import/xlsx";
import { validateBudgetRows, type Masters } from "@/lib/import/budget";
const m: Masters = { subactivities: new Map([["1.01.01", "s1"]]), accounts: new Map([["5.1.02", "a1"]]), fundingSources: new Map([["DAU", "f1"]]), pptkByNip: new Map([["1980", "p1"]]) };
describe("parseRupiah", () => {
  it.each([["1.234.567,89", "1234567.89"], ["Rp 1.500.000", "1500000.00"], ["1500000", "1500000.00"], [2500.5, "2500.50"]])("%s", (i, o) => expect(parseRupiah(i)).toBe(o));
  it.each([["Rp. 1.500.000", "1500000.00"], ["Rp.1.500.000,-", "1500000.00"], ["1.500.000,-", "1500000.00"], ["1,500,000.00", "1500000.00"], ["1,500,000", "1500000.00"],
    ["IDR 1,500,000.50", "1500000.50"], ["'1500000", "1500000.00"], ["1 500 000", "1500000.00"], ["\u00a01.500.000", "1500000.00"], ["1.500.000,5", "1500000.50"], ["1.500.000.", "1500000.00"], ["-0", "0.00"]])("format Excel/Indonesia %s", (i, o) => expect(parseRupiah(i)).toBe(o));
  it("angka negatif tetap terdeteksi", () => expect(parseRupiah("-1.500.000")).toBe("-1500000.00"));
  it.each(["abc", "", "1,234,56", "10,005", "1,500", "-", "1.5E+06", "(1.500.000)", "12,5%"])("menolak %s", (i) => expect(parseRupiah(i)).toBeNull());
});
describe("validateBudgetRows", () => {
  const ok = { _row: 2, kode_subkegiatan: "1.01.01", kode_rekening: "5.1.02", kode_sumber_dana: "dau", uraian: "Belanja ATK", pagu: "1.000.000", nip_pptk: "1980" };
  it("menerima baris valid", () => { const r = validateBudgetRows([ok], m); expect(r.errors).toEqual([]); expect(r.valid[0]?.amount).toBe("1000000.00"); });
  it("melaporkan kode master tidak dikenal beserta saran", () => { const r = validateBudgetRows([{ ...ok, kode_rekening: "9.9" }], m); expect(r.errors[0]).toMatchObject({ row: 2, field: "kode_rekening" }); expect(r.errors[0]?.hint).toBeTruthy(); expect(r.valid).toHaveLength(0); });
  it("mendeteksi duplikasi dalam file", () => { const r = validateBudgetRows([ok, { ...ok, _row: 3 }], m); expect(r.valid).toHaveLength(1); expect(r.errors[0]?.message).toContain("baris 2"); });
});
describe("xlsx", () => {
  it("membaca workbook dan checksum stabil", async () => {
    const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet("x");
    ws.addRow(["Kode_Subkegiatan", "Pagu"]); ws.addRow(["1.01.01", 5000]);
    const buf = new Uint8Array(await wb.xlsx.writeBuffer());
    const rows = await readFirstSheet(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(rows[0]).toMatchObject({ _row: 2, kode_subkegiatan: "1.01.01", pagu: 5000 });
    expect(sha256(buf)).toBe(sha256(buf));
  });
});
