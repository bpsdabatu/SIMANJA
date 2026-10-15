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

/** Sisa tersedia butir pada versi: pagu − realisasi sah − pembayaran menunggu SP2D (RLS membatasi ke butir yang boleh dilihat). */
async function availableFor(sb: Sb, version: string, item: string): Promise<number | null> {
  const { data } = await sb.from("v_budget_balance").select("pagu, eligible_realization, pending_sp2d").eq("budget_version_id", version).eq("budget_item_id", item).maybeSingle();
  return data ? availableOf(Number(data.pagu), Number(data.eligible_realization), Number(data.pending_sp2d)) : null;
}

export async function createTransactionAction(fd: FormData): Promise<void> {
  const { context } = await requireModule("realization.edit");
  if (str(fd, "versionId", 40) !== context.versionId) flashRedirect(LIST, { err: "Konteks anggaran berubah. Muat ulang halaman." });
  const item = str(fd, "itemId", 40);
  const date = str(fd, "date", 10);
  const amount = num(fd, "amount");
  const back = isUuid(item) ? `${LIST}?butir=${item}` : LIST;
  if (!isUuid(item)) flashRedirect(LIST, { err: "Pilih butir anggaran." });
  if (!str(fd, "description", 500)) flashRedirect(back, { err: "Uraian transaksi wajib diisi." });

  const supabase = await userClient();
  const available = await availableFor(supabase, context.versionId, item);
  if (available === null) flashRedirect(LIST, { err: "Butir anggaran tidak ditemukan atau bukan milik Anda." });
  // Duplikat: transaksi aktif dengan butir, tanggal, dan total pembayaran yang sama
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

  let id = "";
  let message = "";
  try {
    const { data, error } = await supabase.rpc("create_transaction", {
      p_version: context.versionId, p_item: item, p_date: date, p_description: str(fd, "description", 500),
      p_supplier: supplierId, p_method: uuidOrNull(fd, "method"), p_amount: amount,
    });
    if (error) message = friendlyError(error); else id = String(data);
  } catch { message = "Terjadi kesalahan pada sistem. Silakan coba lagi."; }
  if (message) flashRedirect(back, { err: message });

  if (str(fd, "intent", 10) === "submit") {
    let submitErr = "";
    try {
      const { error } = await supabase.rpc("submit_transaction", { p_tx: id });
      if (error) submitErr = friendlyError(error);
    } catch { submitErr = "Terjadi kesalahan pada sistem."; }
    if (submitErr) flashRedirect(detail(id), { err: `Transaksi tersimpan sebagai draf, tetapi belum dapat diajukan: ${submitErr}` });
    flashRedirect(detail(id), { ok: "Transaksi dibuat dan diajukan untuk verifikasi." });
  }
  flashRedirect(detail(id), { ok: "Transaksi draf dibuat. Tambahkan pembayaran bila perlu, lalu ajukan." });
}

function txId(fd: FormData): string {
  const id = str(fd, "txId", 40);
  if (!isUuid(id)) flashRedirect(LIST, { err: "Transaksi tidak valid." });
  return id;
}

export async function addPaymentAction(fd: FormData): Promise<void> {
  await requireModule("realization.edit");
  const id = txId(fd);
  const amount = num(fd, "amount");
  if (!Number.isFinite(amount) || amount <= 0) flashRedirect(detail(id), { err: "Nilai pembayaran harus lebih dari nol." });
  const supabase = await userClient();
  const { data: tx } = await supabase.from("realization_transactions").select("budget_version_id, budget_item_id").eq("id", id).maybeSingle();
  if (tx) {
    const available = await availableFor(supabase, tx.budget_version_id as string, tx.budget_item_id as string);
    if (available !== null && amount > available) flashRedirect(detail(id), { err: `Nilai melebihi sisa anggaran tersedia (Rp ${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2 }).format(Math.max(0, available))}).` });
  }
  return runAction(detail(id), "Pembayaran ditambahkan.", async () =>
    supabase.rpc("add_payment", { p_tx: id, p_amount: amount, p_note: optStr(fd, "note", 200) }),
  );
}

export async function submitTransactionAction(fd: FormData): Promise<void> {
  await requireModule("realization.submit");
  const id = txId(fd);
  const supabase = await userClient();
  return runAction(detail(id), "Transaksi diajukan untuk verifikasi.", async () => supabase.rpc("submit_transaction", { p_tx: id }));
}

export async function recordSp2dAction(fd: FormData): Promise<void> {
  await requireModule("realization.verify");
  const id = txId(fd);
  const payment = str(fd, "paymentId", 40);
  const date = str(fd, "date", 10);
  if (!isUuid(payment) || !DATE_RE.test(date)) flashRedirect(detail(id), { err: "Nomor dan tanggal SP2D wajib diisi dengan benar." });
  const supabase = await userClient();
  return runAction(detail(id), "SP2D dicatat.", async () =>
    supabase.rpc("record_sp2d", { p_payment: payment, p_number: str(fd, "number", 80), p_date: date }),
  );
}

export async function verifyTransactionAction(fd: FormData): Promise<void> {
  await requireModule("realization.verify");
  const id = txId(fd);
  const supabase = await userClient();
  return runAction(detail(id), "Transaksi diverifikasi dan tercatat sebagai realisasi.", async () => supabase.rpc("verify_transaction", { p_tx: id }));
}

export async function returnTransactionAction(fd: FormData): Promise<void> {
  await requireModule("realization.verify");
  const id = txId(fd);
  const supabase = await userClient();
  return runAction(detail(id), "Transaksi dikembalikan ke PPTK.", async () =>
    supabase.rpc("return_transaction", { p_tx: id, p_reason: str(fd, "reason", 300) }),
  );
}

export async function cancelTransactionAction(fd: FormData): Promise<void> {
  await requireModule("realization.view");
  const id = txId(fd);
  const supabase = await userClient();
  return runAction(detail(id), "Transaksi dibatalkan.", async () =>
    supabase.rpc("cancel_transaction", { p_tx: id, p_reason: str(fd, "reason", 300) }),
  );
}

export async function correctSp2dAction(fd: FormData): Promise<void> {
  await requireModule("realization.correct");
  const id = txId(fd);
  const payment = str(fd, "paymentId", 40);
  const date = str(fd, "date", 10);
  if (!isUuid(payment) || !DATE_RE.test(date)) flashRedirect(detail(id), { err: "Nomor dan tanggal SP2D wajib diisi dengan benar." });
  const supabase = await userClient();
  return runAction(detail(id), "SP2D dikoreksi dan alasan tercatat.", async () =>
    supabase.rpc("correct_sp2d", { p_payment: payment, p_number: str(fd, "number", 80), p_date: date, p_reason: str(fd, "reason", 300) }),
  );
}
