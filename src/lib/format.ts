const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const integer = new Intl.NumberFormat("id-ID");

/** "Rp 1.234.567,00" - menerima number atau string numerik dari PostgREST. */
export function formatRupiah(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Rp 0,00";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "Rp 0,00";
  return rupiah.format(n).replace(/ /g, " ");
}

export function formatInteger(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? integer.format(n) : "0";
}

/** Persentase; null (pagu 0) ditampilkan sebagai "-" bukan 0% agar tidak menyesatkan. */
export function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}%`;
}

/** Tanggal-waktu dalam zona Asia/Jakarta. */
export function formatDateTimeWIB(iso: string | Date | null | undefined): string {
  if (!iso) return "-";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "-";
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " WIB"
  );
}

const amountFmt = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Angka rupiah tanpa simbol untuk tabel padat ("1.170.000"). Sen ditampilkan hanya bila ada, sehingga tidak ada nilai yang dibulatkan diam-diam. */
export function formatAmount(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? amountFmt.format(n) : "0";
}
