"use server";

import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { flashRedirect } from "@/lib/flash";
import { MASTER } from "@/lib/master-config";
import { readTable, readWorkbook } from "@/lib/spreadsheet";
import { parseMasterTable, rowKey, IMPORT_SPECS, STANDARD_PROCUREMENT_METHODS, type ParsedRow } from "@/lib/master-import";
import { friendlyError, isUuid, optStr, runAction, str } from "@/lib/action-utils";

export async function saveMasterAction(fd: FormData): Promise<void> {
  const { user } = await requireModule("master.manage");
  const entityKey = str(fd, "entity", 40);
  const cfg = MASTER[entityKey];
  const back = `/master?tab=${encodeURIComponent(entityKey)}`;
  if (!cfg) flashRedirect("/master", { err: "Jenis master tidak dikenal." });

  const id = str(fd, "id", 40);
  const row: Record<string, string | null> = {};
  for (const f of cfg.fields) {
    const v = f.required ? str(fd, f.key, f.max ?? 300) : optStr(fd, f.key, f.max ?? 300);
    if (f.required && !v) flashRedirect(back, { err: `${f.label} wajib diisi.` });
    row[f.key] = v;
  }
  if (cfg.parent) {
    const p = str(fd, cfg.parent.key, 40);
    if (!isUuid(p)) flashRedirect(back, { err: `${cfg.parent.label} wajib dipilih.` });
    row[cfg.parent.key] = p;
  }

  const supabase = await userClient();
  if (id) {
    if (!isUuid(id)) flashRedirect(back, { err: "Data tidak valid." });
    return runAction(back, `${cfg.label} diperbarui.`, async () => supabase.from(cfg.table).update(row).eq("id", id));
  }
  return runAction(back, `${cfg.label} ditambahkan.`, async () =>
    supabase.from(cfg.table).insert({ ...row, organization_id: user.organizationId }),
  );
}

export async function toggleMasterAction(fd: FormData): Promise<void> {
  await requireModule("master.manage");
  const entityKey = str(fd, "entity", 40);
  const cfg = MASTER[entityKey];
  const back = `/master?tab=${encodeURIComponent(entityKey)}`;
  const id = str(fd, "id", 40);
  if (!cfg || !isUuid(id)) flashRedirect("/master", { err: "Data tidak valid." });
  const next = str(fd, "active", 5) === "true";
  const supabase = await userClient();
  return runAction(back, next ? `${cfg.label} diaktifkan.` : `${cfg.label} dinonaktifkan.`, async () =>
    supabase.from(cfg.table).update({ is_active: next }).eq("id", id),
  );
}

/* ======================= Tambahan: hapus terkendali & impor Excel/CSV ======================= */

export async function deleteMasterAction(fd: FormData): Promise<void> {
  await requireModule("master.manage");
  const entityKey = str(fd, "entity", 40);
  const cfg = MASTER[entityKey];
  const back = `/master?tab=${encodeURIComponent(entityKey)}`;
  const id = str(fd, "id", 40);
  if (!cfg || !isUuid(id)) flashRedirect("/master", { err: "Data tidak valid." });
  const supabase = await userClient();
  return runAction(back, `${cfg.label} dihapus.`, async () => supabase.rpc("delete_master_row", { p_entity: cfg.table, p_id: id }));
}

type ImportOutcome = { error: string } | { inserted: number; updated: number; skipped: number };
const fail = (problems: string[]) => ({ error: `Impor dibatalkan, tidak ada data yang disimpan. ${problems.length} masalah: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? " ..." : ""}` });

