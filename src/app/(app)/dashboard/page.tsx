import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Banknote, CalendarClock, Clock, Database, FileBarChart, FileSearch, Files, LayoutDashboard, ListChecks,
  Percent, PiggyBank, Presentation, Receipt, ScrollText, TableProperties, TrendingUp, Users, Wallet, type LucideIcon,
} from "lucide-react";
import { requireContext } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { formatDateTimeWIB, formatInteger, formatPercent, formatRupiah } from "@/lib/format";
import { STAGE_LABEL } from "@/lib/auth/context";
import { NAV_ITEMS, type IconName } from "@/lib/nav";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { Donut, Legend, ProgressRing, QuarterBars, StackBar, compactRp, type Part } from "@/components/dashboard-charts";
import { loadQItems } from "@/lib/quarterly";
import { metricsOf, type Quarter } from "@/lib/quarterly-core";
import { DIM_LABEL, MONTH_NAMES, defaultPeriod, parsePeriod, periodLabel, periodValue, rankEntities, type Dim, type RankRow } from "@/lib/ranking-core";
import { PageHeader } from "@/components/ui/page";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dasbor" };
export const dynamic = "force-dynamic";

interface Kpis {
  total_pagu: string;
  total_realisasi: string;
  sisa_anggaran: string;
  pct_realisasi: string | null;
  jumlah_butir_aktif: number;
  jumlah_menunggu_sp2d: number;
  jumlah_dokumen_reviu: number;
  total_menunggu_sp2d: string;
  total_komitmen: string;
  dihitung_pada: string;
}

type Hue = "indigo" | "emerald" | "cyan" | "violet" | "blue" | "amber" | "rose" | "teal" | "red";

/** Warna berbeda untuk tiap data: pita atas, ubin ikon bergradasi, dan latar lembut. */
const HUE: Record<Hue, { ribbon: string; tile: string; soft: string; text: string }> = {
  indigo: { ribbon: "from-indigo-500 to-indigo-700", tile: "from-indigo-500 to-indigo-700", soft: "bg-indigo-50/60", text: "text-indigo-900" },
  emerald: { ribbon: "from-emerald-400 to-emerald-600", tile: "from-emerald-400 to-emerald-600", soft: "bg-emerald-50/60", text: "text-emerald-900" },
  cyan: { ribbon: "from-cyan-400 to-cyan-600", tile: "from-cyan-400 to-cyan-600", soft: "bg-cyan-50/60", text: "text-cyan-900" },
  violet: { ribbon: "from-violet-500 to-violet-700", tile: "from-violet-500 to-violet-700", soft: "bg-violet-50/60", text: "text-violet-900" },
  blue: { ribbon: "from-blue-500 to-blue-700", tile: "from-blue-500 to-blue-700", soft: "bg-blue-50/60", text: "text-blue-900" },
  amber: { ribbon: "from-amber-400 to-orange-500", tile: "from-amber-400 to-orange-500", soft: "bg-amber-50/70", text: "text-amber-900" },
  rose: { ribbon: "from-rose-400 to-rose-600", tile: "from-rose-400 to-rose-600", soft: "bg-rose-50/60", text: "text-rose-900" },
  teal: { ribbon: "from-teal-400 to-teal-600", tile: "from-teal-400 to-teal-600", soft: "bg-teal-50/60", text: "text-teal-900" },
  red: { ribbon: "from-red-500 to-red-700", tile: "from-red-500 to-red-700", soft: "bg-red-50", text: "text-red-800" },
};

