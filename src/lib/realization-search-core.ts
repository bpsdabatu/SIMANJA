/** Pencarian realisasi & sisa anggaran per butir (murni). */
export interface BalanceRow {
  itemId: string;
  activityCode: string; activityName: string; subCode: string; subName: string;
  accountCode: string; accountName: string; fundingCode: string; funding: string;
  pptkId: string | null; pptk: string; description: string;
  pagu: number; realisasi: number; pending: number; komitmen: number; sisa: number; pct: number | null;
}
export interface SearchParams { keg?: string; sub?: string; bel?: string; dana?: string; pptk?: string; cari?: string }

export function filterBalance(rows: BalanceRow[], p: SearchParams): BalanceRow[] {
  const q = (p.cari ?? "").trim().toLowerCase().slice(0, 60);
  return rows.filter((r) =>
    (!p.keg || r.activityCode === p.keg) && (!p.sub || r.subCode === p.sub) && (!p.bel || r.accountCode === p.bel) &&
    (!p.dana || r.fundingCode === p.dana) && (!p.pptk || (p.pptk === "none" ? !r.pptkId : r.pptkId === p.pptk)) &&
    (!q || [r.subCode, r.subName, r.activityName, r.accountCode, r.accountName, r.funding, r.pptk, r.description].some((x) => x.toLowerCase().includes(q))));
}

export function totalsOf(rows: BalanceRow[]) {
  const t = rows.reduce((a, r) => ({ pagu: a.pagu + r.pagu, realisasi: a.realisasi + r.realisasi, pending: a.pending + r.pending, komitmen: a.komitmen + r.komitmen }), { pagu: 0, realisasi: 0, pending: 0, komitmen: 0 });
  return { ...t, sisa: t.pagu - t.realisasi, pct: t.pagu === 0 ? null : Math.round((t.realisasi / t.pagu) * 10000) / 100 };
}

/** Pilihan filter yang tersedia (unik, terurut) dari data yang dimuat. */
export function filterOptions(rows: BalanceRow[]) {
  const uniq = (pick: (r: BalanceRow) => [string, string]) =>
    [...new Map(rows.map(pick)).entries()].filter(([k]) => k).map(([value, label]) => ({ value, label })).sort((a, b) => a.value.localeCompare(b.value, "id", { numeric: true }));
  return {
    keg: uniq((r) => [r.activityCode, `${r.activityCode} ${r.activityName}`]),
    sub: uniq((r) => [r.subCode, `${r.subCode} ${r.subName}`]),
    bel: uniq((r) => [r.accountCode, `${r.accountCode} ${r.accountName}`]),
    dana: uniq((r) => [r.fundingCode, `${r.fundingCode} ${r.funding}`]),
    pptk: [...new Map(rows.filter((r) => r.pptkId).map((r) => [r.pptkId!, r.pptk])).entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "id")),
  };
}
