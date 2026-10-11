import { normHeader } from "@/lib/header";

/**
 * Logika murni impor Data Master (tanpa akses database) agar mudah diuji.
 * Tiap entitas punya kolom berkode dan alias nama kolom yang diterima.
 */
export interface ImportColumn { key: "code" | "name" | "parent" | "npwp" | "address" | "year" | "extra"; label: string; aliases: string[]; required?: boolean; max: number }
export interface ImportSpec { columns: ImportColumn[]; sample: string[] }

const code = (extra: string[] = []): ImportColumn => ({ key: "code", label: "kode", aliases: ["kode", "code", ...extra], required: true, max: 40 });
const name = (extra: string[] = [], max = 300): ImportColumn => ({ key: "name", label: "nama", aliases: ["nama", "name", "uraian", ...extra], required: true, max });

export const IMPORT_SPECS: Record<string, ImportSpec> = {
  programs: { columns: [code(["kode_program"]), name(["nama_program"])], sample: ["1.01", "Contoh Program"] },
  activities: {
    columns: [{ key: "parent", label: "kode_program", aliases: ["kode_program", "program"], required: true, max: 40 }, code(["kode_kegiatan"]), name(["nama_kegiatan"])],
    sample: ["1.01", "1.01.01", "Contoh Kegiatan"],
  },
  sub_activities: {
    columns: [{ key: "parent", label: "kode_kegiatan", aliases: ["kode_kegiatan", "kegiatan"], required: true, max: 40 }, code(["kode_sub_kegiatan"]), name(["nama_sub_kegiatan"])],
    sample: ["1.01.01", "1.01.01.0001", "Contoh Sub Kegiatan"],
  },
  expenditure_accounts: { columns: [code(["kode_rekening"]), name(["nama_rekening", "uraian_rekening"])], sample: ["5.1.02.01.01.0024", "Belanja Alat/Bahan untuk Kegiatan Kantor"] },
  funding_sources: { columns: [code(["kode_sumber_dana"]), name(["nama_sumber_dana"], 200)], sample: ["1.1.01", "Pendapatan Asli Daerah"] },
  procurement_methods: { columns: [code(["kode_metode"]), name(["nama_metode"], 200)], sample: ["PL", "Pengadaan Langsung"] },
  suppliers: {
    columns: [
      { key: "name", label: "nama", aliases: ["nama", "name", "nama_penyedia"], required: true, max: 200 },
      { key: "npwp", label: "npwp", aliases: ["npwp"], max: 40 },
      { key: "address", label: "alamat", aliases: ["alamat", "address"], max: 500 },
    ],
    sample: ["CV Contoh Mandiri", "00.000.000.0-000.000", "Jl. Contoh No. 1"],
  },
  rup_references: {
    columns: [
      { key: "year", label: "tahun", aliases: ["tahun", "tahun_anggaran", "year"], required: true, max: 4 },
      { key: "code", label: "kode_rup", aliases: ["kode_rup", "rup", "kode"], required: true, max: 60 },
      { key: "extra", label: "nama_paket", aliases: ["nama_paket", "paket", "nama"], max: 300 },
    ],
    sample: ["2026", "12345678", "Contoh Paket Pengadaan"],
  },
};

export function importTemplateRows(entity: string): string[][] | null {
  const spec = IMPORT_SPECS[entity];
  return spec ? [spec.columns.map((c) => c.label), spec.sample] : null;
}

export interface ParsedRow {
  line: number;
  code?: string; name?: string; parent?: string; npwp?: string | null; address?: string | null; year?: number; extra?: string | null;
}
export interface ParseOutcome { rows: ParsedRow[]; problems: string[] }

/** Memetakan tabel mentah (baris pertama = header) ke baris terstruktur + daftar masalah. */
export function parseMasterTable(entity: string, table: string[][]): ParseOutcome {
  const spec = IMPORT_SPECS[entity];
  if (!spec) return { rows: [], problems: ["Jenis master tidak dapat diimpor."] };
  const header = (table[0] ?? []).map(normHeader);
  const idx = new Map<ImportColumn["key"], number>();
  const problems: string[] = [];
  for (const c of spec.columns) {
    const i = header.findIndex((h) => c.aliases.includes(h));
    if (i === -1) { if (c.required) problems.push(`Kolom wajib "${c.label}" tidak ditemukan pada baris pertama.`); } else idx.set(c.key, i);
  }
  if (problems.length) return { rows: [], problems };
  const data = table.slice(1);
  if (data.length === 0) return { rows: [], problems: ["Berkas tidak berisi baris data."] };
  if (data.length > 5000) return { rows: [], problems: ["Maksimal 5.000 baris per impor."] };

  const rows: ParsedRow[] = [];
  data.forEach((r, i) => {
    const line = i + 2;
    const get = (k: ImportColumn["key"]) => { const j = idx.get(k); return j === undefined ? "" : (r[j] ?? "").trim(); };
    const out: ParsedRow = { line };
    for (const c of spec.columns) {
      const v = get(c.key);
      if (c.required && !v) { problems.push(`Baris ${line}: ${c.label} kosong`); continue; }
      if (v.length > c.max) { problems.push(`Baris ${line}: ${c.label} melebihi ${c.max} karakter`); continue; }
      if (c.key === "year") {
        const y = Number(v);
        if (!Number.isInteger(y) || y < 2000 || y > 2100) problems.push(`Baris ${line}: tahun "${v}" tidak valid`); else out.year = y;
      } else if (c.key === "npwp" || c.key === "address" || c.key === "extra") out[c.key] = v || null;
      else (out as unknown as Record<string, unknown>)[c.key] = v;
    }
    rows.push(out);
  });
  return { rows, problems };
}

/** Kunci identitas baris untuk deteksi duplikat di dalam berkas dan terhadap data yang ada. */
export function rowKey(entity: string, r: ParsedRow): string {
  if (entity === "suppliers") return (r.name ?? "").toLowerCase();
  if (entity === "rup_references") return `${r.year}|${(r.code ?? "").toLowerCase()}`;
  return (r.code ?? "").toLowerCase();
}
