/** Utilitas Waktu Indonesia Barat (WIB, Asia/Jakarta). Murni dan dapat dipakai di server maupun klien. */
const TZ = "Asia/Jakarta";

export function wibHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(d)) % 24;
}

/** Salam menurut jam WIB: pagi 04.00–10.59, siang 11.00–14.59, sore 15.00–17.59, malam selainnya. */
export function greetingFor(d: Date): "Selamat pagi" | "Selamat siang" | "Selamat sore" | "Selamat malam" {
  const h = wibHour(d);
  if (h >= 4 && h < 11) return "Selamat pagi";
  if (h >= 11 && h < 15) return "Selamat siang";
  if (h >= 15 && h < 18) return "Selamat sore";
  return "Selamat malam";
}

export function formatClockWIB(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d).replace(/\./g, ":");
}

export function formatDateWIB(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
}
