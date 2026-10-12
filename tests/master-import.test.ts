import { describe, expect, it } from "vitest";
import { parseMasterTable, rowKey } from "../src/lib/master-import";
import { greetingFor } from "../src/lib/wib";

describe("impor data master", () => {
  it("memetakan alias kolom dan memvalidasi", () => {
    const r = parseMasterTable("activities", [["Kode Program", "Kode Kegiatan", "Nama Kegiatan"], ["1.01", "1.01.01", "Keg A"], ["", "1.2", "Keg B"]]);
    expect(r.rows[0]).toMatchObject({ parent: "1.01", code: "1.01.01", name: "Keg A" });
    expect(r.problems).toEqual(['Baris 3: kode_program kosong dan tidak dapat diturunkan dari kode "1.2"']);
  });
  it("kolom wajib hilang", () => {
    expect(parseMasterTable("programs", [["kode"], ["1"]]).problems[0]).toContain("nama");
  });
  it("tahun RUP tidak valid & kunci baris", () => {
    const r = parseMasterTable("rup_references", [["tahun", "kode_rup"], ["1999", "A"], ["2026", "b"]]);
    expect(r.problems[0]).toContain("tahun");
    expect(rowKey("rup_references", r.rows[1]!)).toBe("2026|b");
  });
});

describe("salam WIB", () => {
  it("menurut jam Asia/Jakarta", () => {
    expect(greetingFor(new Date("2026-01-01T00:00:00Z"))).toBe("Selamat pagi"); // 07 WIB
    expect(greetingFor(new Date("2026-01-01T05:00:00Z"))).toBe("Selamat siang"); // 12 WIB
    expect(greetingFor(new Date("2026-01-01T09:00:00Z"))).toBe("Selamat sore"); // 16 WIB
    expect(greetingFor(new Date("2026-01-01T15:00:00Z"))).toBe("Selamat malam"); // 22 WIB
    expect(greetingFor(new Date("2026-01-01T20:00:00Z"))).toBe("Selamat malam"); // 03 WIB
  });
});

describe("turunan kode induk", () => {
  it("kegiatan -> program, sub kegiatan -> kegiatan bila kolom induk tidak ada", () => {
    const a = parseMasterTable("activities", [["Kode ", "Nama"], ["4.01.01.2.02", "Adm Keuangan"]]);
    expect(a.problems).toEqual([]);
    expect(a.rows[0]!.parent).toBe("4.01.01");
    const s = parseMasterTable("sub_activities", [["Kode", "Nama"], ["4.01.01.2.02.0002", "Penyediaan"]]);
    expect(s.rows[0]!.parent).toBe("4.01.01.2.02");
  });
});

import { STANDARD_PROCUREMENT_METHODS, importTemplateRows } from "../src/lib/master-import";
describe("metode pengadaan baku", () => {
  it("kode unik dan templat memuat seluruhnya", () => {
    const codes = STANDARD_PROCUREMENT_METHODS.map(([c]) => c.toLowerCase());
    expect(new Set(codes).size).toBe(codes.length);
    expect(importTemplateRows("procurement_methods")!.length).toBe(STANDARD_PROCUREMENT_METHODS.length + 1);
    expect(parseMasterTable("procurement_methods", importTemplateRows("procurement_methods")!).problems).toEqual([]);
  });
});
