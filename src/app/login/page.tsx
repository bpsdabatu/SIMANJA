import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BarChart3, FileCheck2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Alert } from "@/components/ui/card";
import { APP_FULL_NAME, APP_NAME, ORG_NAME } from "@/lib/brand";
import { refreshCaptchaAction } from "./actions";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };
export const dynamic = "force-dynamic";

function currentYearWIB(): number {
  return Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Jakarta", year: "numeric" }).format(new Date()));
}

const POINTS = [
  { icon: BarChart3, title: "Monitoring terpadu", text: "Pagu, anggaran kas, dan realisasi belanja dalam satu tampilan." },
  { icon: FileCheck2, title: "Evaluasi terukur", text: "LRA dan rekapitulasi siap unduh serta cetak." },
  { icon: ShieldCheck, title: "Akuntabel", text: "Hak akses berbasis peran dan seluruh aktivitas tercatat." },
];

export default async function LoginPage() {
  const captcha = await refreshCaptchaAction();
  const year = currentYearWIB();
  const years = [year + 1, year, year - 1, year - 2];

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="bg-hero relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-navy-200 hover:text-white">
            <ArrowLeft size={16} aria-hidden /> Beranda
          </Link>
          <span className="text-xs tracking-[0.2em] text-gold-300">{ORG_NAME.toUpperCase()}</span>
        </div>

        <div className="max-w-lg">
          <div className="mb-8 inline-block rounded-2xl bg-white p-5 shadow-lift">
            <Logo variant="full" size={200} priority />
          </div>
          <div className="gold-rule mb-5" />
          <h1 className="font-display text-3xl font-bold leading-tight">{APP_NAME}</h1>
          <p className="mt-3 text-lg leading-relaxed text-navy-100">{APP_FULL_NAME}</p>
          <ul className="mt-8 space-y-4">
            {POINTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gold-300">
                  <Icon size={18} aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="block text-sm text-navy-200">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center gap-2 text-xs text-navy-200">
          <LockKeyhole size={14} aria-hidden /> Akses hanya untuk pengguna terdaftar. Seluruh aktivitas tercatat.
        </p>
      </section>

      <section className="flex items-center justify-center bg-white px-5 py-10 sm:px-8">
        <div className="w-full max-w-md animate-fade-up">
          <div className="mb-6 flex flex-col items-center text-center lg:hidden">
            <Logo variant="full" size={150} priority />
          </div>
          <div className="gold-rule mb-4 hidden lg:block" />
          <h2 className="text-2xl font-bold text-navy-900">Masuk ke {APP_NAME}</h2>
          <p className="mb-6 mt-1 text-sm text-slate-600">
            Gunakan username dan kata sandi yang diberikan administrator, lalu pilih tahun dan tahapan anggaran.
          </p>
          {captcha ? (
            <LoginForm years={years} defaultYear={year} initialCaptcha={captcha} />
          ) : (
            <Alert>Konfigurasi server belum lengkap (APP_SECRET). Hubungi administrator.</Alert>
          )}
          <p className="mt-6 text-xs leading-relaxed text-slate-500">
            Lupa kata sandi? Hubungi administrator untuk pengaturan ulang. Tidak ada pemulihan mandiri melalui email.
          </p>
        </div>
      </section>
    </main>
  );
}
