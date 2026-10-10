import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/action-utils";
import { formatDateTimeWIB, formatRupiah } from "@/lib/format";
import { TX_STATUS } from "@/lib/status";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Flash, PageHeader, TableWrap } from "@/components/ui/page";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/submit-button";
import {
  addPaymentAction, cancelTransactionAction, correctSp2dAction, recordSp2dAction, returnTransactionAction,
  submitTransactionAction, verifyTransactionAction,
} from "../actions";

export const metadata: Metadata = { title: "Detail Transaksi" };
export const dynamic = "force-dynamic";

interface Sp2d { sp2d_number: string; sp2d_date: string | null; voided_at: string | null }
interface Pay { id: string; amount: string | number; payment_note: string | null; created_at: string; sp2d_records: Sp2d | Sp2d[] | null }

export default async function TransactionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { user } = await requireModule("realization.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const supabase = await userClient();

  const { data: tx } = await supabase.from("realization_transactions")
    .select("id, transaction_date, description, status, cancel_reason, budget_item_id, created_by, suppliers(name), procurement_methods(name), payment_records(id, amount, payment_note, created_at, sp2d_records(sp2d_number, sp2d_date, voided_at))")
    .eq("id", id).maybeSingle();
  if (!tx) notFound();
  const { data: events } = await supabase.from("workflow_events").select("id, from_status, to_status, reason, occurred_at")
    .eq("entity_type", "realization_transactions").eq("entity_id", id).order("occurred_at");
  const { data: item } = await supabase.from("budget_items").select("description, sub_activities(code,name), expenditure_accounts(code,name)").eq("id", tx.budget_item_id).maybeSingle();

  const payments = (tx.payment_records ?? []) as unknown as Pay[];
  const sp2dOf = (p: Pay): Sp2d | null => (Array.isArray(p.sp2d_records) ? p.sp2d_records[0] ?? null : p.sp2d_records);
  const total = payments.reduce((s, p) => s + Number(p.amount), 0);
  const st = TX_STATUS[tx.status] ?? { label: tx.status, tone: "slate" as const };
  const perms = user.permissions;
  const isOwnerEditor = perms.has("realization.edit") && tx.created_by === user.id && (tx.status === "draft" || tx.status === "returned");
  const inVerification = tx.status === "submitted" || tx.status === "payment_processing";
  const canVerify = perms.has("realization.verify") && inVerification;
  const canCorrect = perms.has("realization.correct") && tx.status === "realisasi";
  const canCancel = tx.status !== "cancelled" && ((perms.has("realization.verify") && tx.status !== "realisasi") || canCorrect);
  const it = item as unknown as { description: string | null; sub_activities: { code: string; name: string } | null; expenditure_accounts: { code: string; name: string } | null } | null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/realisasi" className="no-print inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-700"><ArrowLeft size={14} aria-hidden /> Kembali ke daftar</Link>
      <PageHeader eyebrow="Transaksi realisasi" title={tx.description} actions={<Badge tone={st.tone} className="px-3 py-1 text-sm">{st.label}</Badge>} />
      <Flash ok={sp.ok} err={sp.err} />

      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Tanggal", new Date(tx.transaction_date).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })],
          ["Butir anggaran", `${it?.sub_activities?.code ?? ""} · ${it?.expenditure_accounts?.code ?? ""}`],
          ["Penyedia", (tx.suppliers as unknown as { name: string } | null)?.name ?? "—"],
          ["Metode", (tx.procurement_methods as unknown as { name: string } | null)?.name ?? "—"],
        ].map(([l, v]) => <div key={l}><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{l}</p><p className="mt-0.5 text-sm font-medium text-slate-900">{v}</p></div>)}
        {tx.cancel_reason && <p className="sm:col-span-2 lg:col-span-4 rounded-lg bg-slate-100 px-3 py-2 text-sm">Alasan pembatalan: {tx.cancel_reason}</p>}
      </Card>

      <Card>
        <CardHeader title="Pembayaran & SP2D" description={`Total pembayaran: ${formatRupiah(total)}`} />
        <TableWrap>
          <table className="table-base">
            <thead><tr><th>Keterangan</th><th className="text-right">Nilai</th><th>SP2D</th>{(canVerify || canCorrect) && <th>Catat / koreksi</th>}</tr></thead>
            <tbody>
              {payments.map((p) => {
                const s = sp2dOf(p);
                return (
                  <tr key={p.id}>
                    <td>{p.payment_note ?? "Pembayaran"}<span className="block text-xs text-slate-500">{formatDateTimeWIB(p.created_at)}</span></td>
                    <td className="num font-medium">{formatRupiah(p.amount)}</td>
                    <td>{s ? <><span className="font-mono text-[13px]">{s.sp2d_number}</span><span className="block text-xs text-slate-500">{s.sp2d_date ? new Date(s.sp2d_date).toLocaleDateString("id-ID", { timeZone: "UTC" }) : "tanpa tanggal"}</span></> : <Badge tone="amber">Belum ada</Badge>}</td>
                    {(canVerify || canCorrect) && (
                      <td>
                        <form action={canCorrect ? correctSp2dAction : recordSp2dAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="txId" value={id} /><input type="hidden" name="paymentId" value={p.id} />
                          <Input name="number" required maxLength={80} placeholder="No. SP2D" aria-label="Nomor SP2D" defaultValue={s?.sp2d_number} className="h-9 w-36" />
                          <Input name="date" type="date" required aria-label="Tanggal SP2D" defaultValue={s?.sp2d_date ?? ""} className="h-9 w-36" />
                          {canCorrect && <Input name="reason" required maxLength={300} placeholder="Alasan koreksi" aria-label="Alasan koreksi" className="h-9 w-44" />}
                          <SubmitButton size="sm" variant="soft">{canCorrect ? "Koreksi" : "Simpan"}</SubmitButton>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>

        {isOwnerEditor && (
          <div className="space-y-4 border-t border-slate-100 p-5">
            <form action={addPaymentAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="txId" value={id} />
              <Field label="Tambah pembayaran (Rp)" htmlFor="amount"><Input id="amount" name="amount" type="number" min={0.01} step="0.01" required className="w-44" /></Field>
              <Field label="Keterangan" htmlFor="note"><Input id="note" name="note" maxLength={200} placeholder="mis. Termin 2" className="w-56" /></Field>
              <SubmitButton variant="outline">Tambah</SubmitButton>
            </form>
            <form action={submitTransactionAction}>
              <input type="hidden" name="txId" value={id} />
              <ConfirmSubmit variant="accent" message="Ajukan transaksi ini untuk diverifikasi? Setelah diajukan tidak dapat diubah.">Ajukan untuk verifikasi</ConfirmSubmit>
            </form>
          </div>
        )}

        {canVerify && (
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 p-5">
            <form action={verifyTransactionAction}>
              <input type="hidden" name="txId" value={id} />
              <ConfirmSubmit variant="primary" message="Verifikasi transaksi ini sebagai realisasi? Seluruh pembayaran harus sudah memiliki SP2D bertanggal.">Verifikasi sebagai realisasi</ConfirmSubmit>
            </form>
            <form action={returnTransactionAction} className="flex gap-2">
              <input type="hidden" name="txId" value={id} />
              <Input name="reason" required maxLength={300} placeholder="Alasan pengembalian" aria-label="Alasan pengembalian" className="h-10 w-64" />
              <SubmitButton variant="outline">Kembalikan ke PPTK</SubmitButton>
            </form>
          </div>
        )}
        {canCancel && (
          <form action={cancelTransactionAction} className="flex flex-wrap gap-2 border-t border-slate-100 p-5">
            <input type="hidden" name="txId" value={id} />
            <Input name="reason" required maxLength={300} placeholder={tx.status === "realisasi" ? "Alasan pembatalan transaksi final" : "Alasan pembatalan"} aria-label="Alasan pembatalan" className="h-10 w-72" />
            <ConfirmSubmit variant="danger" message="Batalkan transaksi ini? Tindakan tercatat pada riwayat dan tidak dapat diurungkan.">Batalkan transaksi</ConfirmSubmit>
          </form>
        )}
      </Card>

      <Card>
        <CardHeader title="Riwayat status" description="Dicatat otomatis oleh sistem dan tidak dapat diubah." />
        <ol className="divide-y divide-slate-100">
          {(events ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <span className="text-slate-500">{formatDateTimeWIB(e.occurred_at)}</span>
              <span>{e.from_status ? `${TX_STATUS[e.from_status]?.label ?? e.from_status} → ` : ""}<b>{TX_STATUS[e.to_status]?.label ?? e.to_status}</b></span>
              {e.reason && <span className="text-slate-600">— {e.reason}</span>}
            </li>
          ))}
          {(events ?? []).length === 0 && <li className="px-5 py-4 text-sm text-slate-500">Belum ada riwayat.</li>}
        </ol>
      </Card>
    </div>
  );
}
