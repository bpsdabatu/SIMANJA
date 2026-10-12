import { describe, expect, it } from "vitest";
import { allocation, parseAmount, quarterSums, recapTotals, spreadByQuarter, spreadEvenly, sumMonths } from "@/lib/cash-core";

describe("cash-core", () => {
  it("menjumlah tanpa selisih floating point", () => {
    expect(sumMonths([0.1, 0.2, ...Array(10).fill(0)])).toBe(0.3);
  });
  it("jumlah per triwulan", () => {
    expect(quarterSums([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toEqual([6, 15, 24, 33]);
  });
  it("alokasi: kosong, sebagian, penuh, lebih", () => {
    const z = Array(12).fill(0);
    expect(allocation(1000, z)).toMatchObject({ input: 0, sisa: 1000, state: "kosong" });
    expect(allocation(1000, [400, ...Array(11).fill(0)])).toMatchObject({ input: 400, sisa: 600, state: "sebagian", pct: 40 });
    expect(allocation(1000, [1000, ...Array(11).fill(0)])).toMatchObject({ sisa: 0, state: "penuh" });
    expect(allocation(1000, [1000.01, ...Array(11).fill(0)])).toMatchObject({ state: "lebih" });
  });
  it("pagu 0: persentase null dan nilai 0 dianggap kosong (bukan lebih)", () => {
    expect(allocation(0, Array(12).fill(0))).toMatchObject({ pct: null, sisa: 0, state: "kosong" });
    expect(allocation(0, [1, ...Array(11).fill(0)]).state).toBe("lebih");
  });
  it("bagi rata tepat sampai ke sen", () => {
    for (const total of [1000, 1000.01, 99.99, 0, 123456789.37]) {
      expect(sumMonths(spreadEvenly(total))).toBe(total);
      expect(sumMonths(spreadByQuarter(total))).toBe(total);
    }
    expect(spreadByQuarter(1200)).toEqual(Array(12).fill(100));
  });
  it("parseAmount", () => {
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("1250,5")).toBe(1250.5);
    expect(parseAmount("1250.50")).toBe(1250.5);
    expect(parseAmount("-1")).toBeNaN();
    expect(parseAmount("1.250.000")).toBeNaN();
    expect(parseAmount("abc")).toBeNaN();
  });
  it("rekap triwulan", () => {
    const r = recapTotals([
      { pagu: 1200, months: Array(12).fill(100), status: "final" },
      { pagu: 500, months: null, status: null },
      { pagu: 0, months: Array(12).fill(0), status: "draft" },
    ]);
    expect(r.tw).toEqual([300, 300, 300, 300]);
    expect(r).toMatchObject({ pagu: 1700, total: 1200, sisa: 500, count: 3, filled: 2 });
  });
});
