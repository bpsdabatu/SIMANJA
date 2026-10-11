import { describe, expect, it } from "vitest";
import { buildEntryIndex, parseCashPdfLines, pickWindow, resolveEntry, validateCashRows, type EntryRef } from "@/lib/cash-import";
import { cashWarnings, monthToQuarter, quarterTotals, splitEvenly } from "@/lib/cash";

const E = (id: string, sub: string, acc: string, fund: string, desc: string, pagu: string): EntryRef => ({ id, sub, acc, fund, desc, pagu });
const idx = buildEntryIndex([
  E("e1", "1.01.02.2.01.0001", "5.1.01.01.01.0001", "DAU", "Gaji Pokok ASN", "4000000.00"),
  E("e2", "1.01.02.2.06.0001", "5.1.02.01.01.0026", "DAU", "Belanja Alat Tulis Kantor", "5000000.00"),
  E("e3", "1.01.02.2.06.0001", "5.1.02.01.01.0026", "DAK", "Belanja ATK Khusus", "1000000.00"),
]);
describe("triwulan", () => {
  it("bulan -> triwulan", () => expect([1, 3, 4, 6, 7, 9, 10, 12].map(monthToQuarter)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]));
  it("bagi rata menyimpan sisa sen di TW IV", () => { expect(splitEvenly("1000.00")).toEqual(["250.00", "250.00", "250.00", "250.00"]); expect(splitEvenly("100.01")).toEqual(["25.00", "25.00", "25.00", "25.01"]); });
  it("total triwulan & peringatan", () => {
    const items = [{ entryId: "e", quarter: 1, planned: "100.00" }, { entryId: "e", quarter: 4, planned: "50.50" }];
    expect(quarterTotals(items)).toEqual(["100.00", "0.00", "0.00", "50.50"]);
    expect(cashWarnings([{ id: "e", amount: "100.00" }], items, []).map((w) => w.type)).toEqual(["exceeds_pagu"]);
    expect(cashWarnings([{ id: "e", amount: "1000.00" }], [{ entryId: "e", quarter: 3, planned: "500.00" }], [{ id: "p", name: "ATK", dueQuarter: 1, allocations: [{ entryId: "e", amount: "400.00" }] }]).map((w) => w.type)).toEqual(["cash_not_ready"]);
  });
});
describe("resolve rekening anggaran", () => {
  it("tunggal", () => expect(resolveEntry(idx, "1.01.02.2.01.0001", "5.1.01.01.01.0001")).toMatchObject({ entry: { id: "e1" } }));
  it("ambigu tanpa sumber dana/uraian", () => expect(resolveEntry(idx, "1.01.02.2.06.0001", "5.1.02.01.01.0026")).toHaveProperty("error"));
  it("ambigu dipecahkan sumber dana", () => expect(resolveEntry(idx, "1.01.02.2.06.0001", "5.1.02.01.01.0026", "dak")).toMatchObject({ entry: { id: "e3" } }));
  it("ambigu dipecahkan uraian", () => expect(resolveEntry(idx, "1.01.02.2.06.0001", "5.1.02.01.01.0026", undefined, "belanja alat tulis kantor")).toMatchObject({ entry: { id: "e2" } }));
  it("tidak ada", () => expect(resolveEntry(idx, "9.9", "5.1.01.01.01.0001")).toHaveProperty("error"));
});
describe("unggah Excel", () => {
  const base = { kode_subkegiatan: "1.01.02.2.01.0001", kode_rekening: "5.1.01.01.01.0001" };
  it("membaca tw1..tw4 format Indonesia", () => {
    const r = validateCashRows([{ _row: 2, ...base, tw1: "1.000.000,00", tw2: 1000000, tw3: "", tw4: "500000" }], idx);
    expect(r.errors).toEqual([]); expect(r.valid[0]).toEqual({ entry_id: "e1", q: ["1000000.00", "1000000.00", null, "500000.00"] });
    expect(r.preview[0]!.total).toBe("2500000.00"); expect(r.preview[0]!.over).toBe(false);
  });
  it("menjumlahkan kolom bulanan menjadi triwulan", () => {
    const r = validateCashRows([{ _row: 2, ...base, jan: 100, februari: 100, mar: 100, apr: 50, des: 10 }], idx);
    expect(r.valid[0]!.q).toEqual(["300.00", "50.00", null, "10.00"]);
  });
  it("kolom tw menang atas kolom bulan", () => expect(validateCashRows([{ _row: 2, ...base, tw1: 5, jan: 100 }], idx).valid[0]!.q[0]).toBe("5.00"));
  it("menandai melebihi pagu tanpa menolak", () => { const r = validateCashRows([{ _row: 2, ...base, tw1: 5000000 }], idx); expect(r.errors).toEqual([]); expect(r.preview[0]!.over).toBe(true); });
  it("baris tanpa nilai dilewati, bukan error", () => { const r = validateCashRows([{ _row: 2, ...base }], idx); expect(r.skipped).toBe(1); expect(r.errors).toEqual([]); });
  it("error: angka tidak valid, negatif, tidak ada, duplikat", () => {
    const r = validateCashRows([{ _row: 2, ...base, tw1: "abc" }, { _row: 3, ...base, tw1: -5 }, { _row: 4, kode_subkegiatan: "x", kode_rekening: "y", tw1: 1 }, { _row: 5, ...base, tw1: 1 }, { _row: 6, ...base, tw2: 1 }], idx);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3, 4, 6]); expect(r.valid).toHaveLength(1);
  });
});
describe("unggah PDF", () => {
  const lines = [
    "Kode Uraian Pagu TW I TW II TW III TW IV",
    "1.01.02.2.01.0001 Penyediaan Gaji dan Tunjangan ASN",
    "5.1.01.01.01.0001 Gaji Pokok ASN 4.000.000,00 1.000.000,00 1.000.000,00 1.000.000,00 1.000.000,00",
    "1.01.02.2.06.0001 Penyediaan Barang Pakai Habis",
    "5.1.02.01.01.0026 Belanja Alat Tulis Kantor 5.000.000,00 1.250.000,00 1.250.000,00 1.250.000,00 1.250.000,00",
    "5.1.02.01.01.0026 Belanja ATK Khusus 1.000.000,00 1.000.000,00 0,00 0,00 0,00",
    "5.1.02.01.01.0026 Tanpa angka",
  ];
  it("mengenali kode dari master, memakai konteks subkegiatan, dan memilih 4 angka triwulan (bukan kolom pagu)", () => {
    const r = parseCashPdfLines(lines, idx);
    expect(r.valid.map((v) => v.entry_id)).toEqual(["e1", "e2", "e3"]);
    expect(r.valid[0]!.q).toEqual(["1000000.00", "1000000.00", "1000000.00", "1000000.00"]);
    expect(r.valid[2]!.q).toEqual(["1000000.00", "0.00", "0.00", "0.00"]);
    expect(r.errors).toHaveLength(1); expect(r.errors[0]!.row).toBe(7);
  });
  it("PDF bulanan dijumlahkan ke triwulan", () => {
    const m = ["100,00", "100,00", "100,00", "50,00", "50,00", "50,00", "0,00", "0,00", "0,00", "10,00", "10,00", "10,00"].join(" ");
    const r = parseCashPdfLines(["1.01.02.2.01.0001 X", `5.1.01.01.01.0001 Gaji 4.000.000,00 ${m}`], idx);
    expect(r.valid[0]!.q).toEqual(["300.00", "150.00", "0.00", "30.00"]);
  });
  it("pickWindow: kolom jumlah di akhir", () => expect(pickWindow(["10.00", "20.00", "30.00", "40.00", "100.00"], 4)).toEqual(["10.00", "20.00", "30.00", "40.00"]));
  it("tanpa konteks subkegiatan: rekening unik tetap terbaca", () => expect(parseCashPdfLines(["5.1.01.01.01.0001 Gaji 1,00 2,00 3,00 4,00"], idx).valid[0]!.entry_id).toBe("e1"));
});

describe("format nominal pada template kas", () => {
  const row = (v: unknown) => ({ _row: 2, kode_subkegiatan: "1.01.02.2.01.0001", kode_rekening: "5.1.01.01.01.0001", kode_sumber_dana: "DAU", uraian: "Gaji Pokok ASN", tw1: v });
  it.each([["Rp. 1.000.000", "1000000.00"], ["1.000.000,-", "1000000.00"], ["1,000,000.00", "1000000.00"], [1000000, "1000000.00"], ["-", "0.00"], ["\u2013", "0.00"]])("tw1 %s diterima", (v, o) => {
    const r = validateCashRows([row(v)], idx); expect(r.errors).toEqual([]); expect(r.valid[0]?.q[0]).toBe(o);
  });
  it("sel galat Excel dilaporkan dengan jelas, bukan [object Object]", () => {
    const r = validateCashRows([row("#REF!")], idx); expect(r.errors[0]?.message).toContain("#REF!");
  });
});
