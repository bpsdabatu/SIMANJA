"use client";

import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { formatClockWIB, formatDateWIB, greetingFor } from "@/lib/wib";

/** Jam digital WIB (berdetak tiap detik). Dirender setelah mount agar tidak terjadi selisih hidrasi. */
export function DigitalClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="hidden items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-slate-700 md:flex" role="timer" aria-label="Waktu Indonesia Barat">
      <Clock size={16} aria-hidden className="text-navy-600" />
      <div className="leading-tight">
        <p className="text-sm font-bold tabular-nums text-navy-900">{now ? formatClockWIB(now) : "--:--:--"} <span className="text-[10px] font-semibold text-gold-700">WIB</span></p>
        <p className="text-[10px] text-slate-500">{now ? formatDateWIB(now) : "\u00a0"}</p>
      </div>
    </div>
  );
}

const KEY = "simaspraja.lastSeen";
const AWAY_MS = 5 * 60 * 1000; // dianggap "kembali" bila tidak aktif ≥ 5 menit

/** Salam sapa saat masuk atau kembali ke aplikasi (sesi baru, atau kembali ke tab setelah ≥ 5 menit). */
export function GreetingBanner({ name }: { name: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const read = () => { try { return Number(localStorage.getItem(KEY) ?? "0"); } catch { return 0; } };
    const touch = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* abaikan */ } };
    const greet = () => {
      const d = new Date();
      setText(`${greetingFor(d)}, ${name}! Selamat ${read() === 0 ? "datang" : "datang kembali"} di SIMASPRAJA.`);
    };
    const first = read();
    if (first === 0 || Date.now() - first >= AWAY_MS) greet();
    touch();

    const onVisible = () => {
      if (document.visibilityState === "hidden") { touch(); return; }
      if (Date.now() - read() >= AWAY_MS) greet();
      touch();
    };
    document.addEventListener("visibilitychange", onVisible);
    const beat = setInterval(() => { if (document.visibilityState === "visible") touch(); }, 60_000);
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(beat); };
  }, [name]);

  useEffect(() => {
    if (!text) return;
    const t = setTimeout(() => setText(null), 8000);
    return () => clearTimeout(t);
  }, [text]);

  if (!text) return null;
  return (
    <div role="status" data-noprint className="no-print fixed right-4 top-20 z-40 flex max-w-sm items-start gap-3 rounded-xl border border-gold-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-lift animate-fade-up">
      <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-gold-500" aria-hidden />
      <p className="flex-1">{text}</p>
      <button onClick={() => setText(null)} aria-label="Tutup salam" className="text-slate-400 hover:text-slate-700"><X size={16} aria-hidden /></button>
    </div>
  );
}

/** Dipakai tombol Keluar: sesi berikutnya dianggap masuk baru sehingga salam tampil kembali. */
export function resetGreeting() {
  try { localStorage.removeItem(KEY); } catch { /* abaikan */ }
}
