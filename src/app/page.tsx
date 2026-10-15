import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight, BarChart3, CalendarClock, CheckCircle2, ClipboardCheck, Database, FileBarChart, Files,
  History, KeyRound, LockKeyhole, Receipt, ShieldCheck, Wallet,
} from "lucide-react";
import { Logo, LogoBadge } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { APP_FULL_NAME, APP_NAME, APP_TAGLINE, ORG_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME} | ${APP_FULL_NAME}` },
  robots: { index: false, follow: false },
};

const FEATURES = [
  { icon: Wallet, title: "Perencanaan Anggaran", text: "Input pagu per butir anggaran dengan versi Murni, Pergeseran, dan Perubahan yang dapat difinalisasi." },
  { icon: CalendarClock, title: "Anggaran Kas", text: "Rencana kas bulanan per butir anggaran, diajukan PPTK dan difinalisasi sesuai alur persetujuan." },
  { icon: Receipt, title: "Input Realisasi", text: "Input realisasi cukup dengan tanggal SP2D, langsung tercatat tanpa verifikasi. Realisasi sah hanya dari SP2D bertanggal." },
  { icon: BarChart3, title: "Rekapitulasi", text: "Pagu, realisasi, sisa, dan persentase per sub kegiatan dan rekening, dengan filter program hingga PPTK, siap diunduh." },
  { icon: FileBarChart, title: "Laporan Realisasi Anggaran", text: "LRA berjenjang program–kegiatan–sub kegiatan dengan tampilan cetak resmi." },
  { icon: Files, title: "Dokumen Pengadaan", text: "Alur Nota Dinas, DPP, reviu PPBJ, dan Berita Acara Reviu dengan riwayat revisi." },
  { icon: Database, title: "Data Master", text: "Program, kegiatan, sub kegiatan, rekening, sumber dana, metode, penyedia, dan RUP." },
  { icon: History, title: "Log Audit", text: "Setiap perubahan penting tercatat permanen dan tidak dapat diubah." },
];

const STEPS = [
  { n: "1", title: "Rencanakan", text: "Susun pagu dan versi anggaran pada tahun dan tahapan terpilih." },
  { n: "2", title: "Jadwalkan Kas", text: "PPTK menyusun anggaran kas bulanan untuk butir yang ditugaskan." },
  { n: "3", title: "Realisasikan", text: "Catat transaksi, pembayaran, dan SP2D; verifikasi oleh pejabat berwenang." },
  { n: "4", title: "Monitor & Laporkan", text: "Pantau dasbor, rekapitulasi, dan cetak LRA untuk evaluasi kinerja." },
];

const SECURITY = [
  "Login dengan username, kata sandi, dan kode keamanan sekali pakai",
  "Pembatasan percobaan masuk per akun dan per alamat IP",
  "Hak akses berbasis peran (Admin, PPK, PPTK, PPBJ) dan penugasan",
  "Isolasi data di tingkat database (row level security)",
  "Seluruh aktivitas penting tercatat pada log audit append-only",
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label={`${APP_NAME} - Beranda`}>
            <Logo variant="mark" size={36} priority />
            <span className="font-display text-lg font-bold tracking-wide text-navy-800">{APP_NAME}</span>
          </Link>
          <nav aria-label="Navigasi beranda" className="hidden items-center gap-7 text-sm font-medium text-slate-600 md:flex">
            <a href="#fitur" className="hover:text-navy-700">Fitur</a>
            <a href="#alur" className="hover:text-navy-700">Alur Kerja</a>
            <a href="#keamanan" className="hover:text-navy-700">Keamanan</a>
          </nav>
          <Link href="/login" className={buttonVariants({ variant: "primary" })}>
            <KeyRound size={16} aria-hidden /> Masuk
          </Link>
        </div>
      </header>

      <section className="bg-hero relative overflow-hidden text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div className="animate-fade-up">
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-gold-300 ring-1 ring-white/15">
              <ShieldCheck size={14} aria-hidden /> {ORG_NAME}
            </p>
            <h1 className="font-display text-4xl font-bold leading-[1.1] sm:text-5xl">
              Monitoring &amp; Evaluasi <span className="text-gold-300">Anggaran dan Kinerja</span> dalam Satu Sistem
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-navy-100">
              {APP_FULL_NAME}. {APP_TAGLINE}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className={cn(buttonVariants({ variant: "accent", size: "lg" }))}>
                Masuk ke Aplikasi <ArrowRight size={18} aria-hidden />
              </Link>
              <a href="#fitur" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-white/30 bg-white/5 text-white hover:bg-white/10")}>
                Lihat Fitur
              </a>
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs text-navy-200">
              <LockKeyhole size={14} aria-hidden /> Akses hanya untuk pengguna terdaftar.
            </p>
          </div>
          <div className="mx-auto w-full max-w-md">
            <div className="rounded-3xl bg-white p-6 shadow-lift ring-1 ring-white/30">
              <Logo variant="full" size={300} priority className="mx-auto" />
            </div>
          </div>
        </div>
      </section>

      <section id="fitur" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="gold-rule mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-navy-900">Seluruh siklus anggaran, terhubung</h2>
          <p className="mt-3 text-slate-600">Dari perencanaan hingga pelaporan, setiap modul memakai satu definisi angka yang sama.</p>
        </div>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-card transition-all hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-lift">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700 transition-colors group-hover:bg-navy-700 group-hover:text-gold-300">
                <Icon size={22} aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-bold text-navy-900">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section id="alur" className="scroll-mt-20 bg-slate-50 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <div className="gold-rule mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-navy-900">Alur kerja</h2>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="relative rounded-2xl bg-white p-6 shadow-card">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-400 font-display text-lg font-bold text-navy-950">{s.n}</span>
                <h3 className="mt-4 font-bold text-navy-900">{s.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="keamanan" className="mx-auto grid max-w-7xl scroll-mt-20 items-center gap-10 px-5 py-20 sm:px-8 lg:grid-cols-2">
        <div>
          <div className="gold-rule mb-4" />
          <h2 className="text-3xl font-bold text-navy-900">Aman dan dapat ditelusuri</h2>
          <p className="mt-3 text-slate-600">Dirancang untuk data keuangan daerah: akses dibatasi, perubahan tercatat, dan angka dapat diaudit.</p>
        </div>
        <ul className="space-y-3">
          {SECURITY.map((t) => (
            <li key={t} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
              <CheckCircle2 size={20} aria-hidden className="mt-0.5 shrink-0 text-gold-600" />
              <span className="text-sm text-slate-700">{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-hero text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-5 py-12 sm:px-8">
          <div className="flex items-center gap-4">
            <ClipboardCheck size={36} aria-hidden className="text-gold-300" />
            <div>
              <p className="font-display text-xl font-bold">Siap memulai monitoring tahun anggaran ini?</p>
              <p className="text-sm text-navy-200">Masuk dengan akun yang diberikan administrator.</p>
            </div>
          </div>
          <Link href="/login" className={buttonVariants({ variant: "accent", size: "lg" })}>
            Masuk <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-slate-500 sm:px-8">
          <span className="flex items-center gap-2"><LogoBadge size={20} className="!bg-white ring-slate-200" /> © {new Date().getFullYear()} {APP_NAME} · {ORG_NAME}</span>
          <span>{APP_FULL_NAME}</span>
        </div>
      </footer>
    </div>
  );
}
