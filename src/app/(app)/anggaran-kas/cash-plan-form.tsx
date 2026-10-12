"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { MONTHS_SHORT, TW_LABEL, allocation, parseAmount, quarterSums, spreadByQuarter, spreadEvenly } from "@/lib/cash-core";
import { saveCashPlanAction } from "./actions";

const rp = (n: number) => `Rp ${new Intl.NumberFormat("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const rpShort = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
const TW_TONE = ["bg-sky-50 text-sky-800 border-sky-200", "bg-emerald-50 text-emerald-800 border-emerald-200", "bg-amber-50 text-amber-800 border-amber-200", "bg-violet-50 text-violet-800 border-violet-200"];

function Btn({ intent, children, variant, disabled }: { intent: "draft" | "submit"; children: React.ReactNode; variant: "primary" | "accent" | "outline"; disabled: boolean }) {
  const { pending } = useFormStatus();
  const cls = {
    primary: "bg-navy-700 text-white hover:bg-navy-800",
    accent: "bg-gold-500 text-navy-950 hover:bg-gold-400",
    outline: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
  }[variant];
  return (
    <button type="submit" name="intent" value={intent} disabled={pending || disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${cls}`}>
      {pending && <Loader2 size={15} className="animate-spin" aria-hidden />}{children}
    </button>
  );
}

/**
 * Form anggaran kas per butir: hitung langsung (terinput, sisa belum diinput, per triwulan),
 * pembantu bagi rata, dan tombol "Simpan & ajukan" (termasuk untuk nilai 0).
 * Server tetap memeriksa ulang (total tidak boleh melebihi pagu).
 */
export function CashPlanForm({ versionId, itemId, pagu, initial, hasPlan }: {
  versionId: string; itemId: string; pagu: number; initial: number[]; hasPlan: boolean;
}) {
  const [raw, setRaw] = useState<string[]>(() => initial.map((v) => (v ? String(v) : "")));
  const parsed = useMemo(() => raw.map(parseAmount), [raw]);
  const invalid = parsed.some((v) => Number.isNaN(v));
  const months = useMemo(() => parsed.map((v) => (Number.isNaN(v) ? 0 : v)), [parsed]);
  const a = allocation(pagu, months);
  const tw = quarterSums(months);
  const over = a.state === "lebih";
  const zeroPagu = pagu <= 0;
  const blocked = invalid || over;
  const barPct = a.pct === null ? 0 : Math.min(100, a.pct);
  const barTone = over ? "bg-red-500" : a.state === "penuh" ? "bg-emerald-500" : a.state === "kosong" ? "bg-slate-300" : "bg-sky-500";

  const setAll = (vals: number[]) => setRaw(vals.map((v) => (v ? String(v) : "")));
  const remain = Math.max(0, a.sisa);

  return (
    <form action={saveCashPlanAction}>
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="itemId" value={itemId} />

      {/* Ringkasan langsung */}
      <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">Pagu butir</p>
          <p className="mt-0.5 font-display text-lg font-bold tabular-nums text-navy-900">{rp(pagu)}</p>
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-xs font-medium text-sky-700">Sudah diinput</p>
          <p className="mt-0.5 font-display text-lg font-bold tabular-nums text-sky-900">{rp(a.input)}</p>
        </div>
        <div className={`rounded-lg border px-4 py-3 ${over ? "border-red-300 bg-red-50" : a.state === "penuh" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <p className={`text-xs font-medium ${over ? "text-red-700" : a.state === "penuh" ? "text-emerald-700" : "text-amber-700"}`}>{over ? "Melebihi pagu" : "Sisa belum diinput"}</p>
          <p className={`mt-0.5 font-display text-lg font-bold tabular-nums ${over ? "text-red-800" : a.state === "penuh" ? "text-emerald-900" : "text-amber-900"}`}>{rp(over ? Math.abs(a.sisa) : a.sisa)}</p>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(barPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Persentase pagu yang sudah dialokasikan ke kas">
        <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${barPct}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-500">{a.pct === null ? "Pagu Rp 0: persentase tidak dihitung." : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(a.pct)}% dari pagu sudah dialokasikan.`}</p>

      {zeroPagu && (
        <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">Pagu butir ini <b>Rp 0</b>. Tidak perlu mengisi bulan — cukup klik <b>Simpan &amp; ajukan</b> agar anggaran kas Rp 0 tercatat dan dapat diproses pejabat berwenang.</p>
      )}

      {/* Isian bulanan */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {MONTHS_SHORT.map((m, i) => {
          const bad = Number.isNaN(parsed[i]);
          return (
            <label key={m} className="block text-xs font-medium text-slate-600">{m}
              <input
                name={`m${i + 1}`} inputMode="decimal" autoComplete="off" placeholder="0" disabled={zeroPagu}
                value={raw[i]} onChange={(e) => setRaw((r) => r.map((x, k) => (k === i ? e.target.value : x)))}
                aria-invalid={bad}
                className={`mt-1 h-9 w-full rounded-lg border bg-white px-2.5 text-right text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 disabled:bg-slate-100 ${bad ? "border-red-400 focus:ring-red-200" : "border-slate-300 focus:border-navy-600 focus:ring-navy-200"}`}
              />
            </label>
          );
        })}
      </div>

      {/* Jumlah per triwulan (langsung) */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tw.map((v, i) => (
          <div key={i} className={`rounded-lg border px-3 py-2 ${TW_TONE[i]}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide">{TW_LABEL[i]}</p>
            <p className="font-display text-sm font-bold tabular-nums">Rp {rpShort(v)}</p>
          </div>
        ))}
      </div>

      {invalid && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Ada isian bulan yang tidak valid. Gunakan angka saja (desimal dengan koma/titik, maksimal 2 digit), tanpa pemisah ribuan.</p>}
      {over && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">Total kas ({rp(a.input)}) melebihi pagu ({rp(pagu)}) sebesar {rp(Math.abs(a.sisa))}. Kurangi nilai bulan agar dapat disimpan.</p>}

      {!zeroPagu && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-slate-500">Bantu isi:</span>
          <button type="button" onClick={() => setAll(spreadEvenly(pagu))} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">Bagi rata pagu ke 12 bulan</button>
          <button type="button" onClick={() => setAll(spreadByQuarter(pagu))} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">Bagi rata per triwulan</button>
          {remain > 0 && a.input > 0 && <button type="button" onClick={() => setRaw((r) => { const k = r.map(parseAmount).findLastIndex((v) => v > 0); const idx = k === -1 ? 11 : k; return r.map((x, j) => (j === idx ? String(Math.round((parseAmount(x) + remain) * 100) / 100) : x)); })} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">Taruh sisa di bulan terakhir terisi</button>}
          <button type="button" onClick={() => setAll(Array(12).fill(0))} className="rounded-md px-2.5 py-1 font-medium text-slate-500 hover:bg-slate-100">Kosongkan</button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn intent="draft" variant="outline" disabled={blocked}>Simpan draf</Btn>
        <Btn intent="submit" variant="accent" disabled={blocked}>Simpan &amp; ajukan</Btn>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {hasPlan ? "Menyimpan menimpa isian bulanan sebelumnya." : "Belum ada rencana kas tersimpan untuk butir ini."}
        {" "}Total kas boleh kurang dari pagu (sisa tetap terlihat), tetapi tidak boleh melebihi pagu.
        {!zeroPagu && a.state === "kosong" && " Mengajukan dengan total Rp 0 berarti tidak ada penarikan kas pada butir ini."}
      </p>
    </form>
  );
}
