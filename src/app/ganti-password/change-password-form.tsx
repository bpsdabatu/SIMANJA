"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { changePasswordAction } from "@/app/actions";
import type { FormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      {state.error && <Alert>{state.error}</Alert>}
      <div>
        <Label htmlFor="password">Kata sandi baru</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
        <p className="mt-1 text-xs text-slate-500">Minimal 10 karakter, memuat huruf besar, huruf kecil, dan angka.</p>
      </div>
      <div>
        <Label htmlFor="confirm">Ulangi kata sandi baru</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
      </div>
      <Button type="submit" variant="accent" disabled={pending} className="w-full">
        {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
        Simpan kata sandi
      </Button>
    </form>
  );
}
