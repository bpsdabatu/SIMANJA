import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLraReport, foldRealization, fullCode, periodBounds, periodOf, todayWIB, type LraItem } from "../src/lib/lra-core";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/lra-sample-2026.json", import.meta.url), "utf8")) as {
  rows: Array<{ subCode: string; account: string; funding: string; n: number[] }>;
};

const mk = (o: Partial<LraItem> & { itemId: string }): LraItem => ({
  programCode: "P", programName: "Program", activityCode: "P.1", activityName: "Kegiatan", subCode: "S.1", subName: "Sub",
  accountCode: "5.1", accountName: "Belanja", fundingCode: "PAD", fundingName: "PAD", pptk: "", description: "",
  pagu: { murni: 0, pergeseran: 0, perubahan: 0 }, lalu: 0, ini: 0, ...o,
});

/** Contoh LRA TA 2026 (Pergeseran, s.d. 14 Okt 2026) direkonstruksi sebagai pembayaran ber-SP2D, lalu dihitung ulang. */
function fromSample() {
  const items: LraItem[] = []; const pays: Array<{ budget_item_id: string; amount: number; sp2d_date: string }> = [];
  for (const r of fixture.rows) {
    const id = `${r.subCode}|${r.account}|${r.funding}`;
    const [, murni, pergeseran, perubahan, lalu, ini] = r.n as [number, number, number, number, number, number];
    items.push(mk({ itemId: id, programCode: r.subCode.split(".").slice(0, 3).join("."), activityCode: r.subCode.split(".").slice(0, 5).join("."), subCode: r.subCode, accountCode: r.account, fundingCode: r.funding, pagu: { murni, pergeseran, perubahan } }));
    if (lalu) pays.push({ budget_item_id: id, amount: lalu, sp2d_date: "2026-09-20" });
    if (ini) pays.push({ budget_item_id: id, amount: ini, sp2d_date: "2026-10-10" });
  }
  return { items, pays };
}

describe("LRA — rekonsiliasi dengan contoh dokumen", () => {
  it("butir contoh unik dan pagu tahapan aktif = kolom Pergeseran", () => {
    expect(new Set(fixture.rows.map((r) => `${r.subCode}|${r.account}|${r.funding}`)).size).toBe(53);
    for (const r of fixture.rows) expect(r.n[0]).toBe(r.n[2]);
  });

  it("total, capaian, dan setiap baris sama dengan dokumen", () => {
    const { items, pays } = fromSample();
    const f = foldRealization(pays, "2026-10-14", new Set(items.map((i) => i.itemId)));
    for (const i of items) { const v = f.byItem.get(i.itemId); i.lalu = v?.lalu ?? 0; i.ini = v?.ini ?? 0; }
    const { lines, total, checks } = buildLraReport(items, "pergeseran");
    expect(total).toMatchObject({ pagu: 681_989_691, murni: 681_989_691, pergeseran: 681_989_691, perubahan: 715_150_891, lalu: 266_799_770, ini: 37_377_799, jumlah: 304_177_569, sisa: 377_812_122, pct: 44.6 });
    expect(checks).toEqual({ negativeSisa: 0, realisasiTanpaPagu: 0 });
    expect(f.afterCutoff.count).toBe(0);
    expect(f.unmapped.count).toBe(0);

    const byCode = new Map(lines.filter((l) => l.kind === "item").map((l) => [l.code, l.totals]));
    for (const r of fixture.rows) {
      const t = byCode.get(`${r.subCode}.${r.account}.${r.funding}`)!;
      expect([t.pagu, t.lalu, t.ini, t.jumlah, t.sisa]).toEqual([r.n[0], r.n[4], r.n[5], r.n[6], r.n[7]]);
    }
  });

  it("total tiap tingkat = jumlah anaknya", () => {
    const { items } = fromSample();
    const { lines, total } = buildLraReport(items, "pergeseran");
    const sum = (level: number) => lines.filter((l) => l.level === level).reduce((a, l) => a + Math.round(l.totals.pagu * 100), 0);
    for (const level of [0, 1, 2, 3]) expect(sum(level)).toBe(Math.round(total.pagu * 100));
    expect(lines.filter((l) => l.level === 2)).toHaveLength(new Set(fixture.rows.map((r) => r.subCode)).size);
  });

  it("tahapan lain memakai kolom pagunya sendiri dan sisa dihitung terhadap pagu itu", () => {
    const { items } = fromSample();
    const { total } = buildLraReport(items.map((i) => ({ ...i, lalu: 0, ini: 0 })), "perubahan");
    expect(total.pagu).toBe(715_150_891);
    expect(total.sisa).toBe(715_150_891);
  });
});

