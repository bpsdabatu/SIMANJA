import { describe, expect, it } from "vitest";
import { parsePeriod, periodSpan, periodLabel, periodValue, rankEntities } from "../src/lib/ranking-core";
import { rankSuppliers } from "../src/lib/supplier-ranking-core";
import { parseLoose } from "../src/lib/cash-core";
import { parseBulkPayload } from "../src/lib/cash-bulk";
import { checkTransaction } from "../src/lib/tx-rules";
import { NAV_ITEMS, canSeeNav } from "../src/lib/nav";
import type { QItem } from "../src/lib/quarterly-core";

const item = (o: Partial<QItem>): QItem => ({
  itemId: "i", programCode: "1", programName: "P", activityCode: "1.1", activityName: "K", subCode: "1.1.1", subName: "S",
  accountCode: "5.1", accountName: "B", pptkId: "p1", pptk: "Ani", description: "", pagu: 1000,
  kasMonths: null, kasStatus: null, real: [], pending: 0, komitmen: 0, hasTransaction: false, ...o,
});

describe("peringkat: bulanan, triwulanan, rentang tanggal", () => {
  const a = item({ itemId: "a", pptkId: "p1", pptk: "Ani", pagu: 1000, real: [
    { date: "2026-02-10", amount: 100, txDate: "2026-02-10" },
    { date: "2026-03-05", amount: 200, txDate: "2026-02-20" }, // transaksi Februari, SP2D Maret
  ] });
  const b = item({ itemId: "b", pptkId: "p2", pptk: "Budi", pagu: 500, real: [{ date: "2026-03-02", amount: 400, txDate: "2026-03-01" }] });

  it("bulanan menurut tanggal SP2D; kumulatif s.d. akhir periode", () => {
    const rows = rankEntities([a, b], 2026, "pptk", { kind: "month", n: 3 });
    const ani = rows.find((r) => r.name === "Ani")!;
    expect(ani.realPeriod).toBe(200);
    expect(ani.realCum).toBe(300);
    expect(rows[0]!.name).toBe("Budi"); // 80% > 30%
  });
  it("triwulanan menjumlah tiga bulan", () => {
    const rows = rankEntities([a, b], 2026, "pptk", { kind: "quarter", n: 1 });
    expect(rows.find((r) => r.name === "Ani")!.realPeriod).toBe(300);
  });
  it("rentang: tanggal transaksi >= awal dan tanggal SP2D <= akhir", () => {
    const p = parsePeriod("r", { kind: "year", n: 0 }, { from: "2026-02-15", to: "2026-03-31" });
    expect(p.kind).toBe("range");
    const ani = rankEntities([a, b], 2026, "pptk", p).find((r) => r.name === "Ani")!;
    expect(ani.realPeriod).toBe(200); // hanya transaksi 20 Feb (SP2D 5 Mar); yang 10 Feb tidak
    expect(periodValue(p)).toBe("r");
    expect(periodLabel(p, 2026)).toContain("15/02/2026");
  });
  it("rentang terbalik ditukar; tidak valid -> cadangan; dibatasi tahun anggaran", () => {
    const fb = { kind: "year", n: 0 } as const;
    expect(parsePeriod("r", fb, { from: "2026-05-01", to: "2026-04-01" })).toMatchObject({ from: "2026-04-01", to: "2026-05-01" });
    expect(parsePeriod("r", fb, { from: "x", to: "2026-04-01" })).toEqual(fb);
    expect(periodSpan(2026, { kind: "range", n: 0, from: "2025-12-01", to: "2027-02-01" })).toMatchObject({ start: "2026-01-01", end: "2026-12-31" });
  });
  it("urut nominal periode", () => {
    const rows = rankEntities([a, b], 2026, "pptk", { kind: "month", n: 3 }, "rp");
    expect(rows[0]!.name).toBe("Budi"); // 400 > 200
    const q1 = rankEntities([a, b], 2026, "pptk", { kind: "quarter", n: 1 }, "rp");
    expect(q1.map((r) => r.name)).toEqual(["Budi", "Ani"]); // 400 vs 300
  });
});

