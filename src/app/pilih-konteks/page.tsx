import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { userClient } from "@/lib/supabase/server";
import { Card, Alert } from "@/components/ui/card";
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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700">
            <CalendarRange size={20} aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Pilih konteks anggaran</h1>
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

        <form action={logoutAction} className="mt-6 border-t border-slate-100 pt-4 text-right">
          <button className="text-sm text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline">
            Keluar
          </button>
        </form>
      </Card>
    </main>
  );
}
