/**
 * Mengubah nilai sel menjadi string desimal 2 digit tanpa floating-point pada string.
 * Menerima format Indonesia dan format Excel berbahasa Inggris:
 *   "Rp 1.234.567,89"  "Rp. 1.500.000"  "Rp.1.500.000,-"  "1.500.000,-"
 *   "1,500,000.00"     "1,500,000"       "1 500 000"        1500000 (angka)
 * Format yang ambigu atau pembulatan diam-diam ditolak (mengembalikan null).
 */
export function parseRupiah(v: unknown): string | null {
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(2) : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/^[\s'"`\u2018\u2019]+/, "")        // apostrof pembuka (sel teks)
    .replace(/idr|rp\.?/gi, "")                          // "Rp", "Rp.", "IDR"
    .replace(/[\s\u00a0\u202f]/g, "")                    // spasi biasa / non-breaking
    .replace(/[,.]-+$/, "")                              // akhiran ",-" atau ".-"
    .replace(/[.,]+$/, "");                              // titik/koma tergantung di akhir
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const neg = s.startsWith("-"); if (neg) s = s.slice(1);
  const lastDot = s.lastIndexOf("."), lastCom = s.lastIndexOf(",");
  const groups = (sep: string) => new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`);
  let int: string, frac = "";
  if (lastDot >= 0 && lastCom >= 0) {                    // dua pemisah: yang terakhir = desimal
    const dec = lastDot > lastCom ? "." : ",", thou = dec === "." ? "," : ".";
    const parts = s.split(dec); if (parts.length !== 2) return null;
    if (!groups(thou).test(parts[0]!) && !/^\d+$/.test(parts[0]!)) return null;
    int = parts[0]!.split(thou).join(""); frac = parts[1]!;
  } else if (lastCom >= 0) {                             // hanya koma
    const n = s.split(",").length - 1;
    if (n > 1) { if (!groups(",").test(s)) return null; int = s.split(",").join(""); }       // 1,500,000 -> ribuan
    else { const [a, b] = s.split(","); if (b!.length === 3 && a!.length <= 3) return null;   // "1,500" ambigu
      int = a!; frac = b!; }
  } else if (lastDot >= 0) {                             // hanya titik
    const n = s.split(".").length - 1;
    if (n > 1) { if (!groups(".").test(s)) return null; int = s.split(".").join(""); }       // 1.500.000 -> ribuan
    else { const [a, b] = s.split("."); if (b!.length === 3 && a!.length <= 3) int = a! + b!; else { int = a!; frac = b!; } }
  } else int = s;
  if (!/^\d+$/.test(int) || (frac && !/^\d+$/.test(frac))) return null;
  if (/[1-9]/.test(frac.slice(2))) return null;          // jangan membulatkan diam-diam
  return `${neg && /[1-9]/.test(int + frac) ? "-" : ""}${int.replace(/^0+(?=\d)/, "")}.${(frac + "00").slice(0, 2)}`;
}
