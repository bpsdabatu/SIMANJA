import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { getOrganizationName } from "@/lib/lookups";
import { loadReport, sumRows, type ReportRow } from "@/lib/reports";
import { STAGE_LABEL } from "@/lib/auth/context";
import { formatPercent, formatRupiah } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Flash, PageHeader, TableWrap } from "@/components/ui/page";
import { PrintButton } from "@/components/ui/submit-button";
import { PrintFooter, PrintHeader, SignatureBlock } from "@/components/ui/report";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rekapitulasi" };
export const dynamic = "force-dynamic";

export default async function RekapPage({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; err?: string }> }) {
  const { user, context } = await requireModule("recap.view");
  const sp = await searchParams;
  const supabase = await userClient();
  const [{ rows: all, error }, org] = await Promise.all([loadReport(supabase, context.versionId), getOrganizationName(supabase, user.organizationId)]);
  const q = (sp.q ?? "").trim().toLowerCase().slice(0, 60);
  const rows = q ? all.filter((r) => [r.subCode, r.subName, r.accountCode, r.accountName, r.pptk, r.description].some((x) => x.toLowerCase().includes(q))) : all;
  const t = sumRows(rows);
  const groups = new Map<string, ReportRow[]>();
  for (const r of rows) { const k = `${r.subCode}|${r.subName}`; (groups.get(k) ?? groups.set(k, []).get(k)!).push(r); }
  const sub = `Tahun Anggaran ${context.year} — ${STAGE_LABEL[context.stage]}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PrintHeader orgName={org} title="Rekapitulasi Anggaran dan Realisasi" subtitle={sub} />
      <PageHeader
        eyebrow={sub}
        title="Rekapitulasi"
        description="Pagu, realisasi sah (SP2D bertanggal), transaksi menunggu SP2D, dan komitmen kontrak ditampilkan terpisah per butir anggaran."
        actions={<>
          {user.permissions.has("recap.export") && (
            <a href={`/rekapitulasi/export?q=${encodeURIComponent(sp.q ?? "")}`} className={buttonVariants({ variant: "outline" })}><Download size={16} aria-hidden /> Unduh CSV</a>
          )}
          <PrintButton />
        </>}
      />
      <Flash ok={sp.ok} err={sp.err} />

      <div className="no-print grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[["Pagu", formatRupiah(t.pagu)], ["Realisasi", formatRupiah(t.realisasi)], ["Sisa", formatRupiah(t.sisa)], ["Persentase", formatPercent(t.pct)]].map(([l, v]) => (
          <Card key={l} className="p-5"><p className="text-sm text-slate-600">{l}</p><p className="mt-1 font-display text-xl font-bold tabular-nums text-navy-900">{v}</p></Card>
        ))}
      </div>

      <Card>
        <form action="/rekapitulasi" className="no-print flex gap-2 border-b border-slate-100 p-4">
          <Input name="q" defaultValue={sp.q ?? ""} placeholder="Cari sub kegiatan / rekening / PPTK" aria-label="Cari" className="h-9 max-w-sm" />
          <button className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-9")}>Cari</button>
        </form>
        {error ? <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman atau hubungi administrator.</EmptyState>
          : rows.length === 0 ? <EmptyState title="Tidak ada data">Belum ada butir anggaran pada konteks ini atau tidak cocok dengan pencarian.</EmptyState>
          : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Sub kegiatan / rekening</th><th>PPTK</th><th className="text-right">Pagu</th><th className="text-right">Realisasi</th><th className="text-right">Menunggu SP2D</th><th className="text-right">Komitmen</th><th className="text-right">Sisa</th><th className="text-right">%</th></tr></thead>
              <tbody>
                {[...groups.entries()].map(([key, list]) => {
                  const [code, name] = key.split("|");
                  const g = sumRows(list);
                  return [
                    <tr key={key} className="bg-navy-50/70">
                      <td colSpan={2} className="font-semibold text-navy-900"><span className="font-mono text-[13px]">{code}</span> {name}</td>
                      <td className="num font-semibold">{formatRupiah(g.pagu)}</td><td className="num font-semibold">{formatRupiah(g.realisasi)}</td>
                      <td className="num font-semibold">{formatRupiah(g.pending)}</td><td className="num font-semibold">{formatRupiah(g.komitmen)}</td>
                      <td className="num font-semibold">{formatRupiah(g.sisa)}</td><td className="num font-semibold">{formatPercent(g.pct)}</td>
                    </tr>,
                    ...list.map((r) => (
                      <tr key={r.itemId}>
                        <td className="pl-6"><span className="font-mono text-[13px] text-slate-500">{r.accountCode}</span> {r.accountName}{r.description && <span className="block text-xs text-slate-500">{r.description}</span>}</td>
                        <td>{r.pptk || "—"}</td>
                        <td className="num">{formatRupiah(r.pagu)}</td><td className="num">{formatRupiah(r.realisasi)}</td>
                        <td className="num">{formatRupiah(r.pending)}</td><td className="num">{formatRupiah(r.komitmen)}</td>
                        <td className={cn("num", r.sisa < 0 && "font-semibold text-red-700")}>{formatRupiah(r.sisa)}</td><td className="num">{formatPercent(r.pct)}</td>
                      </tr>
                    )),
                  ];
                })}
              </tbody>
              <tfoot><tr className="bg-slate-50 font-bold">
                <td colSpan={2} className="px-3 py-3 text-right">TOTAL</td>
                <td className="num px-3 py-3">{formatRupiah(t.pagu)}</td><td className="num px-3 py-3">{formatRupiah(t.realisasi)}</td>
                <td className="num px-3 py-3">{formatRupiah(t.pending)}</td><td className="num px-3 py-3">{formatRupiah(t.komitmen)}</td>
                <td className="num px-3 py-3">{formatRupiah(t.sisa)}</td><td className="num px-3 py-3">{formatPercent(t.pct)}</td>
              </tr></tfoot>
            </table>
          </TableWrap>
        )}
      </Card>
      <SignatureBlock />
      <PrintFooter />
    </div>
  );
}
