"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { selectContextAction } from "@/app/actions";
import type { FormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Label } from "@/components/ui/input";

export interface ContextOption {
  year: number;
  stage: string;
  stageName: string;
  status: string;
}

export function ContextForm({ options, defaultYear, defaultStage }: {
  options: ContextOption[];
  defaultYear?: number;
  defaultStage?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(selectContextAction, {});
  const years = [...new Set(options.map((o) => o.year))].sort((a, b) => b - a);
  const stages = ["murni", "pergeseran", "perubahan"].map((s) => ({
    code: s,
    name: options.find((o) => o.stage === s)?.stageName ?? s[0]!.toUpperCase() + s.slice(1),
  }));
  const available = new Set(options.map((o) => `${o.year}:${o.stage}`));

  return (
    <form action={action} className="space-y-5">
      {state.error && <Alert>{state.error}</Alert>}

      <div>
        <Label htmlFor="year">Tahun Anggaran</Label>
        <select
          id="year"
          name="year"
          required
          defaultValue={defaultYear ?? years[0]}
          className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">Tahapan Anggaran</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {stages.map((s) => (
            <label
              key={s.code}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm has-[:checked]:border-teal-600 has-[:checked]:bg-teal-50"
            >
              <input
                type="radio"
                name="stage"
                value={s.code}
                required
                defaultChecked={(defaultStage ?? options[0]?.stage) === s.code}
                className="accent-teal-600"
              />
              {s.name}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Kombinasi yang belum tersedia untuk tahun terpilih akan ditolak. Tersedia:{" "}
          {[...available].sort().join(", ") || "belum ada"}.
        </p>
      </fieldset>

      <Button type="submit" variant="accent" disabled={pending} className="w-full">
        {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
        Lanjutkan
      </Button>
    </form>
  );
}
