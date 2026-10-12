import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, Search } from "lucide-react";
import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { loadSuppliersMethods } from "@/lib/lookups";
import { STAGE_LABEL } from "@/lib/auth/context";
import { formatPercent, formatRupiah } from "@/lib/format";
import { loadBalanceRows } from "@/lib/realization-search";
import { filterBalance, filterOptions, totalsOf } from "@/lib/realization-search-core";
import { TX_STATUS } from "@/lib/status";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui/page";
import { cn } from "@/lib/utils";
import { availableOf } from "@/lib/tx-rules";
import { TransactionForm, type Recent, type TxItem } from "./transaction-form";

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

export default async function RealisasiPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; butir?: string; status?: string; q?: string; keg?: string; sub?: string; bel?: string; dana?: string; pptk?: string; cari?: string }> }) {
  const { user, context } = await requireModule("realization.view");
  const sp = await searchParams;
  const status = sp.status && TX_STATUS[sp.status] ? sp.status : "";
  const canCreate = user.permissions.has("realization.edit");
  const supabase = await userClient();

  let txQuery = supabase.from("realization_transactions")
    .select("id, transaction_date, description, status, budget_item_id, suppliers(name), payment_records(amount)")
    .eq("budget_version_id", context.versionId).order("transaction_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  if (status) txQuery = txQuery.eq("status", status);

  const [{ data: txRaw, error }, { data: itemsRaw }, opts, balance] = await Promise.all([
    txQuery,
    supabase.from("budget_item_versions")
      .select("budget_item_id, budget_items(pptk_id, description, sub_activities(code,name), expenditure_accounts(code))")
      .eq("budget_version_id", context.versionId).limit(2000),
    canCreate ? loadSuppliersMethods(supabase) : Promise.resolve(null),
    loadBalanceRows(supabase, context.versionId),
  ]);
  const sisaOf = new Map(balance.rows.map((r) => [r.itemId, r.sisa]));
  const fparams = { keg: sp.keg ?? "", sub: sp.sub ?? "", bel: sp.bel ?? "", dana: sp.dana ?? "", pptk: sp.pptk ?? "", cari: sp.cari ?? "" };
  const found = filterBalance(balance.rows, fparams);
  const opt = filterOptions(balance.rows);
  const tot = totalsOf(found);
  const exportQs = new URLSearchParams(Object.entries(fparams).filter(([, v]) => v)).toString();
  const items = new Map(((itemsRaw ?? []) as unknown as ItemRow[]).map((i) => [i.budget_item_id, i.budget_items]));
  const myItems = ((itemsRaw ?? []) as unknown as ItemRow[]).filter((i) => i.budget_items?.pptk_id === user.id);
  const myIds = new Set(myItems.map((i) => i.budget_item_id));
  const txItems: TxItem[] = balance.rows.filter((r) => myIds.has(r.itemId)).map((r) => ({
    id: r.itemId, subCode: r.subCode, subName: r.subName, accountCode: r.accountCode, accountName: r.accountName, funding: r.funding,
    description: r.description, pagu: r.pagu, realisasi: r.realisasi, pending: r.pending, available: availableOf(r.pagu, r.realisasi, r.pending),
  }));
  const recent: Recent[] = ((txRaw ?? []) as unknown as Tx[]).filter((t) => t.status !== "cancelled")
    .map((t) => ({ itemId: t.budget_item_id, date: t.transaction_date, amount: t.payment_records.reduce((a, p) => a + Number(p.amount), 0) }));
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

      {!canCreate && (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-900">Transaksi baru dibuat oleh <b>PPTK</b> dari butir anggaran yang ditugaskan kepadanya. Admin menugaskan PPTK pada menu <Link href="/anggaran" className="font-semibold underline">Input Anggaran</Link> (Ubah → PPTK); PPK/verifikator memeriksa dan mencatat SP2D pada detail transaksi.</p>
      )}

      {canCreate && opts && (
        <Card id="form">
          <details open={!!sp.butir || !!sp.err}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-semibold text-navy-800 [&::-webkit-details-marker]:hidden"><Plus size={16} aria-hidden /> Buat transaksi baru</summary>
            {txItems.length === 0 ? (
              <p className="border-t border-slate-100 px-5 py-4 text-sm text-slate-600">Belum ada butir anggaran yang ditugaskan kepada Anda pada konteks ini.</p>
            ) : (
              <TransactionForm versionId={context.versionId} year={context.year} items={txItems} recent={recent} suppliers={opts.suppliers} methods={opts.methods} preselect={sp.butir ?? ""} />
            )}
          </details>
        </Card>
      )}

      <Card>
        <CardHeader
          title={`Pencarian Realisasi & Sisa Anggaran (${found.length} butir)`}
          description="Cari menurut kegiatan, sub kegiatan, belanja, sumber dana, atau PPTK. Realisasi sah = SP2D bertanggal; menunggu SP2D dan komitmen tidak dihitung."
          actions={<>
            <a href={`/realisasi/export?format=xlsx&${exportQs}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}><Download size={14} aria-hidden /> Excel</a>
            <a href={`/realisasi/export?format=csv&${exportQs}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}><Download size={14} aria-hidden /> CSV</a>
          </>}
        />
        <form action="/realisasi" className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-3">
          {status && <input type="hidden" name="status" value={status} />}{sp.q && <input type="hidden" name="q" value={sp.q} />}
          <Field label="Kegiatan" htmlFor="f-keg"><Select id="f-keg" name="keg" defaultValue={fparams.keg}><option value="">Semua kegiatan</option>{opt.keg.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Field label="Sub kegiatan" htmlFor="f-sub"><Select id="f-sub" name="sub" defaultValue={fparams.sub}><option value="">Semua sub kegiatan</option>{opt.sub.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Field label="Belanja (rekening)" htmlFor="f-bel"><Select id="f-bel" name="bel" defaultValue={fparams.bel}><option value="">Semua rekening belanja</option>{opt.bel.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Field label="Sumber dana" htmlFor="f-dana"><Select id="f-dana" name="dana" defaultValue={fparams.dana}><option value="">Semua sumber dana</option>{opt.dana.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Field label="PPTK" htmlFor="f-pptk"><Select id="f-pptk" name="pptk" defaultValue={fparams.pptk}><option value="">Semua PPTK</option>{opt.pptk.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}<option value="none">Belum ditugaskan</option></Select></Field>
          <Field label="Kata kunci" htmlFor="f-cari"><Input id="f-cari" name="cari" defaultValue={fparams.cari} placeholder="uraian, kode, nama" maxLength={60} /></Field>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
            <button className={buttonVariants({ variant: "primary" })}><Search size={16} aria-hidden /> Cari</button>
            <Link href="/realisasi" className={buttonVariants({ variant: "outline" })}>Atur ulang</Link>
          </div>
        </form>
        {balance.error ? <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman atau hubungi administrator.</EmptyState>
          : found.length === 0 ? <EmptyState title="Tidak ada butir yang cocok">Ubah atau atur ulang filter pencarian.</EmptyState>
          : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Sub kegiatan</th><th>Rekening</th><th>Sumber dana</th><th>PPTK</th><th className="text-right">Pagu</th><th className="text-right">Realisasi</th><th className="text-right">Menunggu SP2D</th><th className="text-right">Sisa anggaran</th><th className="text-right">%</th>{canCreate && <th className="no-print" />}</tr></thead>
              <tbody>
                {found.map((r) => (
                  <tr key={r.itemId}>
                    <td><span className="font-mono text-xs text-slate-500">{r.subCode}</span><br />{r.subName}</td>
                    <td><span className="font-mono text-xs text-slate-500">{r.accountCode}</span><br />{r.accountName}</td>
                    <td>{r.funding || "—"}</td><td>{r.pptk || "—"}</td>
                    <td className="num">{formatRupiah(r.pagu)}</td><td className="num">{formatRupiah(r.realisasi)}</td>
                    <td className="num">{r.pending ? formatRupiah(r.pending) : "—"}</td>
                    <td className={cn("num font-semibold", r.sisa < 0 && "text-red-700")}>{formatRupiah(r.sisa)}</td>
                    <td className="num">{formatPercent(r.pct)}</td>
                    {canCreate && <td className="no-print text-right">{myIds.has(r.itemId) ? <Link href={`/realisasi?butir=${r.itemId}#form`} className={buttonVariants({ variant: "outline", size: "sm" })}>Buat transaksi</Link> : null}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-50 font-bold"><td colSpan={4} className="px-3 py-3 text-right">TOTAL ({found.length} butir)</td><td className="num px-3 py-3">{formatRupiah(tot.pagu)}</td><td className="num px-3 py-3">{formatRupiah(tot.realisasi)}</td><td className="num px-3 py-3">{formatRupiah(tot.pending)}</td><td className="num px-3 py-3">{formatRupiah(tot.sisa)}</td><td className="num px-3 py-3">{formatPercent(tot.pct)}</td>{canCreate && <td className="no-print" />}</tr></tfoot>
            </table>
          </TableWrap>
        )}
      </Card>

      <Card>
        <CardHeader
          title={`Transaksi (${txs.length})`}
          actions={
            <form action="/realisasi" className="flex flex-wrap gap-2">
              {Object.entries(fparams).map(([k, v]) => v ? <input key={k} type="hidden" name={k} value={v} /> : null)}
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
