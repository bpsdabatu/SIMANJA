import { parseRupiah } from "./import/parse";
import { fromCents, toCents } from "./money";

export type EntryRef = { id: string; sub: string; acc: string; fund: string; desc: string; pagu: string };
export type Quarters = (string | null)[]; // 4 elemen; null = tidak diubah
export type StagedCash = { entry_id: string; q: Quarters };
export type PreviewRow = { row: number; label: string; q: Quarters; pagu: string; total: string; over: boolean };
export type CashRowError = { row: number; field: string; message: string; hint: string };
export type CashParse = { valid: StagedCash[]; preview: PreviewRow[]; errors: CashRowError[]; skipped: number };
export const CASH_TEMPLATE_COLUMNS = ["kode_program", "kode_kegiatan", "kode_subkegiatan", "kode_rekening", "kode_sumber_dana", "uraian", "pagu", "tw1", "tw2", "tw3", "tw4"] as const;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown) => String(v ?? "").trim();
/** Tanda strip (-, –, —) lazim dipakai dokumen keuangan untuk nilai nol. */
const parseQuarter = (v: unknown) => (/^[-\u2013\u2014]+$/.test(str(v)) ? "0.00" : parseRupiah(v));
export const entryLabel = (e: EntryRef) => `${e.sub} / ${e.acc}: ${e.desc}`;

export type EntryIndex = { all: EntryRef[]; bySubAcc: Map<string, EntryRef[]>; byAcc: Map<string, EntryRef[]>; subs: Set<string>; accs: Set<string> };
export function buildEntryIndex(entries: EntryRef[]): EntryIndex {
  const bySubAcc = new Map<string, EntryRef[]>(), byAcc = new Map<string, EntryRef[]>();
  for (const e of entries) {
    bySubAcc.set(`${e.sub}|${e.acc}`, [...(bySubAcc.get(`${e.sub}|${e.acc}`) ?? []), e]);
    byAcc.set(e.acc, [...(byAcc.get(e.acc) ?? []), e]);
  }
  return { all: entries, bySubAcc, byAcc, subs: new Set(entries.map((e) => e.sub)), accs: new Set(entries.map((e) => e.acc)) };
}
type Resolve = { entry: EntryRef } | { error: { field: string; message: string; hint: string } };
const descMatch = (a: string, b: string) => { const x = norm(a), y = norm(b); return x === y || (Math.min(x.length, y.length) >= 6 && (x.includes(y) || y.includes(x))); };

/** Mencari satu rekening anggaran dari kombinasi subkegiatan + rekening (+ sumber dana, uraian bila perlu). */
export function resolveEntry(idx: EntryIndex, sub: string | null, acc: string, fund?: string, desc?: string): Resolve {
  let c = sub ? (idx.bySubAcc.get(`${sub}|${acc}`) ?? []) : (idx.byAcc.get(acc) ?? []);
  if (!c.length) return { error: sub ? { field: "kode_rekening", message: `Tidak ada rekening anggaran untuk subkegiatan "${sub}" dan rekening "${acc}"`, hint: "Periksa kode, atau impor anggaran lebih dulu di menu Impor anggaran" } : { field: "kode_subkegiatan", message: `Rekening "${acc}" tidak ditemukan pada anggaran`, hint: "Periksa kode rekening atau impor anggaran lebih dulu" } };
  if (fund) { const f = c.filter((e) => e.fund.toUpperCase() === fund.toUpperCase()); if (!f.length) return { error: { field: "kode_sumber_dana", message: `Sumber dana "${fund}" tidak cocok dengan rekening anggaran`, hint: "Gunakan kode sumber dana seperti di anggaran" } }; c = f; }
  if (c.length > 1 && desc) { const d = c.filter((e) => descMatch(e.desc, desc)); if (d.length) c = d; }
  if (c.length > 1) return { error: { field: "uraian", message: `${c.length} rekening anggaran memakai kombinasi yang sama`, hint: "Isi kode_sumber_dana dan uraian persis seperti di anggaran (gunakan template dari menu ini)" } };
  return { entry: c[0]! };
}

