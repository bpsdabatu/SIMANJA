import type { Metadata } from "next";
import { Download } from "lucide-react";
import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { getOrganizationName } from "@/lib/lookups";
import { isIsoDate, loadReport, sumRows } from "@/lib/reports";
import { buildLra } from "@/lib/lra";
import { STAGE_LABEL } from "@/lib/auth/context";
import { formatPercent, formatRupiah } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, PageHeader, TableWrap } from "@/components/ui/page";
import { PrintButton } from "@/components/ui/submit-button";
import { PrintFooter, PrintHeader, SignatureBlock } from "@/components/ui/report";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Laporan Realisasi Anggaran" };
export const dynamic = "force-dynamic";

const INDENT = ["pl-3", "pl-7", "pl-11", "pl-16"];
const WEIGHT = ["font-bold bg-navy-100/60", "font-semibold bg-navy-50/80", "font-semibold", ""];

export default async function LraPage({ searchParams }: { searchParams: Promise<{ sampai?: string }> }) {
  const { user, context } = await requireModule("lra.view");
  const sp = await searchParams;
  const until = isIsoDate(sp.sampai) ? sp.sampai : null;
  const supabase = await userClient();
  const [{ rows, error }, org] = await Promise.all([loadReport(supabase, context.versionId, { until }), getOrganizationName(supabase, user.organizationId)]);
  const lines = buildLra(rows);
  const t = sumRows(rows);
  const periode = until ? `s.d. ${new Date(until).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}` : "s.d. saat ini";
  const sub = `Tahun Anggaran ${context.year} — ${STAGE_LABEL[context.stage]} — ${periode}`;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PrintHeader orgName={org} title="Laporan Realisasi Anggaran" subtitle={sub} />
      <PageHeader
        eyebrow={sub}
        title="Laporan Realisasi Anggaran"
        description="Realisasi hanya dari transaksi terverifikasi dengan SP2D bertanggal pada atau sebelum tanggal batas. Siap diunduh (CSV) atau dicetak ke PDF/kertas."
        actions={<>
          {user.permissions.has("lra.export") && (
            <a href={`/lra/export${until ? `?sampai=${until}` : ""}`} className={buttonVariants({ variant: "outline" })}><Download size={16} aria-hidden /> Unduh CSV</a>
          )}
          <PrintButton label="Cetak / Simpan PDF" />
        </>}
      />

      <Card className="no-print p-4">
        <form action="/lra" className="flex flex-wrap items-end gap-3">
          <Field label="Realisasi sampai tanggal" htmlFor="sampai"><Input id="sampai" name="sampai" type="date" defaultValue={until ?? ""} className="w-48" /></Field>
          <button className={buttonVariants({ variant: "primary" })}>Terapkan</button>
          {until && <a href="/lra" className={buttonVariants({ variant: "ghost" })}>Atur ulang</a>}
        </form>
      </Card>

      <Card>
        {error ? <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman atau hubungi administrator.</EmptyState>
          : lines.length === 0 ? <EmptyState title="Belum ada data">Belum ada butir anggaran pada konteks ini.</EmptyState>
          : (
          <TableWrap>
            <table className="table-base">
              <thead><tr><th>Kode</th><th>Uraian</th><th className="text-right">Anggaran</th><th className="text-right">Realisasi</th><th className="text-right">Sisa</th><th className="text-right">%</th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className={WEIGHT[l.level]}>
                    <td className={cn("whitespace-nowrap font-mono text-[13px]", INDENT[l.level])}>{l.code}</td>
                    <td>{l.name}</td>
                    <td className="num">{formatRupiah(l.totals.pagu)}</td>
                    <td className="num">{formatRupiah(l.totals.realisasi)}</td>
                    <td className={cn("num", l.totals.sisa < 0 && "text-red-700")}>{formatRupiah(l.totals.sisa)}</td>
                    <td className="num">{formatPercent(l.totals.pct)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-50 font-bold">
                <td colSpan={2} className="px-3 py-3 text-right">JUMLAH</td>
                <td className="num px-3 py-3">{formatRupiah(t.pagu)}</td><td className="num px-3 py-3">{formatRupiah(t.realisasi)}</td>
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
