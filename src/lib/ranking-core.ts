import { quarterRange, type QItem } from "@/lib/quarterly-core";

/** Peringkat capaian realisasi (murni, dapat diuji). Kunci peringkat: realisasi kumulatif s.d. akhir periode ÷ pagu. */
export type Dim = "pptk" | "kegiatan" | "sub";
export interface Period { kind: "month" | "quarter" | "year"; n: number }

export const DIM_LABEL: Record<Dim, string> = { pptk: "PPTK", kegiatan: "Kegiatan", sub: "Sub Kegiatan" };
export const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function parsePeriod(v: string | null | undefined, fallback: Period): Period {
  const m = /^(m|q|y)(\d{1,2})?$/.exec(v ?? "");
  if (!m) return fallback;
  if (m[1] === "y") return { kind: "year", n: 0 };
  const n = Number(m[2]);
  if (m[1] === "m" && n >= 1 && n <= 12) return { kind: "month", n };
  if (m[1] === "q" && n >= 1 && n <= 4) return { kind: "quarter", n };
  return fallback;
}
export const periodValue = (p: Period) => (p.kind === "year" ? "y" : `${p.kind === "month" ? "m" : "q"}${p.n}`);
export const periodLabel = (p: Period, year: number) => p.kind === "year" ? `Tahun ${year}` : p.kind === "month" ? `${MONTH_NAMES[p.n - 1]} ${year}` : `Triwulan ${["I", "II", "III", "IV"][p.n - 1]} ${year}`;

/** Bulan awal/akhir (1–12) dan rentang tanggal periode. */
export function periodSpan(year: number, p: Period): { from: number; to: number; start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (p.kind === "year") return { from: 1, to: 12, start: `${year}-01-01`, end: `${year}-12-31` };
  if (p.kind === "quarter") { const r = quarterRange(year, p.n as 1 | 2 | 3 | 4); return { from: (p.n - 1) * 3 + 1, to: p.n * 3, ...r }; }
  const last = new Date(Date.UTC(year, p.n, 0)).getUTCDate();
  return { from: p.n, to: p.n, start: `${year}-${pad(p.n)}-01`, end: `${year}-${pad(p.n)}-${pad(last)}` };
}

/** Kebiasaan: bulan/triwulan berjalan (WIB) bila tahun anggaran = tahun ini; selain itu seluruh tahun. */
export function defaultPeriod(year: number, now: Date): Period {
  const t = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit" }).format(now);
  return Number(t.slice(0, 4)) === year ? { kind: "month", n: Number(t.slice(5, 7)) } : { kind: "year", n: 0 };
}

export interface RankRow {
  key: string; name: string; code: string; items: number;
  pagu: number; kasPeriod: number; realPeriod: number; realCum: number;
  pctPagu: number; pctPeriod: number; pctKas: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function rankEntities(items: QItem[], year: number, dim: Dim, period: Period): RankRow[] {
  const { from, to, start, end } = periodSpan(year, period);
  const groups = new Map<string, { name: string; code: string; list: QItem[] }>();
  for (const it of items) {
    const [key, name, code] = dim === "pptk" ? [it.pptkId ?? "none", it.pptk || "Belum ditugaskan", ""]
      : dim === "kegiatan" ? [it.activityCode, it.activityName || "(tanpa kegiatan)", it.activityCode]
      : [it.subCode, it.subName || "(tanpa sub kegiatan)", it.subCode];
    (groups.get(key) ?? groups.set(key, { name: name!, code: code!, list: [] }).get(key)!).list.push(it);
  }
  const rows: RankRow[] = [];
  for (const [key, g] of groups) {
    let pagu = 0, kasPeriod = 0, kasCum = 0, realPeriod = 0, realCum = 0;
    for (const it of g.list) {
      pagu += it.pagu;
      if (it.kasMonths) for (let m = 1; m <= 12; m++) { const v = it.kasMonths[m - 1] ?? 0; if (m <= to) kasCum += v; if (m >= from && m <= to) kasPeriod += v; }
      for (const r of it.real) { if (r.date <= end) realCum += r.amount; if (r.date >= start && r.date <= end) realPeriod += r.amount; }
    }
    if (pagu <= 0) continue;
    rows.push({ key, name: g.name, code: g.code, items: g.list.length, pagu, kasPeriod, realPeriod, realCum,
      pctPagu: r2((realCum / pagu) * 100), pctPeriod: r2((realPeriod / pagu) * 100), pctKas: kasCum > 0 ? r2((realCum / kasCum) * 100) : null });
  }
  return rows.sort((a, b) => b.pctPagu - a.pctPagu || b.realCum - a.realCum || a.name.localeCompare(b.name, "id"));
}
