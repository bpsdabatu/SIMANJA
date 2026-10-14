/**
 * Inti perhitungan Laporan Realisasi Anggaran (LRA) — murni (tanpa akses database) agar mudah diuji.
 *
 * Format mengikuti LRA SKPD: per butir belanja
 *   Pagu (tahapan aktif) | Pagu rincian Murni / Pergeseran / Perubahan | Realisasi Bln Lalu / Bln Ini / Jumlah | Sisa
 *   Jumlah = Bln Lalu + Bln Ini   ·   Sisa = Pagu − Jumlah   ·   Capaian = Jumlah ÷ Pagu × 100 (dari total, bukan rata-rata baris)
 *
 * Akurasi: seluruh penjumlahan dilakukan dalam sen (bilangan bulat) lalu dikembalikan ke rupiah, sehingga tidak ada
 * galat floating-point; butir dibedakan oleh rekening + SUMBER DANA (kode .PAD / .DBH_CHT) dan tidak digabung.
 */
export type LraStage = "murni" | "pergeseran" | "perubahan";

export interface LraItem {
  itemId: string;
  programCode: string; programName: string;
  activityCode: string; activityName: string;
  subCode: string; subName: string;
  accountCode: string; accountName: string;
  fundingCode: string; fundingName: string;
  pptk: string; description: string;
  /** Pagu butir pada masing-masing tahapan (0 bila butir tidak ada di tahapan itu). */
  pagu: Record<LraStage, number>;
  /** Realisasi sah (SP2D bertanggal) sampai akhir bulan lalu dan dari awal bulan berjalan sampai tanggal batas. */
  lalu: number; ini: number;
}

export interface LraAmounts {
  pagu: number; murni: number; pergeseran: number; perubahan: number;
  lalu: number; ini: number; jumlah: number; sisa: number; pct: number | null;
}

export type LraFlag = "SISA_NEGATIF" | "REALISASI_TANPA_PAGU";

export type LraLine =
  | { kind: "group"; level: 0 | 1 | 2; code: string; name: string; totals: LraAmounts }
  | { kind: "item"; level: 3; code: string; name: string; fundingName: string; pptk: string; description: string; totals: LraAmounts; flags: LraFlag[] };

export interface LraChecks {
  negativeSisa: number;
  realisasiTanpaPagu: number;
}

const toCents = (v: number | string | null | undefined): number => Math.round((Number(v) || 0) * 100);
const fromCents = (c: number): number => c / 100;
const pctOf = (jumlahC: number, paguC: number): number | null => (paguC === 0 ? null : Math.round((jumlahC / paguC) * 10000) / 100);

function amountsOf(items: LraItem[], stage: LraStage): LraAmounts {
  let pagu = 0, murni = 0, pergeseran = 0, perubahan = 0, lalu = 0, ini = 0;
  for (const it of items) {
    pagu += toCents(it.pagu[stage]);
    murni += toCents(it.pagu.murni); pergeseran += toCents(it.pagu.pergeseran); perubahan += toCents(it.pagu.perubahan);
    lalu += toCents(it.lalu); ini += toCents(it.ini);
  }
  const jumlah = lalu + ini;
  return {
    pagu: fromCents(pagu), murni: fromCents(murni), pergeseran: fromCents(pergeseran), perubahan: fromCents(perubahan),
    lalu: fromCents(lalu), ini: fromCents(ini), jumlah: fromCents(jumlah), sisa: fromCents(pagu - jumlah), pct: pctOf(jumlah, pagu),
  };
}

/** Kode rekening lengkap seperti pada LRA: Sub Kegiatan . Rekening . Sumber Dana. */
export const fullCode = (i: Pick<LraItem, "subCode" | "accountCode" | "fundingCode">): string =>
  [i.subCode, i.accountCode, i.fundingCode].filter((x) => x && x !== "-").join(".");

const cmp = (a: string, b: string) => a.localeCompare(b, "id", { numeric: true });

function groupBy(list: LraItem[], key: (i: LraItem) => string): Array<[string, LraItem[]]> {
  const m = new Map<string, LraItem[]>();
  for (const i of list) { const k = key(i); const g = m.get(k); if (g) g.push(i); else m.set(k, [i]); }
  return [...m.entries()];
}

