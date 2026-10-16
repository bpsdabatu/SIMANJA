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
import { Input } from "@/components/ui/input";
import { Flash, PageHeader } from "@/components/ui/page";
import { ConfirmSubmit, SubmitButton } from "@/components/ui/submit-button";
import { cancelTransactionAction, correctDatesAction } from "../actions";

export const metadata: Metadata = { title: "Detail Realisasi" };
export const dynamic = "force-dynamic";

interface Sp2d { sp2d_number: string | null; sp2d_date: string | null; voided_at: string | null }
interface Pay { id: string; amount: string | number; sp2d_records: Sp2d | Sp2d[] | null }

const fmtDate = (d: string, long = false) => new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: long ? "long" : "short", year: "numeric", timeZone: "UTC" });

export default async function TransactionDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { user } = await requireModule("realization.view");
  const { id } = await params;
  const sp = await searchParams;
  if (!isUuid(id)) notFound();
  const supabase = await userClient();

  const { data: tx } = await supabase.from("realization_transactions")
    .select("id, transaction_date, description, status, cancel_reason, budget_item_id, suppliers(name), procurement_methods(name), payment_records(id, amount, sp2d_records(sp2d_number, sp2d_date, voided_at))")
    .eq("id", id).maybeSingle();
  if (!tx) notFound();
  const { data: events } = await supabase.from("workflow_events").select("id, from_status, to_status, reason, occurred_at")
    .eq("entity_type", "realization_transactions").eq("entity_id", id).order("occurred_at");
  const { data: item } = await supabase.from("budget_items").select("description, sub_activities(code,name), expenditure_accounts(code,name)").eq("id", tx.budget_item_id).maybeSingle();

  const payments = (tx.payment_records ?? []) as unknown as Pay[];
  const sp2dOf = (p: Pay): Sp2d | null => (Array.isArray(p.sp2d_records) ? p.sp2d_records[0] ?? null : p.sp2d_records);
  const total = payments.reduce((s, p) => s + Number(p.amount), 0);
  const sp2dDate = sp2dOf(payments[0] ?? ({} as Pay))?.sp2d_date ?? tx.transaction_date;
  const st = TX_STATUS[tx.status] ?? { label: tx.status, tone: "slate" as const };
  const perms = user.permissions;
  const canCorrect = perms.has("realization.correct") && tx.status === "realisasi";
  const canCancel = perms.has("realization.correct") && tx.status !== "cancelled";
  const it = item as unknown as { description: string | null; sub_activities: { code: string; name: string } | null; expenditure_accounts: { code: string; name: string } | null } | null;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Link href="/realisasi" className="no-print inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-700"><ArrowLeft size={14} aria-hidden /> Kembali ke Input Realisasi</Link>
      <PageHeader eyebrow="Realisasi belanja" title={tx.description} actions={<Badge tone={tx.status === "realisasi" ? "green" : st.tone} className="px-3 py-1 text-sm">{tx.status === "realisasi" ? "Tercatat" : st.label}</Badge>} />
      <Flash ok={sp.ok} err={sp.err} />

      <Card className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Tanggal transaksi", fmtDate(tx.transaction_date, true)],
          ["Tanggal SP2D", fmtDate(sp2dDate, true)],
          ["Nilai realisasi", formatRupiah(total)],
          ["Butir anggaran", `${it?.sub_activities?.code ?? ""} · ${it?.expenditure_accounts?.code ?? ""} ${it?.expenditure_accounts?.name ?? ""}`],
          ["Sub kegiatan", it?.sub_activities?.name ?? "—"],
          ["Penyedia", (tx.suppliers as unknown as { name: string } | null)?.name ?? "—"],
          ["Metode pengadaan", (tx.procurement_methods as unknown as { name: string } | null)?.name ?? "—"],
        ].map(([l, v]) => <div key={l}><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{l}</p><p className="mt-0.5 text-sm font-medium text-slate-900">{v}</p></div>)}
        {payments.some((p) => sp2dOf(p)?.sp2d_number) && (
          <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-3">No. SP2D (data lama): {payments.map((p) => sp2dOf(p)?.sp2d_number).filter(Boolean).join(", ")}</p>
        )}
        {tx.cancel_reason && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm sm:col-span-2 lg:col-span-3">Alasan pembatalan: {tx.cancel_reason}</p>}
      </Card>

      {(canCorrect || canCancel) && (
        <Card>
          <CardHeader title="Koreksi" description="Hanya Admin. Koreksi mewajibkan alasan; perubahan data tercatat di Log Audit." />
          {canCorrect && (
            <form action={correctDatesAction} className="flex flex-wrap items-end gap-2 border-b border-slate-100 p-5">
              <input type="hidden" name="txId" value={id} />
              <label className="text-sm font-medium text-slate-700">Tanggal transaksi
                <Input name="txDate" type="date" required defaultValue={tx.transaction_date} className="mt-1 h-10 w-44" />
              </label>
              <label className="text-sm font-medium text-slate-700">Tanggal SP2D
                <Input name="date" type="date" required defaultValue={sp2dDate} className="mt-1 h-10 w-44" />
              </label>
              <Input name="reason" required maxLength={300} placeholder="Alasan koreksi" aria-label="Alasan koreksi" className="h-10 w-64" />
              <SubmitButton variant="outline">Koreksi tanggal</SubmitButton>
            </form>
          )}
          {canCancel && (
            <form action={cancelTransactionAction} className="flex flex-wrap gap-2 p-5">
              <input type="hidden" name="txId" value={id} />
              <Input name="reason" required maxLength={300} placeholder="Alasan pembatalan" aria-label="Alasan pembatalan" className="h-10 w-72" />
              <ConfirmSubmit variant="danger" message="Batalkan realisasi ini? Nilainya tidak lagi dihitung sebagai realisasi. Tindakan tercatat pada riwayat dan tidak dapat diurungkan.">Batalkan realisasi</ConfirmSubmit>
            </form>
          )}
        </Card>
      )}

      <Card>
        <CardHeader title="Riwayat" description="Dicatat otomatis oleh sistem dan tidak dapat diubah." />
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
