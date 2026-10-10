"use server";

import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { flashRedirect } from "@/lib/flash";
import { friendlyError, isUuid, num, optStr, runAction, str, uuidOrNull } from "@/lib/action-utils";

const LIST = "/realisasi";
const detail = (id: string) => `/realisasi/${id}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function createTransactionAction(fd: FormData): Promise<void> {
  const { context } = await requireModule("realization.edit");
  if (str(fd, "versionId", 40) !== context.versionId) flashRedirect(LIST, { err: "Konteks anggaran berubah. Muat ulang halaman." });
  const item = str(fd, "itemId", 40);
  const date = str(fd, "date", 10);
  const amount = num(fd, "amount");
  if (!isUuid(item)) flashRedirect(LIST, { err: "Pilih butir anggaran." });
  if (!DATE_RE.test(date)) flashRedirect(LIST, { err: "Tanggal transaksi tidak valid." });
  if (!Number.isFinite(amount) || amount <= 0) flashRedirect(LIST, { err: "Nilai pembayaran harus lebih dari nol." });

  const supabase = await userClient();
  let id = "";
  let message = "";
  try {
    const { data, error } = await supabase.rpc("create_transaction", {
      p_version: context.versionId, p_item: item, p_date: date, p_description: str(fd, "description", 500),
      p_supplier: uuidOrNull(fd, "supplier"), p_method: uuidOrNull(fd, "method"), p_amount: amount,
    });
    if (error) message = friendlyError(error); else id = String(data);
  } catch { message = "Terjadi kesalahan pada sistem. Silakan coba lagi."; }
  if (message) flashRedirect(LIST, { err: message });
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
