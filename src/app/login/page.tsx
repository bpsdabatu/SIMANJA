import type { Metadata } from "next";
import { Landmark } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-navy-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-600">
            <Landmark size={22} aria-hidden />
          </span>
          <span className="text-xl font-semibold tracking-wide">SIMANJA</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Sistem Informasi Manajemen Kinerja</h1>
          <p className="mt-4 text-navy-200">
            Anggaran, anggaran kas, realisasi belanja, dan persiapan pengadaan dalam satu sistem yang dapat ditelusuri.
          </p>
        </div>
        <p className="text-xs text-navy-200">Akses hanya untuk pengguna terdaftar. Seluruh aktivitas tercatat.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy-800 text-white">
              <Landmark size={18} aria-hidden />
            </span>
            <span className="text-lg font-semibold text-navy-800">SIMANJA</span>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900">Masuk</h2>
          <p className="mb-6 mt-1 text-sm text-slate-600">Gunakan username dan kata sandi yang diberikan administrator.</p>
          <LoginForm />
          <p className="mt-6 text-xs text-slate-500">
            Lupa kata sandi? Hubungi administrator untuk pengaturan ulang. Tidak ada pemulihan mandiri melalui email.
          </p>
        </div>
      </section>
    </main>
  );
}
