/** Aturan validasi transaksi belanja (murni; dipakai server sebagai penjaga akhir dan klien sebagai umpan balik langsung). */
export interface TxCheckInput {
  date: string; today: string; year: number;
  amount: number; available: number;
  duplicate: boolean; confirmDuplicate: boolean;
}

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

/** Mengembalikan pesan galat pertama, atau null bila lolos. */
export function checkTransaction(i: TxCheckInput): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) return "Tanggal transaksi tidak valid.";
  if (Number(i.date.slice(0, 4)) !== i.year) return `Tanggal transaksi harus berada pada tahun anggaran ${i.year}.`;
  if (i.date > i.today) return "Tanggal transaksi tidak boleh melebihi tanggal hari ini.";
  if (!Number.isFinite(i.amount) || i.amount <= 0) return "Nilai pembayaran harus lebih dari nol.";
  if (Math.round(i.amount * 100) / 100 !== i.amount) return "Nilai pembayaran maksimal dua angka desimal.";
  if (i.amount > i.available) return `Nilai (${rp(i.amount)}) melebihi sisa anggaran tersedia (${rp(Math.max(0, i.available))}). Sisa tersedia = pagu − realisasi − pembayaran yang masih menunggu SP2D.`;
  if (i.duplicate && !i.confirmDuplicate) return "Sudah ada transaksi dengan butir, tanggal, dan nilai yang sama. Centang konfirmasi bila ini memang transaksi terpisah.";
  return null;
}

/** Sisa yang masih dapat dipakai transaksi baru. */
export const availableOf = (pagu: number, realisasi: number, pending: number) => Math.round((pagu - realisasi - pending) * 100) / 100;
