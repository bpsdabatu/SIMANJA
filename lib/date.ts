const TZ = "Asia/Jakarta";
/** ISO (yyyy-mm-dd atau timestamp) -> dd/mm/yyyy; kosong -> "-". */
export function fmtDate(v?: string | null): string {
  if (!v) return "-";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}
/** Waktu selalu ditampilkan dalam WIB (Asia/Jakarta), apa pun zona waktu server atau peramban. */
export const fmtDateTime = (v: string | Date): string => `${new Date(v).toLocaleString("id-ID", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(",", "")} WIB`;
export const nowWib = (): string => fmtDateTime(new Date());
export const todayLong = (): string => new Date().toLocaleDateString("id-ID", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
export const todayIso = (): string => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
