import type { Metadata } from "next";
import { Download, TriangleAlert } from "lucide-react";
import { requireAdminModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { getOrganizationName } from "@/lib/lookups";
import { isIsoDate } from "@/lib/reports";
import { buildLraReport, periodBounds } from "@/lib/lra-core";
import { loadKpa, loadLraData } from "@/lib/lra-data";
import { formatAmount, formatPercent } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { EmptyState, PageHeader, TableWrap } from "@/components/ui/page";
import { PrintButton } from "@/components/ui/submit-button";
import { PrintFooter, PrintHeader, SignatureBlock } from "@/components/ui/report";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Laporan Realisasi Anggaran" };
export const dynamic = "force-dynamic";

const INDENT = ["pl-3", "pl-6", "pl-9", "pl-12"];
const WEIGHT = ["font-bold bg-navy-100/60", "font-semibold bg-navy-50/80", "font-semibold", ""];
const dmy = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function LraPage({ searchParams }: { searchParams: Promise<{ sampai?: string }> }) {
  const { user, context } = await requireAdminModule("lra.view");
  const sp = await searchParams;
  const until = isIsoDate(sp.sampai) ? sp.sampai : null;
  const supabase = await userClient();
  const [data, org, kpa] = await Promise.all([
    loadLraData(supabase, { versionId: context.versionId, stage: context.stage }, { until }),
    getOrganizationName(supabase, user.organizationId),
    loadKpa(supabase, user.organizationId),
  ]);
  const { lines, total, checks } = buildLraReport(data.items);
  const b = periodBounds(data.cutoff);
  const { tahapan } = data;
  const stage = tahapan.active?.label ?? "Belum ada DPA berlaku";
  const sub = `Tahun Anggaran ${context.year} — Tahapan ${stage}${tahapan.active?.dpaDate ? ` (DPA ${dmy(tahapan.active.dpaDate)})` : ""} — Sampai dengan ${dmy(data.cutoff)}`;
  const colLabel = (s: "murni" | "pergeseran" | "perubahan") => {
    const c = tahapan.columns[s];
    return { text: `${c?.label ?? { murni: "Murni", pergeseran: "Pergeseran", perubahan: "Perubahan" }[s]}${c && !c.effective ? " *" : ""}`, hint: c ? (c.dpaDate ? `DPA ${dmy(c.dpaDate)}${c.effective ? "" : " — belum berlaku pada tanggal batas"}` : "Tanggal DPA belum diisi") : "Belum ada versi pada tahapan ini" };
  };
  const planned = (["murni", "pergeseran", "perubahan"] as const).filter((s) => tahapan.columns[s] && !tahapan.columns[s]!.effective);
  const laluHint = b.laluTo ? `Realisasi sampai ${dmy(b.laluTo)}` : "Belum ada realisasi bulan lalu (awal tahun)";
  const iniHint = `Realisasi ${dmy(b.iniFrom)} s.d. ${dmy(b.iniTo)}`;
  const notices = [
    tahapan.mode === "konteks" && "Tanggal DPA belum diisi pada versi anggaran mana pun, sehingga tahapan mengikuti konteks yang dipilih. Isi tanggal DPA di menu Input Anggaran → Versi anggaran.",
    tahapan.mode === "tanggal" && tahapan.undated > 0 && `${tahapan.undated} versi anggaran belum memiliki tanggal DPA dan tidak dipertimbangkan dalam penentuan tahapan.`,
    tahapan.mode === "tanggal" && !tahapan.active && `Belum ada DPA yang berlaku pada ${dmy(data.cutoff)}; pagu tahapan aktif dihitung 0.`,
    data.afterCutoff.count > 0 && `${data.afterCutoff.count} SP2D bertanggal setelah ${dmy(data.cutoff)} (Rp ${formatAmount(data.afterCutoff.amount)}) tidak dihitung pada laporan ini.`,
    data.unmapped.count > 0 && `${data.unmapped.count} realisasi sah (Rp ${formatAmount(data.unmapped.amount)}) tidak memiliki butir pada snapshot pagu mana pun dan tidak tampil — periksa Input Anggaran.`,
    checks.negativeSisa > 0 && `${checks.negativeSisa} butir realisasinya melebihi pagu (sisa negatif, ditandai merah).`,
    checks.realisasiTanpaPagu > 0 && `${checks.realisasiTanpaPagu} butir memiliki realisasi tetapi pagu ${stage} nol.`,
  ].filter(Boolean) as string[];
  const cards: Array<[string, string]> = [
    [`Pagu (${stage})`, `Rp ${formatAmount(total.pagu)}`], ["Total Realisasi", `Rp ${formatAmount(total.jumlah)}`],
    ["Sisa Anggaran", `Rp ${formatAmount(total.sisa)}`], ["Capaian", formatPercent(total.pct)],
  ];
  const num = "num whitespace-nowrap";

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <PrintHeader orgName={org} title="Laporan Realisasi Anggaran (LRA)" subtitle={sub} />
      <PageHeader
        eyebrow={sub}
        title="Laporan Realisasi Anggaran"
        description="Realisasi hanya dari transaksi terverifikasi dengan SP2D bertanggal pada atau sebelum tanggal batas (bawaan: hari ini, WIB). Bln Lalu + Bln Ini = Jumlah; Sisa = Pagu − Jumlah."
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

      {notices.length > 0 && (
        <div role="status" className="no-print flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          <ul className="list-disc space-y-1 pl-4">{notices.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label} className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-lg font-bold tabular-nums">{value}</p></Card>
        ))}
      </div>

      <Card>
        {data.error ? <EmptyState title="Data tidak dapat dimuat">Muat ulang halaman atau hubungi administrator.</EmptyState>
          : lines.length === 0 ? <EmptyState title="Belum ada data">Belum ada butir anggaran pada konteks ini.</EmptyState>
          : (
          <TableWrap>
            <table className="table-base text-xs print:text-[9px]">
              <thead>
                <tr>
                  <th rowSpan={2}>Kode Rekening</th><th rowSpan={2}>Uraian Belanja</th><th rowSpan={2} className="text-right">Pagu ({tahapan.active?.label ?? "-"})</th>
                  <th colSpan={3} className="text-center">Pagu Rincian</th><th colSpan={3} className="text-center">Realisasi</th>
                  <th rowSpan={2} className="text-right">Sisa</th><th rowSpan={2} className="text-right">%</th>
                </tr>
                <tr>
                  {(["murni", "pergeseran", "perubahan"] as const).map((k) => { const h = colLabel(k); return <th key={k} className="text-right" title={h.hint}>{h.text}</th>; })}
                  <th className="text-right" title={laluHint}>Bln Lalu</th><th className="text-right" title={iniHint}>Bln Ini</th><th className="text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className={cn(WEIGHT[l.level], l.kind === "item" && l.flags.includes("SISA_NEGATIF") && "bg-red-50")}>
                    <td className={cn("whitespace-nowrap font-mono", INDENT[l.level])}>{l.code}</td>
                    <td className={l.kind === "item" ? "min-w-48" : undefined}>
                      {l.name}
                      {l.kind === "item" && (l.fundingName || l.description) && <span className="block text-[11px] font-normal text-slate-500">{[l.fundingName, l.description].filter(Boolean).join(" · ")}</span>}
                    </td>
                    <td className={num}>{formatAmount(l.totals.pagu)}</td>
                    <td className={num}>{formatAmount(l.totals.murni)}</td><td className={num}>{formatAmount(l.totals.pergeseran)}</td><td className={num}>{formatAmount(l.totals.perubahan)}</td>
                    <td className={num}>{formatAmount(l.totals.lalu)}</td><td className={num}>{formatAmount(l.totals.ini)}</td><td className={num}>{formatAmount(l.totals.jumlah)}</td>
                    <td className={cn(num, l.totals.sisa < 0 && "text-red-700")}>{formatAmount(l.totals.sisa)}</td>
                    <td className={num}>{formatPercent(l.totals.pct)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-slate-50 font-bold">
                <td colSpan={2} className="px-3 py-3 text-right">TOTAL BELANJA</td>
                {[total.pagu, total.murni, total.pergeseran, total.perubahan, total.lalu, total.ini, total.jumlah].map((v, i) => <td key={i} className={cn(num, "px-3 py-3")}>{formatAmount(v)}</td>)}
                <td className={cn(num, "px-3 py-3", total.sisa < 0 && "text-red-700")}>{formatAmount(total.sisa)}</td><td className={cn(num, "px-3 py-3")}>{formatPercent(total.pct)}</td>
              </tr></tfoot>
            </table>
          </TableWrap>
        )}
      </Card>
      {planned.length > 0 && <p className="text-xs text-slate-600">* DPA belum berlaku pada tanggal batas ({planned.map((k) => { const c = tahapan.columns[k]!; return `${c.label}${c.dpaDate ? `: ${dmy(c.dpaDate)}` : ": tanggal belum diisi"}`; }).join("; ")}); angka ditampilkan sebagai rencana.</p>}
      <SignatureBlock kpa={kpa} />
      <PrintFooter />
    </div>
  );
}
