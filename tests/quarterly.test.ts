import { describe, expect, it } from "vitest";
import { buildQuarterReport, classify, defaultQuarter, metricsOf, quarterRange, type QItem } from "../src/lib/quarterly-core";

const base = (o: Partial<QItem>): QItem => ({
  itemId: "i", programCode: "1", programName: "Program 1", activityCode: "1.1", activityName: "Kegiatan 1", subCode: "1.1.1", subName: "Sub 1",
  accountCode: "5.1", accountName: "Belanja", pptkId: "p1", pptk: "Ani", description: "", pagu: 1_000_000,
  kasMonths: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100].map((x) => x * 1000), kasStatus: "final",
  real: [], pending: 0, komitmen: 0, hasTransaction: false, ...o,
});

describe("laporan triwulanan", () => {
  it("batas triwulan", () => {
    expect(quarterRange(2026, 1)).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(quarterRange(2026, 2).end).toBe("2026-06-30");
    expect(quarterRange(2024, 4).end).toBe("2024-12-31");
  });
  it("triwulan bawaan menurut WIB", () => {
    expect(defaultQuarter(2026, new Date("2026-05-10T00:00:00Z"))).toBe(2);
    expect(defaultQuarter(2025, new Date("2026-05-10T00:00:00Z"))).toBe(4);
    expect(defaultQuarter(2027, new Date("2026-05-10T00:00:00Z"))).toBe(1);
    expect(defaultQuarter(2026, new Date("2026-03-31T18:00:00Z"))).toBe(2); // 01 Apr 01:00 WIB
  });
  it("realisasi dikelompokkan menurut tanggal SP2D (triwulan vs kumulatif)", () => {
    const it1 = base({ real: [{ date: "2026-02-10", amount: 200_000 }, { date: "2026-05-02", amount: 150_000 }, { date: "2026-08-01", amount: 999 }] });
    const m = metricsOf([it1], 2, 2026);
    expect(m.realTw).toBe(150_000);
    expect(m.realCum).toBe(350_000);
    expect(m.kasCum).toBe(600_000);
    expect(m.kasTw).toBe(300_000);
    expect(m.pctKas).toBeCloseTo(58.33, 2);
  });
  it("klasifikasi status", () => {
    expect(classify(90, 100)).toBe("Sesuai target");
    expect(classify(70, 100)).toBe("Perlu perhatian");
    expect(classify(69.99, 100)).toBe("Di bawah target");
    expect(classify(10, 0)).toBe("Belum ada target kas");
  });
  it("tanpa kas -> pct kas null dan analisis tidak menilai", () => {
    const rep = buildQuarterReport({ org: "X", year: 2026, stageLabel: "Murni", quarter: 1, now: new Date("2026-04-10T00:00:00Z"), pptkFilter: null,
      items: [base({ kasMonths: null, kasStatus: null })] });
    expect(rep.totals.pctKas).toBeNull();
    expect(rep.analysis.findings.join(" ")).toContain("tidak dapat dinilai");
    expect(rep.counts.idle).toBe(1);
  });
  it("triwulan berjalan ditandai sementara; filter PPTK tercermin", () => {
    const rep = buildQuarterReport({ org: "X", year: 2026, stageLabel: "Murni", quarter: 2, now: new Date("2026-05-10T00:00:00Z"), pptkFilter: "Ani", items: [base({})] });
    expect(rep.endsInFuture).toBe(true);
    expect(rep.analysis.notes.join(" ")).toContain("bersifat sementara");
    expect(rep.analysis.findings.join(" ")).not.toContain("Menurut PPTK");
  });
  it("tidak ada butir -> laporan kosong aman", () => {
    const rep = buildQuarterReport({ org: "X", year: 2026, stageLabel: "Murni", quarter: 1, now: new Date(), pptkFilter: null, items: [] });
    expect(rep.totals.pagu).toBe(0);
    expect(rep.analysis.findings).toEqual([]);
  });
});

import { defaultPeriod, parsePeriod, periodSpan, rankEntities } from "../src/lib/ranking-core";
import { filterBalance, filterOptions, totalsOf, type BalanceRow } from "../src/lib/realization-search-core";

describe("peringkat capaian", () => {
  const mk = (id: string, pptk: string, pagu: number, real: number, date = "2026-02-10") =>
    base({ itemId: id, pptkId: pptk, pptk: pptk.toUpperCase(), pagu, subCode: id, real: real ? [{ date, amount: real }] : [] });
  it("urut menurun menurut % realisasi kumulatif terhadap pagu; pagu 0 dikeluarkan", () => {
    const rows = rankEntities([mk("a", "p1", 1000, 900), mk("b", "p2", 1000, 100), mk("c", "p3", 0, 0)], 2026, "pptk", { kind: "year", n: 0 });
    expect(rows.map((r) => r.key)).toEqual(["p1", "p2"]);
    expect(rows[0]!.pctPagu).toBe(90);
  });
  it("bulanan: realisasi periode vs kumulatif", () => {
    const rows = rankEntities([mk("a", "p1", 1000, 300, "2026-02-10"), { ...mk("a2", "p1", 0, 0), real: [{ date: "2026-03-05", amount: 200 }], pagu: 0 }], 2026, "pptk", { kind: "month", n: 3 });
    expect(rows[0]).toMatchObject({ realPeriod: 200, realCum: 500, pctPagu: 50, pctPeriod: 20 });
  });
  it("rentang & parser periode", () => {
    expect(periodSpan(2026, { kind: "month", n: 2 }).end).toBe("2026-02-28");
    expect(periodSpan(2026, { kind: "quarter", n: 3 })).toMatchObject({ from: 7, to: 9 });
    expect(parsePeriod("m13", { kind: "year", n: 0 })).toEqual({ kind: "year", n: 0 });
    expect(parsePeriod("q2", { kind: "year", n: 0 })).toEqual({ kind: "quarter", n: 2 });
    expect(defaultPeriod(2026, new Date("2026-05-10T00:00:00Z"))).toEqual({ kind: "month", n: 5 });
    expect(defaultPeriod(2025, new Date("2026-05-10T00:00:00Z")).kind).toBe("year");
  });
});

describe("pencarian realisasi & sisa", () => {
  const row = (o: Partial<BalanceRow>): BalanceRow => ({ itemId: "i", activityCode: "K1", activityName: "Keg", subCode: "S1", subName: "Sub", accountCode: "R1", accountName: "Belanja ATK", fundingCode: "D1", funding: "PAD", pptkId: "p1", pptk: "Ani", description: "", pagu: 100, realisasi: 40, pending: 10, komitmen: 0, sisa: 60, pct: 40, ...o });
  const all = [row({}), row({ itemId: "j", subCode: "S2", accountCode: "R2", fundingCode: "D2", pptkId: null, pptk: "", pagu: 50, realisasi: 0, sisa: 50, pct: 0 })];
  it("filter berlapis", () => {
    expect(filterBalance(all, { sub: "S2" })).toHaveLength(1);
    expect(filterBalance(all, { pptk: "none" })[0]!.itemId).toBe("j");
    expect(filterBalance(all, { dana: "D1", bel: "R1", keg: "K1", pptk: "p1" })).toHaveLength(1);
    expect(filterBalance(all, { cari: "atk" })).toHaveLength(2);
  });
  it("total & opsi", () => {
    expect(totalsOf(all)).toMatchObject({ pagu: 150, realisasi: 40, sisa: 110, pct: 26.67 });
    expect(filterOptions(all).sub.map((o) => o.value)).toEqual(["S1", "S2"]);
  });
});
