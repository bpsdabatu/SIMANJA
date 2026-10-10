import type { Metadata } from "next";
import { AlertTriangle, Banknote, Clock, FileSearch, ListChecks, PiggyBank, TrendingUp, Percent } from "lucide-react";
import { requireContext } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { formatDateTimeWIB, formatInteger, formatPercent, formatRupiah } from "@/lib/format";
import { STAGE_LABEL } from "@/lib/auth/context";
import { Alert, Card } from "@/components/ui/card";

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

function Kpi({ icon: Icon, label, value, hint, tone = "slate" }: {
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  label: string; value: string; hint?: string; tone?: "slate" | "red" | "teal";
}) {
  const color = { slate: "text-navy-700 bg-navy-50", red: "text-red-700 bg-red-50", teal: "text-teal-700 bg-teal-50" }[tone];
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-600">{label}</p>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${color}`}><Icon size={17} aria-hidden /></span>
      </div>
      <p className={`mt-2 break-words text-2xl font-semibold tabular-nums ${tone === "red" ? "text-red-700" : "text-slate-900"}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ akses?: string }> }) {
  const { user, context } = await requireContext();
  const sp = await searchParams;
  const supabase = await userClient();
  const { data, error } = await supabase.rpc("dashboard_kpis", { p_version: context.versionId });
  const k = (Array.isArray(data) ? data[0] : data) as Kpis | undefined;

  const sisa = Number(k?.sisa_anggaran ?? 0);
  const over = sisa < 0;
  const empty = !k || k.jumlah_butir_aktif === 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dasbor</h1>
        <p className="mt-1 text-sm text-slate-600">
          Ringkasan Tahun Anggaran {context.year}, tahapan {STAGE_LABEL[context.stage]}. Angka mengikuti data yang boleh Anda akses
          ({user.roles.join(", ")}).
        </p>
      </div>

      {sp.akses === "ditolak" && <Alert tone="amber">Anda tidak memiliki izin untuk membuka halaman tersebut.</Alert>}
      {error && <Alert>Ringkasan tidak dapat dimuat. Silakan muat ulang halaman atau hubungi administrator.</Alert>}
      {over && <Alert><AlertTriangle size={15} className="mr-1.5 inline" aria-hidden /> Realisasi melebihi pagu pada konteks ini (sisa anggaran negatif). Periksa data realisasi.</Alert>}

      {k && (
        <>
          <section aria-label="Indikator utama" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Banknote} label="Total Pagu Anggaran" value={formatRupiah(k.total_pagu)} />
            <Kpi icon={TrendingUp} label="Total Realisasi Belanja" value={formatRupiah(k.total_realisasi)} hint="Hanya transaksi ber-SP2D bertanggal" tone="teal" />
            <Kpi icon={PiggyBank} label="Sisa Anggaran" value={formatRupiah(k.sisa_anggaran)} hint="Pagu − realisasi sah" tone={over ? "red" : "slate"} />
            <Kpi icon={Percent} label="Persentase Realisasi" value={formatPercent(k.pct_realisasi)} hint={k.pct_realisasi === null ? "Pagu 0: persentase tidak dihitung" : undefined} />
            <Kpi icon={ListChecks} label="Butir Anggaran Aktif" value={formatInteger(k.jumlah_butir_aktif)} />
            <Kpi icon={Clock} label="Transaksi Menunggu SP2D" value={formatInteger(k.jumlah_menunggu_sp2d)} hint={`Nilai: ${formatRupiah(k.total_menunggu_sp2d)}`} tone={k.jumlah_menunggu_sp2d > 0 ? "red" : "slate"} />
            <Kpi icon={FileSearch} label="Dokumen Menunggu Reviu" value={formatInteger(k.jumlah_dokumen_reviu)} />
            <Kpi icon={Banknote} label="Komitmen Kontrak" value={formatRupiah(k.total_komitmen)} hint="Dicatat terpisah; bukan realisasi" />
          </section>

          {empty && (
            <Alert tone="teal">
              Belum ada butir anggaran pada konteks ini. Input dan impor anggaran tersedia pada Fase 2; sampai saat itu angka di atas bernilai nol.
            </Alert>
          )}

          <p className="text-xs text-slate-500">
            Dihitung pada {formatDateTimeWIB(k.dihitung_pada)}. Definisi: realisasi sah = transaksi berstatus realisasi dengan SP2D bertanggal dan tidak dibatalkan.
            Menunggu SP2D dan komitmen kontrak ditampilkan terpisah dan tidak pernah dijumlahkan ke realisasi.
          </p>
        </>
      )}
    </div>
  );
}
