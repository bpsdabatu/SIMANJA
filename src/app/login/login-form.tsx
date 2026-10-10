"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CalendarDays, Eye, EyeOff, Loader2, Lock, RefreshCw, ShieldCheck, User } from "lucide-react";
import { loginAction, refreshCaptchaAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/card";
import { STAGES, STAGE_LABEL } from "@/lib/auth/context";
import type { CaptchaChallenge, FormState } from "@/lib/form-state";

const STAGE_HINT: Record<(typeof STAGES)[number], string> = {
  murni: "Anggaran awal",
  pergeseran: "Penyesuaian antar objek",
  perubahan: "APBD Perubahan",
};

export function LoginForm({
  years, defaultYear, initialCaptcha,
}: { years: number[]; defaultYear: number; initialCaptcha: CaptchaChallenge }) {
  const [state, action, pending] = useActionState<FormState, FormData>(loginAction, {});
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [username, setUsername] = useState("");
  const [year, setYear] = useState(String(defaultYear));
  const [stage, setStage] = useState<(typeof STAGES)[number]>("murni");
  const [captcha, setCaptcha] = useState<CaptchaChallenge>(initialCaptcha);
  const [refreshing, startRefresh] = useTransition();

  // Setelah percobaan gagal server mengirim kode baru (kode lama sudah dihabiskan).
  useEffect(() => {
    if (state.captcha) setCaptcha(state.captcha);
  }, [state.captcha]);

  const refresh = () =>
    startRefresh(async () => {
      const next = await refreshCaptchaAction();
      if (next) setCaptcha(next);
    });

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Alert>{state.error}</Alert>}

      <div>
        <Label htmlFor="username">Username</Label>
        <div className="relative">
          <User size={17} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            id="username"
            name="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            maxLength={32}
            placeholder="contoh: pptk.ekonomi"
            className="pl-10"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="password">Kata sandi</Label>
        <div className="relative">
          <Lock size={17} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            id="password"
            name="password"
            type={showPw ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={128}
            className="px-10"
            onKeyUp={onKey}
            onKeyDown={onKey}
            onBlur={() => setCaps(false)}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
            aria-pressed={showPw}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 hover:text-slate-800"
          >
            {showPw ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </div>
        {caps && <p role="status" className="mt-1.5 text-xs font-medium text-amber-700">Caps Lock sedang aktif.</p>}
      </div>

      <div>
        <Label htmlFor="year">Tahun Anggaran</Label>
        <div className="relative">
          <CalendarDays size={17} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            id="year"
            name="year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            required
            className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-8 text-sm text-slate-900 focus-visible:border-navy-500"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">Tahapan Anggaran</legend>
        <div className="grid grid-cols-3 gap-2">
          {STAGES.map((s) => (
            <label
              key={s}
              className="flex cursor-pointer flex-col items-center rounded-lg border border-slate-300 bg-white px-2 py-2 text-center text-sm font-semibold text-slate-700 transition-colors hover:border-navy-300 has-[:checked]:border-navy-600 has-[:checked]:bg-navy-50 has-[:checked]:text-navy-800 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-navy-500"
            >
              <input
                type="radio"
                name="stage"
                value={s}
                checked={stage === s}
                onChange={() => setStage(s)}
                required
                className="sr-only"
              />
              {STAGE_LABEL[s]}
              <span className="mt-0.5 text-[10px] font-normal text-slate-500">{STAGE_HINT[s]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <ShieldCheck size={16} aria-hidden className="text-gold-600" /> Kode keamanan
        </div>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={captcha.image} alt="Kode keamanan berupa 5 karakter huruf dan angka" width={168} height={56} className="h-14 w-[168px] rounded-lg border border-slate-200" />
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={refreshing} aria-label="Muat kode keamanan baru" className="h-9 w-9 px-0">
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} aria-hidden />
          </Button>
        </div>
        <input type="hidden" name="captchaToken" value={captcha.token} />
        <Input
          id="captchaAnswer"
          name="captchaAnswer"
          aria-label="Ketik kode keamanan"
          placeholder="Ketik 5 karakter pada gambar"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          maxLength={8}
          className="mt-2 uppercase tracking-widest placeholder:normal-case placeholder:tracking-normal"
        />
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending && <Loader2 size={17} className="animate-spin" aria-hidden />}
        {pending ? "Memeriksa..." : "Masuk"}
      </Button>

      <ul className="grid grid-cols-1 gap-1 text-[11px] text-slate-500 sm:grid-cols-3">
        <li className="flex items-center gap-1"><ShieldCheck size={12} aria-hidden /> Kode sekali pakai</li>
        <li className="flex items-center gap-1"><ShieldCheck size={12} aria-hidden /> Batas percobaan</li>
        <li className="flex items-center gap-1"><ShieldCheck size={12} aria-hidden /> Aktivitas tercatat</li>
      </ul>
    </form>
  );
}