/** Inti impor satu jenis master dari tabel mentah. Validasi seluruh baris dulu; penyisipan baru dilakukan dalam satu pernyataan. */
async function runMasterImport(organizationId: string, entityKey: string, table: string[][], updateExisting: boolean): Promise<ImportOutcome> {
  const cfg = MASTER[entityKey]!;
  const user = { organizationId };
  const parsed = parseMasterTable(entityKey, table);
  if (parsed.problems.length) return fail(parsed.problems);

  const supabase = await userClient();
  const rows = parsed.rows;
  const problems: string[] = [];

  // Duplikat di dalam berkas
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = rowKey(entityKey, r);
    if (seen.has(k)) problems.push(`Baris ${r.line}: duplikat dengan baris ${seen.get(k)}`); else seen.set(k, r.line);
  }

  // Induk (Program -> Kegiatan -> Sub Kegiatan) dan tahun anggaran (RUP)
  let parentId = new Map<string, string>();
  if (cfg.parent && cfg.parent.table !== "fiscal_years") {
    const { data } = await supabase.from(cfg.parent.table).select("id, code").limit(10000);
    parentId = new Map((data ?? []).map((p) => [String(p.code).trim().toLowerCase(), p.id as string]));
  }
  let yearId = new Map<number, string>();
  if (entityKey === "rup_references") {
    const { data } = await supabase.from("fiscal_years").select("id, year");
    yearId = new Map((data ?? []).map((y) => [Number(y.year), y.id as string]));
  }

  // Data yang sudah ada
  const existing = new Map<string, string>(); // key -> id
  if (entityKey === "suppliers") {
    const { data } = await supabase.from("suppliers").select("id, name").limit(20000);
    for (const e of data ?? []) existing.set(String(e.name).trim().toLowerCase(), e.id as string);
  } else if (entityKey === "rup_references") {
    const { data } = await supabase.from("rup_references").select("id, rup_code, fiscal_year_id").limit(20000);
    const yearOf = new Map([...yearId.entries()].map(([y, id]) => [id, y]));
    for (const e of data ?? []) existing.set(`${yearOf.get(e.fiscal_year_id as string)}|${String(e.rup_code).trim().toLowerCase()}`, e.id as string);
  } else {
    const { data } = await supabase.from(cfg.table).select("id, code").limit(20000);
    for (const e of data ?? []) existing.set(String(e.code).trim().toLowerCase(), e.id as string);
  }

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];
  let skipped = 0;
  const build = (r: ParsedRow): Record<string, unknown> | null => {
    const base: Record<string, unknown> = { organization_id: user.organizationId };
    if (entityKey === "suppliers") return { ...base, name: r.name, npwp: r.npwp ?? null, address: r.address ?? null };
    if (entityKey === "rup_references") {
      const fy = yearId.get(r.year!);
      if (!fy) { problems.push(`Baris ${r.line}: tahun anggaran ${r.year} belum ada (buat melalui Input Anggaran > Tahun anggaran)`); return null; }
      return { ...base, fiscal_year_id: fy, rup_code: r.code, package_name: r.extra ?? null };
    }
    const out: Record<string, unknown> = { ...base, code: r.code, name: r.name };
    if (cfg.parent) {
      const pid = parentId.get((r.parent ?? "").toLowerCase());
      if (!pid) { problems.push(`Baris ${r.line}: kode ${cfg.parent.label.toLowerCase()} "${r.parent}" tidak ditemukan di Data Master`); return null; }
      out[cfg.parent.key] = pid;
    }
    return out;
  };

  for (const r of rows) {
    const hit = existing.get(rowKey(entityKey, r));
    if (hit) {
      if (!updateExisting) { skipped++; continue; }
      const full = build(r);
      if (!full) continue;
      const { organization_id: _o, ...patch } = full; void _o;
      delete patch.code; delete patch.rup_code; // kunci identitas tidak diubah
      toUpdate.push({ id: hit, patch });
      continue;
    }
    const row = build(r);
    if (row) toInsert.push(row);
  }
  if (problems.length) return fail(problems);

  if (toInsert.length) {
    const { error } = await supabase.from(cfg.table).insert(toInsert);
    if (error) return { error: `Impor dibatalkan, tidak ada data yang disimpan. ${friendlyError(error)}` };
  }
  let updated = 0;
  for (const u of toUpdate) {
    const { error } = await supabase.from(cfg.table).update(u.patch).eq("id", u.id);
    if (error) return { error: `${toInsert.length} ditambahkan, ${updated} diperbarui, lalu berhenti: ${friendlyError(error)}` };
    updated++;
  }
  return { inserted: toInsert.length, updated, skipped };
}

