"use server";

import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { flashRedirect } from "@/lib/flash";
import { friendlyError, isUuid, num, optStr, runAction, str, uuidOrNull } from "@/lib/action-utils";
import { availableOf, checkTransaction } from "@/lib/tx-rules";
import { todayWIB } from "@/lib/quarterly-core";
import { normalizeName, parseNpwp } from "@/lib/supplier-input";

const LIST = "/realisasi";
const detail = (id: string) => `/realisasi/${id}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Sb = Awaited<ReturnType<typeof userClient>>;

/** Sisa tersedia butir pada versi: pagu − realisasi sah − pembayaran lama yang belum bertanggal SP2D (RLS membatasi ke butir yang boleh dilihat). */
async function availableFor(sb: Sb, version: string, item: string): Promise<number | null> {
  const { data } = await sb.from("v_budget_balance").select("pagu, eligible_realization, pending_sp2d").eq("budget_version_id", version).eq("budget_item_id", item).maybeSingle();
  return data ? availableOf(Number(data.pagu), Number(data.eligible_realization), Number(data.pending_sp2d)) : null;
}

/**
 * Input realisasi satu langkah (PPTK): butir + tanggal SP2D + nilai (+ uraian/penyedia/metode opsional).
 * Tanpa nomor SP2D dan tanpa verifikasi: tersimpan langsung sebagai realisasi sah.
 */
export async function createRealizationAction(fd: FormData): Promise<void> {
  const { context } = await requireModule("realization.edit");
  if (str(fd, "versionId", 40) !== context.versionId) flashRedirect(LIST, { err: "Konteks anggaran berubah. Muat ulang halaman." });
  const item = str(fd, "itemId", 40);
  const date = str(fd, "date", 10);
  const amount = num(fd, "amount");
  if (!isUuid(item)) flashRedirect(LIST, { err: "Pilih butir anggaran." });
  const back = `${LIST}?butir=${item}${DATE_RE.test(date) ? `&tgl=${date}` : ""}`;

  const supabase = await userClient();
  const available = await availableFor(supabase, context.versionId, item);
  if (available === null) flashRedirect(LIST, { err: "Butir anggaran tidak ditemukan atau bukan milik Anda." });

  // Duplikat: transaksi aktif dengan butir, tanggal, dan nilai yang sama
  let duplicate = false;
  if (DATE_RE.test(date)) {
    const { data: same } = await supabase.from("realization_transactions").select("id, payment_records(amount)")
      .eq("budget_version_id", context.versionId).eq("budget_item_id", item).eq("transaction_date", date).neq("status", "cancelled").limit(50);
    duplicate = (same ?? []).some((t) => Math.round((t.payment_records as { amount: string | number }[]).reduce((a, p) => a + Number(p.amount), 0) * 100) === Math.round(amount * 100));
  }
  const problem = checkTransaction({ date, today: todayWIB(new Date()), year: context.year, amount, available: available!, duplicate, confirmDuplicate: str(fd, "confirmDuplicate", 5) === "true" });
  if (problem) flashRedirect(back, { err: problem });

  // Penyedia: dipilih dari Data Master, atau diketik manual (ditambahkan ke Data Master / dipakai ulang bila namanya sudah ada).
  let supplierId = uuidOrNull(fd, "supplier");
  if (str(fd, "supplierNew", 5) === "true") {
    const name = normalizeName(str(fd, "supplierName", 200));
    const npwp = parseNpwp(str(fd, "supplierNpwp", 40));
    if (!name) flashRedirect(back, { err: "Nama penyedia baru wajib diisi." });
    if (npwp.error) flashRedirect(back, { err: npwp.error });
    let supErr = "";
    try {
      const { data, error } = await supabase.rpc("create_supplier_for_realization", { p_name: name, p_npwp: npwp.value, p_address: optStr(fd, "supplierAddress", 500) });
      if (error) supErr = friendlyError(error); else supplierId = String(data);
    } catch { supErr = "Terjadi kesalahan pada sistem. Silakan coba lagi."; }
    if (supErr) flashRedirect(back, { err: `Penyedia: ${supErr}` });
  }

  let message = "";
  try {
    const { error } = await supabase.rpc("record_realization", {
      p_version: context.versionId, p_item: item, p_sp2d_date: date, p_description: optStr(fd, "description", 500),
      p_supplier: supplierId, p_method: uuidOrNull(fd, "method"), p_amount: amount,
    });
    if (error) message = friendlyError(error);
  } catch { message = "Terjadi kesalahan pada sistem. Silakan coba lagi."; }
  if (message) flashRedirect(back, { err: message });

  flashRedirect(back, { ok: "Realisasi tersimpan dan langsung tercatat." });
}

function txId(fd: FormData): string {
  const id = str(fd, "txId", 40);
  if (!isUuid(id)) flashRedirect(LIST, { err: "Transaksi tidak valid." });
  return id;
}

/** Pembatalan realisasi dengan alasan tercatat (hak koreksi Admin). */
export async function cancelTransactionAction(fd: FormData): Promise<void> {
  await requireModule("realization.correct");
  const id = txId(fd);
  const supabase = await userClient();
  return runAction(detail(id), "Transaksi dibatalkan.", async () =>
    supabase.rpc("cancel_transaction", { p_tx: id, p_reason: str(fd, "reason", 300) }),
  );
}

/** Koreksi tanggal SP2D dengan alasan tercatat (hak koreksi Admin). */
export async function correctDateAction(fd: FormData): Promise<void> {
  await requireModule("realization.correct");
  const id = txId(fd);
  const date = str(fd, "date", 10);
  if (!DATE_RE.test(date)) flashRedirect(detail(id), { err: "Tanggal SP2D wajib diisi dengan benar." });
  const supabase = await userClient();
  return runAction(detail(id), "Tanggal SP2D dikoreksi dan alasan tercatat.", async () =>
    supabase.rpc("correct_realization_date", { p_tx: id, p_date: date, p_reason: str(fd, "reason", 300) }),
  );
}
