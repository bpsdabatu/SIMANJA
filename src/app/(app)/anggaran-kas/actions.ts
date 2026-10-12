"use server";

import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { flashRedirect } from "@/lib/flash";
import { friendlyError, isUuid, num, optStr, runAction, str } from "@/lib/action-utils";
import { parseMoney } from "@/lib/csv";
import { parseAmount } from "@/lib/cash-core";
import { normHeader, readTable } from "@/lib/spreadsheet";

const BACK = "/anggaran-kas";

async function ctxVersion(fd: FormData, permission: string) {
  const { context } = await requireModule(permission);
  if (str(fd, "versionId", 40) !== context.versionId) flashRedirect(BACK, { err: "Konteks anggaran berubah. Muat ulang halaman lalu ulangi." });
  return context.versionId;
}

export async function saveCashPlanAction(fd: FormData): Promise<void> {
  const versionId = await ctxVersion(fd, "cashplan.edit");
  const item = str(fd, "itemId", 40);
  if (!isUuid(item)) flashRedirect(BACK, { err: "Butir tidak valid." });
  const months: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const raw = String(fd.get(`m${m}`) ?? "").trim();
    const v = raw === "" ? 0 : parseAmount(raw);
    if (!Number.isFinite(v) || v < 0) flashRedirect(BACK, { err: `Nilai bulan ke-${m} tidak valid.` });
    months.push(v);
  }
  const supabase = await userClient();
  let planId = "";
  let message = "";
  try {
    const { data, error } = await supabase.rpc("save_cash_plan", { p_version: versionId, p_item: item, p_months: months });
    if (error) message = friendlyError(error); else planId = String(data);
  } catch { message = "Terjadi kesalahan pada sistem. Silakan coba lagi."; }
  if (message) flashRedirect(BACK, { err: message });

  if (str(fd, "intent", 10) === "submit") {
    let submitErr = "";
    try {
      const { error } = await supabase.rpc("set_cash_plan_status", { p_plan: planId, p_to: "submitted", p_reason: null });
      if (error) submitErr = friendlyError(error);
    } catch { submitErr = "Terjadi kesalahan pada sistem."; }
    if (submitErr) flashRedirect(BACK, { err: `Tersimpan sebagai draf, tetapi belum dapat diajukan: ${submitErr}` });
    flashRedirect(BACK, { ok: "Anggaran kas disimpan dan diajukan." });
  }
  flashRedirect(BACK, { ok: "Anggaran kas disimpan sebagai draf. Klik “Simpan & ajukan” bila sudah benar." });
}

export async function cashStatusAction(fd: FormData): Promise<void> {
  const to = str(fd, "to", 12);
  const perm = to === "submitted" ? "cashplan.submit" : "cashplan.finalize";
  await ctxVersion(fd, perm);
  const plan = str(fd, "planId", 40);
  if (!isUuid(plan) || !["submitted", "returned", "final"].includes(to)) flashRedirect(BACK, { err: "Permintaan tidak valid." });
  const msg = { submitted: "Anggaran kas diajukan.", returned: "Anggaran kas dikembalikan ke PPTK.", final: "Anggaran kas difinalisasi." }[to]!;
  const supabase = await userClient();
  return runAction(BACK, msg, async () =>
    supabase.rpc("set_cash_plan_status", { p_plan: plan, p_to: to, p_reason: optStr(fd, "reason", 300) }),
  );
}

/* ======================= Tambahan: hapus draf & impor Excel/CSV ======================= */

export async function deleteCashPlanAction(fd: FormData): Promise<void> {
  await ctxVersion(fd, "cashplan.edit");
  const plan = str(fd, "planId", 40);
  if (!isUuid(plan)) flashRedirect(BACK, { err: "Permintaan tidak valid." });
  const supabase = await userClient();
  return runAction(BACK, "Draf anggaran kas dihapus.", async () => supabase.rpc("delete_cash_plan", { p_plan: plan }));
}

const MONTH_KEYS = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];
const MONTH_ALIASES: string[][] = [
  ["jan", "januari"], ["feb", "februari"], ["mar", "maret"], ["apr", "april"], ["mei"], ["jun", "juni"],
  ["jul", "juli"], ["agu", "agt", "agustus"], ["sep", "september"], ["okt", "oktober"], ["nov", "november"], ["des", "desember"],
];

/** Impor anggaran kas dari Excel/CSV (templat berisi butir dari Input Anggaran; kunci: id_butir). Hanya butir milik PPTK yang bersangkutan yang dapat disimpan (RLS). */
export async function importCashPlansAction(fd: FormData): Promise<void> {
  const versionId = await ctxVersion(fd, "cashplan.edit");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) flashRedirect(BACK, { err: "Pilih berkas Excel (.xlsx) atau CSV." });
  const read = await readTable(file as File);
  if (!read.ok) flashRedirect(BACK, { err: read.error });
  const table = (read as { rows: string[][] }).rows;
  const header = (table[0] ?? []).map(normHeader);
  const iId = header.indexOf("id_butir");
  const iMonth = MONTH_ALIASES.map((al) => header.findIndex((h) => al.includes(h)));
  if (iId === -1 || iMonth.some((i) => i === -1)) flashRedirect(BACK, { err: "Gunakan templat dari menu ini: kolom id_butir dan jan s.d. des wajib ada." });
  const data = table.slice(1);
  if (data.length === 0) flashRedirect(BACK, { err: "Berkas tidak berisi baris data." });
  if (data.length > 2000) flashRedirect(BACK, { err: "Maksimal 2.000 baris per impor." });

  const problems: string[] = [];
  const seen = new Set<string>();
  const parsed = data.map((r, i) => {
    const line = i + 2;
    const id = (r[iId] ?? "").trim();
    if (!isUuid(id)) problems.push(`Baris ${line}: id_butir tidak valid`);
    else if (seen.has(id)) problems.push(`Baris ${line}: id_butir ganda`);
    seen.add(id);
    const months = iMonth.map((c, m) => {
      const raw = (r[c] ?? "").trim();
      if (raw === "") return 0;
      const v = parseMoney(raw);
      if (!Number.isFinite(v) || v < 0) { problems.push(`Baris ${line}: nilai ${MONTH_KEYS[m]} tidak valid`); return 0; }
      return v;
    });
    return { line, id, months };
  });
  if (problems.length) flashRedirect(BACK, { err: `Impor dibatalkan, tidak ada data yang disimpan. ${problems.length} masalah: ${problems.slice(0, 5).join("; ")}${problems.length > 5 ? " ..." : ""}` });

  const supabase = await userClient();
  let ok = 0, skipped = 0;
  const failed: string[] = [];
  for (const p of parsed) {
    if (p.months.every((m) => m === 0)) { skipped++; continue; }
    const { error } = await supabase.rpc("save_cash_plan", { p_version: versionId, p_item: p.id, p_months: p.months });
    if (error) failed.push(`Baris ${p.line}: ${friendlyError(error)}`); else ok++;
  }
  if (failed.length) flashRedirect(BACK, { err: `${ok} butir tersimpan sebagai draf, ${failed.length} gagal. ${failed.slice(0, 4).join("; ")}${failed.length > 4 ? " ..." : ""}` });
  flashRedirect(BACK, { ok: `${ok} anggaran kas tersimpan sebagai draf${skipped ? `; ${skipped} baris kosong dilewati` : ""}. Periksa lalu ajukan.` });
}
