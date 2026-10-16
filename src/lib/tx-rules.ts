/** Aturan validasi transaksi belanja (murni; dipakai server sebagai penjaga akhir dan klien sebagai umpan balik langsung). */
export interface TxCheckInput {
  /** Tanggal SP2D. */
  date: string; today: string; year: number;
  /** Tanggal transaksi (opsional; bila diberikan harus pada tahun anggaran dan tidak setelah tanggal SP2D). */
  txDate?: string;
  amount: number; available: number;
  duplicate: boolean; confirmDuplicate: boolean;
}

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

/** Mengembalikan pesan galat pertama, atau null bila lolos. */
export function checkTransaction(i: TxCheckInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) return "Tanggal SP2D tidak valid.";
  if (Number(i.date.slice(0, 4)) !== i.year) return `Tanggal SP2D harus berada pada tahun anggaran ${i.year}.`;
  if (i.date > i.today) return "Tanggal SP2D tidak boleh melebihi tanggal hari ini.";
  if (i.txDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(i.txDate)) return "Tanggal transaksi tidak valid.";
    if (Number(i.txDate.slice(0, 4)) !== i.year) return `Tanggal transaksi harus berada pada tahun anggaran ${i.year}.`;
    if (i.txDate > i.date) return "Tanggal transaksi tidak boleh setelah tanggal SP2D.";
  }
  if (!Number.isFinite(i.amount) || i.amount <= 0) return "Nilai realisasi harus lebih dari nol.";
  if (Math.round(i.amount * 100) / 100 !== i.amount) return "Nilai realisasi maksimal dua angka desimal.";
  if (i.amount > i.available) return `Nilai (${rp(i.amount)}) melebihi sisa anggaran tersedia (${rp(Math.max(0, i.available))}). Sisa tersedia = pagu − realisasi.`;
  if (i.duplicate && !i.confirmDuplicate) return "Sudah ada transaksi dengan butir, tanggal, dan nilai yang sama. Centang konfirmasi bila ini memang transaksi terpisah.";
  return null;
}

/** Sisa yang masih dapat dipakai transaksi baru. */
export const availableOf = (pagu: number, realisasi: number, pending: number) => Math.round((pagu - realisasi - pending) * 100) / 100;
