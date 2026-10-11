import type { Metadata } from "next";
import { Download, Presentation } from "lucide-react";
import { requireModule } from "@/lib/auth/guard";
import { userClient } from "@/lib/supabase/server";
import { loadQuarterReport } from "@/lib/quarterly";
import { dateID, pct, rp, type Line } from "@/lib/quarterly-core";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { EmptyState, PageHeader, TableWrap } from "@/components/ui/page";
import { PrintButton } from "@/components/ui/submit-button";
import { PrintFooter, PrintHeader, SignatureBlock } from "@/components/ui/report";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Laporan Triwulanan" };
export const dynamic = "force-dynamic";

const TONE = { "Sesuai target": "green", "Perlu perhatian": "amber", "Di bawah target": "red", "Belum ada target kas": "slate" } as const;
const INDENT = ["pl-3", "pl-7", "pl-11"];
const WEIGHT = ["font-bold bg-navy-100/60", "font-semibold bg-navy-50/80", ""];

export default async function LaporanTriwulanPage({ searchParams }: { searchParams: Promise<{ tw?: string; pptk?: string }> }) {
  const { user, context } = await requireModule("recap.view");
  const sp = await searchParams;
  const { report: r, pptkOptions, error } = await loadQuarterReport(await userClient(), context, user.organizationId, { quarter: sp.tw, pptk: sp.pptk });
  const t = r.totals;
  const qs = `tw=${r.quarter}&pptk=${encodeURIComponent(sp.pptk ?? "")}`;
  const canExport = user.permissions.has("recap.export");
  const sub = `${r.label} — Tahun Anggaran ${r.year} — ${r.stageLabel}${r.pptkFilter ? ` — PPTK ${r.pptkFilter}` : ""}`;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PrintHeader orgName={r.org} title="Laporan Capaian Kinerja Pelaksanaan dan Realisasi Kegiatan dan Anggaran" subtitle={sub} />
      <PageHeader
        eyebrow={sub}
        title="Laporan Triwulanan"
        description="Capaian pelaksanaan dan realisasi kegiatan serta anggaran per triwulan, dengan analisis singkat yang disusun dari data sistem. Dapat difilter per PPTK dan diunduh sebagai Presentasi atau PDF."
        actions={canExport ? <>
          <a href={`/laporan-triwulan/pptx?${qs}`} className={buttonVariants({ variant: "primary" })}><Presentation size={16} aria-hidden /> Unduh Presentasi (PPTX)</a>
          <a href={`/laporan-triwulan/pdf?${qs}`} className={buttonVariants({ variant: "outline" })}><Download size={16} aria-hidden /> Unduh PDF</a>
          <PrintButton />
        </> : <PrintButton />}
      />

      <Card className="no-print p-4">
        <form action="/laporan-triwulan" className="flex flex-wrap items-end gap-3">
          <Field label="Triwulan" htmlFor="tw">
            <Select id="tw" name="tw" defaultValue={String(r.quarter)} className="w-44">
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Triwulan {["I", "II", "III", "IV"][q - 1]}</option>)}
            </Select>
          </Field>
          <Field label="PPTK" htmlFor="pptk">
            <Select id="pptk" name="pptk" defaultValue={sp.pptk ?? ""} className="w-72">
              <option value="">Semua PPTK</option>
              {pptkOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="none">Belum ditugaskan</option>
            </Select>
          </Field>
          <button className={buttonVariants({ variant: "primary" })}>Terapkan</button>
        </form>
      </Card>

      {error ? <Card><EmptyState title="Data tidak dapat dimuat">Muat ulang halaman atau hubungi administrator.</EmptyState></Card> : (
        <>
          {(r.endsInFuture || r.notStarted) && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">{r.label} {r.notStarted ? "belum dimulai" : "belum berakhir"}; angka bersifat {r.notStarted ? "awal" : "sementara"} per {dateID(r.today)}.</p>}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[["Pagu", rp(t.pagu), ""], ["Target kas s.d. triwulan", rp(t.kasCum), `Triwulan ini ${rp(t.kasTw)}`], [`Realisasi ${r.label}`, rp(t.realTw), ""], ["Realisasi kumulatif", rp(t.realCum), `${pct(t.pctPagu)} dari pagu`], ["Capaian terhadap kas", pct(t.pctKas), t.status]].map(([l, v, s]) => (
              <Card key={l} className="p-5"><p className="text-sm text-slate-600">{l}</p><p className="mt-1 font-display text-lg font-bold tabular-nums text-navy-900">{v}</p>{s && <p className="mt-1 text-xs text-slate-500">{s}</p>}</Card>
            ))}
          </div>

          <Card>
            <CardHeader title="Analisis Singkat" description={r.analysis.headline} />
            <div className="grid gap-6 p-5 lg:grid-cols-3">
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-800 lg:col-span-2">{r.analysis.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
              <div>
                <p className="mb-2 text-sm font-semibold text-navy-900">Rekomendasi</p>
                {r.analysis.recommendations.length ? <ul className="list-disc space-y-2 pl-5 text-sm text-slate-800">{r.analysis.recommendations.map((f, i) => <li key={i}>{f}</li>)}</ul> : <p className="text-sm text-slate-600">Tidak ada rekomendasi khusus.</p>}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Capaian per Program, Kegiatan, dan Sub Kegiatan" />
            {r.lines.length === 0 ? <EmptyState title="Belum ada data">Belum ada butir anggaran pada cakupan ini.</EmptyState> : (
              <TableWrap>
                <table className="table-base">
                  <thead><tr><th>Kode</th><th>Uraian</th><th className="text-right">Pagu</th><th className="text-right">Target kas s.d. TW</th><th className="text-right">Realisasi {r.label}</th><th className="text-right">Realisasi kumulatif</th><th className="text-right">% pagu</th><th className="text-right">% kas</th><th>Status</th></tr></thead>
                  <tbody>
                    {r.lines.map((l: Line, i) => (
                      <tr key={i} className={WEIGHT[l.level]}>
                        <td className={cn("whitespace-nowrap", INDENT[l.level])}>{l.code}</td><td>{l.name}</td>
                        <td className="num">{rp(l.m.pagu)}</td><td className="num">{rp(l.m.kasCum)}</td><td className="num">{rp(l.m.realTw)}</td><td className="num">{rp(l.m.realCum)}</td>
                        <td className="num">{pct(l.m.pctPagu)}</td><td className="num">{pct(l.m.pctKas)}</td><td><Badge tone={TONE[l.m.status]}>{l.m.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="bg-slate-50 font-bold"><td colSpan={2} className="px-3 py-3 text-right">JUMLAH</td><td className="num px-3 py-3">{rp(t.pagu)}</td><td className="num px-3 py-3">{rp(t.kasCum)}</td><td className="num px-3 py-3">{rp(t.realTw)}</td><td className="num px-3 py-3">{rp(t.realCum)}</td><td className="num px-3 py-3">{pct(t.pctPagu)}</td><td className="num px-3 py-3">{pct(t.pctKas)}</td><td className="px-3 py-3">{t.status}</td></tr></tfoot>
                </table>
              </TableWrap>
            )}
          </Card>

          {!r.pptkFilter && r.byPptk.length > 0 && (
            <Card>
              <CardHeader title="Capaian per PPTK" />
              <TableWrap>
                <table className="table-base">
                  <thead><tr><th>PPTK</th><th className="text-right">Butir</th><th className="text-right">Pagu</th><th className="text-right">Target kas s.d. TW</th><th className="text-right">Realisasi kumulatif</th><th className="text-right">% pagu</th><th className="text-right">% kas</th><th>Status</th></tr></thead>
                  <tbody>{r.byPptk.map((p) => (
                    <tr key={p.key}><td>{p.name}</td><td className="num">{p.items}</td><td className="num">{rp(p.m.pagu)}</td><td className="num">{rp(p.m.kasCum)}</td><td className="num">{rp(p.m.realCum)}</td><td className="num">{pct(p.m.pctPagu)}</td><td className="num">{pct(p.m.pctKas)}</td><td><Badge tone={TONE[p.m.status]}>{p.m.status}</Badge></td></tr>
                  ))}</tbody>
                </table>
              </TableWrap>
            </Card>
          )}

          <Card className="p-5"><p className="mb-2 text-sm font-semibold text-navy-900">Catatan metodologi dan keterbatasan data</p><ul className="list-disc space-y-1 pl-5 text-xs text-slate-600">{r.analysis.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></Card>
        </>
      )}
      <SignatureBlock />
      <PrintFooter />
    </div>
  );
}
