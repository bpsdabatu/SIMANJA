import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/brand/logo";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Ganti Kata Sandi" };

export default async function GantiPasswordPage() {
  const user = await requireUser();
  return (
    <main className="bg-hero flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="mb-5 rounded-xl bg-white px-4 py-2 shadow-lift"><Logo variant="mark" size={44} /></div>
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold-50 text-gold-700">
            <KeyRound size={20} aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-bold text-navy-900">Ganti kata sandi</h1>
            <p className="mt-1 text-sm text-slate-600">
              {user.mustChangePassword
                ? "Demi keamanan, buat kata sandi baru sebelum melanjutkan."
                : "Perbarui kata sandi akun Anda."}
            </p>
          </div>
        </div>
        <ChangePasswordForm />
      </Card>
    </main>
  );
}