describe("peringkat penyedia", () => {
  const rows = [
    { supplierId: "s1", supplierName: "CV A", amount: 100.1, txDate: "2026-01-05", sp2dDate: "2026-01-10" },
    { supplierId: "s1", supplierName: "CV A", amount: 200.2, txDate: "2026-02-05", sp2dDate: "2026-02-10" },
    { supplierId: "s2", supplierName: "PT B", amount: 900, txDate: "2026-02-01", sp2dDate: "2026-03-01" },
    { supplierId: null, supplierName: "", amount: 50, txDate: "2026-02-01", sp2dDate: "2026-02-02" },
  ];
  it("urut dari nominal tertinggi ke terendah, tanpa selisih desimal", () => {
    const r = rankSuppliers(rows);
    expect(r.map((x) => x.name)).toEqual(["PT B", "CV A", "Tanpa penyedia"]);
    expect(r[1]!.total).toBe(300.3);
    expect(r[1]!.count).toBe(2);
    expect(r.reduce((a, x) => a + x.share, 0)).toBeGreaterThan(99.9);
  });
  it("periode menurut tanggal SP2D; rentang menurut transaksi..SP2D", () => {
    expect(rankSuppliers(rows, { start: "2026-02-01", end: "2026-02-28" }).map((x) => x.name)).toEqual(["CV A", "Tanpa penyedia"]);
    expect(rankSuppliers(rows, { start: "2026-02-01", end: "2026-03-31", lifecycle: true }).map((x) => x.name)).toEqual(["PT B", "CV A", "Tanpa penyedia"]);
    expect(rankSuppliers(rows, { start: "2026-02-02", end: "2026-03-31", lifecycle: true }).map((x) => x.name)).toEqual(["CV A"]);
  });
  it("kosong aman", () => expect(rankSuppliers([])).toEqual([]));
});

describe("anggaran kas: tempel & simpan massal", () => {
  it("parseLoose menerima format Indonesia/Inggris/Rp", () => {
    expect(parseLoose("1.234.567,89")).toBe(1234567.89);
    expect(parseLoose("1,234,567.5")).toBe(1234567.5);
    expect(parseLoose("Rp 2.500.000")).toBe(2500000);
    expect(parseLoose("")).toBe(0);
    expect(parseLoose("abc")).toBeNaN();
    expect(parseLoose("-5")).toBeNaN();
  });
  const id = "11111111-1111-4111-8111-111111111111";
  const ok = (m: unknown) => parseBulkPayload(JSON.stringify([{ i: id, m, l: "x" }]));
  it("muatan valid", () => {
    const r = ok(Array(12).fill(10.5));
    expect(r.ok).toBe(true);
  });
  it("menolak muatan tidak valid", () => {
    expect(ok(Array(11).fill(1)).ok).toBe(false);
    expect(ok(Array(12).fill(-1)).ok).toBe(false);
    expect(ok(Array(12).fill(1.234)).ok).toBe(false);
    expect(ok(Array(12).fill("1")).ok).toBe(false);
    expect(parseBulkPayload("[]").ok).toBe(false);
    expect(parseBulkPayload("bukan json").ok).toBe(false);
    expect(parseBulkPayload(JSON.stringify([{ i: "x", m: Array(12).fill(0) }])).ok).toBe(false);
    expect(parseBulkPayload(JSON.stringify([{ i: id, m: Array(12).fill(0) }, { i: id, m: Array(12).fill(0) }])).ok).toBe(false);
  });
});

describe("tanggal transaksi terpisah dari tanggal SP2D", () => {
  const base = { date: "2026-05-10", today: "2026-06-01", year: 2026, amount: 100, available: 1000, duplicate: false, confirmDuplicate: false };
  it("tanpa txDate: perilaku lama", () => expect(checkTransaction(base)).toBeNull());
  it("tanggal transaksi sebelum/sama dengan SP2D lolos", () => {
    expect(checkTransaction({ ...base, txDate: "2026-05-01" })).toBeNull();
    expect(checkTransaction({ ...base, txDate: "2026-05-10" })).toBeNull();
  });
  it("menolak transaksi setelah SP2D, di luar tahun, atau format salah", () => {
    expect(checkTransaction({ ...base, txDate: "2026-05-11" })).toMatch(/setelah tanggal SP2D/);
    expect(checkTransaction({ ...base, txDate: "2025-12-31" })).toMatch(/tahun anggaran/);
    expect(checkTransaction({ ...base, txDate: "11/05/2026" })).toMatch(/tidak valid/);
  });
});

describe("menu LRA hanya admin", () => {
  const lra = NAV_ITEMS.find((i) => i.href === "/lra")!;
  const perms = new Set(["lra.view", "lra.export"]);
  it("admin melihat, PPK/PPTK/PPBJ tidak walau punya izin", () => {
    expect(canSeeNav(lra, { roles: ["admin"], permissions: perms })).toBe(true);
    for (const r of ["ppk", "pptk", "ppbj"]) expect(canSeeNav(lra, { roles: [r], permissions: perms })).toBe(false);
  });
  it("menu lain tetap mengikuti izin", () => {
    const rekap = NAV_ITEMS.find((i) => i.href === "/rekapitulasi")!;
    expect(canSeeNav(rekap, { roles: ["pptk"], permissions: new Set(["recap.view"]) })).toBe(true);
    expect(canSeeNav(rekap, { roles: ["pptk"], permissions: new Set() })).toBe(false);
  });
});
