import { describe, expect, it } from "vitest";
import { csvCell, detectDelimiter, parseCsv, parseMoney, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("mendeteksi titik koma, koma, dan tab", () => {
    expect(detectDelimiter("a;b;c")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
  });
  it("menangani kutip, pemisah di dalam sel, baris baru di dalam sel, BOM, dan CRLF", () => {
    const rows = parseCsv('\uFEFFkode;uraian\r\n1;"a;b"\r\n2;"baris\nbaru"\r\n3;"kata ""kutip"""\r\n');
    expect(rows).toEqual([["kode", "uraian"], ["1", "a;b"], ["2", "baris\nbaru"], ["3", 'kata "kutip"']]);
  });
  it("mengabaikan baris kosong", () => {
    expect(parseCsv("a,b\n\n,\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("csv keluaran", () => {
  it("menetralkan formula injection tetapi membiarkan angka negatif", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+62")).toBe("'+62");
    expect(csvCell(-5000)).toBe("-5000");
    expect(csvCell("-")).toBe("'-");
  });
  it("memberi kutip bila perlu & BOM di awal", () => {
    const out = toCsv([["a", 'b"c', "d;e"]]);
    expect(out.startsWith("\uFEFF")).toBe(true);
    expect(out).toContain('a;"b""c";"d;e"');
  });
});

describe("parseMoney", () => {
  it.each([
    ["1500000", 1500000], ["1.500.000", 1500000], ["1.500.000,50", 1500000.5], ["1,500,000.50", 1500000.5],
    ["Rp 2.000.000", 2000000], ["1500,5", 1500.5], ["12.5", 12.5], ["0", 0],
  ])("%s -> %d", (raw, n) => expect(parseMoney(raw)).toBe(n));
  it.each(["", "abc", "1.2.3x", "--1"])("menolak %j", (raw) => expect(parseMoney(raw)).toBeNaN());
});
