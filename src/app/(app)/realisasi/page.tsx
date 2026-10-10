import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { loadSuppliersMethods } from "@/lib/lookups";
import { STAGE_LABEL } from "@/lib/auth/context";
import { formatRupiah } from "@/lib/format";
import { TX_STATUS } from "@/lib/status";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui/page";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { createTransactionAction } from "./actions";

export const metadata: Metadata = { title: "Realisasi Belanja" };
export const dynamic = "force-dynamic";

interface Tx {
  id: string; transaction_date: string; description: string; status: string; budget_item_id: string;
  suppliers: { name: string } | null; payment_records: { amount: string | number }[];
}
interface ItemRow {
  budget_item_id: string;
  budget_items: { pptk_id: string | null; description: string | null; sub_activities: { code: string; name: string } | null; expenditure_accounts: { code: string } | null } | null;
}

export default async function RealisasiPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; status?: string; q?: string }> }) {
  const { user, context } = await requireModule("realization.view");
  const sp = await searchParams;
  const status = sp.status && TX_STATUS[sp.status] ? sp.status : "";
  const canCreate = user.permissions.has("realization.edit");
  const supabase = await userClient();

  let txQuery = supabase.from("realization_transactions")
    .select("id, transaction_date, description, status, budget_item_id, suppliers(name), payment_records(amount)")
    .eq("budget_version_id", context.versionId).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (status) txQuery = txQuery.eq("status", status);

  const [{ data: txRaw, error }, { data: itemsRaw }, opts] = await Promise.all([
    txQuery,
    supabase.from("budget_item_versions")
      .select("budget_item_id, budget_items(pptk_id, description, sub_activities(code,name), expenditure_accounts(code))")
      .eq("budget_version_id", context.versionId).limit(2000),
    canCreate ? loadSuppliersMethods(supabase) : Promise.resolve(null),
  ]);
  const items = new Map(((itemsRaw ?? []) as unknown as ItemRow[]).map((i) => [i.budget_item_id, i.budget_items]));
  const myItems = ((itemsRaw ?? []) as unknown as ItemRow[]).filter((i) => i.budget_items?.pptk_id === user.id);
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const txs = ((txRaw ?? []) as unknown as Tx[]).filter((t) => !q || t.description.toLowerCase().includes(q) || (t.suppliers?.name ?? "").toLowerCase().includes(q));
  const sum = (t: Tx) => t.payment_records.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow={`TA ${context.year} · ${STAGE_LABEL[context.stage]}`}
        title="Realisasi Belanja"
        description="Transaksi, pembayaran, dan SP2D. Sebuah transaksi baru dihitung sebagai realisasi setelah diverifikasi dan seluruh pembayarannya memiliki SP2D bertanggal."
      />
      <Flash ok={sp.ok} err={sp.err} />

      {canCreate && opts && (
        <Card>
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold text-navy-800 [&::-webkit-details-marker]:hidden"><Plus size={16} aria-hidden /> Buat transaksi baru</summary>
            {myItems.length === 0 ? (
              <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-600">Belum ada butir anggaran yang ditugaskan kepada Anda pada konteks ini.</p>
            ) : (
              <form action={createTransactionAction} className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2">
                <input type="hidden" name="versionId" value={context.versionId} />
                <Field label="Butir anggaran" htmlFor="itemId" className="sm:col-span-2">
                  <Select id="itemId" name="itemId" required defaultValue="">
                    <option value="" disabled>Pilih butir anggaran</option>
                    {myItems.map((i) => <option key={i.budget_item_id} value={i.budget_item_id}>{i.budget_items?.sub_activities?.code} · {i.budget_items?.expenditure_accounts?.code}{i.budget_items?.description ? ` · ${i.budget_items.description}` : ""}</option>)}
                  </Select>
                </Field>
                <Field label="Tanggal transaksi" htmlFor="date"><Input id="date" name="date" type="date" required /></Field>
                <Field label="Nilai pembayaran (Rp)" htmlFor="amount"><Input id="amount" name="amount" type="number" min={0.01} step="0.01" required inputMode="decimal" /></Field>
                <Field label="Uraian" htmlFor="description" className="sm:col-span-2"><Input id="description" name="description" required maxLength={500} /></Field>
                <Field label="Penyedia" htmlFor="supplier"><Select id="supplier" name="supplier" defaultValue=""><option value="">— Tanpa penyedia —</option>{opts.suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
                <Field label="Metode pengadaan" htmlFor="method"><Select id="method" name="method" defaultValue=""><option value="">— Tidak ada —</option>{opts.methods.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
                <div className="sm:col-span-2"><SubmitButton pendingText="Menyimpan...">Simpan sebagai draf</SubmitButton></div>
              </form>
            )}
          </details>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`Transaksi (${txs.length})`}
          actions={
            <form action="/realisasi" className="flex flex-wrap gap-2">
              <Select name="status" defaultValue={status} aria-label="Filter status" className="h-9 w-44">
                <option value="">Semua status</option>
                {Object.entries(TX_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
              <Input name="q" defaultValue={sp.q ?? ""} placeholder="Cari uraian / penyedia" aria-label="Cari" className="h-9 w-48" />
              <button className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}>Terapkan</button>
            </form>
          }
        />
        {error ? <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman atau hubungi administrator.</EmptyState>
          : txs.length === 0 ? <EmptyState title="Belum ada transaksi">{canCreate ? "Buat transaksi pertama dari butir anggaran Anda." : "Tidak ada transaksi yang cocok."}</EmptyState>
          : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Tanggal</th><th>Uraian</th><th>Butir</th><th>Penyedia</th><th className="text-right">Nilai</th><th>Status</th></tr></thead>
              <tbody>
                {txs.map((t) => {
                  const it = items.get(t.budget_item_id);
                  const st = TX_STATUS[t.status] ?? { label: t.status, tone: "slate" as const };
                  return (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap">{new Date(t.transaction_date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</td>
                      <td><Link href={`/realisasi/${t.id}`} className="font-medium text-navy-700 hover:underline">{t.description}</Link></td>
                      <td className="text-xs text-slate-600"><span className="font-mono">{it?.sub_activities?.code}</span> · {it?.expenditure_accounts?.code}</td>
                      <td>{t.suppliers?.name ?? "—"}</td>
                      <td className="num font-medium">{formatRupiah(sum(t))}</td>
                      <td><Badge tone={st.tone}>{st.label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}