/** Susunan berjenjang Program > Kegiatan > Sub Kegiatan > butir belanja (rekening + sumber dana), dengan total tiap tingkat. */
export function buildLraReport(items: LraItem[], stage: LraStage): { lines: LraLine[]; total: LraAmounts; checks: LraChecks } {
  const sorted = [...items].sort((a, b) =>
    cmp(`${a.programCode}|${a.activityCode}|${a.subCode}|${a.accountCode}|${a.fundingCode}|${a.description}`, `${b.programCode}|${b.activityCode}|${b.subCode}|${b.accountCode}|${b.fundingCode}|${b.description}`));
  const lines: LraLine[] = [];
  const checks: LraChecks = { negativeSisa: 0, realisasiTanpaPagu: 0 };

  for (const [, pr] of groupBy(sorted, (i) => i.programCode)) {
    lines.push({ kind: "group", level: 0, code: pr[0]!.programCode, name: pr[0]!.programName, totals: amountsOf(pr, stage) });
    for (const [, ac] of groupBy(pr, (i) => `${i.programCode}|${i.activityCode}`)) {
      lines.push({ kind: "group", level: 1, code: ac[0]!.activityCode, name: ac[0]!.activityName, totals: amountsOf(ac, stage) });
      for (const [, sb] of groupBy(ac, (i) => `${i.programCode}|${i.activityCode}|${i.subCode}`)) {
        lines.push({ kind: "group", level: 2, code: sb[0]!.subCode, name: sb[0]!.subName, totals: amountsOf(sb, stage) });
        for (const it of sb) {
          const totals = amountsOf([it], stage);
          const flags: LraFlag[] = [];
          if (toCents(totals.sisa) < 0) { flags.push("SISA_NEGATIF"); checks.negativeSisa++; }
          if (toCents(totals.pagu) === 0 && toCents(totals.jumlah) > 0) { flags.push("REALISASI_TANPA_PAGU"); checks.realisasiTanpaPagu++; }
          lines.push({ kind: "item", level: 3, code: fullCode(it), name: it.accountName, fundingName: it.fundingName, pptk: it.pptk, description: it.description, totals, flags });
        }
      }
    }
  }
  return { lines, total: amountsOf(sorted, stage), checks };
}

// ---------- periode realisasi ----------

/** Tanggal hari ini menurut WIB (YYYY-MM-DD). */
export function todayWIB(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Batas periode: Bln Lalu = sebelum tanggal 1 bulan berjalan; Bln Ini = tanggal 1 s.d. batas (inklusif). Perbandingan string ISO (bebas zona waktu). */
export function periodBounds(cutoff: string): { monthStart: string; laluTo: string | null; iniFrom: string; iniTo: string } {
  const [y, m] = cutoff.split("-").map(Number) as [number, number];
  const monthStart = `${cutoff.slice(0, 8)}01`;
  const laluTo = m === 1 ? null : new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
  return { monthStart, laluTo, iniFrom: monthStart, iniTo: cutoff };
}

export function periodOf(sp2dDate: string, cutoff: string): "lalu" | "ini" | "setelah" {
  const d = sp2dDate.slice(0, 10);
  if (d > cutoff) return "setelah";
  return d < `${cutoff.slice(0, 8)}01` ? "lalu" : "ini";
}

export interface RealizationRow { budget_item_id: string; amount: string | number; sp2d_date: string }
export interface Tally { count: number; amount: number }

/** Mengelompokkan realisasi sah per butir dan periode. Tidak ada nilai yang hilang diam-diam: yang di luar batas / tanpa butir dicatat terpisah. */
export function foldRealization(rows: RealizationRow[], cutoff: string, knownItemIds: Set<string>) {
  const byItem = new Map<string, { lalu: number; ini: number }>();
  let afterC = 0, afterN = 0, unmC = 0, unmN = 0;
  for (const r of rows) {
    const c = toCents(r.amount);
    if (!knownItemIds.has(r.budget_item_id)) { unmN++; unmC += c; continue; }
    const p = periodOf(r.sp2d_date, cutoff);
    if (p === "setelah") { afterN++; afterC += c; continue; }
    const cur = byItem.get(r.budget_item_id) ?? { lalu: 0, ini: 0 };
    cur[p] += c;
    byItem.set(r.budget_item_id, cur);
  }
  const out = new Map<string, { lalu: number; ini: number }>();
  for (const [k, v] of byItem) out.set(k, { lalu: fromCents(v.lalu), ini: fromCents(v.ini) });
  return { byItem: out, afterCutoff: { count: afterN, amount: fromCents(afterC) } as Tally, unmapped: { count: unmN, amount: fromCents(unmC) } as Tally };
}
