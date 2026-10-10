import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarRange } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { Card, Alert } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
import { logoutAction } from "@/app/actions";
import { ContextForm, type ContextOption } from "./context-form";

export const metadata: Metadata = { title: "Pilih Konteks Anggaran" };

export default async function PilihKonteksPage() {
  const user = await requireUser();
  if (user.mustChangePassword) redirect("/ganti-password");

  const supabase = await userClient();
  const { data } = await supabase.rpc("list_budget_contexts");
  const options: ContextOption[] = (data ?? []).map(
    (r: { fiscal_year: number; stage_code: string; stage_name: string; status: string }) => ({
      year: r.fiscal_year,
      stage: r.stage_code,
      stageName: r.stage_name,
      status: r.status,
    }),
  );

  return (
    <main className="bg-hero flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex justify-center"><div className="rounded-xl bg-white px-4 py-2 shadow-lift"><Logo variant="mark" size={44} /></div></div>
        <Card className="p-6 sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-50 text-gold-700">
              <CalendarRange size={20} aria-hidden />
            </span>
            <div>
              <h1 className="text-xl font-bold text-navy-900">Pilih konteks anggaran</h1>
              <p className="mt-1 text-sm text-slate-600">
                Halo, {user.fullName}. Seluruh modul, laporan, grafik, dan formulir akan memakai tahun dan tahapan yang Anda pilih.
              </p>
            </div>
          </div>

          {options.length === 0 ? (
            <Alert tone="amber">
              Belum ada versi anggaran yang tersedia untuk Anda. Hubungi administrator untuk membuat atau mengaktifkan
              versi anggaran.
            </Alert>
          ) : (
            <ContextForm options={options} />
          )}

          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-slate-500 hover:text-navy-700"><ArrowLeft size={14} aria-hidden /> Kembali</Link>
            <form action={logoutAction}>
              <button className="text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline">Keluar</button>
            </form>
          </div>
        </Card>
      </div>
    </main>
  );
}
