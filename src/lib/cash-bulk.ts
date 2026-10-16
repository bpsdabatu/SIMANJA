/**
 * Muatan simpan massal Anggaran Kas (murni, dipakai server action dan dapat diuji).
 * Bentuk: JSON array [{ "i": "<uuid butir>", "m": [12 angka], "l": "label" }].
 */
export interface BulkRow { id: string; months: number[]; label: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BULK_MAX_ROWS = 1000;
export const BULK_MAX_BYTES = 2_000_000;

export function parseBulkPayload(raw: string): { ok: true; rows: BulkRow[] } | { ok: false; error: string } {
  if (raw.length > BULK_MAX_BYTES) return { ok: false, error: "Data terlalu besar. Simpan per bagian." };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { ok: false, error: "Data tidak valid. Muat ulang halaman lalu ulangi." }; }
  if (!Array.isArray(data)) return { ok: false, error: "Data tidak valid." };
  if (data.length === 0) return { ok: false, error: "Tidak ada perubahan untuk disimpan." };
  if (data.length > BULK_MAX_ROWS) return { ok: false, error: `Maksimal ${BULK_MAX_ROWS} butir per simpan.` };
  const seen = new Set<string>();
  const rows: BulkRow[] = [];
  for (let n = 0; n < data.length; n++) {
    const d = data[n] as { i?: unknown; m?: unknown; l?: unknown } | null;
    const id = typeof d?.i === "string" ? d.i : "";
    if (!UUID.test(id)) return { ok: false, error: `Butir ke-${n + 1} tidak valid.` };
    if (seen.has(id)) return { ok: false, error: `Butir ke-${n + 1} ganda.` };
    seen.add(id);
    const m = d?.m;
    if (!Array.isArray(m) || m.length !== 12) return { ok: false, error: `Butir ke-${n + 1}: harus 12 bulan.` };
    const months: number[] = [];
    for (const v of m) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e15) return { ok: false, error: `Butir ke-${n + 1}: nilai bulan tidak valid.` };
      const c = Math.round(v * 100);
      if (Math.abs(v * 100 - c) > 1e-6) return { ok: false, error: `Butir ke-${n + 1}: maksimal 2 digit desimal.` };
      months.push(c / 100);
    }
    rows.push({ id, months, label: typeof d?.l === "string" ? d.l.slice(0, 80) : `Butir ${n + 1}` });
  }
  return { ok: true, rows };
}
