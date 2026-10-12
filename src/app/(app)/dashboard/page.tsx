import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Banknote, Clock, FileSearch, ListChecks, Percent, PiggyBank, TrendingUp,
} from "lucide-react";
import { requireContext } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { formatDateTimeWIB, formatInteger, formatPercent, formatRupiah } from "@/lib/format";
import { STAGE_LABEL } from "@/lib/auth/context";
import { NAV_ITEMS } from "@/lib/nav";
import { Alert, Card, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { loadQItems } from "@/lib/quarterly";
import { DIM_LABEL, MONTH_NAMES, defaultPeriod, parsePeriod, periodLabel, periodSpan, periodValue, rankEntities, type Dim, type RankRow } from "@/lib/ranking-core";
import { PageHeader } from "@/components/ui/page";

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

type Tone = "navy" | "gold" | "red";

function Kpi({ icon: Icon, label, value, hint, tone = "navy" }: {
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  label: string; value: string; hint?: string; tone?: Tone;
}) {
  const chip = { navy: "bg-navy-50 text-navy-700", gold: "bg-gold-50 text-gold-700", red: "bg-red-50 text-red-700" }[tone];
  const bar = { navy: "bg-navy-600", gold: "bg-gold-400", red: "bg-red-500" }[tone];
  return (
    <Card className="relative overflow-hidden p-5">
      <span className={`absolute inset-x-0 top-0 h-1 ${bar}`} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${chip}`}><Icon size={18} aria-hidden /></span>
      </div>
      <p className={`mt-3 break-words font-display text-2xl font-bold tabular-nums ${tone === "red" ? "text-red-700" : "text-navy-900"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ akses?: string; dim?: string; per?: string }> }) {
  const { user, context } = await requireContext();
  const sp = await searchParams;
  const supabase = await userClient();
  const { data, error } = await supabase.rpc("dashboard_kpis", { p_version: context.versionId });
  const k = (Array.isArray(data) ? data[0] : data) as Kpis | undefined;

  const dim: Dim = sp.dim === "kegiatan" || sp.dim === "sub" ? sp.dim : "pptk";
  const period = parsePeriod(sp.per, defaultPeriod(context.year, new Date()));
  const q = await loadQItems(supabase, context, user.organizationId, periodSpan(context.year, period).end);
  const ranking = rankEntities(q.items, context.year, dim, period);

  const sisa = Number(k?.sisa_anggaran ?? 0);
  const over = sisa < 0;
  const empty = !k || k.jumlah_butir_aktif === 0;
  const pct = Math.max(0, Math.min(100, Number(k?.pct_realisasi ?? 0)));
  const shortcuts = NAV_ITEMS.filter((i) => i.href !== "/dashboard" && user.permissions.has(i.permission)).slice(0, 6);

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
          <Card className="overflow-hidden">
            <div className="bg-hero px-6 py-6 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-300">Capaian realisasi belanja</p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                <p className="font-display text-4xl font-bold tabular-nums">{formatPercent(k.pct_realisasi)}</p>
                <p className="text-sm text-navy-100">
                  {formatRupiah(k.total_realisasi)} dari pagu {formatRupiah(k.total_pagu)}
                </p>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Persentase realisasi">
                <div className="h-full rounded-full bg-gradient-to-r from-gold-400 to-gold-200" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </Card>

          <section aria-label="Indikator utama" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Banknote} label="Total Pagu Anggaran" value={formatRupiah(k.total_pagu)} />
            <Kpi icon={TrendingUp} label="Total Realisasi Belanja" value={formatRupiah(k.total_realisasi)} hint="Hanya transaksi ber-SP2D bertanggal" tone="gold" />
            <Kpi icon={PiggyBank} label="Sisa Anggaran" value={formatRupiah(k.sisa_anggaran)} hint="Pagu − realisasi sah" tone={over ? "red" : "navy"} />
            <Kpi icon={Percent} label="Persentase Realisasi" value={formatPercent(k.pct_realisasi)} hint={k.pct_realisasi === null ? "Pagu 0: persentase tidak dihitung" : undefined} />
            <Kpi icon={ListChecks} label="Butir Anggaran Aktif" value={formatInteger(k.jumlah_butir_aktif)} />
            <Kpi icon={Clock} label="Transaksi Menunggu SP2D" value={formatInteger(k.jumlah_menunggu_sp2d)} hint={`Nilai: ${formatRupiah(k.total_menunggu_sp2d)}`} tone={k.jumlah_menunggu_sp2d > 0 ? "gold" : "navy"} />
            <Kpi icon={FileSearch} label="Dokumen Menunggu Reviu" value={formatInteger(k.jumlah_dokumen_reviu)} />
            <Kpi icon={Banknote} label="Komitmen Kontrak" value={formatRupiah(k.total_komitmen)} hint="Dicatat terpisah; bukan realisasi" />
          </section>

          {empty && (
            <Alert tone="teal">
              Belum ada butir anggaran pada konteks ini. Mulailah dari menu <Link href="/anggaran" className="font-semibold underline">Input Anggaran</Link>{" "}
              (setelah Data Master terisi); sampai saat itu angka di atas bernilai nol.
            </Alert>
          )}

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
          <ul className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
            {shortcuts.map((s) => (
              <li key={s.href} className="bg-white">
                <Link href={s.href} className="group flex items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-slate-800 hover:bg-navy-50/60">
                  <span>{s.label}</span>
                  <ArrowRight size={16} aria-hidden className="text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-navy-700" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RankList({ title, tone, rows, offset }: { title: string; tone: "up" | "down"; rows: RankRow[]; offset: (i: number) => number }) {
  const bar = tone === "up" ? "bg-emerald-500" : "bg-red-500";
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-navy-900">{title}</p>
      <ol className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="grid grid-cols-[2rem_1fr_auto] items-start gap-x-3">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${tone === "up" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{offset(i)}</span>
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-slate-900">{r.code && <span className="mr-1 text-xs text-slate-500">{r.code}</span>}{r.name}</p>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="presentation"><div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.max(0, Math.min(100, r.pctPagu))}%` }} /></div>
              <p className="mt-1 text-xs text-slate-500">Periode ini {formatRupiah(r.realPeriod)} · kumulatif {formatRupiah(r.realCum)} dari pagu {formatRupiah(r.pagu)}{r.pctKas !== null ? ` · ${formatPercent(r.pctKas)} dari target kas` : ""}</p>
            </div>
            <p className="text-right font-display text-lg font-bold tabular-nums text-navy-900">{formatPercent(r.pctPagu)}</p>
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
    <Card>
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