function Kpi({ icon: Icon, label, value, hint, hue }: {
  icon: LucideIcon; label: string; value: string; hint?: string; hue: Hue;
}) {
  const h = HUE[hue];
  return (
    <div className={cn("group relative overflow-hidden rounded-2xl border border-slate-200/80 p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift", h.soft)}>
      <span className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r", h.ribbon)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm", h.tile)}><Icon size={19} aria-hidden /></span>
      </div>
      <p className={cn("mt-3 break-words font-display text-2xl font-bold tabular-nums", h.text)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const SHORTCUT_ICON: Record<IconName, LucideIcon> = {
  "layout-dashboard": LayoutDashboard, wallet: Wallet, "calendar-clock": CalendarClock, receipt: Receipt,
  "table-properties": TableProperties, "file-bar-chart": FileBarChart, files: Files, database: Database,
  users: Users, "scroll-text": ScrollText, presentation: Presentation,
};
const SHORTCUT_HUE: Hue[] = ["indigo", "cyan", "emerald", "violet", "amber", "rose", "teal", "blue"];

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ akses?: string; dim?: string; per?: string }> }) {
  const { user, context } = await requireContext();
  const sp = await searchParams;
  const supabase = await userClient();
  const [{ data, error }, txStat] = await Promise.all([
    supabase.rpc("dashboard_kpis", { p_version: context.versionId }),
    supabase.from("realization_transactions").select("status").eq("budget_version_id", context.versionId).limit(10000),
  ]);
  const k = (Array.isArray(data) ? data[0] : data) as Kpis | undefined;

  const dim: Dim = sp.dim === "kegiatan" || sp.dim === "sub" ? sp.dim : "pptk";
  const period = parsePeriod(sp.per, defaultPeriod(context.year, new Date()));
  // Muat realisasi s.d. akhir tahun sekali; peringkat & grafik triwulan memfilter menurut tanggal masing-masing.
  const q = await loadQItems(supabase, context, user.organizationId, `${context.year}-12-31`);
  const ranking = rankEntities(q.items, context.year, dim, period);
  const perQ = ([1, 2, 3, 4] as Quarter[]).map((n) => { const m = metricsOf(q.items, n, context.year); return { label: `TW ${["I", "II", "III", "IV"][n - 1]}`, kas: m.kasTw, real: m.realTw }; });

  const txCount = (txStat.data ?? []).reduce<Record<string, number>>((a, r) => { const st = (r as { status: string }).status; a[st] = (a[st] ?? 0) + 1; return a; }, {});
  const kasCount = q.items.reduce<Record<string, number>>((a, i) => { const st = i.kasStatus ?? "none"; a[st] = (a[st] ?? 0) + 1; return a; }, {});
  const kasTotal = q.items.reduce((a, i) => a + (i.kasMonths ? i.kasMonths.reduce((x, y) => x + y, 0) : 0), 0);

  const sisa = Number(k?.sisa_anggaran ?? 0);
  const over = sisa < 0;
  const empty = !k || k.jumlah_butir_aktif === 0;
  const pagu = Number(k?.total_pagu ?? 0), real = Number(k?.total_realisasi ?? 0), pend = Number(k?.total_menunggu_sp2d ?? 0);
  const parts: Part[] = [
    { label: "Realisasi sah", value: real, color: "bg-emerald-500", hex: "#10b981" },
    { label: "Menunggu SP2D", value: pend, color: "bg-amber-400", hex: "#fbbf24" },
    { label: "Sisa tersedia", value: Math.max(0, pagu - real - pend), color: "bg-sky-400", hex: "#38bdf8" },
  ];
  const shortcuts = NAV_ITEMS.filter((i) => i.href !== "/dashboard" && user.permissions.has(i.permission)).slice(0, 8);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        eyebrow={`Tahun Anggaran ${context.year} · ${STAGE_LABEL[context.stage]}`}
        title={`Selamat datang, ${user.fullName.split(" ")[0]}`}
        description={`Ringkasan monitoring dan evaluasi anggaran. Angka mengikuti data yang boleh Anda akses (${user.roles.join(", ").toUpperCase() || "tanpa peran"}).`}
      />

      {sp.akses === "ditolak" && <Alert tone="amber">Anda tidak memiliki izin untuk membuka halaman tersebut.</Alert>}
      {error && <Alert>Ringkasan tidak dapat dimuat. Silakan muat ulang halaman atau hubungi administrator.</Alert>}
      {over && (
        <Alert>
          <AlertTriangle size={15} className="mr-1.5 inline" aria-hidden /> Realisasi melebihi pagu pada konteks ini (sisa anggaran negatif). Periksa data realisasi.
        </Alert>
      )}

      {k && (
        <>
          {/* Hero: capaian + tiga angka kunci */}
          <div className="overflow-hidden rounded-2xl border border-navy-900/20 shadow-lift">
            <div className="bg-hero px-6 py-7 text-white sm:px-8">
              <div className="grid items-center gap-6 lg:grid-cols-[auto_1fr]">
                <div className="mx-auto text-white lg:mx-0"><ProgressRing value={k.pct_realisasi === null ? null : Number(k.pct_realisasi)} /></div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-300">Capaian realisasi belanja</p>
                  <p className="mt-1 text-sm text-navy-100">{formatRupiah(k.total_realisasi)} dari pagu {formatRupiah(k.total_pagu)}</p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      ["Realisasi sah", formatRupiah(k.total_realisasi), "bg-emerald-400"],
                      ["Menunggu SP2D", formatRupiah(k.total_menunggu_sp2d), "bg-amber-300"],
                      [over ? "Melebihi pagu" : "Sisa anggaran", formatRupiah(over ? Math.abs(sisa) : k.sisa_anggaran), over ? "bg-red-400" : "bg-sky-300"],
                    ].map(([l, v, dot]) => (
                      <div key={l} className="rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/10 backdrop-blur">
                        <dt className="flex items-center gap-2 text-xs text-navy-100"><span className={cn("h-2 w-2 rounded-full", dot)} aria-hidden />{l}</dt>
                        <dd className="mt-1 break-words font-display text-base font-bold tabular-nums sm:text-lg">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <section aria-label="Indikator utama" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi hue="indigo" icon={Banknote} label="Total Pagu Anggaran" value={formatRupiah(k.total_pagu)} hint="Seluruh butir pada konteks ini" />
            <Kpi hue="emerald" icon={TrendingUp} label="Total Realisasi Belanja" value={formatRupiah(k.total_realisasi)} hint="Hanya transaksi ber-SP2D bertanggal" />
            <Kpi hue={over ? "red" : "cyan"} icon={PiggyBank} label="Sisa Anggaran" value={formatRupiah(k.sisa_anggaran)} hint="Pagu − realisasi sah" />
            <Kpi hue="violet" icon={Percent} label="Persentase Realisasi" value={formatPercent(k.pct_realisasi)} hint={k.pct_realisasi === null ? "Pagu 0: persentase tidak dihitung" : "Realisasi ÷ pagu"} />
            <Kpi hue="blue" icon={ListChecks} label="Butir Anggaran Aktif" value={formatInteger(k.jumlah_butir_aktif)} hint="Butir yang Anda akses" />
            <Kpi hue="amber" icon={Clock} label="Transaksi Menunggu SP2D" value={formatInteger(k.jumlah_menunggu_sp2d)} hint={`Nilai: ${formatRupiah(k.total_menunggu_sp2d)}`} />
            <Kpi hue="rose" icon={FileSearch} label="Dokumen Menunggu Reviu" value={formatInteger(k.jumlah_dokumen_reviu)} hint="Dokumen pengadaan diajukan" />
            <Kpi hue="teal" icon={Banknote} label="Komitmen Kontrak" value={formatRupiah(k.total_komitmen)} hint="Dicatat terpisah; bukan realisasi" />
          </section>

          {empty && (
            <Alert tone="teal">
              Belum ada butir anggaran pada konteks ini. Mulailah dari menu <Link href="/anggaran" className="font-semibold underline">Input Anggaran</Link>{" "}
              (setelah Data Master terisi); sampai saat itu angka di atas bernilai nol.
            </Alert>
          )}

          {/* Grafik */}
          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="overflow-hidden lg:col-span-3">
              <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-500" aria-hidden />
              <CardHeader title="Target Kas vs Realisasi per Triwulan" description="Target dari Anggaran Kas; realisasi menurut tanggal SP2D." />
              <div className="px-4 pb-3 pt-4">
                {q.error ? <p className="p-2 text-sm text-red-700">Data grafik tidak dapat dimuat sepenuhnya.</p> : <QuarterBars data={perQ} />}
                <div className="mt-1 flex flex-wrap justify-center gap-5 text-xs text-slate-600">
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-indigo-500" aria-hidden />Target kas</span>
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-emerald-500" aria-hidden />Realisasi</span>
                </div>
              </div>
            </Card>
            <Card className="overflow-hidden lg:col-span-2">
              <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-amber-400 to-sky-400" aria-hidden />
              <CardHeader title="Komposisi Pagu" description="Realisasi, menunggu SP2D, dan sisa tersedia." />
              <div className="flex flex-col items-center gap-5 p-5 sm:flex-row sm:justify-center lg:flex-col xl:flex-row">
                <Donut parts={parts} center={{ top: "Total pagu", bottom: compactRp(pagu) }} />
                <div className="w-full max-w-xs"><Legend parts={parts} /></div>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-amber-400 to-violet-500" aria-hidden />
              <CardHeader title="Posisi Transaksi Belanja" description="Jumlah transaksi menurut tahap alur." actions={<Link href="/realisasi" className="text-sm font-semibold text-navy-700 hover:underline">Buka Realisasi</Link>} />
              <div className="p-5">
                <StackBar parts={[
                  { label: "Draf", value: txCount.draft ?? 0, color: "bg-amber-400" },
                  { label: "Dikembalikan", value: txCount.returned ?? 0, color: "bg-rose-500" },
                  { label: "Diajukan", value: (txCount.submitted ?? 0) + (txCount.contracted ?? 0), color: "bg-sky-500" },
                  { label: "Proses SP2D", value: txCount.payment_processing ?? 0, color: "bg-violet-500" },
                  { label: "Realisasi", value: txCount.realisasi ?? 0, color: "bg-emerald-500" },
                  { label: "Dibatalkan", value: txCount.cancelled ?? 0, color: "bg-slate-400" },
                ]} />
              </div>
            </Card>
            <Card className="overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-sky-400 to-emerald-500" aria-hidden />
              <CardHeader title="Status Anggaran Kas" description={`Rencana kas tersusun ${formatRupiah(kasTotal)} dari pagu ${formatRupiah(pagu)}.`} actions={<Link href="/anggaran-kas" className="text-sm font-semibold text-navy-700 hover:underline">Buka Anggaran Kas</Link>} />
              <div className="p-5">
                <StackBar parts={[
                  { label: "Belum disusun", value: kasCount.none ?? 0, color: "bg-slate-300" },
                  { label: "Draf", value: kasCount.draft ?? 0, color: "bg-amber-400" },
                  { label: "Diajukan", value: kasCount.submitted ?? 0, color: "bg-sky-500" },
                  { label: "Dikembalikan", value: kasCount.returned ?? 0, color: "bg-rose-500" },
                  { label: "Final", value: kasCount.final ?? 0, color: "bg-emerald-500" },
                ]} />
              </div>
            </Card>
          </div>

          <p className="text-xs text-slate-500">
            Dihitung pada {formatDateTimeWIB(k.dihitung_pada)}. Definisi: realisasi sah = transaksi berstatus realisasi dengan SP2D bertanggal dan tidak dibatalkan.
            Menunggu SP2D dan komitmen kontrak ditampilkan terpisah dan tidak pernah dijumlahkan ke realisasi.
          </p>
        </>
      )}

      <RankingCard rows={ranking} dim={dim} period={period} year={context.year} error={q.error} />

      {shortcuts.length > 0 && (
        <Card>
          <CardHeader title="Pintasan modul" description="Menu yang tersedia sesuai peran Anda." />
          <ul className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {shortcuts.map((s, i) => {
              const Icon = SHORTCUT_ICON[s.icon];
              const h = HUE[SHORTCUT_HUE[i % SHORTCUT_HUE.length]!];
              return (
                <li key={s.href}>
                  <Link href={s.href} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-800 transition-all hover:-translate-y-0.5 hover:shadow-card">
                    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", h.tile)}><Icon size={18} aria-hidden /></span>
                    <span className="min-w-0 flex-1 leading-tight">{s.label}</span>
                    <ArrowRight size={16} aria-hidden className="text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-navy-700" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RankList({ title, tone, rows, offset }: { title: string; tone: "up" | "down"; rows: RankRow[]; offset: (i: number) => number }) {
  const bar = tone === "up" ? "bg-gradient-to-r from-emerald-400 to-emerald-600" : "bg-gradient-to-r from-rose-400 to-rose-600";
  const medal = ["bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950", "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800", "bg-gradient-to-br from-orange-300 to-orange-500 text-orange-950"];
  return (
    <div>
      <p className={cn("mb-3 inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide", tone === "up" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{title}</p>
      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[2rem_1fr_auto] items-start gap-x-3">
            <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold", tone === "up" && i < 3 ? medal[i] : tone === "up" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{offset(i)}</span>
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-slate-900">{r.code && <span className="mr-1 text-xs text-slate-500">{r.code}</span>}{r.name}</p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="presentation"><div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(0, Math.min(100, r.pctPagu))}%` }} /></div>
              <p className="mt-1 text-xs text-slate-500">Periode ini {formatRupiah(r.realPeriod)} · kumulatif {formatRupiah(r.realCum)} dari pagu {formatRupiah(r.pagu)}{r.pctKas !== null ? ` · ${formatPercent(r.pctKas)} dari target kas` : ""}</p>
            </div>
            <p className={cn("text-right font-display text-lg font-bold tabular-nums", tone === "up" ? "text-emerald-700" : "text-rose-700")}>{formatPercent(r.pctPagu)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RankingCard({ rows, dim, period, year, error }: { rows: RankRow[]; dim: Dim; period: ReturnType<typeof parsePeriod>; year: number; error: string | null }) {
  const N = 5;
  const high = rows.slice(0, N);
  const low = [...rows].reverse().slice(0, N);
  const split = rows.length > N;
  return (
    <Card className="overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500" aria-hidden />
      <CardHeader title="Peringkat Capaian Realisasi Anggaran" description={`Menurut ${DIM_LABEL[dim]} · ${periodLabel(period, year)}. Diurutkan dari realisasi kumulatif s.d. akhir periode terhadap pagu (realisasi sah: SP2D bertanggal).`} />
      <form action="/dashboard" className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-5 py-4">
        <Field label="Peringkat menurut" htmlFor="dim">
          <Select id="dim" name="dim" defaultValue={dim} className="w-44">{(Object.keys(DIM_LABEL) as Dim[]).map((d) => <option key={d} value={d}>{DIM_LABEL[d]}</option>)}</Select>
        </Field>
        <Field label="Periode" htmlFor="per">
          <Select id="per" name="per" defaultValue={periodValue(period)} className="w-52">
            <option value="y">Seluruh tahun (s.d. kini)</option>
            <optgroup label="Triwulanan">{[1, 2, 3, 4].map((n) => <option key={n} value={`q${n}`}>Triwulan {["I", "II", "III", "IV"][n - 1]}</option>)}</optgroup>
            <optgroup label="Bulanan">{MONTH_NAMES.map((m, i) => <option key={m} value={`m${i + 1}`}>{m}</option>)}</optgroup>
          </Select>
        </Field>
        <button className={buttonVariants({ variant: "primary" })}>Tampilkan</button>
      </form>
      {error ? <p className="p-5 text-sm text-red-700">Data peringkat tidak dapat dimuat sepenuhnya. Muat ulang halaman.</p>
        : rows.length === 0 ? <p className="p-5 text-sm text-slate-600">Belum ada data pagu untuk diperingkatkan pada konteks ini.</p>
        : (
        <div className={`grid gap-8 p-5 ${split ? "lg:grid-cols-2" : ""}`}>
          <RankList title={split ? `${N} tertinggi` : "Peringkat (tertinggi ke terendah)"} tone="up" rows={high} offset={(i) => i + 1} />
          {split && <RankList title={`${N} terendah`} tone="down" rows={low} offset={(i) => rows.length - i} />}
        </div>
      )}
    </Card>
  );
}
