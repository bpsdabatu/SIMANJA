import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBudgetContext } from "@/lib/server/budget-context";
import { totals } from "@/lib/realization";
import { loadRealization } from "@/lib/server/realization-data";
import { fillMonths } from "@/lib/dashboard";
import { rp } from "@/lib/format";
import { MonthlyChart } from "@/components/monthly-chart";
import { Icon, type IconName } from "@/components/icons";
import { getSession } from "@/lib/server/session";
import { can } from "@/lib/rbac";
import { nowWib } from "@/lib/date";

async function QuickLinks() {
  const s = await getSession();
  const items: [string, string, IconName][] = [["/laporan", "Laporan & dokumen", "printer"], ["/anggaran/impor", "Impor anggaran", "upload"], ["/panduan", "Panduan", "book"],
    ...(s && can(s.roles, "print-profile:write") ? [["/pengaturan", "Pengaturan", "settings"] as [string, string, IconName]] : [])];
  return <nav aria-label="Akses cepat" className="flex flex-wrap gap-2">{items.map(([h, l, i]) => <Link key={h} href={h} className="btn btn-ghost btn-sm"><Icon name={i} className="h-4 w-4" />{l}</Link>)}</nav>;
}
type Summary = { rup_count: number; pkg_processed: number; pkg_unprocessed: number; pkg_followup: number; result_total: number; contract_total: number; by_method: { name: string; count: number }[]; monthly: { month: number; verified: number }[] };
export default async function Home() {
  const ctx = await getBudgetContext(), sb = await createClient();
  if (!ctx?.versionId) return <section className="max-w-2xl space-y-2"><h1 className="page-title">Beranda</h1>
    <p className="text-slate-600">Belum ada versi anggaran untuk tahun/tahapan ini. Siapkan di menu <Link className="link" href="/anggaran/impor">Impor anggaran</Link>.</p><QuickLinks /></section>;
  const [{ data: s, error }, real] = await Promise.all([sb.rpc("dashboard_summary", { p_version: ctx.versionId }), loadRealization(sb, ctx.versionId)]);
  if (error || !s) return <p role="alert" className="alert alert-error">Dashboard tidak dapat dimuat. Muat ulang halaman.</p>;
  const d = s as Summary;
  const t = totals(real);
  const pct = t.percent === null ? null : Math.min(100, Math.max(0, Number(t.percent)));
  const hero: [string, string, string][] = [
    ["Total pagu anggaran", rp(t.pagu), "/realisasi"], ["Realisasi terverifikasi", rp(t.verified), "/realisasi?status=verified"], ["Sisa anggaran", rp(t.remaining), "/realisasi"]];
  const cards: [string, string, string][] = [
    ["Paket RUP", String(d.rup_count), "/rup"], ["Paket sudah diproses", String(d.pkg_processed), "/paket?kelompok=sudah_diproses"], ["Paket belum diproses", String(d.pkg_unprocessed), "/paket?kelompok=belum_diproses"],
    ["Nilai hasil pemilihan", rp(d.result_total), "/paket"], ["Nilai kontrak/SP", rp(d.contract_total), "/paket"], ["Perlu tindak lanjut", String(d.pkg_followup), "/paket?filter=tindak-lanjut"]];
  return (
    <section className="max-w-7xl space-y-6">
      <div><p className="eyebrow">Ringkasan</p>
        <h1 className="page-title">Dashboard <span className="page-sub">Tahun {ctx.year} · {ctx.stageName}</span></h1>
        <p className="page-desc">Diperbarui {nowWib()}. Sumber: data yang dicatat di aplikasi ini. Realisasi hanya dari transaksi terverifikasi{t.unverifiedCount > 0 ? `; ${t.unverifiedCount} transaksi belum diverifikasi (${rp(t.unverified)}) tidak ikut dihitung` : ""}.</p></div>
      <QuickLinks />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {hero.map(([k, v, h], i) => <Link key={k} href={h} className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-800 to-navy-950 p-5 text-white shadow-card transition hover:-translate-y-0.5 hover:shadow-glow">
          <span className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-400/20 blur-2xl" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-300">{k}</p><p className="mt-2 font-display text-2xl font-bold tabular-nums">{v}</p>
          <p className="mt-3 text-xs font-semibold text-cyan-300 opacity-80 group-hover:opacity-100">{i === 0 ? "Lihat rincian" : "Buka realisasi"} →</p></Link>)}
        <Link href="/realisasi" className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-indigo-50 p-5 shadow-card transition hover:-translate-y-0.5">
          <p className="text-sm font-medium text-slate-600">Persentase realisasi</p>
          <p className="mt-2 font-display text-2xl font-bold tabular-nums text-navy-800">{t.percent === null ? "N/A" : `${t.percent.replace(".", ",")}%`}</p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/80" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Persentase realisasi">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500" style={{ width: `${pct ?? 0}%` }} /></div></Link>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">{cards.map(([k, v, h]) => <Link key={k} href={h} className="card p-4 transition hover:-translate-y-0.5 hover:border-cyan-400">
        <p className="text-sm text-slate-600">{k}</p><p className="mt-1 break-words font-display text-xl font-bold tabular-nums text-navy-800">{v}</p></Link>)}</div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="card p-5"><h2 className="mb-3">Realisasi terverifikasi per bulan</h2>
          {d.monthly.length ? <MonthlyChart data={fillMonths(d.monthly)} /> : <p className="text-slate-600">Belum ada transaksi terverifikasi pada tahun/tahapan ini.</p>}</div>
        <div className="card p-5"><h2 className="mb-3">Paket per metode pemilihan</h2>
          {d.by_method.length ? <ul className="divide-y divide-slate-100">{d.by_method.map((x) => <li key={x.name} className="flex items-center justify-between py-2.5"><span>{x.name}</span><b className="badge badge-info tabular-nums">{x.count}</b></li>)}</ul> : <p className="text-slate-600">Belum ada paket pengadaan.</p>}</div>
      </div>
      <p className="text-xs leading-relaxed text-slate-500">Paket "diproses" = status berkelompok diproses atau selesai; "perlu tindak lanjut" = status bertanda tindak lanjut, belum bertaut RUP, atau lewat tenggat dan belum selesai. Pengelompokan status dapat diubah di master status.</p>
    </section>);
}