// ---------- Excel ----------
const TW_ALIASES = [["tw1", "twi", "triwulan1", "triwulani"], ["tw2", "twii", "triwulan2", "triwulanii"], ["tw3", "twiii", "triwulan3", "triwulaniii"], ["tw4", "twiv", "triwulan4", "triwulaniv"]];
const MONTH_ALIASES = [["jan", "januari", "bulan1"], ["feb", "februari", "bulan2"], ["mar", "maret", "bulan3"], ["apr", "april", "bulan4"], ["mei", "bulan5"], ["jun", "juni", "bulan6"],
  ["jul", "juli", "bulan7"], ["agu", "agt", "agus", "agustus", "bulan8"], ["sep", "sept", "september", "bulan9"], ["okt", "oktober", "bulan10"], ["nov", "nop", "november", "nopember", "bulan11"], ["des", "desember", "bulan12"]];

function readQuarters(r: Record<string, unknown>): { q: Quarters; error?: { field: string; message: string } } {
  const byKey = new Map<string, unknown>();
  for (const [k, v] of Object.entries(r)) if (k !== "_row") byKey.set(alnum(k), v);
  const get = (aliases: string[]) => { for (const a of aliases) if (byKey.has(a)) { const v = byKey.get(a); if (str(v) !== "") return { field: a, v }; } return null; };
  const q: Quarters = [null, null, null, null];
  for (let i = 0; i < 4; i++) {
    const direct = get(TW_ALIASES[i]!);
    if (direct) {
      const n = parseQuarter(direct.v);
      if (n === null) return { q, error: { field: direct.field, message: `Format angka tidak valid: "${str(direct.v)}"` } };
      if (n.startsWith("-")) return { q, error: { field: direct.field, message: "Nilai kas tidak boleh negatif" } };
      q[i] = n; continue;
    }
    let sum = 0n, any = false;
    for (let m = i * 3; m < i * 3 + 3; m++) {
      const h = get(MONTH_ALIASES[m]!); if (!h) continue;
      const n = parseQuarter(h.v);
      if (n === null) return { q, error: { field: h.field, message: `Format angka tidak valid: "${str(h.v)}"` } };
      if (n.startsWith("-")) return { q, error: { field: h.field, message: "Nilai kas tidak boleh negatif" } };
      sum += toCents(n); any = true;
    }
    if (any) q[i] = fromCents(sum);
  }
  return { q };
}
const totalOf = (q: Quarters) => fromCents(q.reduce((s, v) => s + (v ? toCents(v) : 0n), 0n));

function finish(state: { seen: Map<string, number>; out: CashParse }, row: number, e: EntryRef, q: Quarters) {
  const dup = state.seen.get(e.id);
  if (dup !== undefined) { state.out.errors.push({ row, field: "kode_rekening", message: `Duplikat dengan baris ${dup}`, hint: "Satu rekening anggaran hanya boleh muncul sekali" }); return; }
  state.seen.set(e.id, row);
  const total = totalOf(q);
  state.out.valid.push({ entry_id: e.id, q });
  state.out.preview.push({ row, label: entryLabel(e), q, pagu: e.pagu, total, over: toCents(total) > toCents(e.pagu) });
}