export async function importMasterAction(fd: FormData): Promise<void> {
  const { user } = await requireModule("master.manage");
  const entityKey = str(fd, "entity", 40);
  const cfg = MASTER[entityKey];
  const back = `/master?tab=${encodeURIComponent(entityKey)}`;
  if (!cfg || !IMPORT_SPECS[entityKey]) flashRedirect("/master", { err: "Jenis master tidak dapat diimpor." });
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) flashRedirect(back, { err: "Pilih berkas Excel (.xlsx) atau CSV terlebih dahulu." });
  const read = await readTable(file as File);
  if (!read.ok) flashRedirect(back, { err: read.error });
  const r = await runMasterImport(user.organizationId, entityKey, (read as { rows: string[][] }).rows, str(fd, "updateExisting", 5) === "true");
  if ("error" in r) flashRedirect(back, { err: r.error });
  const o = r as { inserted: number; updated: number; skipped: number };
  flashRedirect(back, { ok: `Impor ${cfg!.label} selesai: ${o.inserted} ditambahkan, ${o.updated} diperbarui, ${o.skipped} dilewati (kode sudah ada).` });
}

const SHEET_ORDER: { entity: string; names: string[] }[] = [
  { entity: "programs", names: ["program"] },
  { entity: "activities", names: ["kegiatan"] },
  { entity: "sub_activities", names: ["sub kegiatan", "subkegiatan", "sub_kegiatan"] },
  { entity: "expenditure_accounts", names: ["belanja", "rekening", "rekening belanja"] },
  { entity: "funding_sources", names: ["sumber dana", "sumberdana", "sumber_dana"] },
  { entity: "procurement_methods", names: ["metode pengadaan", "metode"] },
  { entity: "suppliers", names: ["penyedia"] },
];

/** Impor satu berkas Excel berisi banyak sheet (PROGRAM, KEGIATAN, SUB KEGIATAN, BELANJA, SUMBER DANA, ...) secara berurutan. Aman diulang: kode yang sudah ada dilewati. */
export async function importMasterWorkbookAction(fd: FormData): Promise<void> {
  const { user } = await requireModule("master.manage");
  const back = "/master?tab=programs";
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) flashRedirect(back, { err: "Pilih berkas Excel (.xlsx)." });
  const wb = await readWorkbook(file as File);
  if (!wb.ok) flashRedirect(back, { err: wb.error });
  const sheets = (wb as { sheets: { name: string; rows: string[][] }[] }).sheets;
  const updateExisting = str(fd, "updateExisting", 5) === "true";
  const done: string[] = [];
  for (const { entity, names } of SHEET_ORDER) {
    const sh = sheets.find((x) => names.includes(x.name.trim().toLowerCase()));
    if (!sh || sh.rows.length === 0) continue;
    const r = await runMasterImport(user.organizationId, entity, sh.rows, updateExisting);
    if ("error" in r) flashRedirect(back, { err: `Sheet ${sh.name}: ${r.error}${done.length ? ` (sheet sebelumnya sudah tersimpan: ${done.join("; ")})` : ""}` });
    const o = r as { inserted: number; updated: number; skipped: number };
    done.push(`${MASTER[entity]!.label} +${o.inserted}${o.updated ? ` ~${o.updated}` : ""}${o.skipped ? ` (${o.skipped} dilewati)` : ""}`);
  }
  if (done.length === 0) flashRedirect(back, { err: "Tidak ada sheet yang dikenali. Nama sheet: PROGRAM, KEGIATAN, SUB KEGIATAN, BELANJA, SUMBER DANA." });
  flashRedirect(back, { ok: `Impor berkas selesai — ${done.join("; ")}.` });
}

/** Mengisi metode pengadaan baku (Perpres 16/2018 jo. 12/2021). Aditif: kode yang sudah ada tidak diubah. */
export async function seedProcurementMethodsAction(): Promise<void> {
  const { user } = await requireModule("master.manage");
  const back = "/master?tab=procurement_methods";
  const supabase = await userClient();
  const { data } = await supabase.from("procurement_methods").select("code").limit(1000);
  const have = new Set((data ?? []).map((r) => String(r.code).trim().toLowerCase()));
  const rows = STANDARD_PROCUREMENT_METHODS.filter(([c]) => !have.has(c.toLowerCase())).map(([code, name]) => ({ organization_id: user.organizationId, code, name }));
  if (rows.length === 0) flashRedirect(back, { ok: "Seluruh metode pengadaan baku sudah ada." });
  const { error } = await supabase.from("procurement_methods").insert(rows);
  if (error) flashRedirect(back, { err: friendlyError(error) });
  flashRedirect(back, { ok: `${rows.length} metode pengadaan baku ditambahkan.` });
}
