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
