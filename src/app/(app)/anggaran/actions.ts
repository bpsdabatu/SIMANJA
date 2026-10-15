"use server";

import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { flashRedirect } from "@/lib/flash";
import { friendlyError, isUuid, num, optStr, runAction, str, uuidOrNull } from "@/lib/action-utils";
import { parseCsv, parseMoney } from "@/lib/csv";
import { readTable } from "@/lib/spreadsheet";
import { STAGES } from "@/lib/auth/context";
import { isIsoDate } from "@/lib/reports";

const BACK = "/anggaran";

export async function createVersionAction(fd: FormData): Promise<void> {
  await requireModule("budget.edit");
  const year = Number(str(fd, "year", 6));
  const stage = str(fd, "stage", 20);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) flashRedirect(BACK, { err: "Tahun anggaran tidak valid." });
  if (!(STAGES as readonly string[]).includes(stage)) flashRedirect(BACK, { err: "Tahapan anggaran tidak valid." });
  const copy = uuidOrNull(fd, "copyFrom");
  const supabase = await userClient();
  return runAction(BACK, "Versi anggaran dibuat berstatus draf. Pilih konteks (menu Ganti) untuk membukanya.", async () =>
    supabase.rpc("create_budget_version", { p_year: year, p_stage: stage, p_note: optStr(fd, "note", 300), p_copy_from: copy }),
  );
}

export async function setVersionStatusAction(fd: FormData): Promise<void> {
  await requireModule("budget.edit");
  const id = str(fd, "versionId", 40);
  const to = str(fd, "to", 10);
  if (!isUuid(id) || !["active", "final"].includes(to)) flashRedirect(BACK, { err: "Permintaan tidak valid." });
  const supabase = await userClient();
  return runAction(BACK, to === "final" ? "Versi anggaran difinalisasi dan tidak dapat diubah lagi." : "Versi anggaran diaktifkan.", async () =>
    supabase.rpc("set_budget_version_status", { p_version: id, p_to: to }),
  );
}

/** Mengisi / mengoreksi tanggal penetapan DPA suatu versi (penentu tahapan berlaku pada LRA). Koreksi wajib beralasan (divalidasi database). */
export async function setVersionDpaDateAction(fd: FormData): Promise<void> {
  await requireModule("budget.edit");
  const id = str(fd, "versionId", 40);
  const date = str(fd, "dpaDate", 10);
  if (!isUuid(id) || !isIsoDate(date)) flashRedirect(BACK, { err: "Versi atau tanggal DPA tidak valid." });
  const supabase = await userClient();
  return runAction(BACK, "Tanggal DPA disimpan.", async () =>
    supabase.rpc("set_budget_version_dpa_date", { p_version: id, p_date: date, p_reason: optStr(fd, "reason", 300) }),
  );
}

async function currentVersion(fd: FormData) {
  const { context } = await requireModule("budget.edit");
  const v = str(fd, "versionId", 40);
  if (v !== context.versionId) flashRedirect(BACK, { err: "Konteks anggaran berubah. Muat ulang halaman lalu ulangi." });
  return context.versionId;
}

export async function addItemAction(fd: FormData): Promise<void> {
  const versionId = await currentVersion(fd);
  const pagu = num(fd, "pagu");
  const sub = str(fd, "subActivity", 40), acct = str(fd, "account", 40), fund = str(fd, "funding", 40);
  if (![sub, acct, fund].every(isUuid)) flashRedirect(BACK, { err: "Sub kegiatan, rekening, dan sumber dana wajib dipilih." });
  if (!Number.isFinite(pagu) || pagu < 0) flashRedirect(BACK, { err: "Pagu harus berupa angka nol atau lebih." });
  const supabase = await userClient();
  return runAction(BACK, "Butir anggaran ditambahkan.", async () =>
    supabase.rpc("add_budget_item", {
      p_version: versionId, p_sub_activity: sub, p_account: acct, p_funding: fund,
      p_pptk: uuidOrNull(fd, "pptk"), p_description: optStr(fd, "description", 500), p_pagu: pagu,
    }),
  );
}

