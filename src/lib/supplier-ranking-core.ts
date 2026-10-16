/**
 * Peringkat penyedia menurut nominal transaksi (murni; tanpa akses database sehingga mudah diuji).
 * Nominal = pembayaran realisasi sah (SP2D bertanggal, tidak dibatalkan) yang dikelompokkan per penyedia.
 */
export interface SupplierTx {
  supplierId: string | null;
  supplierName: string;
  amount: number;
  /** Tanggal transaksi dan tanggal SP2D (YYYY-MM-DD). */
  txDate: string;
  sp2dDate: string;
}

export interface SupplierRank {
  key: string; name: string; total: number; count: number; share: number; largest: number; last: string;
}

export const NO_SUPPLIER = "Tanpa penyedia";

/**
 * Menjumlah per penyedia lalu mengurutkan dari nominal TERTINGGI ke TERENDAH.
 * Periode (opsional) {start,end}:
 *  - lifecycle=false (bulan/triwulan/tahun): dihitung menurut tanggal SP2D (start <= SP2D <= end);
 *  - lifecycle=true  (rentang bebas): tanggal transaksi >= start DAN tanggal SP2D <= end.
 * Perhitungan dalam sen agar tidak ada selisih floating point.
 */
export function rankSuppliers(rows: SupplierTx[], range?: { start: string; end: string; lifecycle?: boolean }): SupplierRank[] {
  const map = new Map<string, { name: string; cents: number; count: number; largest: number; last: string }>();
  let grand = 0;
  for (const r of rows) {
    if (range) {
      const ok = range.lifecycle ? r.txDate >= range.start && r.sp2dDate <= range.end : r.sp2dDate >= range.start && r.sp2dDate <= range.end;
      if (!ok) continue;
    }
    const c = Math.round(r.amount * 100);
    if (!Number.isFinite(c) || c <= 0) continue;
    const key = r.supplierId ?? "none";
    const g = map.get(key) ?? map.set(key, { name: r.supplierId ? r.supplierName || "(tanpa nama)" : NO_SUPPLIER, cents: 0, count: 0, largest: 0, last: "" }).get(key)!;
    g.cents += c; g.count += 1; g.largest = Math.max(g.largest, c); if (r.sp2dDate > g.last) g.last = r.sp2dDate;
    grand += c;
  }
  return [...map.entries()]
    .map(([key, g]) => ({ key, name: g.name, total: g.cents / 100, count: g.count, share: grand > 0 ? Math.round((g.cents / grand) * 10000) / 100 : 0, largest: g.largest / 100, last: g.last }))
    .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name, "id"));
}