describe("LRA — periode & akurasi", () => {
  it("batas Bln Lalu / Bln Ini (inklusif, bebas zona waktu)", () => {
    expect(periodOf("2026-09-30", "2026-10-14")).toBe("lalu");
    expect(periodOf("2026-10-01", "2026-10-14")).toBe("ini");
    expect(periodOf("2026-10-14", "2026-10-14")).toBe("ini");
    expect(periodOf("2026-10-15", "2026-10-14")).toBe("setelah");
    expect(periodOf("2026-10-14T23:30:00+00:00", "2026-10-14")).toBe("ini");
    expect(periodBounds("2026-10-14")).toEqual({ monthStart: "2026-10-01", laluTo: "2026-09-30", iniFrom: "2026-10-01", iniTo: "2026-10-14" });
    expect(periodBounds("2026-03-05").laluTo).toBe("2026-02-28");
    expect(periodBounds("2026-01-10").laluTo).toBeNull();
  });

  it("tanggal hari ini mengikuti WIB", () => {
    expect(todayWIB(new Date("2026-10-14T20:00:00Z"))).toBe("2026-10-15");
    expect(todayWIB(new Date("2026-10-14T16:59:00Z"))).toBe("2026-10-14");
  });

  it("penjumlahan dalam sen tidak menimbulkan galat floating-point", () => {
    const items = [mk({ itemId: "a", pagu: { murni: 0, pergeseran: 0.3, perubahan: 0 }, lalu: 0.1, ini: 0.2 }), mk({ itemId: "b", accountCode: "5.2", pagu: { murni: 0, pergeseran: 0.7, perubahan: 0 }, lalu: 0.1 })];
    const { total } = buildLraReport(items, "pergeseran");
    expect(total.jumlah).toBe(0.4);
    expect(total.sisa).toBe(0.6);
    expect(total.pct).toBe(40);
  });

  it("butir dengan rekening sama tetapi sumber dana berbeda tidak digabung", () => {
    const a = mk({ itemId: "a", fundingCode: "PAD", pagu: { murni: 0, pergeseran: 100, perubahan: 0 }, ini: 10 });
    const b = mk({ itemId: "b", fundingCode: "DBH_CHT", pagu: { murni: 0, pergeseran: 200, perubahan: 0 }, ini: 20 });
    const items = buildLraReport([a, b], "pergeseran").lines.filter((l) => l.kind === "item");
    expect(items.map((l) => l.code)).toEqual(["S.1.5.1.DBH_CHT", "S.1.5.1.PAD"]);
    expect(items.map((l) => l.totals.jumlah)).toEqual([20, 10]);
    expect(fullCode(a)).toBe("S.1.5.1.PAD");
  });

  it("pagu nol: persentase null (bukan error), realisasi tanpa pagu & sisa negatif ditandai", () => {
    const x = mk({ itemId: "x", pagu: { murni: 0, pergeseran: 0, perubahan: 5 }, ini: 7 });
    const y = mk({ itemId: "y", accountCode: "5.2", pagu: { murni: 0, pergeseran: 10, perubahan: 0 }, lalu: 12 });
    const { lines, checks } = buildLraReport([x, y], "pergeseran");
    const it = lines.filter((l) => l.kind === "item");
    expect(it[0]!.totals.pct).toBeNull();
    expect(it.map((l) => (l.kind === "item" ? l.flags : []))).toEqual([["SISA_NEGATIF", "REALISASI_TANPA_PAGU"], ["SISA_NEGATIF"]]);
    expect(checks).toEqual({ negativeSisa: 2, realisasiTanpaPagu: 1 });
  });

  it("realisasi di luar batas / tanpa butir dilaporkan, tidak hilang diam-diam", () => {
    const f = foldRealization([
      { budget_item_id: "a", amount: "100.50", sp2d_date: "2026-10-02" },
      { budget_item_id: "a", amount: 50, sp2d_date: "2026-10-20" },
      { budget_item_id: "zzz", amount: 25, sp2d_date: "2026-10-02" },
    ], "2026-10-14", new Set(["a"]));
    expect(f.byItem.get("a")).toEqual({ lalu: 0, ini: 100.5 });
    expect(f.afterCutoff).toEqual({ count: 1, amount: 50 });
    expect(f.unmapped).toEqual({ count: 1, amount: 25 });
  });
});