export async function updatePaguAction(fd: FormData): Promise<void> {
  const versionId = await currentVersion(fd);
  const item = str(fd, "itemId", 40);
  const pagu = num(fd, "pagu");
  if (!isUuid(item)) flashRedirect(BACK, { err: "Butir tidak valid." });
  if (!Number.isFinite(pagu) || pagu < 0) flashRedirect(BACK, { err: "Pagu harus berupa angka nol atau lebih." });
  const supabase = await userClient();
  return runAction(BACK, "Pagu diperbarui.", async () =>
    supabase.rpc("update_item_pagu", { p_version: versionId, p_item: item, p_pagu: pagu, p_note: optStr(fd, "note", 300) }),
  );
}

export async function assignPptkAction(fd: FormData): Promise<void> {
  await currentVersion(fd);
  const item = str(fd, "itemId", 40);
  if (!isUuid(item)) flashRedirect(BACK, { err: "Butir tidak valid." });
  const supabase = await userClient();
  return runAction(BACK, "Penugasan PPTK diperbarui.", async () =>
    supabase.from("budget_items").update({ pptk_id: uuidOrNull(fd, "pptk") }).eq("id", item),
  );
}

const IMPORT_HEADERS = ["kode_sub_kegiatan", "kode_rekening", "kode_sumber_dana", "username_pptk", "uraian", "pagu"];
const MAX_IMPORT_BYTES = 1_000_000;

export async function importCsvAction(fd: FormData): Promise<void> {
  const { context } = await requireModule("budget.import");
  if (str(fd, "versionId", 40) !== context.versionId) flashRedirect(BACK, { err: "Konteks anggaran berubah. Muat ulang halaman." });

  const file = fd.get("file");
  let rows: string[][];
  if (file instanceof File && file.size > 0) {
    const read = await readTable(file);
    if (!read.ok) flashRedirect(BACK, { err: read.error });
    rows = (read as { rows: string[][] }).rows;
  } else {
    const text = str(fd, "csv", MAX_IMPORT_BYTES);
    if (!text.trim()) flashRedirect(BACK, { err: "Pilih berkas Excel/CSV atau tempel isinya." });
    rows = parseCsv(text);
  }
  const header = (rows[0] ?? []).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const idx = Object.fromEntries(IMPORT_HEADERS.map((h) => [h, header.indexOf(h)])) as Record<string, number>;
  const missing = IMPORT_HEADERS.filter((h) => idx[h] === -1 && h !== "username_pptk" && h !== "uraian");
  if (missing.length) flashRedirect(BACK, { err: `Kolom wajib tidak ditemukan: ${missing.join(", ")}.` });
  const data = rows.slice(1);
  if (data.length === 0) flashRedirect(BACK, { err: "Berkas tidak berisi baris data." });
  if (data.length > 2000) flashRedirect(BACK, { err: "Maksimal 2.000 baris per impor." });

  const supabase = await userClient();
  const byCode = async (table: string) => {
    const { data: d } = await supabase.from(table).select("id, code").limit(5000);
    return new Map((d ?? []).map((r) => [String(r.code).trim().toLowerCase(), r.id as string]));
  };
  const [subs, accts, funds] = await Promise.all([byCode("sub_activities"), byCode("expenditure_accounts"), byCode("funding_sources")]);
  const { data: users } = await supabase.from("profiles").select("id, username").limit(5000);
  const userMap = new Map((users ?? []).map((u) => [String(u.username), u.id as string]));

  const cell = (r: string[], k: string) => (idx[k]! >= 0 ? (r[idx[k]!] ?? "").trim() : "");
  const problems: string[] = [];
  const parsed = data.map((r, i) => {
    const line = i + 2;
    const sub = subs.get(cell(r, "kode_sub_kegiatan").toLowerCase());
    const acct = accts.get(cell(r, "kode_rekening").toLowerCase());
    const fund = funds.get(cell(r, "kode_sumber_dana").toLowerCase());
    const uname = cell(r, "username_pptk").toLowerCase();
    const pptk = uname ? userMap.get(uname) : null;
    const pagu = parseMoney(cell(r, "pagu"));
    if (!sub) problems.push(`Baris ${line}: kode sub kegiatan "${cell(r, "kode_sub_kegiatan")}" tidak ditemukan`);
    if (!acct) problems.push(`Baris ${line}: kode rekening "${cell(r, "kode_rekening")}" tidak ditemukan`);
    if (!fund) problems.push(`Baris ${line}: kode sumber dana "${cell(r, "kode_sumber_dana")}" tidak ditemukan`);
    if (uname && !pptk) problems.push(`Baris ${line}: username PPTK "${uname}" tidak ditemukan`);
    if (!Number.isFinite(pagu) || pagu < 0) problems.push(`Baris ${line}: pagu tidak valid`);
    return { line, sub, acct, fund, pptk: pptk ?? null, pagu, desc: cell(r, "uraian") || null };
  });
  if (problems.length) {
    const shown = problems.slice(0, 5).join("; ");
    flashRedirect(BACK, { err: `Impor dibatalkan, tidak ada data yang disimpan. ${problems.length} masalah: ${shown}${problems.length > 5 ? " ..." : ""}` });
  }

  let ok = 0;
  const failed: string[] = [];
  for (const p of parsed) {
    const { error } = await supabase.rpc("add_budget_item", {
      p_version: context.versionId, p_sub_activity: p.sub, p_account: p.acct, p_funding: p.fund,
      p_pptk: p.pptk, p_description: p.desc, p_pagu: p.pagu,
    });
    if (error) failed.push(`Baris ${p.line}: ${friendlyError(error)}`); else ok++;
  }
  if (failed.length) {
    flashRedirect(BACK, { err: `${ok} baris berhasil, ${failed.length} gagal. ${failed.slice(0, 4).join("; ")}${failed.length > 4 ? " ..." : ""}` });
  }
  flashRedirect(BACK, { ok: `${ok} butir anggaran berhasil diimpor.` });
}

