"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { readFirstSheet } from "@/lib/import/xlsx";
import { sha256 } from "@/lib/import/hash";
import { validateBudgetRows, type Masters, type RowError } from "@/lib/import/budget";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";

export type ImportState = { error?: string; jobId?: string; fileName?: string; total?: number; ok?: number; failed?: number; errors?: RowError[]; confirmed?: number };
const MAX_BYTES = 5 * 1024 * 1024, MAX_ROWS = 5000;

async function fetchAll(q: (a: number, b: number) => PromiseLike<{ data: { id: string; code?: string; nip?: string }[] | null }>) {
  const out: { id: string; code?: string; nip?: string }[] = [];
  for (let f = 0; ; f += 1000) { const { data } = await q(f, f + 999); if (!data?.length) break; out.push(...data); if (data.length < 1000) break; }
  return out;
}
export async function ensureBudgetVersion(): Promise<void> {
  const ctx = await getBudgetContext(); if (!ctx || ctx.versionId) return;
  const sb = await createClient(); const { data: { user } } = await sb.auth.getUser();
  const { data: p } = await sb.from("profiles").select("organization_id").eq("id", user!.id).single();
  await sb.from("budget_versions").insert({ organization_id: p!.organization_id, budget_year_id: ctx.yearId, budget_stage_id: ctx.stageId, version_no: 1, created_by: user!.id });
  revalidatePath("/anggaran/impor");
}
export async function stageBudgetImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const ctx = await getBudgetContext();
  if (!ctx?.versionId) return { error: "Versi anggaran untuk tahun/tahapan ini belum disiapkan." };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih file .xlsx terlebih dahulu." };
  if (!file.name.toLowerCase().endsWith(".xlsx")) return { error: "Hanya file .xlsx yang didukung." };
  if (file.size > MAX_BYTES) return { error: "Ukuran file maksimal 5 MB." };
  const buf = await file.arrayBuffer(); const bytes = new Uint8Array(buf);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return { error: "Isi file bukan format .xlsx yang valid." };
  let rows; try { rows = await readFirstSheet(buf); } catch { return { error: "File tidak dapat dibaca. Pastikan bukan file rusak atau berpassword." }; }
  if (!rows.length) return { error: "Tidak ada baris data pada sheet pertama." };
  if (rows.length > MAX_ROWS) return { error: `Maksimal ${MAX_ROWS} baris per impor.` };

  const sb = await createClient();
  const [sub, acc, fund, pptk] = await Promise.all([
    fetchAll((a, b) => sb.from("subactivities").select("id, code").eq("is_active", true).range(a, b)),
    fetchAll((a, b) => sb.from("expenditure_accounts").select("id, code").eq("is_active", true).range(a, b)),
    fetchAll((a, b) => sb.from("funding_sources").select("id, code").eq("is_active", true).range(a, b)),
    fetchAll((a, b) => sb.from("officials").select("id, nip").eq("official_type", "pptk").eq("is_active", true).not("nip", "is", null).range(a, b))]);
  const m: Masters = {
    subactivities: new Map(sub.map((r) => [r.code!, r.id])), accounts: new Map(acc.map((r) => [r.code!, r.id])),
    fundingSources: new Map(fund.map((r) => [r.code!.toUpperCase(), r.id])), pptkByNip: new Map(pptk.map((r) => [r.nip!, r.id])) };
  const { valid, errors } = validateBudgetRows(rows, m);

  const checksum = sha256(bytes);
  const { data: existing } = await sb.from("import_jobs").select("id, status").eq("kind", "budget_entries").eq("budget_version_id", ctx.versionId).eq("checksum", checksum).maybeSingle();
  if (existing?.status === "confirmed") return { error: "File ini sudah pernah diimpor dan dikonfirmasi." };
  const payload = { file_name: file.name.slice(0, 200), total_rows: rows.length, ok_rows: valid.length, error_rows: new Set(errors.map((e) => e.row)).size, staged_rows: valid, status: "staged" };
  let jobId = existing?.id as string | undefined;
  if (jobId) {
    await sb.from("import_errors").delete().eq("import_job_id", jobId);
    const { error } = await sb.from("import_jobs").update(payload).eq("id", jobId);
    if (error) return { error: "Gagal menyimpan hasil pemeriksaan. Anda mungkin tidak berwenang mengimpor." };
  } else {
    const { data, error } = await sb.from("import_jobs").insert({ ...payload, kind: "budget_entries", budget_version_id: ctx.versionId, checksum }).select("id").single();
    if (error || !data) return { error: "Gagal menyimpan hasil pemeriksaan. Anda mungkin tidak berwenang mengimpor." };
    jobId = data.id;
  }
  if (errors.length) await sb.from("import_errors").insert(errors.slice(0, 1000).map((e) => ({ import_job_id: jobId, row_no: e.row, field: e.field, message: e.message, hint: e.hint })));
  revalidatePath("/anggaran/impor");
  return { jobId, fileName: file.name, total: payload.total_rows, ok: payload.ok_rows, failed: payload.error_rows, errors: errors.slice(0, 200) };
}
export async function confirmBudgetImport(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const jobId = String(fd.get("jobId") ?? "");
  const { data, error } = await (await createClient()).rpc("confirm_budget_import", { p_job: jobId });
  if (error) return { error: error.message };
  revalidatePath("/anggaran/impor");
  return { confirmed: data as number };
}

// ---------- hapus riwayat impor yang belum dikonfirmasi ----------
const UUID = /^[0-9a-f-]{36}$/i;
/** Menghapus satu riwayat impor berstatus belum dikonfirmasi. Yang sudah dikonfirmasi ditolak oleh aplikasi dan oleh kebijakan database. */
export async function deleteImportJob(fd: FormData): Promise<void> {
  const s = await getSession(); if (!s || !can(s.roles, "budget:import")) return;
  const id = String(fd.get("jobId") ?? ""); if (!UUID.test(id)) return;
  await (await createClient()).from("import_jobs").delete().eq("id", id).neq("status", "confirmed");
  revalidatePath("/anggaran/impor");
}
/** Menghapus semua riwayat impor yang belum dikonfirmasi pada tahun/tahapan yang sedang dipilih. */
export async function deleteUnconfirmedImports(): Promise<void> {
  const s = await getSession(); if (!s || !can(s.roles, "budget:import")) return;
  const ctx = await getBudgetContext(); if (!ctx?.versionId) return;
  await (await createClient()).from("import_jobs").delete().eq("budget_version_id", ctx.versionId).neq("status", "confirmed");
  revalidatePath("/anggaran/impor");
}