/** Validasi baris Excel. Nilai triwulan dari kolom tw1..tw4 atau (otomatis dijumlahkan) kolom bulan jan..des. */
export function validateCashRows(rows: { _row: number; [k: string]: unknown }[], idx: EntryIndex): CashParse {
  const state = { seen: new Map<string, number>(), out: { valid: [], preview: [], errors: [], skipped: 0 } as CashParse };
  for (const r of rows) {
    const sub = str(r.kode_subkegiatan), acc = str(r.kode_rekening);
    if (!sub && !acc) continue;
    const err = (field: string, message: string, hint: string) => state.out.errors.push({ row: r._row, field, message, hint });
    if (!sub) { err("kode_subkegiatan", "Kosong", "Isi kode subkegiatan"); continue; }
    if (!acc) { err("kode_rekening", "Kosong", "Isi kode rekening"); continue; }
    const { q, error } = readQuarters(r);
    if (error) { err(error.field, error.message, "Gunakan angka, mis. 1500000 atau 1.500.000,00"); continue; }
    if (q.every((v) => v === null)) { state.out.skipped++; continue; }
    const res = resolveEntry(idx, sub, acc, str(r.kode_sumber_dana) || undefined, str(r.uraian) || undefined);
    if ("error" in res) { err(res.error.field, res.error.message, res.error.hint); continue; }
    finish(state, r._row, res.entry, q);
  }
  return state.out;
}

// ---------- PDF ----------
const NUM = /^-?[\d.,]+$/;
const isAmount = (t: string) => NUM.test(t) && /\d/.test(t) && parseRupiah(t) !== null;
/** Dari deretan angka satu baris, pilih jendela `size` angka berurutan; utamakan yang jumlahnya sama dengan angka di sebelahnya (kolom pagu/jumlah). */
export function pickWindow(nums: string[], size: number): string[] {
  if (nums.length <= size) return nums;
  for (let s = nums.length - size; s >= 0; s--) {
    const w = nums.slice(s, s + size), sum = w.reduce((a, v) => a + toCents(v), 0n);
    const near = [nums[s - 1], nums[s + size]].filter((x): x is string => x !== undefined);
    if (near.some((x) => toCents(x) === sum)) return w;
  }
  return nums.slice(nums.length - size);
}
/** Membaca teks PDF (baris demi baris). Hanya baris berisi kode rekening yang dikenal yang dianggap data; sisanya diabaikan. */
export function parseCashPdfLines(lines: string[], idx: EntryIndex): CashParse {
  const state = { seen: new Map<string, number>(), out: { valid: [], preview: [], errors: [], skipped: 0 } as CashParse };
  let sub: string | null = null;
  lines.forEach((line, i) => {
    const row = i + 1, tokens = line.split(/\s+/).filter(Boolean);
    const accAt = tokens.findIndex((t) => idx.accs.has(t));
    if (accAt < 0) { const s = tokens.find((t) => idx.subs.has(t)); if (s) sub = s; return; }
    const acc = tokens[accAt]!, rest = tokens.slice(accAt + 1);
    const firstNum = rest.findIndex(isAmount), desc = (firstNum < 0 ? rest : rest.slice(0, firstNum)).join(" ");
    const nums = rest.filter(isAmount).map((t) => parseRupiah(t)!);
    const snippet = line.length > 90 ? `${line.slice(0, 87)}...` : line;
    const err = (field: string, message: string, hint: string) => state.out.errors.push({ row, field, message: `${message} (teks: "${snippet}")`, hint });
    let q: Quarters;
    if (nums.length >= 12) { const m = pickWindow(nums, 12); q = [0, 1, 2, 3].map((k) => fromCents(m.slice(k * 3, k * 3 + 3).reduce((s, v) => s + toCents(v), 0n))); }
    else if (nums.length >= 4) q = pickWindow(nums, 4);
    else { err("tw1-tw4", `Hanya ${nums.length} angka terbaca, butuh 4 nilai triwulan`, "Gunakan template Excel dari menu ini bila PDF sulit dibaca"); return; }
    if (q.some((v) => v && v.startsWith("-"))) { err("tw1-tw4", "Ada nilai negatif", "Periksa dokumen sumber"); return; }
    const res = resolveEntry(idx, sub, acc, undefined, desc || undefined);
    if ("error" in res) { err(res.error.field, res.error.message, res.error.hint); return; }
    finish(state, row, res.entry, q);
  });
  return state.out;
}