/* ======================= Tambahan: tahun anggaran, ubah & hapus butir ======================= */

export async function addFiscalYearAction(fd: FormData): Promise<void> {
  await requireModule("budget.edit");
  const year = Number(str(fd, "year", 6));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) flashRedirect(BACK, { err: "Tahun anggaran tidak valid." });
  const supabase = await userClient();
  const { data: existing } = await supabase.from("fiscal_years").select("id").eq("year", year).maybeSingle();
  if (existing) flashRedirect(BACK, { err: `Tahun anggaran ${year} sudah ada. Gunakan "Buat versi baru" untuk menambah tahapan.` });
  return runAction(BACK, `Tahun anggaran ${year} ditambahkan dengan versi Murni (draf). Aktifkan versi, lalu pilih konteks (menu Ganti) untuk membukanya.`, async () =>
    supabase.rpc("create_budget_version", { p_year: year, p_stage: "murni", p_note: optStr(fd, "note", 300), p_copy_from: null }),
  );
}

export async function updateItemDetailAction(fd: FormData): Promise<void> {
  const versionId = await currentVersion(fd);
  const item = str(fd, "itemId", 40);
  const sub = str(fd, "subActivity", 40), acct = str(fd, "account", 40), fund = str(fd, "funding", 40);
  if (![item, sub, acct, fund].every(isUuid)) flashRedirect(BACK, { err: "Sub kegiatan, rekening, dan sumber dana wajib dipilih." });
  const supabase = await userClient();
  return runAction(BACK, "Rincian butir anggaran diperbarui.", async () =>
    supabase.rpc("update_budget_item", { p_version: versionId, p_item: item, p_sub_activity: sub, p_account: acct, p_funding: fund, p_description: optStr(fd, "description", 500) }),
  );
}

export async function deleteItemAction(fd: FormData): Promise<void> {
  const versionId = await currentVersion(fd);
  const item = str(fd, "itemId", 40);
  if (!isUuid(item)) flashRedirect(BACK, { err: "Butir tidak valid." });
  const supabase = await userClient();
  return runAction(BACK, "Butir anggaran dihapus dari versi ini.", async () =>
    supabase.rpc("delete_budget_item", { p_version: versionId, p_item: item }),
  );
}
