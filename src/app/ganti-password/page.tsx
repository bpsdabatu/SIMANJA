import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { Card } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Ganti Kata Sandi" };

export default async function GantiPasswordPage() {
  const user = await requireUser();
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md p-6 sm:p-8">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy-50 text-navy-700">
            <KeyRound size={20} aria-hidden />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Ganti kata sandi</h1>
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
