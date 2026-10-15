/** Aturan input penyedia manual pada form Realisasi Belanja (murni — dipakai server action dan tampilan). */

export const normalizeName = (s: string): string => s.replace(/\s+/g, " ").trim();
const key = (s: string) => normalizeName(s).toLowerCase();

/** NPWP opsional; bila diisi harus 15 atau 16 digit (titik/tanda hubung diperbolehkan). */
export function parseNpwp(raw: string): { value: string | null; error?: string } {
  const t = raw.trim();
  if (!t) return { value: null };
  if (!/^[0-9.\-\s]+$/.test(t)) return { value: null, error: "NPWP hanya boleh berisi angka, titik, dan tanda hubung." };
  const digits = t.replace(/\D/g, "");
  if (digits.length !== 15 && digits.length !== 16) return { value: null, error: "NPWP harus 15 atau 16 digit." };
  return { value: t.replace(/\s+/g, " ") };
}

export interface SupplierOpt { id: string; label: string }

/** Penyedia yang sudah ada dengan nama sama / mirip — agar pengguna memilihnya dari daftar, bukan membuat duplikat. */
export function similarSuppliers(name: string, list: SupplierOpt[], max = 4): { exact: SupplierOpt | null; similar: SupplierOpt[] } {
  const q = key(name);
  if (q.length < 3) return { exact: null, similar: [] };
  const exact = list.find((s) => key(s.label) === q) ?? null;
  const similar = list.filter((s) => s !== exact && (key(s.label).includes(q) || (key(s.label).length >= 3 && q.includes(key(s.label))))).slice(0, max);
  return { exact, similar };
}
